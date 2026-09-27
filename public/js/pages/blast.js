// Jimmy Blast: incremental game page (fleet, upgrades, prestige tree, missions, leaderboard, saves).
import {
  state, actions, render, api, esc, avatar, toast, title,
} from '../core.js';
import {
  TIERS, UPGRADES, ABILITIES, MAX_SHIPS_PER_TIER, newSave, normalizeSave, fleetDamage, levelCost, affordableLevels, buyCostN, affordableShips,
  canBuy, canMerge, mergeCost, tierVisible, buyShip, mergeShips, levelUp, upgradeCost, canUpgrade, buyUpgrade, offlineEarnings, earn, fmt,
  prestigeCost, PRESTIGE_BONUS, PRESTIGE_POINTS, PRESTIGE_COST_GROWTH, prestigeFactor, canPrestige, doPrestige, starsFor,
  CALIBER, MODULES, FINGER_CALIBER, FINGER_MODULES, workshopOpen, caliberCost, canBuyCaliber, buyCaliber, canBuyModule, buyModule,
  fingerCost, canBuyFinger, buyFinger, canBuyFingerModule, buyFingerModule, clickDamage,
  SKILLS, skillCost, canBuySkill, buySkill, skillFactor, BOOST, boostDuration, UFO_FRENZY,
  MISSIONS, MISSION_REWARD_MINUTES, dailyMissions, claimMission, rewardCredits, track, planetName, planetsConquered,
} from '../games/blast/logic.js';
import { createBlast } from '../games/blast/engine.js';

const GAME = 'blast';
const LOCAL_SAVE = (id) => `neutron_blast_${id}`;
const SERVER_SAVE_EVERY = 30000;
const MULTS = [1, 10, 'max'];
const TABS = [['ships', '🛸', 'Flotte'], ['upgrades', '⚙️', 'Amélio.'], ['workshop', '🛠️', 'Atelier'], ['prestige', '⭐', 'Prestige'], ['missions', '🎯', 'Missions'], ['ranking', '🏆', 'Top']];

let g = null; // current game: { save, engine, pending, tab, mult, … }

const shipSvg = (color, size = 44) => `<svg class="bl-ship" viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true">
  <path d="M0 -11 L7.7 7.7 L0 3.8 L-7.7 7.7 Z" fill="${color}"/></svg>`;

/** Local calendar day: daily missions change at midnight. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---- saves -----------------------------------------------------------------------

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_SAVE(state.me.id)) || 'null'); } catch { return null; }
}
function writeLocal() {
  g.save.savedAt = Date.now();
  try { localStorage.setItem(LOCAL_SAVE(state.me.id), JSON.stringify(g.save)); } catch { /* private mode */ }
}
async function writeServer({ keepalive = false } = {}) {
  writeLocal();
  g.lastServerSave = Date.now();
  try {
    await fetch(`/api/arcade/${GAME}/save`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: g.save, score: g.save.maxStage }),
      credentials: 'same-origin',
      keepalive,
    });
  } catch { /* offline: the local save is kept and sent next time */ }
}

async function loadSave() {
  let server = null;
  try { server = (await api(`/api/arcade/${GAME}/save`)).save?.data; } catch { /* play from the local save */ }
  const local = readLocal();
  const pick = [server, local].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  return normalizeSave(pick || newSave());
}

// ---- page ------------------------------------------------------------------------------

