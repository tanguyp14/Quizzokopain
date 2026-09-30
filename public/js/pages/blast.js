// Jimmy Blast: incremental game page (fleet, upgrades, prestige tree, missions, leaderboard, saves).
import {
  state, actions, render, api, esc, avatar, notify, title,
} from '../core.js';
import {
  TIERS, UPGRADES, ABILITIES, MAX_SHIPS_PER_TIER, newSave, normalizeSave, fleetDamage, levelCost, affordableLevels, buyCostN, affordableShips,
  canBuy, canMerge, mergeCost, possibleMerges, mergeable, setReserve, canLevel, levelCap, atLevelCap, ascensionActive, ascensionCost, canAscend, ascend, ASCENSION, ascensionForgeLevel, ascensionForgeReady, tierVisible, buyShip, mergeShips, levelUp, upgradeCost, canUpgrade, buyUpgrade, offlineEarnings, offlineProgress, earn, fmt,
  prestigeCost, PRESTIGE_BONUS, PRESTIGE_POINTS, PRESTIGE_COST_STEP, PRESTIGE_SECTOR, prestigeFactor, canPrestige, prestigeSector, prestigeShare, prestigeCapped, prestigeSectorReached, doPrestige, starsFor,
  CALIBER, MODULES, FINGER_CALIBER, FINGER_MODULES, WORKSHOP_UNLOCK, workshopOpen, caliberCost, canBuyCaliber, buyCaliber, canBuyModule, buyModule, MODULES2, canBuyModule2, buyModule2,

  fingerCost, canBuyFinger, buyFinger, canBuyFingerModule, buyFingerModule, clickDamage,
  canTravel, travelTo, resumeConquest, skillLocked, canAuto, setAuto, autoBuy, canAutoUpgrade, autoUpgrade, canAutoLevel, canAutoAsc, autoLevelUp, THEMES, isBossStage,
  prestigePoints, FORGE_UNLOCKS, runRank, DM_SHOP, DM_FRAMES, BIG_BANG, bigBangSector, resonance, dmCost, canBuyDm, buyDm, bigBangVisible, canBigBang, doBigBang, singularityFactor, alembicCost, alembicMax, transmute, RELICS, relicRecipe, canForgeRelic, forgeRelic,
  forgeFeatureOpen, forgeFeatureVisible, canUnlockFeature, unlockFeature,
  zoneAffinity, zoneFactor, ZONE_BONUS, ZONE_MALUS, squadronTypes, squadronFactor, squadronBonus, FORMATION, formationLength, SYNERGIES, canBuySynergy, buySynergy, synergyOn, PLANET_WEAK, planetWeakTier, SQUADRON, ADV_UNLOCKS, upgradeOpen, canUnlockAdv, unlockAdv, isSwarmStage,
  FORGE, RESOURCES, FORGE_UPGRADES, forgeVisible, forgeOpen, canUnlockForge, unlockForge, forgeRecipe, canForge, forgeUpgrade, resourceFor,
  SKILLS, skillCost, skillPrice, skillDiscount, universeBest, canBuySkill, buySkill, starBlockChance, starBlockCap, oreYield, portalStart, critFactor, oreChance, astrolabeFactor, bounceFactor, START_FLEET_PER_LEVEL, shipDiscount, shipRise, goldChance, bossTime, LAUNCH, launchLevel, launchAsc, launchAlloyNeed, launchCost, canLaunch, buyLaunch, skillFactor, BOOST, boostDuration, UFO_FRENZY,
  MISSIONS, MISSION_REWARD_MINUTES, dailyMissions, claimMission, dailyStars, achList, achDef, ACH_DIFFICULTY, achState, achProgress, updateAchievements, achievementPoints, claimAchievement, rewardCredits, track, planetName, planetsConquered,
} from '../games/blast/logic.js';
import { createBlast } from '../games/blast/engine.js';

const GAME = 'blast';
const LOCAL_SAVE = (id) => `neutron_blast_${id}`;
const SERVER_SAVE_EVERY = 30000;
import { notesButton } from '../patchnotes.js';

const MULTS = [1, 10, 'max'];
const ALEMBIC_MULTS = [1, 10, 100, 1000, 'max'];
const TABS = [['ships', '🛸', 'Flotte'], ['upgrades', '⚙️', 'Amélio.'], ['workshop', '🛠️', 'Atelier'], ['forge', '⚒️', 'Forge'], ['travel', '🧭', 'Secteurs'], ['prestige', '⭐', 'Prestige'], ['cosmos', '🌑', 'Big Bang']];
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
    // A 409 on our own newer version is an older request of this device arriving late: ignore it.
    if (res.status === 409 && body.rejected) adoptServerSave(body.save);
    else if (res.status === 409 && body.save?.device !== DEVICE) pauseForOtherDevice();
    else if (res.ok) game.serverAt = Math.max(game.serverAt || 0, body.updatedAt);
  } catch { /* offline: the local save is kept and sent next time */ }
}

/**
 * The server refused a save it can't believe: the game goes back to the server's save right here
 * (no reload, so no loop if the same save comes again), and this device keeps that one too.
 */
function adoptServerSave(save) {
  if (!g) return;
  applyServerSave(save?.data ? save : { data: newSave(), updatedAt: save?.updatedAt || 0 });
  writeLocal();
  const now = Date.now();
  if (now - (g.refusedAt || 0) > 60_000) notify('blast', 'Sauvegarde refusée par le serveur : retour à ta dernière partie valide.', true);
  g.refusedAt = now;
  buildPanel();
  tick();
}

async function fetchServerSave() {
  try { return (await api(`/api/arcade/${GAME}/save`)).save; } catch { return undefined; }
}

async function loadSave() {
  const server = await fetchServerSave();
  const local = readLocal();
  // The latest run first (a prestige is never undone), then the latest save. The device may be one
  // prestige ahead of the server (not sent yet), never more: the server's save is the reference.
  const bangs = (d) => Math.floor(Number(d?.bigBangs) || 0);
  const ok = (d) => d === server?.data || runRank(d) <= runRank(server?.data) + 1
    || (bangs(d) === bangs(server?.data) + 1 && (d.prestige || 0) <= 1); // a Big Bang not sent yet
  const pick = [server?.data, local].filter(Boolean).filter(ok)
    .sort((a, b) => runRank(b) - runRank(a) || (b.savedAt || 0) - (a.savedAt || 0))[0];
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
  delete fresh.starsCatchUp;
  for (const k of Object.keys(g.save)) delete g.save[k];
  Object.assign(g.save, fresh);
  dailyMissions(g.save, today());
  g.serverAt = remote.updatedAt;
  g.pending = 0;
  g.structure = '';
  g.missionsKey = null;
  g.planKey = null;
  g.engine.restart();
}

/** « Reprendre ici » / back on this tab: load the latest version and become the device that saves. */
async function takeOver({ quiet = false } = {}) {
  const remote = await fetchServerSave();
  if (!g) return false;
  // Never go back to an older run (fewer prestiges): this device's save wins then.
  const changed = remote && remote.updatedAt > (g.serverAt || 0) && remote.device !== DEVICE
    && runRank(remote.data) >= runRank(g.save);
  if (changed) applyServerSave(remote);
  g.inactive = false;
  const $o = document.getElementById('bl-elsewhere');
  if ($o) $o.hidden = true;
  if (!document.hidden) g.engine.start();
  if (changed && !quiet) notify('blast', '🔄 Ta partie a avancé sur un autre appareil, elle a été rechargée');
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
  const afk = away.away > 60 ? offlineProgress(save, away.seconds) : null;
  updateAchievements(save); // goals reached before this feature, and points for the Top
  const catchUp = save.starsCatchUp;
  delete save.starsCatchUp;
  g = {
    save, rewards, pending: away.away > 60 && away.amount >= 1 ? away.amount : 0,
    tab: 'ships', mult: 1, incomeWindow: 0, lastServerSave: Date.now(), timers: [], leaderboard: null, structure: '',
    serverAt, inactive: false, alFrom: 0, alTo: 1, alMult: 1, topBy: topByPref(), hideDone: (() => { try { return localStorage.getItem('blast-hide-done') === '1'; } catch { return false; } })(),
  };
  render(pageHtml());
  const canvas = document.getElementById('bl-canvas');
  g.light = lightPref();
  g.engine = createBlast(canvas, save, {
    light: g.light,
    onEarn: (n) => { g.incomeWindow += n; },
    onStage: (stage) => { if (stage % 5 === 0) writeServer(); },
    onStar: () => { notify('blast', '🔭 Une étoile trouvée : +1 ⭐'); writeServer(); },
    onBoss: (won) => {
      if (won) notify('blast', `🚩 ${planetName(g.save.stage - 1)} est conquise ! Gros butin de crédits`);
      else notify('blast', `🪐 ${planetName(g.save.stage + 1)} résiste : renforce ta flotte, tu retenteras au prochain secteur`, true);
    },
  });
  g.engine.start();
  showLight();
  if (catchUp) notify('blast', `⭐ Nouvelle formule des étoiles : +${fmt(catchUp)} ⭐ pour tes prestiges passés !`);
  afkToast(afk);
  state.view = () => {}; // the page draws itself; ignore global re-renders
  g.timers.push(setInterval(tick, 200));
  // Automatic shipyard (star tree): buys and merges twice a second for the tiers set to « Auto ».
  g.timers.push(setInterval(() => {
    if (!g || document.hidden || g.inactive) return;
    autoUpgrade(g.save); // upgrades first: the shipyard would otherwise spend everything on scouts
    autoLevelUp(g.save);
    const done = autoBuy(g.save);
    if (done.merged || done.bought) g.engine.syncFleet();
    // Dark matter shop: automatic acceleration and « Pilote total » II (automatic prestige).
    const s = g.save;
    if (s.dmShop.autoBoost && s.autoBoostOn) actions['bl-boost']();
    if (s.dmShop.pilot >= 2 && s.autoPrestigeOn && s.runBest >= s.autoPrestigeAt && canPrestige(s)) {
      prestigeNow(`🤖 Prestige automatique ${s.prestige + 1} : +${starsFor(s)} ⭐, +${prestigePoints(s)} 🔷`);
    }
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
      if (!g || changed || away.away <= 60) return;
      if (away.amount >= 1) g.pending += away.amount;
      const afk = offlineProgress(g.save, away.seconds);
      if (afk.sectors) { g.engine.restart(); g.structure = ''; tick(); writeServer(); }
      afkToast(afk);
    });
  }
}

