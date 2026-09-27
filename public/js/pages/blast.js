// Jimmy Blast: incremental game page (fleet, upgrades, leaderboard, saves).
import {
  state, actions, render, api, esc, avatar, toast, title,
} from '../core.js';
import {
  TIERS, UPGRADES, BOOST, MERGE_COST, MAX_SHIPS_PER_TIER, newSave, normalizeSave, fleetDamage, levelCost, affordableLevels, buyCostN, affordableShips,
  canBuy, canMerge, tierVisible, buyShip, mergeShips, levelUp, upgradeCost, canUpgrade, buyUpgrade, offlineEarnings, earn, fmt,
  PRESTIGE_COST, PRESTIGE_BONUS, prestigeFactor, canPrestige, doPrestige,
} from '../games/blast/logic.js';
import { createBlast } from '../games/blast/engine.js';

const GAME = 'blast';
const LOCAL_SAVE = (id) => `neutron_blast_${id}`;
const SERVER_SAVE_EVERY = 30000;
const MULTS = [1, 10, 'max'];

let g = null; // current game: { save, engine, pending, tab, mult, … }

const shipSvg = (color, size = 44) => `<svg class="bl-ship" viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true">
  <path d="M0 -11 L7.7 7.7 L0 3.8 L-7.7 7.7 Z" fill="${color}"/></svg>`;

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
  render(`<p class="muted">Chargement de la flotte…</p>`);
  const save = await loadSave();
  if (!location.hash.startsWith('#/games')) return;
  const away = offlineEarnings(save);
  g = {
    save, pending: away.away > 60 && away.amount >= 1 ? away.amount : 0, awaySeconds: away.seconds,
    tab: 'ships', mult: 1, incomeWindow: 0, lastServerSave: Date.now(), timers: [], leaderboard: null, structure: '',
  };
  render(pageHtml());
  const canvas = document.getElementById('bl-canvas');
  g.engine = createBlast(canvas, save, {
    onEarn: (n) => { g.incomeWindow += n; },
    onStage: (stage) => { if (stage % 5 === 0) writeServer(); },
  });
  g.engine.start();
  state.view = () => {}; // the page draws itself; ignore global re-renders
  g.timers.push(setInterval(tick, 200));
  g.timers.push(setInterval(() => {
    if (document.hidden) return; // hidden time is paid as offline earnings on return
    // Income rate over time (drives offline earnings).
    g.save.rate = g.save.rate * 0.95 + g.incomeWindow * 0.05;
    g.incomeWindow = 0;
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
    g.hiddenAt = Date.now();
    g.engine.stop();
    writeServer({ keepalive: true });
  } else {
    // Time spent in another tab counts as offline time.
    const away = offlineEarnings(g.save);
    if (away.away > 60 && away.amount >= 1) { g.pending += away.amount; g.awaySeconds = away.seconds; }
    g.engine.start();
  }
}

function pageHtml() {
  return `<div class="blast">
    <section class="bl-play">
      <div class="bl-top card">
        <div class="bl-money"><span class="bl-coin">🪙</span><strong id="bl-money">0</strong><span class="muted small" id="bl-rate"></span></div>
        <div class="bl-stage"><span class="badge bl-prestige-badge" id="bl-prestige" hidden></span><span class="badge" id="bl-stage">Secteur 1</span><div class="bl-bar"><span id="bl-bar"></span></div></div>
        <button class="btn accent sm" id="bl-collect" data-action="bl-collect" hidden></button>
      </div>
      <div class="bl-canvas-wrap"><canvas id="bl-canvas" aria-label="Terrain de jeu : touche les blocs pour les casser"></canvas></div>
      <button class="btn block bl-boost" id="bl-boost" data-action="bl-boost">
        ${shipSvg('#fff', 26)}<span id="bl-boost-label">ACCÉLÉRATION</span><span class="bl-boost-fill" id="bl-boost-fill"></span></button>
    </section>
    <section class="bl-side">
      <h1 class="bl-title">${title('🚀', 'Jimmy Blast')}</h1>
      <div class="tabs bl-tabs" role="tablist">
        <button data-action="bl-tab" data-tab="ships">🛸 Vaisseaux</button>
        <button data-action="bl-tab" data-tab="upgrades">⚙️ Améliorations</button>
        <button data-action="bl-tab" data-tab="ranking">🏆 Classement</button>
      </div>
      <div id="bl-panel"></div>
      <p class="muted small bl-help">Tes vaisseaux foncent sur les blocs du secteur : chaque dégât rapporte des crédits, chaque bloc cassé un bonus.
        Touche les blocs pour aider Jimmy. ${MERGE_COST} vaisseaux d’un rang fusionnent en 1 vaisseau du rang supérieur.</p>
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
  const key = `${g.tab}|${visibleTiers().join(',')}|${g.mult}|${g.leaderboard ? 1 : 0}`;
  if (key === g.structure) return;
  g.structure = key;
  for (const b of document.querySelectorAll('.bl-tabs button')) b.classList.toggle('active', b.dataset.tab === g.tab);
  const $p = document.getElementById('bl-panel');
  if (g.tab === 'ships') {
    $p.innerHTML = `<div class="row bl-mult">Quantité : ${MULTS.map((m) => `<button class="btn ghost sm ${m === g.mult ? 'active' : ''}" data-action="bl-mult" data-m="${m}">${m === 'max' ? 'Max' : `×${m}`}</button>`).join('')}</div>
      <div class="bl-cards">${visibleTiers().map((t) => `
      <div class="bl-card" style="--c:${TIERS[t].color}">
        <span class="bl-count" id="bc-${t}"></span>
        <div class="bl-card-head">${shipSvg(TIERS[t].color)}<div><strong>${esc(TIERS[t].name)}</strong>
          <div class="bl-dmg"><span id="bd-${t}"></span> <span class="muted small">dégâts</span></div>
          <div class="muted small" id="bl-${t}"></div></div></div>
        <div class="bl-btns">
          ${t === 0
    ? '<button class="btn sm" data-action="bl-buy" id="bb-0"></button>'
    : `<button class="btn sm" data-action="bl-merge" data-t="${t}" id="bm-${t}"></button>`}
          <button class="btn sm" data-action="bl-level" data-t="${t}" id="bu-${t}"></button>
        </div>
      </div>`).join('')}</div>`;
  } else if (g.tab === 'upgrades') {
    $p.innerHTML = `<div class="stack">
      <div class="bl-upg bl-prestige card-inset">
        <span class="bl-upg-emoji">⭐</span>
        <div class="bl-upg-text"><strong>Prestige</strong> <span class="badge" id="pl"></span>
          <div class="muted small">Recommence à zéro (secteur 1, flotte et améliorations) contre ${fmt(PRESTIGE_COST)} crédits :
            dégâts <strong>+${Math.round(PRESTIGE_BONUS * 100)} %</strong> pour toujours, cumulés à chaque prestige.</div>
          <div class="small" id="pn"></div></div>
        <button class="btn accent sm" data-action="bl-prestige" id="pb"></button>
      </div>
      ${Object.entries(UPGRADES).map(([k, u]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${u.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(u.label)}</strong> <span class="badge" id="ul-${k}"></span><div class="muted small">${esc(u.desc)}</div></div>
        <button class="btn sm" data-action="bl-upgrade" data-k="${k}" id="ub-${k}"></button>
      </div>`).join('')}
      <button class="btn ghost sm bl-reset" data-action="bl-reset">🗑 Recommencer à zéro</button></div>`;
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
        <span class="bl-rank-name">${esc(p.username)}</span><span class="badge">Secteur ${fmt(p.score)}</span></li>`).join('')}</ol>`
      : '<p class="muted">Personne au classement pour l’instant.</p>';
  }
}

const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
const enable = (id, on) => { const el = document.getElementById(id); if (el) el.disabled = !on; };

/** Refreshes numbers and button states without rebuilding the DOM (clicks stay reliable). */
function tick() {
  if (!g) return;
  const s = g.save;
  buildPanel();
  set('bl-money', fmt(s.money));
  set('bl-rate', s.rate >= 1 ? `+${fmt(s.rate)}/s` : '');
  set('bl-stage', `Secteur ${fmt(s.stage)}`);
  const $pr = document.getElementById('bl-prestige');
  if ($pr) { $pr.hidden = !s.prestige; set('bl-prestige', `⭐ ${s.prestige} · ×${fmtFactor(prestigeFactor(s))}`); }
  const bar = document.getElementById('bl-bar');
  if (bar) bar.style.width = `${Math.round(g.engine.progress() * 100)}%`;
  const $collect = document.getElementById('bl-collect');
  if ($collect) {
    $collect.hidden = !g.pending;
    set('bl-collect', `🌙 Collecter ${fmt(g.pending)}`);
  }
  const boost = g.engine.boostLeft();
  const cooldown = Math.max(0, (g.boostReadyAt || 0) - Date.now()) / 1000;
  set('bl-boost-label', boost > 0 ? `ACCÉLÉRATION ×${BOOST.factor} · ${Math.ceil(boost)} s` : cooldown > 0 ? `Recharge… ${Math.ceil(cooldown)} s` : 'ACCÉLÉRATION');
  enable('bl-boost', boost <= 0 && cooldown <= 0);
  const fill = document.getElementById('bl-boost-fill');
  if (fill) fill.style.width = `${boost > 0 ? (boost / BOOST.duration) * 100 : cooldown > 0 ? 100 - (cooldown / (BOOST.cooldown - BOOST.duration)) * 100 : 100}%`;

  if (g.tab === 'ships') {
    for (const t of visibleTiers()) {
      const tier = s.tiers[t];
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
        set(`bm-${t}`, `Fusionner<br><span>${Math.min(s.tiers[t - 1].count, MERGE_COST)} / ${MERGE_COST}</span>`);
        enable(`bm-${t}`, canMerge(s, t));
      }
    }
  } else if (g.tab === 'upgrades') {
    const f = prestigeFactor(s);
    set('pl', `${s.prestige} · dégâts ×${fmtFactor(f)}`);
    set('pn', canPrestige(s) ? `Prêt : tes dégâts passeront à ×${fmtFactor(f * (1 + PRESTIGE_BONUS))}.` : `<span class="muted">Encore ${fmt(PRESTIGE_COST - s.money)} crédits.</span>`);
    set('pb', `⭐ ${fmt(PRESTIGE_COST)}`);
    enable('pb', canPrestige(s));
    for (const [k, u] of Object.entries(UPGRADES)) {
      const lvl = s.upgrades[k];
      set(`ul-${k}`, `${lvl} / ${u.max}`);
      set(`ub-${k}`, lvl >= u.max ? 'Max' : fmt(upgradeCost(k, lvl)));
      enable(`ub-${k}`, canUpgrade(s, k));
    }
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
  if (mergeShips(g.save, t)) toast(`✨ Nouveau ${TIERS[t].name} !`);
  after(true);
};
actions['bl-level'] = (el) => {
  const t = Number(el.dataset.t);
  after(levelUp(g.save, t, levelsToBuy(t)), 'Pas assez de crédits.');
};
actions['bl-upgrade'] = (el) => after(buyUpgrade(g.save, el.dataset.k), 'Pas assez de crédits.');
actions['bl-boost'] = () => {
  if (g.engine.boostLeft() > 0 || (g.boostReadyAt || 0) > Date.now()) return;
  g.engine.boost();
  g.boostReadyAt = Date.now() + BOOST.cooldown * 1000;
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
actions['bl-prestige'] = () => {
  const s = g.save;
  if (!canPrestige(s)) return;
  const next = fmtFactor(prestigeFactor(s) * (1 + PRESTIGE_BONUS));
  if (!confirm(`⭐ Prestige ${s.prestige + 1}\n\nTu repars du secteur 1 avec 1 vaisseau, sans crédits ni améliorations.\nEn échange, tes dégâts passent à ×${next} pour toujours.\n\nOn y va ?`)) return;
  doPrestige(s);
  g.pending = 0;
  g.engine.restart();
  g.structure = '';
  g.tab = 'ships';
  writeServer();
  toast(`⭐ Prestige ${s.prestige} ! Dégâts ×${next}`);
  tick();
};

actions['bl-reset'] = async () => {
  if (!confirm('Effacer ta partie de Jimmy Blast et repartir du secteur 1 ?')) return;
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