export async function blastPage() {
  render('<p class="muted">Chargement de la flotte…</p>');
  const [save, rewards] = await Promise.all([
    loadSave(),
    api(`/api/arcade/${GAME}/rewards`).then((r) => r.rewards).catch(() => []),
  ]);
  if (!location.hash.startsWith('#/games')) return;
  const away = offlineEarnings(save);
  dailyMissions(save, today());
  g = {
    save, rewards, pending: away.away > 60 && away.amount >= 1 ? away.amount : 0,
    tab: 'ships', mult: 1, incomeWindow: 0, lastServerSave: Date.now(), timers: [], leaderboard: null, structure: '',
  };
  render(pageHtml());
  const canvas = document.getElementById('bl-canvas');
  g.engine = createBlast(canvas, save, {
    onEarn: (n) => { g.incomeWindow += n; },
    onStage: (stage) => { if (stage % 5 === 0) writeServer(); },
    onBoss: (won) => {
      if (won) toast(`🚩 ${planetName(g.save.stage - 1)} est conquise ! Gros butin de crédits`);
      else toast(`🪐 ${planetName(g.save.stage + 1)} résiste : renforce ta flotte, tu retenteras au prochain secteur`, true);
    },
  });
  g.engine.start();
  state.view = () => {}; // the page draws itself; ignore global re-renders
  g.timers.push(setInterval(tick, 200));
  g.timers.push(setInterval(() => {
    if (document.hidden) return; // hidden time is paid as offline earnings on return
    // Income rate over time (drives offline earnings).
    g.save.rate = g.save.rate * 0.95 + g.incomeWindow * 0.05;
    g.incomeWindow = 0;
    g.save.stats.playTime += 1;
    dailyMissions(g.save, today());
  }, 1000));
  g.timers.push(setInterval(() => {
    if (document.hidden) return;
    writeLocal();
    if (Date.now() - g.lastServerSave > SERVER_SAVE_EVERY) writeServer();
  }, 5000));
  document.addEventListener('visibilitychange', onVisibility);
  state.ui.cleanup = leave;
  buildPanel();
  tick();
}

function leave() {
  if (!g) return;
  g.timers.forEach(clearInterval);
  document.removeEventListener('visibilitychange', onVisibility);
  g.engine.destroy();
  writeServer({ keepalive: true });
  g = null;
}

function onVisibility() {
  if (!g) return;
  if (document.hidden) {
    g.engine.stop();
    writeServer({ keepalive: true });
  } else {
    // Time spent in another tab counts as offline time.
    const away = offlineEarnings(g.save);
    if (away.away > 60 && away.amount >= 1) g.pending += away.amount;
    g.engine.start();
  }
}

function pageHtml() {
  return `<div class="blast">
    <section class="bl-play">
      <div class="bl-top card">
        <div class="bl-money"><span class="bl-coin">🪙</span><strong id="bl-money">0</strong><span class="muted small" id="bl-rate"></span></div>
        <div class="bl-stage">
          <span class="badge bl-prestige-badge" id="bl-prestige" hidden></span>
          <span class="badge" id="bl-planets" title="Planètes conquises"></span>
          <span class="badge" id="bl-stage">Secteur 1</span>
          <span class="badge bl-frenzy" id="bl-frenzy" hidden></span>
          <div class="bl-bar"><span id="bl-bar"></span></div>
        </div>
        <button class="btn accent sm" id="bl-collect" data-action="bl-collect" hidden></button>
      </div>
      <div class="bl-canvas-wrap"><canvas id="bl-canvas" aria-label="Terrain de jeu : touche les blocs pour les casser"></canvas></div>
      <button class="btn block bl-boost" id="bl-boost" data-action="bl-boost">
        ${shipSvg('#fff', 26)}<span id="bl-boost-label">ACCÉLÉRATION</span><span class="bl-boost-fill" id="bl-boost-fill"></span></button>
    </section>
    <section class="bl-side">
      <h1 class="bl-title">${title('🚀', 'Jimmy Blast')}</h1>
      <div id="bl-rewards"></div>
      <div class="tabs bl-tabs" role="tablist">
        ${TABS.map(([id, emoji, label]) => `<button data-action="bl-tab" data-tab="${id}">${emoji} <span>${label}</span><i class="bl-dot" id="dot-${id}" hidden></i></button>`).join('')}
      </div>
      <div id="bl-panel"></div>
      <p class="muted small bl-help">👽 <strong>La flotte de Jimmy part à la conquête de l’univers, planète par planète.</strong>
        Traverse 9 secteurs de blocs, puis conquiers la 🪐 planète du 10e avant la fin du chrono. Chaque dégât rapporte des crédits, chaque bloc cassé un bonus.
        Touche les blocs pour aider, et attrape la 🛸 soucoupe de Jimmy quand elle passe ! Blocs dorés : gains ×10 · 💣 bombes : elles explosent sur leurs voisins.
        Tes parties de quiz rapportent aussi des bonus ici.</p>
    </section>
  </div>`;
}

// ---- side panel -----------------------------------------------------------------------------