/** What the fleet did while away (sectors, stars, ores). */
function afkToast(afk) {
  if (!afk?.sectors) return;
  const s = g.save;
  const ores = afk.ores.map((n, r) => (n ? `${fmt(n)} ${RESOURCES[r].emoji}` : '')).filter(Boolean);
  notify('blast', `🌙 Pendant ton absence : ${fmt(afk.sectors)} secteur${afk.sectors > 1 ? 's' : ''} ${s.locked ? `farmé${afk.sectors > 1 ? 's' : ''} (secteur ${s.stage})` : `(secteur ${afk.from} → ${s.stage})`}`
    + `${afk.stars ? ` · +${afk.stars} ⭐` : ''}${ores.length ? ` · ${ores.join(' ')}` : ''}`
    + `${afk.stuck && !s.locked ? ` · ${planetName(afk.stuck)} résiste` : ''}`);
}

function pageHtml() {
  return `<div class="blast">
    <aside class="bl-col bl-col-top card">
      <div class="bl-top-head"><h3>🏆 Top</h3>
        <div class="bl-top-switch" role="tablist">
          <button class="btn ghost sm" data-action="bl-top-by" data-by="ach" id="bl-top-ach">🏅 Objectifs</button>
          <button class="btn ghost sm" data-action="bl-top-by" data-by="sector" id="bl-top-sector">🚩 Secteur</button>
        </div></div>
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
      <div class="bl-zoneinfo small" id="bl-zone"></div>
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
      <div class="bl-title-row"><h1 class="bl-title">${title('🚀', 'Jimmy Blast')}</h1>
        <span class="row"><button class="btn ghost sm bl-auto" data-action="bl-light" id="bl-light" title="Mode léger : moins de vaisseaux dessinés, sans traînées, 30 images/s (mêmes dégâts), pour les téléphones et les PC lents"></button>
        ${notesButton('blast')}</span></div>
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
      <h3 class="bl-plan-title">🗺️ Plan d’attaque <i class="bl-dot" id="dot-plan" hidden></i></h3>
      <div id="bl-plan"></div>
    </aside>
    <div class="bl-overlay" id="bl-plan-overlay" hidden>
      <div class="bl-overlay-card card">
        <div class="spread"><h2 style="margin:0">🗺️ Plan d’attaque</h2><button class="btn ghost sm" data-action="bl-plan-close" aria-label="Fermer">✕</button></div>
        <p class="muted small" id="plan-sum"></p>
        <div id="bl-plan-all"></div>
      </div>
    </div>
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
      <div class="row bl-mult">${ALEMBIC_MULTS.map((m) => `<button class="btn ghost sm ${m === g.alMult ? 'active' : ''}" data-action="bl-al-mult" data-m="${m}">${m === 'max' ? 'Max' : `×${m}`}</button>`).join('')}
        <span class="small" id="al-prev"></span></div>
      <button class="btn accent sm" data-action="bl-transmute" id="al-go">⚗️ Transmuter</button>
    </div>`;
  }
  return `<div class="bl-feature card-inset">
    <strong>🏺 Reliques de Jimmy</strong> <span class="muted small">bonus globaux, sans limite · chaque niveau demande les 7 minerais (×2,5 par niveau)</span>
    ${Object.entries(RELICS).map(([k, r]) => `<div class="bl-forge-line">
      <div><span>${r.emoji} <strong>${esc(r.name)}</strong></span> <span class="badge" id="rl-${k}"></span> <span class="badge bl-effect" id="re-${k}"></span>
        <div class="muted small">${esc(r.desc)}</div><div class="bl-recipe" id="rr-${k}"></div></div>
      <button class="btn sm" data-action="bl-relic" data-k="${k}" id="rb-${k}">Forger</button></div>`).join('')}
  </div>`;
}

const alembicCount = () => {
  const max = alembicMax(g.save, g.alFrom, g.alTo);
  return g.alMult === 'max' ? max : Math.min(g.alMult, max);
};

/** « Masquer les débloqués »: hides maxed upgrades, special bonuses and finger modules (remembered on this device). */
const hideToggle = () => `<button class="btn ghost sm bl-hide-toggle ${g.hideDone ? 'on' : ''}" data-action="bl-hide-done"
  title="Masquer ou afficher ce qui est déjà débloqué ou au maximum">${g.hideDone ? '👁️ Afficher les débloqués' : '🙈 Masquer les débloqués'}</button>`;
/** Sub-tabs of a tab (Forge, Atelier, Prestige): the choice is kept while the page is open. */
const SUBTABS = {
  forge: [['ships', '🛸', 'Vaisseaux'], ['relics', '🏺', 'Reliques'], ['alembic', '⚗️', 'Alambic']],
  workshop: [['finger', '👆', 'Doigt de Jimmy'], ['ships', '🛸', 'Vaisseaux']],
  prestige: [['tree', '🌌', 'Arbre des étoiles'], ['bonus', '🎁', 'Bonus'], ['synergies', '🧬', 'Synergies'], ['launch', '🚀', 'Départ lancé']],
};
const sub = (tab) => g.sub?.[tab] || SUBTABS[tab][0][0];
const subTabs = (tab) => `<div class="bl-subtabs" role="tablist">${SUBTABS[tab].map(([id, emoji, label]) => `<button class="${sub(tab) === id ? 'active' : ''}"
  data-action="bl-sub" data-tab="${tab}" data-sub="${id}">${emoji} ${label}</button>`).join('')}</div>`;
actions['bl-sub'] = (el) => { g.sub = { ...g.sub, [el.dataset.tab]: el.dataset.sub }; tick(); };
const markDone = (id, done) => document.getElementById(id)?.closest('.bl-upg')?.classList.toggle('is-done', done);

