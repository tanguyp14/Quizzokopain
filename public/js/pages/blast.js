// Jimmy Blast: incremental game page (fleet, upgrades, prestige tree, missions, leaderboard, saves).
import {
  state, actions, render, api, esc, avatar, toast, title,
} from '../core.js';
import {
  TIERS, UPGRADES, ABILITIES, MAX_SHIPS_PER_TIER, newSave, normalizeSave, fleetDamage, levelCost, affordableLevels, buyCostN, affordableShips,
  canBuy, canMerge, mergeCost, possibleMerges, canLevel, levelCap, atLevelCap, ascensionActive, ascensionCost, canAscend, ascend, ASCENSION, tierVisible, buyShip, mergeShips, levelUp, upgradeCost, canUpgrade, buyUpgrade, offlineEarnings, earn, fmt,
  prestigeCost, PRESTIGE_BONUS, PRESTIGE_POINTS, PRESTIGE_COST_STEP, prestigeFactor, canPrestige, doPrestige, starsFor,
  CALIBER, MODULES, FINGER_CALIBER, FINGER_MODULES, WORKSHOP_UNLOCK, workshopOpen, caliberCost, canBuyCaliber, buyCaliber, canBuyModule, buyModule,
  fingerCost, canBuyFinger, buyFinger, canBuyFingerModule, buyFingerModule, clickDamage,
  canTravel, travelTo, resumeConquest, skillLocked, canAuto, setAuto, autoBuy, THEMES, isBossStage,
  prestigePoints, FORGE_UNLOCKS, alembicCost, alembicMax, transmute, RELICS, relicRecipe, canForgeRelic, forgeRelic,
  forgeFeatureOpen, forgeFeatureVisible, canUnlockFeature, unlockFeature,
  FORGE, RESOURCES, FORGE_UPGRADES, forgeVisible, forgeOpen, canUnlockForge, unlockForge, forgeRecipe, canForge, forgeUpgrade, resourceFor,
  SKILLS, skillCost, canBuySkill, buySkill, skillFactor, BOOST, boostDuration, UFO_FRENZY,
  MISSIONS, MISSION_REWARD_MINUTES, dailyMissions, claimMission, rewardCredits, track, planetName, planetsConquered,
} from '../games/blast/logic.js';
import { createBlast } from '../games/blast/engine.js';

const GAME = 'blast';
const LOCAL_SAVE = (id) => `neutron_blast_${id}`;
const SERVER_SAVE_EVERY = 30000;
const MULTS = [1, 10, 'max'];
const TABS = [['ships', '🛸', 'Flotte'], ['upgrades', '⚙️', 'Amélio.'], ['workshop', '🛠️', 'Atelier'], ['forge', '⚒️', 'Forge'], ['travel', '🧭', 'Secteurs'], ['prestige', '⭐', 'Prestige']];
// The Top is refreshed at fixed times, every 10 minutes (12:00, 12:10, 12:20…), the same for everyone.
const LEADERBOARD_EVERY = 10 * 60 * 1000;
const nextLeaderboardAt = (now = Date.now()) => {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / 10) * 10 + 10);
  return d.getTime();
};
const hhmm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
// Several devices on one account: only the device played last saves. Each save says which
// version it is based on; if another device saved since, the server refuses it (409) and this
// device stops, instead of overwriting the other one's progress.
const DEVICE = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 36);

async function writeServer({ keepalive = false } = {}) {
  if (!g || g.inactive) return;
  const game = g;
  writeLocal();
  game.lastServerSave = Date.now();
  try {
    const res = await fetch(`/api/arcade/${GAME}/save`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: game.save, score: game.save.maxStage, device: DEVICE, basedOn: game.serverAt || 0 }),
      credentials: 'same-origin',
      keepalive,
    });
    const body = await res.json().catch(() => ({}));
    if (g !== game) return;
    if (res.status === 409) pauseForOtherDevice();
    else if (res.ok) game.serverAt = body.updatedAt;
  } catch { /* offline: the local save is kept and sent next time */ }
}

async function fetchServerSave() {
  try { return (await api(`/api/arcade/${GAME}/save`)).save; } catch { return undefined; }
}

async function loadSave() {
  const server = await fetchServerSave();
  const local = readLocal();
  const pick = [server?.data, local].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  return { save: normalizeSave(pick || newSave()), serverAt: server?.updatedAt || 0 };
}

/** Another device saved after us: stop here until the player takes the game back. */
function pauseForOtherDevice() {
  if (g.inactive) return;
  g.inactive = true;
  g.engine.stop();
  const $o = document.getElementById('bl-elsewhere');
  if ($o) $o.hidden = false;
}

/** Replaces the game in memory by the server's version (played on another device). */
function applyServerSave(remote) {
  const fresh = normalizeSave(remote.data);
  for (const k of Object.keys(g.save)) delete g.save[k];
  Object.assign(g.save, fresh);
  dailyMissions(g.save, today());
  g.serverAt = remote.updatedAt;
  g.pending = 0;
  g.structure = '';
  g.missionsKey = null;
  g.engine.restart();
}