function visibleTiers() {
  return TIERS.map((_, t) => t).filter((t) => tierVisible(g.save, t));
}

function levelsToBuy(t) {
  const { level } = g.save.tiers[t];
  if (g.mult === 'max') return Math.max(1, affordableLevels(t, level, g.save.money));
  return g.mult;
}

function shipsToBuy() {
  const room = MAX_SHIPS_PER_TIER - g.save.tiers[0].count;
  if (g.mult === 'max') return Math.max(1, Math.min(room, affordableShips(g.save)));
  return Math.max(1, Math.min(room, g.mult));
}

function buildPanel() {
  const key = `${g.tab}|${workshopOpen(g.save)}|${visibleTiers().join(',')}|${g.mult}|${g.leaderboard ? 1 : 0}|${g.save.daily?.date}|${g.rewards.length}`;
  if (key === g.structure) return;
  g.structure = key;
  for (const b of document.querySelectorAll('.bl-tabs button')) b.classList.toggle('active', b.dataset.tab === g.tab);
  const $r = document.getElementById('bl-rewards');
  if ($r) {
    const minutes = g.rewards.reduce((n, r) => n + r.minutes, 0);
    const wins = g.rewards.filter((r) => r.boost).length;
    $r.innerHTML = g.rewards.length ? `<div class="bl-upg bl-reward card-inset">
      <span class="bl-upg-emoji">🎁</span>
      <div class="bl-upg-text"><strong>Bonus du quiz</strong>
        <div class="muted small">${g.rewards.slice(0, 3).map((r) => esc(r.reason)).join(' · ')}${g.rewards.length > 3 ? ` · +${g.rewards.length - 3}` : ''}</div>
        <div class="small">${minutes} min de gains${wins ? ` + accélération offerte` : ''}</div></div>
      <button class="btn accent sm" data-action="bl-claim-rewards">Récupérer</button></div>` : '';
  }
  const $p = document.getElementById('bl-panel');
  const s = g.save;
  if (g.tab === 'ships') {
    $p.innerHTML = `<div class="bl-dps-total small" id="bl-dps-total"></div>
      <div class="row bl-mult">Quantité : ${MULTS.map((m) => `<button class="btn ghost sm ${m === g.mult ? 'active' : ''}" data-action="bl-mult" data-m="${m}">${m === 'max' ? 'Max' : `×${m}`}</button>`).join('')}</div>
      <div class="bl-cards">${visibleTiers().map((t) => `
      <div class="bl-card" style="--c:${TIERS[t].color}">
        <span class="bl-count" id="bc-${t}"></span>
        <div class="bl-card-head">${shipSvg(TIERS[t].color)}<div><strong>${esc(TIERS[t].name)}</strong>
          <div class="bl-dmg"><span id="bd-${t}"></span> <span class="muted small">dégâts</span></div>
          <div class="muted small" id="bl-${t}"></div>
          <div class="bl-dps small" id="bps-${t}"></div>
          ${ABILITIES[t] ? `<div class="bl-ability small">✨ <strong>${esc(ABILITIES[t].name)}</strong> : ${esc(ABILITIES[t].desc)}</div>` : ''}</div></div>
        <div class="bl-btns">
          ${t === 0
    ? '<button class="btn sm" data-action="bl-buy" id="bb-0"></button>'
    : `<button class="btn sm" data-action="bl-merge" data-t="${t}" id="bm-${t}"></button>`}
          <button class="btn sm" data-action="bl-level" data-t="${t}" id="bu-${t}"></button>
        </div>
      </div>`).join('')}</div>`;
  } else if (g.tab === 'upgrades') {
    $p.innerHTML = `<div class="stack">${Object.entries(UPGRADES).map(([k, u]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${u.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(u.label)}</strong> <span class="badge" id="ul-${k}"></span><div class="muted small">${esc(u.desc)}</div></div>
        <button class="btn sm" data-action="bl-upgrade" data-k="${k}" id="ub-${k}"></button>
      </div>`).join('')}
      <button class="btn ghost sm bl-reset" data-action="bl-reset">🗑 Effacer ma partie</button></div>`;
  } else if (g.tab === 'prestige') {
    $p.innerHTML = `<div class="stack">
      <div class="bl-upg bl-prestige card-inset">
        <span class="bl-upg-emoji">⭐</span>
        <div class="bl-upg-text"><strong>Prestige</strong> <span class="badge" id="pl"></span>
          <div class="muted small">Recommence à zéro (secteur 1, flotte et améliorations) contre <strong id="pc"></strong> crédits :
            dégâts <strong>+${Math.round(PRESTIGE_BONUS * 100)} %</strong> pour toujours, <strong>${PRESTIGE_POINTS} 🔷 points</strong> pour l’atelier des vaisseaux
            et des <strong>étoiles</strong> (1, plus 1 par tranche de 10 secteurs atteints). Le prix ${PRESTIGE_COST_GROWTH === 2 ? 'double' : `est ×${PRESTIGE_COST_GROWTH}`} à chaque prestige.</div>
          <div class="small" id="pn"></div></div>
        <button class="btn accent sm" data-action="bl-prestige" id="pb"></button>
      </div>
      <div class="spread"><h3 style="margin:0">🌌 Arbre des étoiles</h3><span class="badge bl-prestige-badge" id="stars"></span></div>
      <p class="muted small" style="margin:0">Bonus permanents, gardés à chaque prestige. Les étoiles viennent des prestiges, et 1 par jour en finissant les 3 missions.</p>
      ${Object.entries(SKILLS).map(([k, sk]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${sk.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(sk.label)}</strong> <span class="badge" id="sl-${k}"></span><div class="muted small">${esc(sk.desc)}</div></div>
        <button class="btn sm" data-action="bl-skill" data-k="${k}" id="sb-${k}"></button>
      </div>`).join('')}</div>`;
  } else if (g.tab === 'workshop') {
    $p.innerHTML = workshopOpen(s) ? `<div class="stack">
      <div class="spread"><p class="muted small" style="margin:0">Améliorations permanentes, gardées à chaque prestige. Chaque prestige rapporte ${PRESTIGE_POINTS} 🔷 points.</p>
        <span class="badge bl-pp" id="pp"></span></div>
      <h3 style="margin:4px 0 0">👆 Doigt de Jimmy</h3>
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">👆</span>
        <div class="bl-upg-text"><strong>Calibre du doigt</strong> <span class="badge" id="wf-l"></span>
          <div class="muted small">Dégâts au toucher +${Math.round(FINGER_CALIBER.bonus * 100)} % par niveau · <span id="wf-d"></span></div></div>
        <button class="btn sm" data-action="bl-finger" id="wf-b"></button>
      </div>
      ${Object.entries(FINGER_MODULES).map(([k, m]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${m.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(m.name)}</strong><div class="muted small">${esc(m.desc)}</div></div>
        <button class="btn sm" data-action="bl-finger-module" data-k="${k}" id="wfm-${k}"></button>
      </div>`).join('')}
      <h3 style="margin:8px 0 0">🛸 Vaisseaux</h3>
      ${TIERS.map((tier, t) => `
      <div class="bl-upg bl-work card-inset" style="--c:${tier.color}">
        ${shipSvg(tier.color, 34)}
        <div class="bl-upg-text"><strong>${esc(tier.name)}</strong> <span class="badge" id="wc-l-${t}"></span>
          <div class="muted small">Calibre : dégâts +${Math.round(CALIBER.bonus * 100)} % par niveau</div>
          <div class="small bl-module">🔧 <strong>${esc(MODULES[t].name)}</strong> : ${esc(MODULES[t].desc)}</div></div>
        <div class="bl-btns bl-btns-col">
          <button class="btn sm" data-action="bl-caliber" data-t="${t}" id="wc-b-${t}"></button>
          <button class="btn sm" data-action="bl-module" data-t="${t}" id="wm-b-${t}"></button>
        </div>
      </div>`).join('')}</div>`
      : `<div class="card-inset center stack"><p style="font-size:2.5rem;margin:0">🔒🛠️</p>
        <p><strong>L’atelier des vaisseaux s’ouvre au premier prestige.</strong></p>
        <p class="muted small" style="margin:0">Chaque prestige rapporte ${PRESTIGE_POINTS} 🔷 points à dépenser ici : calibre de chaque vaisseau et du doigt de Jimmy,
          modules spéciaux (essaim d’éclaireurs, double tir, foreuse, doigt automatique…). Ces améliorations sont gardées pour toujours.</p></div>`;
  } else if (g.tab === 'missions') {
    const d = dailyMissions(s, today());
    $p.innerHTML = `<div class="stack">
      <p class="muted small" style="margin:0">Nouvelles missions chaque jour à minuit, les mêmes pour tout le monde. Chacune rapporte ${MISSION_REWARD_MINUTES} min de gains,
        et les 3 réunies <strong>1 ⭐ étoile</strong>.</p>
      ${d.missions.map((m, i) => `
      <div class="bl-mission card-inset">
        <div class="spread"><strong>${esc(MISSIONS[m.kind].label(m.target))}</strong><span class="small" id="mp-${i}"></span></div>
        <div class="bl-bar"><span id="mb-${i}"></span></div>
        <button class="btn sm" data-action="bl-claim" data-i="${i}" id="mc-${i}"></button>
      </div>`).join('')}
      <p class="small center" id="m-bonus"></p></div>`;
  } else {
    if (!g.leaderboard) {
      $p.innerHTML = '<p class="muted">Chargement…</p>';
      writeServer().then(() => api(`/api/arcade/${GAME}/leaderboard`)).then(({ players }) => {
        if (!g) return;
        g.leaderboard = players;
        buildPanel();
      }).catch((err) => toast(err.message, true));
      return;
    }
    $p.innerHTML = g.leaderboard.length ? `<ol class="bl-rank">${g.leaderboard.map((p, i) => `
      <li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(p, 28)}
        <span class="bl-rank-name">${esc(p.username)}</span>
        ${p.prestige ? `<span class="badge bl-prestige-badge" title="Prestiges">⭐ ${p.prestige}</span>` : ''}
        <span class="badge" title="Planètes conquises">🚩 ${planetsConquered(p.score)}</span><span class="badge">Secteur ${fmt(p.score)}</span></li>`).join('')}</ol>`
      : '<p class="muted">Personne au classement pour l’instant.</p>';
  }
}

const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
const enable = (id, on) => { const el = document.getElementById(id); if (el) el.disabled = !on; };
const toggle = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };

/** Refreshes numbers and button states without rebuilding the DOM (clicks stay reliable). */
function tick() {
  if (!g) return;
  const s = g.save;
  buildPanel();
  set('bl-money', fmt(s.money));
  set('bl-rate', s.rate >= 1 ? `+${fmt(s.rate)}/s` : '');
  const bossLeft = g.engine.bossLeft();
  set('bl-stage', bossLeft !== null ? `🪐 ${esc(planetName(s.stage))} · secteur ${fmt(s.stage)}` : `Secteur ${fmt(s.stage)} · ${esc(g.engine.themeName())}`);
  set('bl-planets', `🚩 ${planetsConquered(s.maxStage)}`);
  toggle('bl-prestige', s.prestige > 0 || s.skills.power > 0);
  set('bl-prestige', `⭐ ${s.prestige} · ×${fmtFactor(prestigeFactor(s) * skillFactor(s))}`);
  const frenzy = g.engine.frenzyLeft();
  toggle('bl-frenzy', frenzy > 0);
  set('bl-frenzy', `🛸 ×${UFO_FRENZY.factor} · ${Math.ceil(frenzy)} s`);
  const bar = document.getElementById('bl-bar');
  if (bar) bar.style.width = `${Math.round(g.engine.progress() * 100)}%`;
  toggle('bl-collect', g.pending > 0);
  set('bl-collect', `🌙 Collecter ${fmt(g.pending)}`);
  const boost = g.engine.boostLeft();
  const cooldown = Math.max(0, (g.boostReadyAt || 0) - Date.now()) / 1000;
  set('bl-boost-label', boost > 0 ? `ACCÉLÉRATION ×${BOOST.factor} · ${Math.ceil(boost)} s` : cooldown > 0 ? `Recharge… ${Math.ceil(cooldown)} s` : 'ACCÉLÉRATION');
  enable('bl-boost', boost <= 0 && cooldown <= 0);
  const fill = document.getElementById('bl-boost-fill');
  const rest = BOOST.cooldown - BOOST.duration;
  if (fill) fill.style.width = `${boost > 0 ? (boost / boostDuration(s)) * 100 : cooldown > 0 ? 100 - (cooldown / rest) * 100 : 100}%`;
  toggle('dot-missions', (s.daily?.missions || []).some((m) => !m.claimed && m.progress >= m.target));
  toggle('dot-prestige', canPrestige(s) || Object.keys(SKILLS).some((k) => canBuySkill(s, k)));
  toggle('dot-workshop', canBuyFinger(s) || TIERS.some((_, t) => canBuyCaliber(s, t) || canBuyModule(s, t))
    || Object.keys(FINGER_MODULES).some((k) => canBuyFingerModule(s, k)));

  if (g.tab === 'ships') {
    const tap = g.engine.dps('tap');
    set('bl-dps-total', `⚔️ Flotte : <strong>${fmt(g.engine.dps() - tap)}</strong> dégâts/s${tap >= 1 ? ` · 👆 Toi : <strong>${fmt(tap)}</strong>/s` : ''} <span class="muted">· moyenne sur 15 s</span>`);
    for (const t of visibleTiers()) {
      const tier = s.tiers[t];
      const d = g.engine.dps(t);
      set(`bps-${t}`, tier.count
        ? `⚡ <strong>${fmt(d)}</strong>/s${tier.count > 1 ? ` <span class="muted">· ${fmt(g.engine.dpsPerShip(t))}/s par vaisseau</span>` : ''}`
        : '<span class="muted">⚡ aucun vaisseau</span>');
      set(`bc-${t}`, String(tier.count));
      set(`bd-${t}`, fmt(fleetDamage(s, t)));
      set(`bl-${t}`, `Niveau ${tier.level}`);
      const n = levelsToBuy(t);
      const cost = levelCost(t, tier.level, n);
      set(`bu-${t}`, `Niveau +${n}<br><span>${fmt(cost)}</span>`);
      enable(`bu-${t}`, s.money >= cost);
      if (t === 0) {
        const n0 = shipsToBuy();
        set('bb-0', tier.count >= MAX_SHIPS_PER_TIER ? 'Flotte pleine' : `+${n0} vaisseau${n0 > 1 ? 'x' : ''}<br><span>${fmt(buyCostN(s, n0))}</span>`);
        enable('bb-0', canBuy(s, n0));
      } else {
        set(`bm-${t}`, `Fusionner<br><span>${Math.min(s.tiers[t - 1].count, mergeCost(s))} / ${mergeCost(s)}</span>`);
        enable(`bm-${t}`, canMerge(s, t));
      }
    }
  } else if (g.tab === 'upgrades') {
    for (const [k, u] of Object.entries(UPGRADES)) {
      const lvl = s.upgrades[k];
      set(`ul-${k}`, `${lvl} / ${u.max}`);
      set(`ub-${k}`, lvl >= u.max ? 'Max' : fmt(upgradeCost(k, lvl)));
      enable(`ub-${k}`, canUpgrade(s, k));
    }
  } else if (g.tab === 'prestige') {
    const f = prestigeFactor(s);
    set('pl', `${s.prestige} · dégâts ×${fmtFactor(f)}`);
    set('pn', canPrestige(s)
      ? `Prêt : dégâts ×${fmtFactor(f * (1 + PRESTIGE_BONUS))}, <strong>+${PRESTIGE_POINTS} 🔷</strong> et <strong>+${starsFor(s)} ⭐</strong> (meilleur secteur de la partie : ${s.runBest}).`
      : `<span class="muted">Encore ${fmt(prestigeCost(s) - s.money)} crédits · rapportera ${PRESTIGE_POINTS} 🔷 et ${starsFor(s)} ⭐ (meilleur secteur : ${s.runBest}).</span>`);
    set('pc', fmt(prestigeCost(s)));
    set('pb', `⭐ ${fmt(prestigeCost(s))}`);
    enable('pb', canPrestige(s));
    set('stars', `${s.stars} ⭐ à dépenser`);
    for (const [k, sk] of Object.entries(SKILLS)) {
      const lvl = s.skills[k];
      set(`sl-${k}`, `${lvl} / ${sk.max}`);
      set(`sb-${k}`, lvl >= sk.max ? 'Max' : `${skillCost(k, lvl)} ⭐`);
      enable(`sb-${k}`, canBuySkill(s, k));
    }
  } else if (g.tab === 'workshop' && workshopOpen(s)) {
    set('pp', `${s.pp} 🔷 points`);
    set('wf-l', `${s.workshop.finger} / ${FINGER_CALIBER.max}`);
    set('wf-d', `toucher actuel : ${fmt(clickDamage(s))}`);
    set('wf-b', s.workshop.finger >= FINGER_CALIBER.max ? 'Max' : `+1 · ${fingerCost(s)} 🔷`);
    enable('wf-b', canBuyFinger(s));
    for (const [k, m] of Object.entries(FINGER_MODULES)) {
      set(`wfm-${k}`, s.workshop.fingerModules[k] ? '✅ Installé' : `${m.cost} 🔷`);
      enable(`wfm-${k}`, canBuyFingerModule(s, k));
    }
    TIERS.forEach((_, t) => {
      const lvl = s.workshop.caliber[t];
      set(`wc-l-${t}`, `calibre ${lvl} / ${CALIBER.max}`);
      set(`wc-b-${t}`, lvl >= CALIBER.max ? 'Calibre max' : `Calibre +1<br><span>${caliberCost(s, t)} 🔷</span>`);
      enable(`wc-b-${t}`, canBuyCaliber(s, t));
      set(`wm-b-${t}`, s.workshop.modules[t] ? '✅ Module' : `Module<br><span>${MODULES[t].cost} 🔷</span>`);
      enable(`wm-b-${t}`, canBuyModule(s, t));
    });
  } else if (g.tab === 'missions') {
    const d = s.daily;
    d.missions.forEach((m, i) => {
      set(`mp-${i}`, `${fmt(Math.floor(m.progress))} / ${fmt(m.target)}`);
      const b = document.getElementById(`mb-${i}`);
      if (b) b.style.width = `${Math.round((m.progress / m.target) * 100)}%`;
      set(`mc-${i}`, m.claimed ? '✅ Récupérée' : m.progress >= m.target ? `🎁 +${fmt(rewardCredits(s, MISSION_REWARD_MINUTES))}` : 'En cours…');
      enable(`mc-${i}`, !m.claimed && m.progress >= m.target);
    });
    set('m-bonus', d.bonus ? '⭐ Étoile du jour gagnée ! Reviens demain.' : `<span class="muted">${d.missions.filter((m) => m.claimed).length} / 3 missions récupérées pour l’étoile du jour</span>`);
  }
}

// ---- actions --------------------------------------------------------------------------------

const after = (ok, msg) => {
  if (ok) { g.engine.syncFleet(); tick(); } else if (msg) toast(msg, true);
};

actions['bl-tab'] = (el) => { g.tab = el.dataset.tab; if (g.tab === 'ranking') g.leaderboard = null; tick(); };
actions['bl-mult'] = (el) => { g.mult = el.dataset.m === 'max' ? 'max' : Number(el.dataset.m); tick(); };
actions['bl-buy'] = () => after(buyShip(g.save, shipsToBuy()), 'Pas assez de crédits.');
actions['bl-merge'] = (el) => {
  const t = Number(el.dataset.t);
  if (mergeShips(g.save, t)) toast(`✨ Nouveau ${TIERS[t].name} !${ABILITIES[t] && g.save.tiers[t].count === 1 ? ` Pouvoir : ${ABILITIES[t].name}` : ''}`);
  after(true);
};
actions['bl-level'] = (el) => {
  const t = Number(el.dataset.t);
  after(levelUp(g.save, t, levelsToBuy(t)), 'Pas assez de crédits.');
};
actions['bl-upgrade'] = (el) => after(buyUpgrade(g.save, el.dataset.k), 'Pas assez de crédits.');
actions['bl-caliber'] = (el) => {
  const t = Number(el.dataset.t);
  if (buyCaliber(g.save, t)) toast(`🛠️ ${TIERS[t].name} : calibre ${g.save.workshop.caliber[t]}`);
  after(true);
};
actions['bl-module'] = (el) => {
  const t = Number(el.dataset.t);
  if (buyModule(g.save, t)) toast(`🔧 Module installé : ${MODULES[t].name}`);
  after(true);
};
actions['bl-finger'] = () => {
  if (buyFinger(g.save)) toast(`👆 Calibre du doigt : ${g.save.workshop.finger}`);
  after(true);
};
actions['bl-finger-module'] = (el) => {
  const { k } = el.dataset;
  if (buyFingerModule(g.save, k)) toast(`${FINGER_MODULES[k].emoji} ${FINGER_MODULES[k].name} installé !`);
  after(true);
};
actions['bl-skill'] = (el) => {
  const { k } = el.dataset;
  if (buySkill(g.save, k)) toast(`🌌 ${SKILLS[k].label} : niveau ${g.save.skills[k]}`);
  after(true);
};
actions['bl-boost'] = () => {
  if (g.engine.boostLeft() > 0 || (g.boostReadyAt || 0) > Date.now()) return;
  g.engine.boost();
  track(g.save, 'boosts');
  // Recharge starts once the (possibly longer) acceleration is over.
  g.boostReadyAt = Date.now() + (boostDuration(g.save) + BOOST.cooldown - BOOST.duration) * 1000;
  tick();
};
actions['bl-collect'] = () => {
  if (!g.pending) return;
  // The pending amount is already net of the gain upgrade: add it as is.
  g.save.money += g.pending;
  g.save.totalEarned += g.pending;
  toast(`🌙 +${fmt(g.pending)} crédits gagnés pendant ton absence`);
  g.pending = 0;
  tick();
};
actions['bl-claim'] = (el) => {
  const r = claimMission(g.save, Number(el.dataset.i));
  if (!r) return;
  toast(`🎯 Mission accomplie : +${fmt(r.credits)} crédits${r.star ? ' et ⭐ 1 étoile !' : ''}`);
  writeServer();
  tick();
};
actions['bl-claim-rewards'] = async () => {
  try {
    const { rewards } = await api(`/api/arcade/${GAME}/rewards/claim`, { method: 'POST' });
    let credits = 0;
    let boost = false;
    for (const r of rewards) {
      credits += rewardCredits(g.save, r.minutes);
      boost ||= r.boost;
    }
    g.save.money += credits;
    g.save.totalEarned += credits;
    if (boost) g.engine.boost(); // offered: the button's recharge is not used
    g.rewards = [];
    toast(`🎁 +${fmt(credits)} crédits${boost ? ' et une accélération offerte' : ''} grâce au quiz !`);
    writeServer();
    tick();
  } catch (err) { toast(err.message, true); }
};
actions['bl-prestige'] = () => {
  const s = g.save;
  if (!canPrestige(s)) return;
  const next = fmtFactor(prestigeFactor(s) * (1 + PRESTIGE_BONUS));
  const stars = starsFor(s);
  if (!confirm(`⭐ Prestige ${s.prestige + 1}\n\nTu repars du secteur 1, sans crédits ni améliorations (l’atelier et l’arbre des étoiles sont gardés).\nEn échange : dégâts ×${next} pour toujours, +${PRESTIGE_POINTS} 🔷 points d’atelier et +${stars} étoile${stars > 1 ? 's' : ''}.\n\nOn y va ?`)) return;
  doPrestige(s);
  g.pending = 0;
  g.engine.restart();
  g.structure = '';
  writeServer();
  toast(`⭐ Prestige ${s.prestige} ! Dégâts ×${next}, +${PRESTIGE_POINTS} 🔷, +${stars} ⭐`);
  tick();
};

actions['bl-reset'] = async () => {
  if (!confirm('Effacer toute ta partie de Jimmy Blast (prestiges et étoiles compris) et repartir du secteur 1 ?')) return;
  const { save } = g;
  Object.assign(save, newSave());
  g.pending = 0;
  try { localStorage.removeItem(LOCAL_SAVE(state.me.id)); } catch { /* ignore */ }
  await api(`/api/arcade/${GAME}/save`, { method: 'DELETE' }).catch(() => {});
  leave();
  blastPage();
};

function fmtFactor(f) {
  return f < 100 ? f.toFixed(2).replace('.', ',') : fmt(f);
}

// Kept for tests / console debugging.
export const _debug = { get game() { return g; }, earn: (n) => g && earn(g.save, n) };