function buildPanel() {
  const fk = g.tab === 'forge'
    ? ['alembic', 'relics'].map((f) => `${forgeFeatureVisible(g.save, f)}${forgeFeatureOpen(g.save, f)}`).join() + `${g.alFrom}${g.alTo}${g.alMult}` : '';
  const key = `${g.tab}|${fk}|${canAuto(g.save)}|${g.save.skills.reserve}|${g.save.skills.autoUpg}|${g.save.skills.autoLevel}|${g.save.skills.autoAsc}|${g.save.advTier}|${workshopOpen(g.save)}|${forgeOpen(g.save)}|${g.tab === 'travel' ? `${g.save.runBest}|${g.save.locked}|${g.save.stage}` : ''}|${visibleTiers().join(',')}|${g.mult}|${g.rewards.length}|${g.hideDone}|${SUBTABS[g.tab] ? sub(g.tab) : ''}|${g.tab === 'cosmos' ? `${JSON.stringify(g.save.dmShop)}|${g.save.bigBangs}` : ''}`;
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
  $p.classList.toggle('hide-done', Boolean(g.hideDone));
  const s = g.save;
  if (g.tab === 'ships') {
    $p.innerHTML = `<div class="bl-dps-total small" id="bl-squad"></div>
      <div class="bl-dps-total small" id="bl-formation"></div>
      <div class="bl-dps-total small" id="bl-dps-total"></div>
      <div class="row bl-mult">Quantité : ${MULTS.map((m) => `<button class="btn ghost sm ${m === g.mult ? 'active' : ''}" data-action="bl-mult" data-m="${m}">${m === 'max' ? 'Max' : `×${m}`}</button>`).join('')}</div>
      <div class="bl-cards">${visibleTiers().map((t) => `
      <div class="bl-card" style="--c:${TIERS[t].color}">
        <span class="bl-count" id="bc-${t}"></span>
        <div class="bl-card-head">${shipSvg(TIERS[t].color)}<div><strong>${esc(TIERS[t].name)}</strong> <span class="badge bl-zone-badge" id="bz-${t}" hidden></span>
          <div class="bl-dmg"><span id="bd-${t}"></span> <span class="muted small">dégâts</span></div>
          <div class="muted small" id="bl-${t}"></div>
          <div class="bl-dps small" id="bps-${t}"></div>
          ${ABILITIES[t] ? `<div class="bl-ability small">✨ <strong>${esc(ABILITIES[t].name)}</strong> : ${esc(ABILITIES[t].desc)}</div>` : ''}</div></div>
        <div class="bl-asc-info small" id="bai-${t}" hidden></div>
        ${s.skills.reserve ? `<div class="bl-reserve small" title="Ces vaisseaux ne sont jamais utilisés par les fusions (manuelles ou auto)">
          🛡️ Réserve <button class="btn ghost sm" data-action="bl-res" data-t="${t}" data-d="-5">−5</button><button class="btn ghost sm" data-action="bl-res" data-t="${t}" data-d="-1">−1</button>
          <strong id="rv-${t}"></strong>
          <button class="btn ghost sm" data-action="bl-res" data-t="${t}" data-d="1">+1</button><button class="btn ghost sm" data-action="bl-res" data-t="${t}" data-d="5">+5</button></div>` : ''}
        <div class="bl-btns">
          ${t === 0
    ? '<button class="btn sm" data-action="bl-buy" id="bb-0"></button>'
    : `<button class="btn sm" data-action="bl-merge" data-t="${t}" id="bm-${t}"></button>`}
          <button class="btn sm" data-action="bl-level" data-t="${t}" id="bu-${t}"></button>
          ${canAuto(s) ? `<button class="btn sm bl-auto" data-action="bl-auto" data-t="${t}" id="ba-${t}"
            title="${t === 0 ? 'Achète des éclaireurs dès que possible' : `Fusionne dès que possible (active aussi les vaisseaux en dessous)`}">🤖 Auto</button>` : ''}
          ${canAutoLevel(s) ? `<button class="btn sm bl-auto" data-action="bl-auto-level" data-t="${t}" id="bal-${t}" title="Monte les niveaux de ce vaisseau dès que possible (le moins cher d’abord)">📈 Auto niv.</button>` : ''}
          ${canAutoAsc(s) && ascensionActive(s) ? `<button class="btn sm bl-auto" data-action="bl-auto-asc" data-t="${t}" id="baa-${t}" title="Fait l’ascension de ce vaisseau dès qu’il est au cap (crédits, minerais et Alliage requis)">🌟 Auto asc.</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
  } else if (g.tab === 'upgrades') {
    const upgLine = ([k, u]) => `
      <div class="bl-upg card-inset ${u.adv ? 'bl-adv' : ''}">
        <span class="bl-upg-emoji">${u.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(u.label)}</strong> <span class="badge" id="ul-${k}"></span><div class="muted small">${esc(u.desc)}</div></div>
        <button class="btn sm" data-action="bl-upgrade" data-k="${k}" id="ub-${k}"></button>
        ${canAutoUpgrade(s) ? `<button class="btn sm bl-auto" data-action="bl-auto-upg" data-k="${k}" id="uba-${k}" title="Achète cette amélioration dès que possible">🤖 Auto</button>` : ''}
      </div>`;
    const tierUpg = (n) => Object.entries(UPGRADES).filter(([, u]) => (u.adv || 0) === n);
    const advTier = (n) => `
      <h4 class="bl-subhead">🔬 Améliorations avancées · ${ADV_UNLOCKS[n].label}</h4>
      ${s.advTier >= n ? tierUpg(n).map(upgLine).join('') : `
      <div class="bl-upg bl-adv-lock card-inset">
        <span class="bl-upg-emoji">🔒</span>
        <div class="bl-upg-text"><strong>${tierUpg(n).map(([, u]) => `${u.emoji} ${esc(u.label)}`).join(' · ')}</strong>
          <div class="muted small">Débloquées pour toujours (gardées au prestige), puis achetées avec des crédits à chaque partie.${n > 1 ? ' Demande le palier 1.' : ''}</div></div>
        <button class="btn accent sm" data-action="bl-adv-unlock" id="adv-u-${n}">${ADV_UNLOCKS[n].stars} ⭐</button>
      </div>`}`;
    $p.innerHTML = `<div class="stack"><div class="bl-hide-row">${hideToggle()}</div>${tierUpg(0).map(upgLine).join('')}
      ${advTier(1)}${s.advTier >= 1 ? advTier(2) : ''}
      <button class="btn ghost sm bl-reset" data-action="bl-reset">🗑 Effacer ma partie</button></div>`;
  } else if (g.tab === 'prestige') {
    $p.innerHTML = `<div class="stack">
      <div class="bl-prestige card-inset bl-pr">
        <div class="bl-pr-head"><span class="bl-pr-star">⭐</span>
          <div><strong>Prestige</strong><div class="muted small">Tout recommence, contre un bonus pour toujours</div></div>
          <span class="badge" id="pl"></span></div>
        <div class="bl-pr-gains" id="pgain"></div>
        <div class="bl-pr-goal">
          <div class="spread small"><span>🚩 Secteur à atteindre</span><span id="psec"></span></div>
          <div class="bl-bar"><span id="psbar"></span></div>
          <div class="spread small"><span>🪙 Crédits</span><span id="pc"></span></div>
          <div class="bl-bar"><span id="pcbar"></span></div>
        </div>
        <button class="btn accent block bl-pr-go" data-action="bl-prestige" id="pb"></button>
        <details class="bl-pr-rules small"><summary>Comment ça marche ?</summary>
          <p>Le prestige recommence la partie à zéro (secteur 1, flotte et améliorations). En échange : dégâts <strong>+${Math.round(PRESTIGE_BONUS * 100)} %</strong> pour toujours,
            <strong>${prestigePoints(s)} 🔷 points</strong> pour l’atelier des vaisseaux (10, +1 par tranche de 25 secteurs atteints) et des <strong>étoiles</strong> (1 + secteur ÷ 10 jusqu’au secteur 100, puis secteur² ÷ 1000 : 25 au secteur 150, 63 au 250, 161 au 400).</p>
          <p>Le prix augmente de ${fmt(PRESTIGE_COST_STEP)} à chaque prestige. Le secteur à atteindre vaut ${Math.round(PRESTIGE_SECTOR.share * 100)} % de ton meilleur secteur de l’univers (au moins ${PRESTIGE_SECTOR.base}),
            +${Math.round(PRESTIGE_SECTOR.step * 100)} % à chaque prestige sans nouveau record, même au-delà du record ; un nouveau record le ramène à ${Math.round(PRESTIGE_SECTOR.share * 100)} %.
            Il ne dépasse jamais ce que ta flotte peut atteindre : ta partie précédente, +1 secteur par ×1,35 de dégâts permanents gagnés depuis.</p>
        </details>
      </div>
      <div class="spread"><h3 style="margin:0">🌌 Étoiles</h3><span class="badge bl-prestige-badge" id="stars"></span></div>
      ${subTabs('prestige')}
      ${sub('prestige') === 'tree' ? '<p class="muted small" style="margin:0">♾️ Bonus infinis, gardés à chaque prestige : sans limite, de plus en plus chers. Les étoiles viennent des prestiges, et chaque jour 2 par prestige en finissant les 3 missions.</p>' : ''}
      ${sub('prestige') === 'bonus' ? `<div class="spread bl-subhead-row"><p class="muted small" style="margin:0">🎁 Bonus spéciaux, gardés à chaque prestige.</p>${hideToggle()}</div>` : ''}
      ${['tree', 'bonus'].includes(sub('prestige')) ? Object.entries(SKILLS).filter(([, sk]) => (sk.max === Infinity) === (sub('prestige') === 'tree')).map(([k, sk]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${sk.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(sk.label)}</strong> <span class="badge" id="sl-${k}"></span> <span class="badge bl-effect" id="se-${k}"></span><div class="muted small">${esc(sk.desc)}</div></div>
        <button class="btn sm" data-action="bl-skill" data-k="${k}" id="sb-${k}"></button>
      </div>`).join('') : ''}
      ${sub('prestige') === 'synergies' ? `<div class="spread bl-subhead-row"><p class="muted small" style="margin:0" id="sy-head">🧬 Débloquées pour toujours ; actives quand les deux types de vaisseaux sont en service.</p>${hideToggle()}</div>
      ${Object.entries(SYNERGIES).map(([k, sy]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${sy.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(sy.name)}</strong> <span class="badge" id="sy-l-${k}"></span>
          <div class="small">${sy.tiers.map((t) => `<span style="color:${TIERS[t].color}">${esc(TIERS[t].name)}</span>`).join(' + ')}</div>
          <div class="muted small">${esc(sy.desc)}</div></div>
        <button class="btn sm" data-action="bl-synergy" data-k="${k}" id="sy-b-${k}"></button>
      </div>`).join('')}` : ''}
      ${sub('prestige') === 'launch' ? `<p class="muted small" style="margin:0">🚀 Chaque vaisseau commence ses parties au niveau ${LAUNCH.step}, ${LAUNCH.step * 2}… sans limite · ⭐ + minerais · au-delà de 100, avec les ascensions et l’🔩 Alliage requis.</p>
      ${forgeOpen(s) ? TIERS.map((tier, t) => `
      <div class="bl-upg card-inset" style="--c:${tier.color}">
        ${shipSvg(tier.color, 34)}
        <div class="bl-upg-text"><strong>${esc(tier.name)}</strong> <span class="badge" id="lc-l-${t}"></span>
          <div class="bl-recipe" id="lc-r-${t}"></div></div>
        <button class="btn sm" data-action="bl-launch" data-t="${t}" id="lc-b-${t}"></button>
      </div>`).join('') : '<p class="muted small" style="margin:0">🔒 Demande la ⚒️ Forge (les minerais servent à le payer).</p>'}` : ''}</div>`;
  } else if (g.tab === 'cosmos') {
    const shop = s.dmShop;
    $p.innerHTML = `<div class="stack">
      <div class="bl-upg bl-bang card-inset">
        <span class="bl-upg-emoji">💥</span>
        <div class="bl-upg-text"><strong>Big Bang</strong> <span class="badge bl-dm-badge" id="bb-n"></span>
          <div class="muted small">Dès le secteur <strong>${bigBangSector(s.bigBangs)}</strong> atteint dans cet univers, tous prestiges confondus (+${BIG_BANG.step} à chaque Big Bang) : <strong>absolument tout</strong> repart de zéro (prestiges, étoiles, arbre des étoiles, atelier, Forge…)
            contre <strong>1 🌑 matière noire</strong>. Gardés : la boutique de matière noire (éternelle), le Plan d’attaque (les récompenses non récoltées sont perdues), ton record et tes stats.</div>
          <div class="small">🔔 <strong>Résonance cosmique</strong> : chaque Big Bang fait donne, pour toujours, +${Math.round(BIG_BANG.resonance * 100)} % de dégâts, d’étoiles de prestige et de minerais (×2, ×3, ×4…) et −${Math.round(BIG_BANG.discount * 100)} % sur l’arbre des étoiles (jusqu’à −${Math.round(BIG_BANG.maxDiscount * 100)} %).
            <span class="badge bl-dm-badge" id="bb-res"></span></div>
          <div class="small" id="bb-need"></div></div>
        <button class="btn accent sm" data-action="bl-bigbang" id="bb-b">💥 Big Bang<br><span>+1 🌑</span></button>
      </div>
      <div class="spread"><h3 style="margin:0">🌑 Boutique de matière noire</h3><span class="badge bl-dm-badge" id="dm"></span></div>
      <p class="muted small" style="margin:0">Éternelle : rien de ce que tu achètes ici n’est perdu, ni au prestige ni au Big Bang.</p>
      ${Object.entries(DM_SHOP).map(([k, it]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${it.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(it.label)}</strong> <span class="badge" id="dl-${k}"></span>
          <div class="muted small">${esc(it.desc)}</div>
          ${k === 'pilot' && shop.pilot >= 2 ? `<div class="bl-reserve small">🤖 Prestige auto
            <button class="btn ghost sm" data-action="bl-ap-at" data-d="-50">−50</button><button class="btn ghost sm" data-action="bl-ap-at" data-d="-10">−10</button>
            <strong id="ap-at"></strong>
            <button class="btn ghost sm" data-action="bl-ap-at" data-d="10">+10</button><button class="btn ghost sm" data-action="bl-ap-at" data-d="50">+50</button>
            <button class="btn sm bl-auto" data-action="bl-ap-on" id="ap-on"></button></div>` : ''}
          ${k === 'autoBoost' && shop.autoBoost ? '<div class="small"><button class="btn sm bl-auto" data-action="bl-ab-on" id="ab-on"></button></div>' : ''}
          ${k === 'frame' ? `<div class="bl-frame-preview small">${DM_FRAMES.slice(1).map((name, i) => `<span class="bl-bang-frame f${i + 1} ${shop.frame > i ? '' : 'locked'}" title="${esc(name)}">${esc(state.me.username)}</span>`).join('')}</div>` : ''}</div>
        <button class="btn sm" data-action="bl-dm" data-k="${k}" id="db-${k}"></button>
      </div>`).join('')}</div>`;
  } else if (g.tab === 'workshop') {
    $p.innerHTML = workshopOpen(s) ? `<div class="stack">
      <div class="spread"><p class="muted small" style="margin:0">Améliorations permanentes, gardées à chaque prestige. Chaque prestige rapporte ${prestigePoints(s)} 🔷 points.</p>
        <span class="badge bl-pp" id="pp"></span></div>
      ${subTabs('workshop')}
      ${sub('workshop') === 'finger' ? `<div class="spread bl-subhead-row"><p class="muted small" style="margin:0">👆 Les touches de Jimmy : calibre et modules.</p>${hideToggle()}</div>
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">👆</span>
        <div class="bl-upg-text"><strong>Calibre du doigt</strong> <span class="badge" id="wf-l"></span> <span class="badge bl-effect" id="wf-e"></span>
          <div class="muted small">Dégâts au toucher +${Math.round(FINGER_CALIBER.bonus * 100)} % par niveau · <span id="wf-d"></span></div></div>
        <button class="btn sm" data-action="bl-finger" id="wf-b"></button>
      </div>
      ${Object.entries(FINGER_MODULES).map(([k, m]) => `
      <div class="bl-upg card-inset">
        <span class="bl-upg-emoji">${m.emoji}</span>
        <div class="bl-upg-text"><strong>${esc(m.name)}</strong><div class="muted small">${esc(m.desc)}</div></div>
        <button class="btn sm" data-action="bl-finger-module" data-k="${k}" id="wfm-${k}"></button>
      </div>`).join('')}` : ''}
      ${sub('workshop') === 'ships' ? TIERS.map((tier, t) => `
      <div class="bl-upg bl-work card-inset" style="--c:${tier.color}">
        ${shipSvg(tier.color, 34)}
        <div class="bl-upg-text"><strong>${esc(tier.name)}</strong> <span class="badge bl-effect" id="wc-l-${t}"></span>
          <div class="muted small">💥 Calibre : dégâts <strong>et</strong> crédits de ses coups ×${String(CALIBER.growth).replace('.', ',')} par niveau (cumulés, sans limite)</div>
          <div class="small bl-module">🔧 <strong>${esc(MODULES[t].name)}</strong> : ${esc(MODULES[t].desc)}</div>
          <div class="small bl-module bl-module2">⚙️ <strong>${esc(MODULES2[t].name)}</strong> : ${esc(MODULES2[t].desc)} <span class="muted">(après le module 🔧)</span></div></div>
        <div class="bl-btns bl-btns-col">
          <button class="btn sm" data-action="bl-caliber" data-t="${t}" id="wc-b-${t}"></button>
          <button class="btn sm" data-action="bl-module" data-t="${t}" id="wm-b-${t}"></button>
        </div>
      </div>`).join('') : ''}</div>`
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
      <p class="muted small" style="margin:0">Chaque zone de 10 secteurs a son minerai : des blocs brillants en contiennent, et chaque planète conquise en donne d’autant plus qu’elle est loin (${FORGE.planetOre} au secteur 50, ${FORGE.planetOre * 5} au 250).
        Les minerais sont gardés pour toujours et servent aux améliorations avancées.</p>
      <div class="bl-ores">${RESOURCES.map((r, i) => `<div class="bl-ore" style="--o:${r.color}" title="${esc(r.name)} · ${zones(i)} (puis tous les 70 secteurs)">
        <span class="bl-ore-emoji">${r.emoji}</span><strong id="ore-${i}"></strong><span class="muted small">${esc(r.name)}</span><span class="muted small">${zones(i)}</span></div>`).join('')}</div>
      ${subTabs('forge')}
      ${sub('forge') === 'alembic' ? forgeFeatureHtml(s, 'alembic') : ''}
      ${sub('forge') === 'relics' ? forgeFeatureHtml(s, 'relics') : ''}
      ${sub('forge') === 'ships' ? TIERS.map((tier, t) => `
      <div class="bl-upg bl-work card-inset" style="--c:${tier.color}">
        ${shipSvg(tier.color, 34)}
        <div class="bl-upg-text"><strong>${esc(tier.name)}</strong>
          ${Object.entries(FORGE_UPGRADES).map(([k, u]) => `<div class="bl-forge-line">
            <div><span>${u.emoji} <strong>${esc(u.name)}</strong></span> <span class="badge" id="fl-${k}-${t}"></span> <span class="badge bl-effect" id="fe-${k}-${t}"></span>
              <div class="muted small">${esc(u.descFor?.(t) || u.desc)}</div><div class="bl-recipe" id="fr-${k}-${t}"></div></div>
            <button class="btn sm" data-action="bl-forge" data-k="${k}" data-t="${t}" id="fb-${k}-${t}">Forger</button></div>`).join('')}
        </div>
      </div>`).join('') : ''}</div>`
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
      et les 3 réunies <strong>2 ⭐ par prestige</strong>.</p>
    ${d.missions.map((m, i) => `
    <div class="bl-mission card-inset">
      <div class="spread"><strong>${esc(MISSIONS[m.kind].label(m.target))}</strong><span class="small" id="mp-${i}"></span></div>
      <div class="bl-bar"><span id="mb-${i}"></span></div>
      <button class="btn sm" data-action="bl-claim" data-i="${i}" id="mc-${i}"></button>
    </div>`).join('')}
    <p class="small center" id="m-bonus"></p></div>`;
}

/** « Plan d'attaque »: a card under the missions (next goals) and a full list in an overlay. */
const achReward = (a) => {
  const d = ACH_DIFFICULTY[a.diff];
  return [d.stars ? `${d.stars} ⭐` : '', d.pp ? `${d.pp} 🔷` : ''].filter(Boolean).join(' + ');
};
const achLine = (a, prefix) => `
  <div class="bl-ach card-inset ${prefix === 'pm' ? 'compact' : ''} ${achState(g.save, a.id) === 2 ? 'done' : ''}" style="--d:${ACH_DIFFICULTY[a.diff].color}">
    <span class="bl-ach-emoji">${a.emoji}</span>
    <div class="bl-ach-text"><div class="spread"><strong>${esc(a.name)}</strong><span class="badge bl-ach-diff">${ACH_DIFFICULTY[a.diff].label} · ${ACH_DIFFICULTY[a.diff].points} pts</span></div>
      <div class="muted small">${esc(a.desc)} · <span id="${prefix}v-${a.id}"></span></div>
      <div class="bl-bar"><span id="${prefix}b-${a.id}"></span></div></div>
    <button class="btn sm" data-action="bl-ach-claim" data-id="${a.id}" id="${prefix}c-${a.id}"></button>
  </div>`;
/** The next goals: rewards to collect first, then the closest ones. */
function nextAchievements(n = 3) {
  const s = g.save;
  const open = achList(s).filter((a) => achState(s, a.id) !== 2);
  return open.sort((a, b) => (achState(s, b.id) - achState(s, a.id)) || (achProgress(s, b) - achProgress(s, a))).slice(0, n);
}
function buildPlan() {
  const s = g.save;
  const next = nextAchievements();
  const states = achList(s).map((a) => achState(s, a.id)).join('');
  const key = `${next.map((a) => a.id).join()}|${states}|${g.planOpen}`;
  if (key === g.planKey) return;
  g.planKey = key;
  const $p = document.getElementById('bl-plan');
  if ($p) {
    $p.innerHTML = `<div class="stack">
      <p class="muted small" style="margin:0">Objectifs permanents : ils rapportent des ⭐ ou des 🔷 selon leur difficulté, et des 🏅 points pour le Top.</p>
      <div class="bl-plan-sum small" id="plan-mini"></div>
      ${next.map((a) => achLine(a, 'pm')).join('')}
      <button class="btn ghost sm" data-action="bl-plan-open">📋 Tout le plan d’attaque</button></div>`;
  }
  const $o = document.getElementById('bl-plan-overlay');
  if ($o) $o.hidden = !g.planOpen;
  const $all = document.getElementById('bl-plan-all');
  if ($all && g.planOpen) {
    const all = achList(s);
    const cats = [...new Set(all.map((a) => a.cat))];
    $all.innerHTML = cats.map((c) => `<h3 class="bl-subhead">${esc(c)}</h3><div class="bl-ach-grid">${all.filter((a) => a.cat === c).map((a) => achLine(a, 'pa')).join('')}</div>`).join('');
  }
}
function tickPlan() {
  const s = g.save;
  for (const a of updateAchievements(s)) notify('blast', `🗺️ Objectif atteint : ${a.emoji} ${a.name} ! Récupère ${achReward(a)} dans le Plan d’attaque`);
  buildPlan();
  const list = achList(s);
  const done = list.filter((a) => achState(s, a.id)).length;
  const sum = `🏅 <strong>${fmt(achievementPoints(s))} points</strong> · ${fmt(done)} objectifs atteints · ♾️ sans fin`;
  set('plan-mini', sum);
  set('plan-sum', `${sum} · les points classent le 🏆 Top « Plan d’attaque ».`);
  toggle('dot-plan', list.some((a) => achState(s, a.id) === 1));
  for (const prefix of g.planOpen ? ['pm', 'pa'] : ['pm']) {
    for (const a of prefix === 'pm' ? nextAchievements() : list) {
      const st = achState(s, a.id);
      const v = Math.min(a.value(s), a.target);
      set(`${prefix}v-${a.id}`, st ? '✅' : `${fmt(Math.floor(v))} / ${fmt(a.target)}`);
      const b = document.getElementById(`${prefix}b-${a.id}`);
      if (b) b.style.width = `${Math.round((st ? 1 : achProgress(s, a)) * 100)}%`;
      set(`${prefix}c-${a.id}`, st === 2 ? '✅' : st === 1 ? `🎁 ${achReward(a)}` : achReward(a));
      enable(`${prefix}c-${a.id}`, st === 1);
    }
  }
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

/** « Mode léger », remembered on this device; on by default for phones and small processors. */
function lightPref() {
  try {
    const v = localStorage.getItem('blast-light');
    if (v !== null) return v === '1';
  } catch { /* private mode */ }
  return Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4);
}
function showLight() {
  const $b = document.getElementById('bl-light');
  if (!$b) return;
  $b.classList.toggle('on', g.light);
  $b.textContent = g.light ? '🐢 Mode léger ON' : '🐢 Mode léger';
}
actions['bl-light'] = () => {
  g.light = !g.light;
  try { localStorage.setItem('blast-light', g.light ? '1' : '0'); } catch { /* per-device preference only */ }
  g.engine.setLight(g.light);
  showLight();
  notify('blast', g.light ? '🐢 Mode léger : moins de vaisseaux dessinés, sans traînées, 30 images/s (mêmes dégâts)' : '✨ Mode normal');
};

/** Top ranking shown (« prestige » or « sector »), remembered on this device. */
function topByPref() {
  try { return localStorage.getItem('blast-top-by') === 'sector' ? 'sector' : 'ach'; } catch { return 'ach'; }
}

async function loadLeaderboard() {
  try {
    await writeServer();
    const { players, bySector, byAch } = await api(`/api/arcade/${GAME}/leaderboard`);
    if (!g) return;
    g.leaderboard = { ach: byAch || players, sector: bySector || players };
    g.leaderboardAt = Math.floor(Date.now() / LEADERBOARD_EVERY) * LEADERBOARD_EVERY;
    renderLeaderboard();
  } catch { /* keep the previous Top */ }
}

function renderLeaderboard() {
  const $r = document.getElementById('bl-rank');
  for (const by of ['ach', 'sector']) document.getElementById(`bl-top-${by}`)?.classList.toggle('active', g.topBy === by);
  document.querySelector('.bl-top-switch')?.classList.toggle('right', g.topBy === 'sector');
  if (!$r || !g.leaderboard) return;
  const list = g.leaderboard[g.topBy];
  $r.innerHTML = (list.length ? `<ol class="bl-rank">${list.map((p, i) => `
    <li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(p, 28)}
      <span class="bl-rank-name">${p.bangFrame ? `<span class="bl-bang-frame f${Math.min(p.bangFrame, DM_FRAMES.length - 1)}" title="Cadre cosmique : ${esc(DM_FRAMES[Math.min(p.bangFrame, DM_FRAMES.length - 1)])}">${esc(p.username)}</span>` : esc(p.username)}</span>
      <span class="bl-rank-badges">${p.bang ? `<span class="badge bl-dm-badge" title="Big Bangs">🌑 ×${p.bang}</span>` : ''}<span class="badge bl-ach-badge" title="Points du plan d’attaque">🏅 ${fmt(p.ach || 0)}</span>${p.prestige ? `<span class="badge bl-prestige-badge" title="Prestiges">⭐ ${p.prestige}</span>` : ''}
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
  toggle('bl-prestige', s.prestige > 0 || s.skills.power > 0 || s.bigBangs > 0);
  set('bl-prestige', `${s.bigBangs ? `🌑${s.bigBangs} · ` : ''}⭐ ${s.prestige} · ×${fmtFactor(prestigeFactor(s) * skillFactor(s) * singularityFactor(s))}`);
  const frenzy = g.engine.frenzyLeft();
  toggle('bl-frenzy', frenzy > 0);
  set('bl-frenzy', `🛸 ×${UFO_FRENZY.factor} · ${Math.ceil(frenzy)} s`);
  {
    const z = zoneAffinity(s.stage);
    const names = (list) => list.map((t) => TIERS[t].name).join(', ');
    const weak = isBossStage(s.stage) ? planetWeakTier(s.stage) : null;
    set('bl-zone', `<strong>${esc(g.engine.themeName())}</strong> : 💥 ×${ZONE_BONUS} ${esc(names(z.weak))} · 🛡️ ×${String(ZONE_MALUS).replace('.', ',')} ${esc(names([z.resist]))}${isSwarmStage(s.stage) ? ' · ☄️ essaim' : ''}${weak !== null ? ` · 🪐 planète vulnérable : <strong style="color:${TIERS[weak].color}">${esc(TIERS[weak].name)} ×${PLANET_WEAK.factor}</strong>` : ''}`);
  }
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
  toggle('dot-prestige', canPrestige(s) || Object.keys(SKILLS).some((k) => canBuySkill(s, k)) || Object.keys(SYNERGIES).some((k) => canBuySynergy(s, k)));
  // The Big Bang tab shows up with a record at sector 400 (or once a Big Bang is done).
  const $bt = document.querySelector('.bl-tabs button[data-tab=cosmos]');
  if ($bt) $bt.hidden = !bigBangVisible(s);
  if (!bigBangVisible(s) && g.tab === 'cosmos') g.tab = 'ships';
  toggle('dot-cosmos', canBigBang(s) || Object.keys(DM_SHOP).some((k) => canBuyDm(s, k)));
  // The sectors tab comes with the interspace travel.
  const $tt = document.querySelector('.bl-tabs button[data-tab=travel]');
  if ($tt) $tt.hidden = !canTravel(s);
  if (!canTravel(s) && g.tab === 'travel') g.tab = 'ships';
  // The forge tab shows up from prestige 5.
  const $ft = document.querySelector('.bl-tabs button[data-tab=forge]');
  const forgeShown = forgeVisible(s);
  if ($ft && $ft.hidden === forgeShown) {
    $ft.hidden = !forgeShown;
    if (forgeShown && g.forgeWasHidden) notify('blast', `⚒️ Prestige ${FORGE.prestige} : la Forge peut être débloquée !`);
  }
  g.forgeWasHidden = !forgeShown;
  if (!forgeShown && g.tab === 'forge') g.tab = 'ships';
  toggle('dot-forge', forgeOpen(s) ? TIERS.some((_, t) => Object.keys(FORGE_UPGRADES).some((k) => canForge(s, k, t))) : canUnlockForge(s));
  // The workshop tab only shows up once unlocked.
  const open = workshopOpen(s);
  const $wt = document.querySelector('.bl-tabs button[data-tab=workshop]');
  if ($wt && $wt.hidden === open) {
    $wt.hidden = !open;
    if (open && g.workshopWasClosed) notify('blast', `🛠️ Atelier des vaisseaux débloqué : ${s.pp} 🔷 points à dépenser !`);
  }
  g.workshopWasClosed = !open;
  if (!open && g.tab === 'workshop') g.tab = 'ships';
  toggle('dot-workshop', canBuyFinger(s) || TIERS.some((_, t) => canBuyCaliber(s, t) || canBuyModule(s, t) || canBuyModule2(s, t))
    || Object.keys(FINGER_MODULES).some((k) => canBuyFingerModule(s, k)));

  if (g.tab === 'ships') {
    const tap = g.engine.dps('tap');
    const nTypes = squadronTypes(s);
    set('bl-squad', `🎖️ Escadrille : <strong>${nTypes} type${nTypes > 1 ? 's' : ''}</strong> avec ${SQUADRON.ships} vaisseaux ou plus (ou 1 au niveau ${SQUADRON.level}) → dégâts <strong>+${Math.round((squadronFactor(s) - 1) * 100)} %</strong>
      <span class="muted">· +${Math.round(squadronBonus(s) * 100)} % par type</span>`);
    const fl = formationLength(s);
    const next = FORMATION.findIndex((f, n) => n > fl && f > FORMATION[fl]);
    const active = Object.keys(SYNERGIES).filter((k) => synergyOn(s, k));
    const x = (f) => `×${String(f).replace('.', ',')}`;
    set('bl-formation', `🧩 Formation : ${fl >= 3
      ? `de l’${TIERS[0].name} au ${TIERS[fl - 1].name} sans trou (${fl} types, au moins 1 de chaque) → dégâts <strong>${x(FORMATION[fl])}</strong>`
      : `<strong>aucune</strong> <span class="muted">(il faut au moins 1 ${TIERS[0].name}, 1 ${TIERS[1].name} et 1 ${TIERS[2].name})</span>`}
      ${next > 0 && fl >= 3 ? `<br><span class="muted">Prochain palier : ajoute ${next - fl > 1 ? `les ${TIERS.slice(fl, next).map((t) => t.name).join(', ')}` : `un ${TIERS[fl].name}`} → ${x(FORMATION[next])}</span>` : ''}
      ${active.length ? `<br>🧬 Synergies actives : ${active.map((k) => `${SYNERGIES[k].emoji} ${esc(SYNERGIES[k].name)}`).join(' · ')}` : ''}`);
    set('bl-dps-total', `⚔️ Flotte : <strong>${fmt(g.engine.dps() - tap)}</strong> dégâts/s${tap >= 1 ? ` · 👆 Toi : <strong>${fmt(tap)}</strong>/s` : ''} <span class="muted">· moyenne sur 15 s</span>`);
    for (const t of visibleTiers()) {
      const tier = s.tiers[t];
      const d = g.engine.dps(t);
      set(`bps-${t}`, tier.count
        ? `⚡ <strong>${fmt(d)}</strong>/s${tier.count > 1 ? ` <span class="muted">· ${fmt(g.engine.dpsPerShip(t))}/s par vaisseau</span>` : ''}`
        : '<span class="muted">⚡ aucun vaisseau</span>');
      set(`bc-${t}`, String(tier.count));
      set(`bd-${t}`, fmt(fleetDamage(s, t)));
      const zf = zoneFactor(s.stage, t);
      toggle(`bz-${t}`, zf !== 1);
      const $bz = document.getElementById(`bz-${t}`);
      if ($bz) $bz.className = `badge bl-zone-badge ${zf > 1 ? 'good' : 'bad'}`;
      set(`bz-${t}`, zf > 1 ? `💥 ×${ZONE_BONUS} ici` : `🛡️ ×${String(ZONE_MALUS).replace('.', ',')} ici`);
      set(`bl-${t}`, `Niveau ${tier.level}${ascensionActive(s) ? ` / ${levelCap(s, t)}` : ''}${tier.asc ? ` · <span class="bl-asc">🌟 Ascension ${tier.asc} · dégâts ×${fmt(ASCENSION.factor ** tier.asc)}</span>` : ''}`);
      const $bu = document.getElementById(`bu-${t}`);
      if (atLevelCap(s, t)) {
        // Level cap: the button becomes the ascension (credits + ores).
        const { credits, ores } = ascensionCost(s, t);
        if ($bu) { $bu.dataset.action = 'bl-ascend'; $bu.classList.add('bl-ascend'); }
        // A simple button (name + credits); what it does and the ores are explained above it.
        set(`bu-${t}`, `🌟 Ascension<br><span>${fmt(credits)}</span>${ores.length ? `<small class="bl-asc-ores">${ores.map(({ res, amount }) => `<i class="${s.forge.res[res] >= amount ? '' : 'missing'}">${RESOURCES[res].emoji}${fmt(amount)}</i>`).join(' ')}</small>` : ''}`);
        enable(`bu-${t}`, canAscend(s, t));
        const need = ascensionForgeLevel(s, t);
        set(`bai-${t}`, `🌟 <strong>Niveau ${levelCap(s, t)} atteint</strong> : l’ascension multiplie les dégâts par ${ASCENSION.factor}`
          + (ascensionForgeReady(s, t) ? '' : ` · <span class="bl-asc-need">🔒 il faut l’🔩 Alliage niv. ${need} de ce vaisseau dans la ⚒️ Forge${forgeOpen(s) ? ` (actuel : ${s.forge.alloy[t]})` : ' (Forge pas encore débloquée)'}</span>`));
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
        set(`bm-${t}`, m > 1 ? `Fusionner ×${m}<br><span>${fmt(m * mergeCost(s, t))} → ${m}</span>`
          : `Fusionner<br><span>${Math.min(mergeable(s, t - 1), mergeCost(s, t))} / ${mergeCost(s, t)}</span>`);
        enable(`bm-${t}`, canMerge(s, t));
      }
      if (s.skills.reserve) set(`rv-${t}`, `${fmt(s.reserve[t])}${s.reserve[t] && tier.count < s.reserve[t] ? ` <span class="muted">(${fmt(tier.count)})</span>` : ''}`);
      const $a = document.getElementById(`ba-${t}`);
      if ($a) {
        $a.classList.toggle('on', s.auto[t]);
        set(`ba-${t}`, s.auto[t] ? '🤖 Auto ON' : '🤖 Auto');
      }
      const $l = document.getElementById(`bal-${t}`);
      if ($l) {
        $l.classList.toggle('on', s.autoLevel[t]);
        set(`bal-${t}`, s.autoLevel[t] ? '📈 Auto niv. ON' : '📈 Auto niv.');
      }
      const $x = document.getElementById(`baa-${t}`);
      if ($x) {
        $x.classList.toggle('on', s.autoAscOn[t]);
        set(`baa-${t}`, s.autoAscOn[t] ? '🌟 Auto asc. ON' : '🌟 Auto asc.');
      }
    }
  } else if (g.tab === 'upgrades') {
    for (const n of [1, 2]) enable(`adv-u-${n}`, s.advTier === n - 1 && canUnlockAdv(s));
    for (const [k, u] of Object.entries(UPGRADES)) {
      if (!upgradeOpen(s, k)) continue;
      const lvl = s.upgrades[k];
      set(`ul-${k}`, `${lvl} / ${u.max}`);
      set(`ub-${k}`, lvl >= u.max ? 'Max' : fmt(upgradeCost(k, lvl)));
      enable(`ub-${k}`, canUpgrade(s, k));
      markDone(`ub-${k}`, lvl >= u.max);
      const $a = document.getElementById(`uba-${k}`);
      if ($a) {
        $a.classList.toggle('on', s.autoUpg[k]);
        set(`uba-${k}`, s.autoUpg[k] ? '🤖 Auto ON' : '🤖 Auto');
      }
    }
  } else if (g.tab === 'cosmos') {
    set('bb-n', `×${s.bigBangs}`);
    set('bb-res', `×${fmtFactor(resonance(s))} · prochain ×${fmtFactor(1 + BIG_BANG.resonance * (s.bigBangs + 1))}`);
    set('bb-need', canBigBang(s) ? '<strong>Prêt !</strong> Un nouvel univers t’attend.' : `<span class="muted">🚩 secteur ${fmt(universeBest(s))} / ${bigBangSector(s.bigBangs)} dans cet univers</span>`);
    enable('bb-b', canBigBang(s));
    set('dm', `${fmt(s.dm)} 🌑 à dépenser`);
    for (const [k, it] of Object.entries(DM_SHOP)) {
      const lvl = s.dmShop[k];
      const max = lvl >= it.max;
      set(`dl-${k}`, k === 'singularity' ? `niv. ${lvl} · dégâts ×${fmtFactor(singularityFactor(s))}` : it.max === Infinity ? `niv. ${lvl}` : `${lvl} / ${it.max}`);
      set(`db-${k}`, max ? (it.max === 1 ? '✅ Débloqué' : 'Max') : `${fmt(dmCost(k, lvl))} 🌑`);
      enable(`db-${k}`, canBuyDm(s, k));
      markDone(`db-${k}`, max);
    }
    set('ap-at', s.autoPrestigeAt ? `dès le secteur ${fmt(s.autoPrestigeAt)}` : 'dès que possible');
    const $ap = document.getElementById('ap-on');
    if ($ap) { $ap.classList.toggle('on', s.autoPrestigeOn); set('ap-on', s.autoPrestigeOn ? '⭐ Auto ON' : '⭐ Auto'); }
    const $ab = document.getElementById('ab-on');
    if ($ab) { $ab.classList.toggle('on', s.autoBoostOn); set('ab-on', s.autoBoostOn ? '⚡ Auto ON' : '⚡ Auto'); }
  } else if (g.tab === 'prestige') {
    const f = prestigeFactor(s);
    set('pl', `${s.prestige} · dégâts ×${fmtFactor(f)}`);
    // What the next prestige brings, and the two conditions as progress bars.
    set('pgain', `<span class="bl-chip">⚔️ dégâts ×${fmtFactor(f)} → <strong>×${fmtFactor(f * (1 + PRESTIGE_BONUS))}</strong></span>
      <span class="bl-chip">+<strong>${prestigePoints(s)}</strong> 🔷</span><span class="bl-chip">+<strong>${fmt(starsFor(s))}</strong> ⭐ <span class="muted">(secteur ${s.runBest})</span></span>`);
    const sec = prestigeSector(s);
    const secOk = prestigeSectorReached(s);
    const cost = prestigeCost(s);
    set('psec', `<strong class="${secOk ? 'good' : ''}">${fmt(Math.min(s.runBest, sec))} / ${fmt(sec)}${secOk ? ' ✓' : ''}</strong> <span class="muted">(${prestigeCapped(s) ? `ta dernière partie + tes nouveaux dégâts, au lieu de ${Math.round(prestigeShare(s) * 100)} % de ${fmt(s.universeBest || 0)}` : `${Math.round(prestigeShare(s) * 100)} % de ${fmt(s.universeBest || 0)}`})</span>`);
    set('pc', `<strong class="${s.money >= cost ? 'good' : ''}">${fmt(Math.min(s.money, cost))} / ${fmt(cost)}${s.money >= cost ? ' ✓' : ''}</strong>`);
    const bar = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.round(Math.min(1, v) * 100)}%`; };
    bar('psbar', s.runBest / sec);
    bar('pcbar', s.money / cost);
    set('pb', canPrestige(s) ? '⭐ Prestige !' : `🔒 ${secOk ? 'Encore des crédits' : `Atteins le secteur ${fmt(sec)}`}`);
    enable('pb', canPrestige(s));
    set('stars', `${fmt(s.stars)} ⭐ à dépenser${skillDiscount(s) ? ` · 🔔 −${Math.round(skillDiscount(s) * 100)} %` : ''}`);
    for (const [k, sk] of Object.entries(SKILLS)) {
      const lvl = s.skills[k];
      set(`sl-${k}`, sk.max === Infinity ? `niv. ${lvl}` : `${lvl} / ${sk.max}`);
      set(`se-${k}`, lvl ? skillEffect(s, k) : '');
      set(`sb-${k}`, lvl >= sk.max ? (sk.max === 1 ? '✅ Débloqué' : 'Max') : skillLocked(s, k) ? `🔒 Prestige ${sk.prestige}` : `${fmt(skillPrice(s, k, lvl))} ⭐`);
      enable(`sb-${k}`, canBuySkill(s, k));
      markDone(`sb-${k}`, sk.max !== Infinity && lvl >= sk.max);
    }
    for (const [k, sy] of Object.entries(SYNERGIES)) {
      set(`sy-l-${k}`, !s.synergies[k] ? '' : synergyOn(s, k) ? '✅ active' : `en veille (il manque ${sy.tiers.filter((t) => !s.tiers[t].count).map((t) => TIERS[t].name).join(', ')})`);
      set(`sy-b-${k}`, s.synergies[k] ? '✅ Débloquée' : `${sy.cost} ⭐`);
      enable(`sy-b-${k}`, canBuySynergy(s, k));
      markDone(`sy-b-${k}`, Boolean(s.synergies[k]));
    }
    document.getElementById('sy-head')?.classList.toggle('is-done', Object.keys(SYNERGIES).every((k) => s.synergies[k]));
    if (forgeOpen(s)) {
      TIERS.forEach((_, t) => {
        const max = s.launch[t] >= LAUNCH.max;
        const asc = launchAsc(s, t);
        set(`lc-l-${t}`, `départ niv. ${launchLevel(s, t)}${asc ? ` · 🌟 ${asc}` : ''}`);
        const { stars, ores } = launchCost(s, t);
        const alloy = launchAlloyNeed(s, t);
        set(`lc-r-${t}`, max ? '' : [`<span class="bl-chip ${s.stars >= stars ? '' : 'missing'}">⭐ ${stars}</span>`,
          ...ores.map(({ res, amount }) => `<span class="bl-chip ${s.forge.res[res] >= amount ? '' : 'missing'}" title="${esc(RESOURCES[res].name)}">${RESOURCES[res].emoji} ${fmt(s.forge.res[res])}/${fmt(amount)}</span>`),
          ...(alloy ? [`<span class="bl-chip ${s.forge.alloy[t] >= alloy ? '' : 'missing'}" title="Alliage de ce vaisseau dans la Forge (comme pour l’ascension)">🔩 ${s.forge.alloy[t]}/${alloy}</span>`] : [])].join(''));
        set(`lc-b-${t}`, max ? 'Max' : `Niveau ${LAUNCH.step * (s.launch[t] + 1)}`);
        enable(`lc-b-${t}`, canLaunch(s, t));
      });
    }
  } else if (g.tab === 'workshop' && workshopOpen(s)) {
    set('pp', `${s.pp} 🔷 points`);
    set('wf-l', `${s.workshop.finger} / ${FINGER_CALIBER.max}`);
    set('wf-e', s.workshop.finger ? `toucher +${Math.round(FINGER_CALIBER.bonus * 100 * s.workshop.finger)} %` : '');
    set('wf-d', `toucher actuel : ${fmt(clickDamage(s))}`);
    set('wf-b', s.workshop.finger >= FINGER_CALIBER.max ? 'Max' : `+1 · ${fingerCost(s)} 🔷`);
    enable('wf-b', canBuyFinger(s));
    markDone('wf-b', s.workshop.finger >= FINGER_CALIBER.max);
    for (const [k, m] of Object.entries(FINGER_MODULES)) {
      set(`wfm-${k}`, s.workshop.fingerModules[k] ? '✅ Installé' : `${m.cost} 🔷`);
      enable(`wfm-${k}`, canBuyFingerModule(s, k));
      markDone(`wfm-${k}`, s.workshop.fingerModules[k]);
    }
    TIERS.forEach((_, t) => {
      const lvl = s.workshop.caliber[t];
      set(`wc-l-${t}`, lvl ? `niv. ${lvl} · ×${fmtFactor(CALIBER.growth ** lvl)}` : '');
      set(`wc-b-${t}`, `💥 Calibre +1<br><span>${fmt(caliberCost(s, t))} 🔷</span>`);
      enable(`wc-b-${t}`, canBuyCaliber(s, t));
      // One module box: module I, then module II once the first is installed.
      const m1 = s.workshop.modules[t];
      const m2 = s.workshop.modules2[t];
      set(`wm-b-${t}`, m2 ? '✅ Modules' : m1 ? `⚙️ Module II<br><span>${MODULES2[t].cost} 🔷</span>` : `🔧 Module<br><span>${MODULES[t].cost} 🔷</span>`);
      enable(`wm-b-${t}`, m1 ? canBuyModule2(s, t) : canBuyModule(s, t));
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
        set(`re-${k}`, s.forge.relics[k] ? relicEffect(s, k) : '');
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
          const bf = bounceFactor(s, t);
          set(`fe-${k}-${t}`, !lvl ? '' : k === 'alloy' ? `dégâts +${Math.round(FORGE_UPGRADES.alloy.bonus * 100 * lvl)} %`
            : t === 2 ? `perçage +${Math.round((1 / bf - 1) * 100)} %` : `rebonds −${Math.round((1 - bf) * 100)} %`);
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
  tickPlan();
  toggle('dot-missions', (s.daily?.missions || []).some((m) => !m.claimed && m.progress >= m.target));
  {
    const d = s.daily;
    d.missions.forEach((m, i) => {
      set(`mp-${i}`, `${fmt(Math.floor(m.progress))} / ${fmt(m.target)}`);
      const b = document.getElementById(`mb-${i}`);
      if (b) b.style.width = `${Math.round((m.progress / m.target) * 100)}%`;
      set(`mc-${i}`, m.claimed ? '✅ Récupérée' : m.progress >= m.target ? `🎁 +${fmt(rewardCredits(s, MISSION_REWARD_MINUTES))}` : 'En cours…');
      enable(`mc-${i}`, !m.claimed && m.progress >= m.target);
      // A collected mission disappears from the list.
      const card = document.getElementById(`mc-${i}`)?.closest('.bl-mission');
      if (card) card.hidden = m.claimed;
    });
    const ds = dailyStars(s);
    set('m-bonus', d.bonus ? '⭐ Étoiles du jour gagnées ! Reviens demain.' : `<span class="muted">${d.missions.filter((m) => m.claimed).length} / 3 missions récupérées pour <strong>${ds} ⭐</strong> (2 par prestige)</span>`);
  }
}

// ---- actions --------------------------------------------------------------------------------

const after = (ok, msg) => {
  if (ok) { g.engine.syncFleet(); tick(); } else if (msg) notify('blast', msg, true);
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
  if (made) notify('blast', `✨ ${made > 1 ? `${made} nouveaux ${TIERS[t].name}s` : `Nouveau ${TIERS[t].name}`} !${ABILITIES[t] && first ? ` Pouvoir : ${ABILITIES[t].name}` : ''}`);
  after(true);
};
actions['bl-level'] = (el) => {
  const t = Number(el.dataset.t);
  after(levelUp(g.save, t, levelsToBuy(t)), 'Pas assez de crédits.');
};
actions['bl-res'] = (el) => {
  const t = Number(el.dataset.t);
  setReserve(g.save, t, (g.save.reserve[t] || 0) + Number(el.dataset.d));
  tick();
};
actions['bl-ascend'] = (el) => {
  const t = Number(el.dataset.t);
  if (ascend(g.save, t)) {
    notify('blast', `🌟 ${TIERS[t].name} : Ascension ${g.save.tiers[t].asc} ! Dégâts ×${ASCENSION.factor}, niveaux jusqu’à ${levelCap(g.save, t)}`);
    writeServer();
  } else notify('blast', 'Il manque des crédits ou des minerais pour l’ascension.', true);
  tick();
};
actions['bl-upgrade'] = (el) => after(buyUpgrade(g.save, el.dataset.k), 'Pas assez de crédits.');
actions['bl-auto-upg'] = (el) => {
  const { k } = el.dataset;
  if (!canAutoUpgrade(g.save)) return;
  g.save.autoUpg[k] = !g.save.autoUpg[k];
  notify('blast', `🔧 ${UPGRADES[k].label} : achat auto ${g.save.autoUpg[k] ? 'activé' : 'coupé'}`);
  after(true);
};
actions['bl-ach-claim'] = (el) => {
  const { id } = el.dataset;
  const r = claimAchievement(g.save, id);
  if (!r) return;
  const a = achDef(id);
  notify('blast', `${a.emoji} ${a.name} : ${achReward(a)} !`);
  writeServer();
  g.structure = '';
  tick();
};
actions['bl-adv-unlock'] = () => {
  if (!unlockAdv(g.save)) return;
  notify('blast', `🔬 Améliorations avancées : ${ADV_UNLOCKS[g.save.advTier].label} débloqué !`);
  writeServer();
  tick();
};
actions['bl-hide-done'] = () => {
  g.hideDone = !g.hideDone;
  try { localStorage.setItem('blast-hide-done', g.hideDone ? '1' : ''); } catch { /* per-device preference only */ }
  tick();
};
actions['bl-plan-open'] = () => { g.planOpen = true; tick(); };
actions['bl-plan-close'] = () => { g.planOpen = false; tick(); };
actions['bl-top-by'] = (el) => {
  g.topBy = el.dataset.by;
  try { localStorage.setItem('blast-top-by', g.topBy); } catch { /* per-device preference only */ }
  renderLeaderboard();
};
actions['bl-takeover'] = () => takeOver();
actions['bl-synergy'] = (el) => {
  const { k } = el.dataset;
  if (!buySynergy(g.save, k)) return;
  notify('blast', `🧬 Synergie débloquée : ${SYNERGIES[k].emoji} ${SYNERGIES[k].name}`);
  writeServer();
  tick();
};
actions['bl-auto-asc'] = (el) => {
  const t = Number(el.dataset.t);
  if (!canAutoAsc(g.save)) return;
  g.save.autoAscOn[t] = !g.save.autoAscOn[t];
  notify('blast', `🌟 ${TIERS[t].name} : ascension auto ${g.save.autoAscOn[t] ? 'activée' : 'coupée'}`);
  tick();
};
actions['bl-auto-level'] = (el) => {
  const t = Number(el.dataset.t);
  if (!canAutoLevel(g.save)) return;
  g.save.autoLevel[t] = !g.save.autoLevel[t];
  notify('blast', `📈 ${TIERS[t].name} : niveaux auto ${g.save.autoLevel[t] ? 'activés' : 'coupés'}`);
  tick();
};
actions['bl-auto'] = (el) => {
  const t = Number(el.dataset.t);
  const on = !g.save.auto[t];
  setAuto(g.save, t, on);
  notify('blast', on
    ? `🤖 Auto : ${TIERS.slice(0, t + 1).map((x) => x.name).join(', ')}`
    : `🤖 Auto coupé : ${TIERS[t].name}${t < TIERS.length - 1 ? ' et les vaisseaux au-dessus' : ''}`);
  tick();
};
actions['bl-travel'] = (el) => {
  const n = Number(el.dataset.n);
  if (!travelTo(g.save, n)) return;
  g.engine.travel();
  notify('blast', `🌌 Voyage vers le secteur ${n} : ta flotte y reste jusqu’à « Continuer à conquérir »`);
  writeServer();
  tick();
};
actions['bl-resume'] = () => {
  resumeConquest(g.save);
  g.engine.travel();
  notify('blast', `🚀 Reprise de la conquête au secteur ${g.save.stage}`);
  writeServer();
  tick();
};
actions['bl-unlock-feature'] = (el) => {
  const { f } = el.dataset;
  if (!unlockFeature(g.save, f)) return;
  notify('blast', `${FORGE_UNLOCKS[f].emoji} ${FORGE_UNLOCKS[f].name} débloqué !`);
  writeServer();
  tick();
};
actions['bl-al-from'] = (el) => { g.alFrom = Number(el.dataset.i); tick(); };
actions['bl-al-to'] = (el) => { g.alTo = Number(el.dataset.i); tick(); };
actions['bl-al-mult'] = (el) => { g.alMult = el.dataset.m === 'max' ? 'max' : Number(el.dataset.m); tick(); };
actions['bl-transmute'] = () => {
  const made = transmute(g.save, g.alFrom, g.alTo, alembicCount());
  if (made) notify('blast', `⚗️ +${fmt(made)} ${RESOURCES[g.alTo].emoji} ${RESOURCES[g.alTo].name}`);
  tick();
};
actions['bl-relic'] = (el) => {
  const { k } = el.dataset;
  if (forgeRelic(g.save, k)) {
    notify('blast', `${RELICS[k].emoji} ${RELICS[k].name} : niveau ${g.save.forge.relics[k]} !`);
    g.engine.syncFleet();
    writeServer();
  }
  tick();
};
actions['bl-unlock-forge'] = () => {
  if (!unlockForge(g.save)) return;
  notify('blast', `⚒️ Forge débloquée ! Cherche les blocs brillants : ${RESOURCES[resourceFor(g.save.stage)].emoji} dans cette zone`);
  writeServer();
  tick();
};
actions['bl-forge'] = (el) => {
  const t = Number(el.dataset.t);
  const { k } = el.dataset;
  if (forgeUpgrade(g.save, k, t)) notify('blast', `${FORGE_UPGRADES[k].emoji} ${TIERS[t].name} : ${FORGE_UPGRADES[k].name} niveau ${g.save.forge[k][t]}`);
  after(true);
};
actions['bl-caliber'] = (el) => {
  const t = Number(el.dataset.t);
  if (buyCaliber(g.save, t)) notify('blast', `💥 ${TIERS[t].name} : calibre niveau ${g.save.workshop.caliber[t]} (×${fmtFactor(CALIBER.growth ** g.save.workshop.caliber[t])})`);
  after(true);
};
actions['bl-module'] = (el) => {
  const t = Number(el.dataset.t);
  if (g.save.workshop.modules[t]) {
    if (buyModule2(g.save, t)) notify('blast', `⚙️ Module II installé : ${MODULES2[t].name}`);
    after(true);
    return;
  }
  if (buyModule(g.save, t)) notify('blast', `🔧 Module installé : ${MODULES[t].name}`);
  after(true);
};
actions['bl-finger'] = () => {
  if (buyFinger(g.save)) notify('blast', `👆 Calibre du doigt : ${g.save.workshop.finger}`);
  after(true);
};
actions['bl-finger-module'] = (el) => {
  const { k } = el.dataset;
  if (buyFingerModule(g.save, k)) notify('blast', `${FINGER_MODULES[k].emoji} ${FINGER_MODULES[k].name} installé !`);
  after(true);
};
actions['bl-skill'] = (el) => {
  const { k } = el.dataset;
  if (buySkill(g.save, k)) {
    notify('blast', k === 'travel' ? '🌌 Voyage interspatial débloqué : nouvel onglet 🧭 Secteurs !'
      : k === 'auto' ? '🤖 Chantier automatique débloqué : bouton « Auto » sur chaque vaisseau !'
        : k === 'autoLevel' ? '📈 Instructeur de vol : bouton « Auto niv. » sur chaque vaisseau !'
        : k === 'autoAsc' ? '🌟 Ascension automatique : bouton « Auto asc. » sur chaque vaisseau !'
        : k === 'autoUpg' ? '🔧 Ingénieur de bord : bouton « Auto » sur chaque amélioration !'
        : `🌌 ${SKILLS[k].label} : niveau ${g.save.skills[k]}`);
    if (SKILLS[k].max === 1) writeServer();
  }
  after(true);
};
actions['bl-launch'] = (el) => {
  const t = Number(el.dataset.t);
  if (buyLaunch(g.save, t)) notify('blast', `🚀 ${TIERS[t].name} : départ au niveau ${launchLevel(g.save, t)}`);
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
  notify('blast', `🌙 +${fmt(g.pending)} crédits gagnés pendant ton absence`);
  g.pending = 0;
  tick();
};
actions['bl-claim'] = (el) => {
  const r = claimMission(g.save, Number(el.dataset.i));
  if (!r) return;
  notify('blast', `🎯 Mission accomplie : +${fmt(r.credits)} crédits${r.stars ? ` et ⭐ ${r.stars} étoile${r.stars > 1 ? 's' : ''} !` : ''}`);
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
    notify('blast', `🎁 +${fmt(credits)} crédits${boost ? ' et une accélération offerte' : ''} grâce au quiz !`);
    writeServer();
    tick();
  } catch (err) { notify('blast', err.message, true); }
};
actions['bl-prestige'] = () => {
  const s = g.save;
  if (!canPrestige(s)) return;
  const next = fmtFactor(prestigeFactor(s) * (1 + PRESTIGE_BONUS));
  const stars = starsFor(s);
  const pts = prestigePoints(s);
  if (!confirm(`⭐ Prestige ${s.prestige + 1}\n\nTu repars du secteur ${portalStart(s)}, sans crédits ni améliorations (l’atelier et l’arbre des étoiles sont gardés).\nEn échange : dégâts ×${next} pour toujours, +${pts} 🔷 points d’atelier et +${stars} étoile${stars > 1 ? 's' : ''}.\n\nOn y va ?`)) return;
  prestigeNow(`⭐ Prestige ${s.prestige + 1} ! Dégâts ×${next}, +${pts} 🔷, +${stars} ⭐`);
};
/** A prestige (by hand or « Pilote total »): the server refuses two within 20 s. */
function prestigeNow(msg) {
  const s = g.save;
  if (!canPrestige(s) || Date.now() - (g.lastPrestigeAt || 0) < 25000) return false;
  doPrestige(s);
  g.lastPrestigeAt = Date.now();
  g.pending = 0;
  g.engine.restart();
  g.structure = '';
  writeServer();
  notify('blast', msg);
  tick();
  return true;
}

actions['bl-bigbang'] = () => {
  const s = g.save;
  if (!canBigBang(s)) return;
  if (!confirm(`💥 Big Bang ${s.bigBangs + 1}\n\nAbsolument tout repart de zéro : prestiges, étoiles, arbre des étoiles, atelier, Forge, minerais, reliques…\nGardés : la boutique de matière noire, le Plan d’attaque, ton record et tes stats.\n⚠️ Les récompenses du Plan d’attaque pas encore récoltées sont perdues : récupère-les avant !\n\nEn échange : +1 🌑 matière noire et Résonance cosmique ×${fmtFactor(1 + BIG_BANG.resonance * (s.bigBangs + 1))} (dégâts, étoiles, minerais) et −${Math.round(Math.min(BIG_BANG.maxDiscount, BIG_BANG.discount * (s.bigBangs + 1)) * 100)} % sur l’arbre des étoiles.\nLe prochain Big Bang demandera le secteur ${bigBangSector(s.bigBangs + 1)}.\n\nOn y va ?`)) return;
  if (Date.now() - (g.lastPrestigeAt || 0) < 25000) return notify('blast', 'Attends quelques secondes après ton dernier prestige.', true);
  doBigBang(s);
  g.lastPrestigeAt = Date.now();
  g.pending = 0;
  g.engine.restart();
  g.structure = '';
  writeServer();
  notify('blast', `💥 Big Bang ${s.bigBangs} ! Un nouvel univers, et +1 🌑 matière noire`);
  tick();
};
actions['bl-dm'] = (el) => {
  const { k } = el.dataset;
  if (!buyDm(g.save, k)) return;
  notify('blast', `🌑 ${DM_SHOP[k].emoji} ${DM_SHOP[k].label} niv. ${g.save.dmShop[k]}`);
  g.structure = '';
  writeServer();
  tick();
  if (k === 'frame') loadLeaderboard();
};
actions['bl-ap-on'] = () => { g.save.autoPrestigeOn = !g.save.autoPrestigeOn; tick(); };
actions['bl-ap-at'] = (el) => { g.save.autoPrestigeAt = Math.max(0, (g.save.autoPrestigeAt || 0) + Number(el.dataset.d)); tick(); };
actions['bl-ab-on'] = () => { g.save.autoBoostOn = !g.save.autoBoostOn; tick(); };

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

/** What a relic gives right now. */
function relicEffect(s, k) {
  const l = s.forge.relics[k];
  switch (k) {
    case 'totem': return `+${5 * l} s par planète · minerai +${50 * l} %`;
    case 'orb': return `soucoupe ${Math.round((1 - Math.max(0.25, 0.9 ** l)) * 100)} % plus fréquente · bonus +${20 * l} %`;
    case 'astrolabe': return `dégâts +${Math.round((astrolabeFactor(s) - 1) * 100)} %`;
    case 'crown': return `étoiles et 🔷 +${25 * l} % par prestige`;
    default: return '';
  }
}

/** What a star-tree bonus gives right now, at its current level (shown next to its level). */
function skillEffect(s, k) {
  const l = s.skills[k];
  const pct = (x) => `${Math.round(x * 10) / 10}`.replace('.', ',');
  switch (k) {
    case 'power': return `dégâts ×${fmtFactor(skillFactor(s))}`;
    case 'critdmg': return `critiques ×${pct(critFactor(s))}`;
    case 'portal': return `départ secteur ${portalStart(s)}${portalStart(s) < 1 + 10 * l ? ' (limité par ton meilleur secteur de l’univers)' : ''}`;
    case 'cosmic': return `crédits +${pct(10 * l)} %`;
    case 'hyper': return `vitesse +${pct(50 * (1 - 0.95 ** l))} %`;
    case 'constellation': return `étoiles +${pct(10 * l)} %`;
    case 'vein': return `minerai ${pct(oreChance(s) * 100)} % des blocs`;
    case 'refine': return `${oreYield(s)} minerai${oreYield(s) > 1 ? 's' : ''} par bloc ici`;
    case 'academy': return `+${l * (l + 1)} 🔷 par prestige`;
    case 'night': return `+${l} h hors ligne`;
    case 'fleet': return `${START_FLEET_PER_LEVEL * l} éclaireurs au départ`;
    case 'shipyard': return `éclaireurs −${pct(100 * (1 - shipDiscount(s)))} % · hausse −${pct(100 * (1 - shipRise(s)))} %`;
    case 'starfind': return `ici ${fmtPct(starBlockChance(s))} (max ${fmtPct(starBlockCap(s))})`;
    case 'bank': return `${fmt(100 * 10 ** l)} crédits au départ`;
    case 'boost': return `accélération ${boostDuration(s)} s`;
    case 'gold': return `blocs dorés ${pct(goldChance(s) * 100)} %`;
    case 'ufo': return `soucoupe −${pct(15 * l)} % d’attente`;
    case 'boss': return `${bossTime(s)} s par planète`;
    default: return '';
  }
}

const fmtPct = (x) => `${(Math.round(x * 1000) / 10).toString().replace('.', ',')} %`;

function fmtFactor(f) {
  return f < 100 ? f.toFixed(2).replace('.', ',') : fmt(f);
}

// Kept for tests / console debugging.
export const _debug = { get game() { return g; }, earn: (n) => g && earn(g.save, n) };