/** « Reprendre ici » / back on this tab: load the latest version and become the device that saves. */
async function takeOver({ quiet = false } = {}) {
  const remote = await fetchServerSave();
  if (!g) return false;
  const changed = remote && remote.updatedAt > (g.serverAt || 0) && remote.device !== DEVICE;
  if (changed) applyServerSave(remote);
  g.inactive = false;
  const $o = document.getElementById('bl-elsewhere');
  if ($o) $o.hidden = true;
  if (!document.hidden) g.engine.start();
  if (changed && !quiet) toast('🔄 Ta partie a avancé sur un autre appareil, elle a été rechargée');
  writeServer();
  tick();
  return changed;
}

// ---- page ------------------------------------------------------------------------------

export async function blastPage() {
  render('<p class="muted">Chargement de la flotte…</p>');
  const [{ save, serverAt }, rewards] = await Promise.all([
    loadSave(),
    api(`/api/arcade/${GAME}/rewards`).then((r) => r.rewards).catch(() => []),
  ]);
  if (!location.hash.startsWith('#/games')) return;
  const away = offlineEarnings(save);
  dailyMissions(save, today());
  g = {
    save, rewards, pending: away.away > 60 && away.amount >= 1 ? away.amount : 0,
    tab: 'ships', mult: 1, incomeWindow: 0, lastServerSave: Date.now(), timers: [], leaderboard: null, structure: '',
    serverAt, inactive: false, alFrom: 0, alTo: 1, alMult: 1,
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
  // Automatic shipyard (star tree): buys and merges twice a second for the tiers set to « Auto ».
  g.timers.push(setInterval(() => {
    if (!g || document.hidden || g.inactive) return;
    const done = autoBuy(g.save);
    if (done.merged || done.bought) g.engine.syncFleet();
  }, 500));
  loadLeaderboard();
  scheduleLeaderboard();
  g.timers.push(setInterval(() => {
    if (document.hidden || g.inactive) return; // hidden time is paid as offline earnings on return
    // Income rate over time (drives offline earnings).
    g.save.rate = g.save.rate * 0.95 + g.incomeWindow * 0.05;
    g.incomeWindow = 0;
    g.save.stats.playTime += 1;
    dailyMissions(g.save, today());
  }, 1000));
  g.timers.push(setInterval(() => {
    if (document.hidden || g.inactive) return;
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
  clearTimeout(g.leaderboardTimer);
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
    // Back on this tab: the game may have moved on elsewhere; otherwise the time away
    // counts as offline time.
    const away = offlineEarnings(g.save);
    takeOver().then((changed) => {
      if (g && !changed && away.away > 60 && away.amount >= 1) g.pending += away.amount;
    });
  }
}

function pageHtml() {
  return `<div class="blast">
    <aside class="bl-col bl-col-top card">
      <h3>🏆 Top</h3>
      <div id="bl-rank"><p class="muted">Chargement…</p></div>
    </aside>
    <section class="bl-play">
      <div class="bl-top card">
        <div class="bl-money"><span class="bl-coin">🪙</span><strong id="bl-money">0</strong><span class="muted small" id="bl-rate"></span></div>
        <div class="bl-stage">
          <span class="badge bl-prestige-badge" id="bl-prestige" hidden></span>
          <span class="badge" id="bl-planets" title="Planètes conquises"></span>
          <span class="badge bl-frenzy" id="bl-frenzy" hidden></span>
        </div>
        <button class="btn accent sm" id="bl-collect" data-action="bl-collect" hidden></button>
      </div>
      <div class="bl-progress card">
        <span class="bl-progress-stage" id="bl-stage">Secteur 1</span>
        <div class="bl-bar"><span id="bl-bar"></span></div>
        <span class="bl-progress-pct" id="bl-pct"></span>
      </div>
      <div class="bl-canvas-wrap"><canvas id="bl-canvas" aria-label="Terrain de jeu : touche les blocs pour les casser"></canvas>
        <div class="bl-elsewhere" id="bl-elsewhere" hidden>
          <p style="font-size:2.4rem;margin:0">📱💻</p>
          <strong>Partie ouverte sur un autre appareil</strong>
          <p class="muted small">Ta flotte a continué ailleurs. Pour ne rien perdre, un seul appareil joue à la fois.</p>
          <button class="btn accent" data-action="bl-takeover">🔄 Reprendre ici</button>
        </div></div>
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
    <aside class="bl-col bl-col-missions card">
      <h3>🎯 Missions du jour <i class="bl-dot" id="dot-missions" hidden></i></h3>
      <div id="bl-missions"></div>
    </aside>
  </div>`;
}

// ---- side panel -----------------------------------------------------------------------------

function visibleTiers() {
  return TIERS.map((_, t) => t).filter((t) => tierVisible(g.save, t));
}

function levelsToBuy(t) {
  const { level } = g.save.tiers[t];
  const room = Math.max(1, levelCap(g.save, t) - level); // never past the level-100 cap
  if (g.mult === 'max') return Math.max(1, Math.min(room, affordableLevels(t, level, g.save.money)));
  return Math.min(room, g.mult);
}

function shipsToBuy() {
  const room = 100_000;
  if (g.mult === 'max') return Math.max(1, Math.min(room, affordableShips(g.save)));
  return Math.max(1, Math.min(room, g.mult));
}

/** Alembic / relics block of the forge: locked (unlock with ⭐ or 🔷) or open. */
function forgeFeatureHtml(s, f) {
  if (!forgeFeatureVisible(s, f)) return '';
  const u = FORGE_UNLOCKS[f];
  if (!forgeFeatureOpen(s, f)) {
    const pitch = f === 'alembic'
      ? 'Transforme tes minerais en surplus : 3 d’un minerai contre 1 du minerai de la zone suivante (×3 par zone d’écart), ou 1 contre 1 vers une zone plus proche.'
      : 'Contenu de fin de partie : des reliques aux bonus globaux sans limite, qui demandent les 7 minerais en énormes quantités.';
    return `<div class="bl-feature card-inset locked">
      <div><strong>${u.emoji} ${esc(u.name)}</strong> <span class="muted small">🔒</span><div class="muted small">${pitch}</div></div>
      <button class="btn accent sm" data-action="bl-unlock-feature" data-f="${f}" id="uf-${f}">Débloquer<br><span>${u.stars} ⭐ + ${u.pp} 🔷</span></button>
    </div>`;
  }
  if (f === 'alembic') {
    const chips = (kind, sel) => RESOURCES.map((r, i) => `<button class="bl-ore-pick ${i === sel ? 'active' : ''}" data-action="bl-al-${kind}" data-i="${i}" title="${esc(r.name)}">${r.emoji}</button>`).join('');
    return `<div class="bl-feature card-inset">
      <strong>⚗️ Alambic</strong>
      <div class="bl-al-row"><span class="muted small">Donner</span>${chips('from', g.alFrom)}</div>
      <div class="bl-al-row"><span class="muted small">Recevoir</span>${chips('to', g.alTo)}</div>
      <div class="row bl-mult">${MULTS.map((m) => `<button class="btn ghost sm ${m === g.alMult ? 'active' : ''}" data-action="bl-al-mult" data-m="${m}">${m === 'max' ? 'Max' : `×${m}`}</button>`).join('')}
        <span class="small" id="al-prev"></span></div>
      <button class="btn accent sm" data-action="bl-transmute" id="al-go">⚗️ Transmuter</button>
    </div>`;
  }
  return `<div class="bl-feature card-inset">
    <strong>🏺 Reliques de Jimmy</strong> <span class="muted small">bonus globaux, sans limite · chaque niveau demande les 7 minerais (×2,5 par niveau)</span>
    ${Object.entries(RELICS).map(([k, r]) => `<div class="bl-forge-line">
      <div><span>${r.emoji} <strong>${esc(r.name)}</strong></span> <span class="badge" id="rl-${k}"></span>
        <div class="muted small">${esc(r.desc)}</div><div class="bl-recipe" id="rr-${k}"></div></div>
      <button class="btn sm" data-action="bl-relic" data-k="${k}" id="rb-${k}">Forger</button></div>`).join('')}
  </div>`;
}

const alembicCount = () => {
  const max = alembicMax(g.save, g.alFrom, g.alTo);
  return g.alMult === 'max' ? max : Math.min(g.alMult, max);
};

function buildPanel() {
  const fk = g.tab === 'forge'
    ? ['alembic', 'relics'].map((f) => `${forgeFeatureVisible(g.save, f)}${forgeFeatureOpen(g.save, f)}`).join() + `${g.alFrom}${g.alTo}${g.alMult}` : '';
  const key = `${g.tab}|${fk}|${canAuto(g.save)}|${workshopOpen(g.save)}|${forgeOpen(g.save)}|${g.tab === 'travel' ? `${g.save.runBest}|${g.save.locked}|${g.save.stage}` : ''}|${visibleTiers().join(',')}|${g.mult}|${g.rewards.length}`;
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
        <div class="bl-asc-info small" id="bai-${t}" hidden></div>
        <div class="bl-btns">
          ${t === 0
    ? '<button class="btn sm" data-action="bl-buy" id="bb-0"></button>'
    : `<button class="btn sm" data-action="bl-merge" data-t="${t}" id="bm-${t}"></button>`}
          <button class="btn sm" data-action="bl-level" data-t="${t}" id="bu-${t}"></button>
          ${canAuto(s) ? `<button class="btn sm bl-auto" data-action="bl-auto" data-t="${t}" id="ba-${t}"
            title="${t === 0 ? 'Achète des éclaireurs dès que possible' : `Fusionne dès que possible (active aussi les vaisseaux en dessous)`}">🤖 Auto</button>` : ''}
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
            dégâts <strong>+${Math.round(PRESTIGE_BONUS * 100)} %</strong> pour toujours, <strong>${prestigePoints(s)} 🔷 points</strong> pour l’atelier des vaisseaux
            et des <strong>étoiles</strong> (1, plus 1 par tranche de 10 secteurs atteints). Le prix augmente de ${fmt(PRESTIGE_COST_STEP)} à chaque prestige.</div>
          <div class="small" id="pn"></div></div>
        <button class="btn accent sm" data-action="bl-prestige" id="pb"></button>
      </div>
      <div class="spread"><h3 style="margin:0">🌌 Arbre des étoiles</h3><span class="badge bl-prestige-badge" id="stars"></span></div>
      <p class="muted small" style="margin:0">Bonus permanents, gardés à chaque prestige. Les étoiles viennent des prestiges, et 1 par jour en finissant les 3 missions.</p>
      ${Object.entries(SKILLS).map(([k, sk], i, all) => `
      ${i === 0 ? '<h4 class="bl-subhead">♾️ Bonus infinis <span class="muted small">(sans limite, de plus en plus chers)</span></h4>' : ''}
      ${sk.max !== Infinity && all[i - 1]?.[1].max === Infinity ? '<h4 class="bl-subhead">🎁 Bonus spéciaux</h4>' : ''}
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${sk.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(sk.label)}</strong> <span class="badge" id="sl-${k}"></span><div class="muted small">${esc(sk.desc)}</div></div>
        <button class="btn sm" data-action="bl-skill" data-k="${k}" id="sb-${k}"></button>
      </div>`).join('')}</div>`;
  } else if (g.tab === 'workshop') {
    $p.innerHTML = workshopOpen(s) ? `<div class="stack">
      <div class="spread"><p class="muted small" style="margin:0">Améliorations permanentes, gardées à chaque prestige. Chaque prestige rapporte ${prestigePoints(s)} 🔷 points.</p>
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
        <p><strong>L’atelier des vaisseaux s’ouvre à ${WORKSHOP_UNLOCK} 🔷 points de prestige.</strong></p>
        <p class="muted small" style="margin:0">Chaque prestige rapporte ${prestigePoints(s)} 🔷 points à dépenser ici : calibre de chaque vaisseau et du doigt de Jimmy,
          modules spéciaux (essaim d’éclaireurs, double tir, foreuse, doigt automatique…). Ces améliorations sont gardées pour toujours.</p></div>`;
  } else if (g.tab === 'travel') {
    const zoneCount = Math.ceil(s.runBest / 10);
    $p.innerHTML = `<div class="stack">
      <div class="bl-travel-status card-inset">
        ${s.locked
    ? `<div><strong>🔒 Ta flotte reste au secteur ${s.locked}</strong><div class="muted small">Chaque secteur vidé revient avec de nouveaux blocs. Ta conquête reprendra au secteur ${s.runBest}.</div></div>
          <button class="btn accent" data-action="bl-resume">🚀 Continuer à conquérir</button>`
    : `<div><strong>🚀 Conquête en cours</strong><div class="muted small">Choisis un secteur déjà atteint pour y rester (par exemple pour récolter son minerai ou refaire sa planète).</div></div>`}
      </div>
      ${[...Array(zoneCount).keys()].map((z) => {
    const theme = THEMES[z % THEMES.length];
    const ore = RESOURCES[z % RESOURCES.length];
    const first = z * 10 + 1;
    const last = Math.min(s.runBest, z * 10 + 10);
    return `<div class="bl-zone" style="--z:${theme.colors[0]}">
          <div class="bl-zone-head"><strong>${esc(theme.name)}</strong> <span class="muted small">secteurs ${first}–${z * 10 + 10}${forgeOpen(s) ? ` · ${ore.emoji} ${esc(ore.name)}` : ''}</span></div>
          <div class="bl-sectors">${[...Array(last - first + 1).keys()].map((i) => {
      const n = first + i;
      const here = n === s.stage;
      return `<button class="bl-sector ${here ? 'active' : ''} ${isBossStage(n) ? 'planet' : ''}" data-action="bl-travel" data-n="${n}"
              title="${isBossStage(n) ? `Planète ${esc(planetName(n))}` : `Secteur ${n}`}">${isBossStage(n) ? '🪐' : ''}${n}</button>`;
    }).join('')}</div></div>`;
  }).join('')}
    </div>`;
  } else if (g.tab === 'forge') {
    const zones = (i) => `secteurs ${i * 10 + 1}–${i * 10 + 10}`;
    $p.innerHTML = forgeOpen(s) ? `<div class="stack">
      <p class="muted small" style="margin:0">Chaque zone de 10 secteurs a son minerai : des blocs brillants en contiennent, et chaque planète conquise en donne ${FORGE.planetOre}.
        Les minerais sont gardés pour toujours et servent aux améliorations avancées.</p>
      <div class="bl-ores">${RESOURCES.map((r, i) => `<div class="bl-ore" style="--o:${r.color}" title="${esc(r.name)} · ${zones(i)} (puis tous les 70 secteurs)">
        <span class="bl-ore-emoji">${r.emoji}</span><strong id="ore-${i}"></strong><span class="muted small">${esc(r.name)}</span><span class="muted small">${zones(i)}</span></div>`).join('')}</div>
      ${forgeFeatureHtml(s, 'alembic')}
      ${forgeFeatureHtml(s, 'relics')}
      <h3 style="margin:6px 0 0">🛸 Améliorations des vaisseaux</h3>
      ${TIERS.map((tier, t) => `
      <div class="bl-upg bl-work card-inset" style="--c:${tier.color}">
        ${shipSvg(tier.color, 34)}
        <div class="bl-upg-text"><strong>${esc(tier.name)}</strong>
          ${Object.entries(FORGE_UPGRADES).map(([k, u]) => `<div class="bl-forge-line">
            <div><span>${u.emoji} <strong>${esc(u.name)}</strong></span> <span class="badge" id="fl-${k}-${t}"></span>
              <div class="muted small">${esc(u.descFor?.(t) || u.desc)}</div><div class="bl-recipe" id="fr-${k}-${t}"></div></div>
            <button class="btn sm" data-action="bl-forge" data-k="${k}" data-t="${t}" id="fb-${k}-${t}">Forger</button></div>`).join('')}
        </div>
      </div>`).join('')}</div>`
      : `<div class="card-inset center stack"><p style="font-size:2.5rem;margin:0">⚒️</p>
        <p><strong>La Forge</strong> : débloque-la pour ${FORGE.cost} 🔷 points de prestige.</p>
        <p class="muted small" style="margin:0">Ensuite, chaque zone de 10 secteurs cache son minerai (${RESOURCES.map((r) => r.emoji).join(' ')}) dans certains blocs.
          Combine-les pour forger des améliorations avancées : alliages (+% de dégâts) et stabilisateurs (moins de rebond) pour chaque vaisseau.</p>
        <button class="btn accent" data-action="bl-unlock-forge" id="forge-unlock">⚒️ Débloquer la Forge · ${FORGE.cost} 🔷</button>
        <p class="small" id="forge-need"></p></div>`;
  }
}

/** Daily missions (their own column on wide screens, under the game otherwise). */
function buildMissions() {
  const s = g.save;
  const d = dailyMissions(s, today());
  const key = `${d.date}`;
  if (key === g.missionsKey) return;
  g.missionsKey = key;
  const $m = document.getElementById('bl-missions');
  if (!$m) return;
  $m.innerHTML = `<div class="stack">
    <p class="muted small" style="margin:0">Nouvelles missions chaque jour à minuit, les mêmes pour tout le monde. Chacune rapporte ${MISSION_REWARD_MINUTES} min de gains,
      et les 3 réunies <strong>1 ⭐ étoile</strong>.</p>
    ${d.missions.map((m, i) => `
    <div class="bl-mission card-inset">
      <div class="spread"><strong>${esc(MISSIONS[m.kind].label(m.target))}</strong><span class="small" id="mp-${i}"></span></div>
      <div class="bl-bar"><span id="mb-${i}"></span></div>
      <button class="btn sm" data-action="bl-claim" data-i="${i}" id="mc-${i}"></button>
    </div>`).join('')}
    <p class="small center" id="m-bonus"></p></div>`;
}

/** Top players, refreshed every 5 minutes (the own save is sent first so the Top is up to date). */
/** Next refresh at the next round 10 minutes (plus a few seconds so everyone's saves are in). */
function scheduleLeaderboard() {
  const at = nextLeaderboardAt();
  g.leaderboardNext = at;
  const game = g;
  g.leaderboardTimer = setTimeout(() => {
    if (g !== game) return;
    if (!document.hidden) loadLeaderboard();
    scheduleLeaderboard();
  }, at - Date.now() + 2000 + Math.random() * 3000);
}

async function loadLeaderboard() {
  try {
    await writeServer();
    const { players } = await api(`/api/arcade/${GAME}/leaderboard`);
    if (!g) return;
    g.leaderboard = players;
    g.leaderboardAt = Math.floor(Date.now() / LEADERBOARD_EVERY) * LEADERBOARD_EVERY;
    renderLeaderboard();
  } catch { /* keep the previous Top */ }
}

function renderLeaderboard() {
  const $r = document.getElementById('bl-rank');
  if (!$r || !g.leaderboard) return;
  $r.innerHTML = (g.leaderboard.length ? `<ol class="bl-rank">${g.leaderboard.map((p, i) => `
    <li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(p, 28)}
      <span class="bl-rank-name">${esc(p.username)}</span>
      <span class="bl-rank-badges">${p.prestige ? `<span class="badge bl-prestige-badge" title="Prestiges">⭐ ${p.prestige}</span>` : ''}
      <span class="badge" title="Planètes conquises">🚩 ${planetsConquered(p.score)}</span><span class="badge" title="Meilleur secteur">Secteur ${fmt(p.score)}</span></span></li>`).join('')}</ol>`
    : '<p class="muted">Personne au classement pour l’instant.</p>')
    + `<p class="bl-rank-time">Top de ${hhmm(g.leaderboardAt)} · suivant ${hhmm(g.leaderboardNext || nextLeaderboardAt())}</p>`;
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
  set('bl-stage', `${s.locked ? '🔒 ' : ''}${bossLeft !== null ? `🪐 ${esc(planetName(s.stage))} · secteur ${fmt(s.stage)}` : `Secteur ${fmt(s.stage)} · ${esc(g.engine.themeName())}`}`);
  set('bl-planets', `🚩 ${planetsConquered(s.maxStage)}`);
  toggle('bl-prestige', s.prestige > 0 || s.skills.power > 0);
  set('bl-prestige', `⭐ ${s.prestige} · ×${fmtFactor(prestigeFactor(s) * skillFactor(s))}`);
  const frenzy = g.engine.frenzyLeft();
  toggle('bl-frenzy', frenzy > 0);
  set('bl-frenzy', `🛸 ×${UFO_FRENZY.factor} · ${Math.ceil(frenzy)} s`);
  set('bl-pct', `${Math.floor(g.engine.progress() * 100)} %`);
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
  toggle('dot-prestige', canPrestige(s) || Object.keys(SKILLS).some((k) => canBuySkill(s, k)));
  // The sectors tab comes with the interspace travel.
  const $tt = document.querySelector('.bl-tabs button[data-tab=travel]');
  if ($tt) $tt.hidden = !canTravel(s);
  if (!canTravel(s) && g.tab === 'travel') g.tab = 'ships';
  // The forge tab shows up from prestige 5.
  const $ft = document.querySelector('.bl-tabs button[data-tab=forge]');
  const forgeShown = forgeVisible(s);
  if ($ft && $ft.hidden === forgeShown) {
    $ft.hidden = !forgeShown;
    if (forgeShown && g.forgeWasHidden) toast(`⚒️ Prestige ${FORGE.prestige} : la Forge peut être débloquée !`);
  }
  g.forgeWasHidden = !forgeShown;
  if (!forgeShown && g.tab === 'forge') g.tab = 'ships';
  toggle('dot-forge', forgeOpen(s) ? TIERS.some((_, t) => Object.keys(FORGE_UPGRADES).some((k) => canForge(s, k, t))) : canUnlockForge(s));
  // The workshop tab only shows up once unlocked.
  const open = workshopOpen(s);
  const $wt = document.querySelector('.bl-tabs button[data-tab=workshop]');
  if ($wt && $wt.hidden === open) {
    $wt.hidden = !open;
    if (open && g.workshopWasClosed) toast(`🛠️ Atelier des vaisseaux débloqué : ${s.pp} 🔷 points à dépenser !`);
  }
  g.workshopWasClosed = !open;
  if (!open && g.tab === 'workshop') g.tab = 'ships';
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
      set(`bl-${t}`, `Niveau ${tier.level}${ascensionActive(s) ? ` / ${levelCap(s, t)}` : ''}${tier.asc ? ` · <span class="bl-asc">🌟 Ascension ${tier.asc} · dégâts ×${fmt(ASCENSION.factor ** tier.asc)}</span>` : ''}`);
      const $bu = document.getElementById(`bu-${t}`);
      if (canLevel(s, t) && atLevelCap(s, t)) {
        // Level cap: the button becomes the ascension (credits + ores).
        const { credits, ores } = ascensionCost(s, t);
        if ($bu) { $bu.dataset.action = 'bl-ascend'; $bu.classList.add('bl-ascend'); }
        // A simple button (name + credits); what it does and the ores are explained above it.
        set(`bu-${t}`, `🌟 Ascension<br><span>${fmt(credits)}</span>${ores.length ? `<small class="bl-asc-ores">${ores.map(({ res, amount }) => `<i class="${s.forge.res[res] >= amount ? '' : 'missing'}">${RESOURCES[res].emoji}${fmt(amount)}</i>`).join(' ')}</small>` : ''}`);
        enable(`bu-${t}`, canAscend(s, t));
        set(`bai-${t}`, `🌟 <strong>Niveau ${levelCap(s, t)} atteint</strong> : l’ascension multiplie les dégâts par ${ASCENSION.factor}`);
        // Ores of the price: in the button's tooltip.
        if ($bu) $bu.title = ores.length ? `Prix : ${fmt(credits)} crédits + ${ores.map(({ res, amount }) => `${fmt(amount)} ${RESOURCES[res].name} (tu en as ${fmt(s.forge.res[res])})`).join(' + ')}` : `Prix : ${fmt(credits)} crédits`;
        toggle(`bai-${t}`, true);
      } else {
        if ($bu) { $bu.dataset.action = 'bl-level'; $bu.classList.remove('bl-ascend'); $bu.title = ''; }
        toggle(`bai-${t}`, false);
        const n = levelsToBuy(t);
        const cost = levelCost(t, tier.level, n);
        set(`bu-${t}`, canLevel(s, t) ? `Niveau +${n}<br><span>${fmt(cost)}</span>` : 'Niveau<br><span>aucun vaisseau</span>');
        enable(`bu-${t}`, canLevel(s, t) && s.money >= cost);
      }
      if (t === 0) {
        const n0 = shipsToBuy();
        set('bb-0', `+${n0} vaisseau${n0 > 1 ? 'x' : ''}<br><span>${fmt(buyCostN(s, n0))}</span>`);
        enable('bb-0', canBuy(s, n0));
      } else {
        const m = mergesToDo(t);
        set(`bm-${t}`, m > 1 ? `Fusionner ×${m}<br><span>${fmt(m * mergeCost(s))} → ${m}</span>`
          : `Fusionner<br><span>${Math.min(s.tiers[t - 1].count, mergeCost(s))} / ${mergeCost(s)}</span>`);
        enable(`bm-${t}`, canMerge(s, t));
      }
      const $a = document.getElementById(`ba-${t}`);
      if ($a) {
        $a.classList.toggle('on', s.auto[t]);
        set(`ba-${t}`, s.auto[t] ? '🤖 Auto ON' : '🤖 Auto');
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
      ? `Prêt : dégâts ×${fmtFactor(f * (1 + PRESTIGE_BONUS))}, <strong>+${prestigePoints(s)} 🔷</strong> et <strong>+${starsFor(s)} ⭐</strong> (meilleur secteur de la partie : ${s.runBest}).`
      : `<span class="muted">Encore ${fmt(prestigeCost(s) - s.money)} crédits · rapportera ${prestigePoints(s)} 🔷 et ${starsFor(s)} ⭐ (meilleur secteur : ${s.runBest}).</span>`);
    set('pc', fmt(prestigeCost(s)));
    set('pb', `⭐ ${fmt(prestigeCost(s))}`);
    enable('pb', canPrestige(s));
    set('stars', `${s.stars} ⭐ à dépenser`);
    for (const [k, sk] of Object.entries(SKILLS)) {
      const lvl = s.skills[k];
      set(`sl-${k}`, sk.max === Infinity ? `niv. ${lvl}` : `${lvl} / ${sk.max}`);
      set(`sb-${k}`, lvl >= sk.max ? (sk.max === 1 ? '✅ Débloqué' : 'Max') : skillLocked(s, k) ? `🔒 Prestige ${sk.prestige}` : `${skillCost(k, lvl)} ⭐`);
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
      set(`wc-l-${t}`, `calibre ${lvl}`);
      set(`wc-b-${t}`, `Calibre +1<br><span>${fmt(caliberCost(s, t))} 🔷</span>`);
      enable(`wc-b-${t}`, canBuyCaliber(s, t));
      set(`wm-b-${t}`, s.workshop.modules[t] ? '✅ Module' : `Module<br><span>${MODULES[t].cost} 🔷</span>`);
      enable(`wm-b-${t}`, canBuyModule(s, t));
    });
  } else if (g.tab === 'forge') {
    for (const f of ['alembic', 'relics']) enable(`uf-${f}`, canUnlockFeature(s, f));
    if (s.forge.alembic) {
      const n = alembicCount();
      const cost = alembicCost(g.alFrom, g.alTo);
      set('al-prev', g.alFrom === g.alTo ? '<span class="muted">Choisis deux minerais différents</span>'
        : `${fmt(Math.max(n, 1) * cost)} ${RESOURCES[g.alFrom].emoji} → ${fmt(Math.max(n, 1))} ${RESOURCES[g.alTo].emoji} <span class="muted">(${cost} pour 1)</span>`);
      enable('al-go', n >= 1);
    }
    if (s.forge.relicsOpen) {
      for (const k of Object.keys(RELICS)) {
        set(`rl-${k}`, `niv. ${s.forge.relics[k]}`);
        set(`rr-${k}`, relicRecipe(k, s.forge.relics[k]).map(({ res, amount }) => {
          const ok = s.forge.res[res] >= amount;
          return `<span class="bl-chip ${ok ? '' : 'missing'}" title="${esc(RESOURCES[res].name)}">${RESOURCES[res].emoji} ${fmt(s.forge.res[res])}/${fmt(amount)}</span>`;
        }).join(''));
        enable(`rb-${k}`, canForgeRelic(s, k));
      }
    }
    if (forgeOpen(s)) {
      RESOURCES.forEach((_, i) => set(`ore-${i}`, fmt(s.forge.res[i])));
      TIERS.forEach((_, t) => {
        for (const [k, u] of Object.entries(FORGE_UPGRADES)) {
          const lvl = s.forge[k][t];
          set(`fl-${k}-${t}`, u.max === Infinity ? `niv. ${lvl}` : `${lvl} / ${u.max}`);
          set(`fr-${k}-${t}`, lvl >= u.max ? '<span class="muted">Niveau max</span>' : forgeRecipe(k, t, lvl).map(({ res, amount }) => {
            const ok = s.forge.res[res] >= amount;
            return `<span class="bl-chip ${ok ? '' : 'missing'}" title="${esc(RESOURCES[res].name)}">${RESOURCES[res].emoji} ${fmt(s.forge.res[res])}/${amount}</span>`;
          }).join(''));
          enable(`fb-${k}-${t}`, canForge(s, k, t));
        }
      });
    } else {
      enable('forge-unlock', canUnlockForge(s));
      set('forge-need', canUnlockForge(s) ? '' : `<span class="muted">Tu as ${s.pp} 🔷 points (il en faut ${FORGE.cost}).</span>`);
    }
  }
  buildMissions();
  toggle('dot-missions', (s.daily?.missions || []).some((m) => !m.claimed && m.progress >= m.target));
  {
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

actions['bl-tab'] = (el) => { g.tab = el.dataset.tab; tick(); };
actions['bl-mult'] = (el) => { g.mult = el.dataset.m === 'max' ? 'max' : Number(el.dataset.m); tick(); };
actions['bl-buy'] = () => after(buyShip(g.save, shipsToBuy()), 'Pas assez de crédits.');
/** Merges follow the quantity selector: ×1, ×10 or Max. */
const mergesToDo = (t) => (g.mult === 'max' ? possibleMerges(g.save, t) : Math.min(g.mult, possibleMerges(g.save, t)));
actions['bl-merge'] = (el) => {
  const t = Number(el.dataset.t);
  const first = g.save.tiers[t].count === 0;
  const made = mergeShips(g.save, t, Math.max(1, mergesToDo(t)));
  if (made) toast(`✨ ${made > 1 ? `${made} nouveaux ${TIERS[t].name}s` : `Nouveau ${TIERS[t].name}`} !${ABILITIES[t] && first ? ` Pouvoir : ${ABILITIES[t].name}` : ''}`);
  after(true);
};
actions['bl-level'] = (el) => {
  const t = Number(el.dataset.t);
  after(levelUp(g.save, t, levelsToBuy(t)), 'Pas assez de crédits.');
};
actions['bl-ascend'] = (el) => {
  const t = Number(el.dataset.t);
  if (ascend(g.save, t)) {
    toast(`🌟 ${TIERS[t].name} : Ascension ${g.save.tiers[t].asc} ! Dégâts ×${ASCENSION.factor}, niveaux jusqu’à ${levelCap(g.save, t)}`);
    writeServer();
  } else toast('Il manque des crédits ou des minerais pour l’ascension.', true);
  tick();
};
actions['bl-upgrade'] = (el) => after(buyUpgrade(g.save, el.dataset.k), 'Pas assez de crédits.');
actions['bl-takeover'] = () => takeOver();
actions['bl-auto'] = (el) => {
  const t = Number(el.dataset.t);
  const on = !g.save.auto[t];
  setAuto(g.save, t, on);
  toast(on
    ? `🤖 Auto : ${TIERS.slice(0, t + 1).map((x) => x.name).join(', ')}`
    : `🤖 Auto coupé : ${TIERS[t].name}${t < TIERS.length - 1 ? ' et les vaisseaux au-dessus' : ''}`);
  tick();
};
actions['bl-travel'] = (el) => {
  const n = Number(el.dataset.n);
  if (!travelTo(g.save, n)) return;
  g.engine.travel();
  toast(`🌌 Voyage vers le secteur ${n} : ta flotte y reste jusqu’à « Continuer à conquérir »`);
  writeServer();
  tick();
  return changed;
};
actions['bl-resume'] = () => {
  resumeConquest(g.save);
  g.engine.travel();
  toast(`🚀 Reprise de la conquête au secteur ${g.save.stage}`);
  writeServer();
  tick();
  return changed;
};
actions['bl-unlock-feature'] = (el) => {
  const { f } = el.dataset;
  if (!unlockFeature(g.save, f)) return;
  toast(`${FORGE_UNLOCKS[f].emoji} ${FORGE_UNLOCKS[f].name} débloqué !`);
  writeServer();
  tick();
};
actions['bl-al-from'] = (el) => { g.alFrom = Number(el.dataset.i); tick(); };
actions['bl-al-to'] = (el) => { g.alTo = Number(el.dataset.i); tick(); };
actions['bl-al-mult'] = (el) => { g.alMult = el.dataset.m === 'max' ? 'max' : Number(el.dataset.m); tick(); };
actions['bl-transmute'] = () => {
  const made = transmute(g.save, g.alFrom, g.alTo, alembicCount());
  if (made) toast(`⚗️ +${fmt(made)} ${RESOURCES[g.alTo].emoji} ${RESOURCES[g.alTo].name}`);
  tick();
};
actions['bl-relic'] = (el) => {
  const { k } = el.dataset;
  if (forgeRelic(g.save, k)) {
    toast(`${RELICS[k].emoji} ${RELICS[k].name} : niveau ${g.save.forge.relics[k]} !`);
    g.engine.syncFleet();
    writeServer();
  }
  tick();
};
actions['bl-unlock-forge'] = () => {
  if (!unlockForge(g.save)) return;
  toast(`⚒️ Forge débloquée ! Cherche les blocs brillants : ${RESOURCES[resourceFor(g.save.stage)].emoji} dans cette zone`);
  writeServer();
  tick();
  return changed;
};
actions['bl-forge'] = (el) => {
  const t = Number(el.dataset.t);
  const { k } = el.dataset;
  if (forgeUpgrade(g.save, k, t)) toast(`${FORGE_UPGRADES[k].emoji} ${TIERS[t].name} : ${FORGE_UPGRADES[k].name} niveau ${g.save.forge[k][t]}`);
  after(true);
};
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
  if (buySkill(g.save, k)) {
    toast(k === 'travel' ? '🌌 Voyage interspatial débloqué : nouvel onglet 🧭 Secteurs !'
      : k === 'auto' ? '🤖 Chantier automatique débloqué : bouton « Auto » sur chaque vaisseau !'
        : `🌌 ${SKILLS[k].label} : niveau ${g.save.skills[k]}`);
    if (SKILLS[k].max === 1) writeServer();
  }
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
  return changed;
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
  const pts = prestigePoints(s);
  if (!confirm(`⭐ Prestige ${s.prestige + 1}\n\nTu repars du secteur 1, sans crédits ni améliorations (l’atelier et l’arbre des étoiles sont gardés).\nEn échange : dégâts ×${next} pour toujours, +${pts} 🔷 points d’atelier et +${stars} étoile${stars > 1 ? 's' : ''}.\n\nOn y va ?`)) return;
  doPrestige(s);
  g.pending = 0;
  g.engine.restart();
  g.structure = '';
  writeServer();
  toast(`⭐ Prestige ${s.prestige} ! Dégâts ×${next}, +${pts} 🔷, +${stars} ⭐`);
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
