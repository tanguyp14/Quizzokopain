// Jimmy Blast — economy and progression rules (pure: no DOM, testable with node).
//
// Ships hit blocks; every point of damage earns money, breaking a block pays a
// bonus. Money buys level-ups (damage) per ship tier, new ships, and global
// upgrades. 5 ships of a tier merge into 1 ship of the next tier. Every 10th
// sector is a planet. Prestiges give permanent damage, stars for the skill tree and
// prestige points for the ship workshop.

export const SAVE_VERSION = 1;

export const TIERS = [
  { name: 'Éclaireur', color: '#9fd3f5' },
  { name: 'Chasseur', color: '#a8e6b0' },
  { name: 'Frégate', color: '#f1cf93' },
  { name: 'Croiseur', color: '#ff9f6b' },
  { name: 'Destroyer', color: '#ff6b8b' },
  { name: 'Cuirassé', color: '#d88bff' },
  { name: 'Vaisseau-mère', color: '#8f7bff' },
  { name: 'Neutron', color: '#ffffff' },
];
export const MERGE_COST = 5; // ships of a tier needed for one ship of the next tier (4 with the skill)

/** Powers of the higher tiers (applied by the engine). */
export const ABILITIES = {
  2: { name: 'Perforation', desc: 'traverse les blocs en les perçant : dégâts en continu pendant la traversée' },
  3: { name: 'Visée', desc: '+25 % de chance de coup critique' },
  4: { name: 'Onde de choc', desc: '30 % des dégâts aux blocs proches' },
  5: { name: 'Bombardement', desc: '60 % des dégâts sur une large zone' },
  6: { name: 'Drones', desc: '2 drones d’escorte par vaisseau' },
  7: { name: 'Rayon Neutron', desc: 'chaque impact touche tout le secteur (10 %)' },
};
export const MAX_SHIPS_PER_TIER = 60;

export const UPGRADES = {
  speed: { label: 'Réacteurs', emoji: '💨', desc: 'Vitesse des vaisseaux +8 %', base: 200, growth: 2.1, max: 25 },
  gain: { label: 'Aspirateur à crédits', emoji: '🧲', desc: 'Gains +15 %', base: 500, growth: 2.4, max: 40 },
  click: { label: 'Doigt de Jimmy', emoji: '👆', desc: 'Dégâts au toucher ×1,5', base: 50, growth: 1.9, max: 200 },
  crit: { label: 'Coups critiques', emoji: '💥', desc: '+3 % de chance de coup ×5', base: 1000, growth: 3, max: 15 },
  offline: { label: 'Pilote automatique', emoji: '🌙', desc: 'Gains hors ligne +10 % et +1 h', base: 5000, growth: 4, max: 5 },
};

export const BOOST = { duration: 15, cooldown: 60, factor: 2 };
export const boostDuration = (s) => BOOST.duration + 5 * s.skills.boost;

// Special blocks: gold pays ×10, a bomb damages its neighbours when it breaks.
export const GOLD_FACTOR = 10;
export const goldChance = (s) => 0.05 + 0.03 * s.skills.gold;
export const BOMB_CHANCE = 0.05;
export const BOMB = { radius: 230, damage: 0.6 }; // share of the neighbours' max HP

// Story: Jimmy's fleet conquers the universe one planet at a time. Sectors 1-9 of each
// zone are asteroid belts; the 10th is a planet to conquer in time, or back to the previous sector.
// (In the code a planet is still a "boss".)
export const isBossStage = (stage) => stage % 10 === 0;
export const BOSS_HP_FACTOR = 3;
export const bossTime = (s) => 30 + 10 * s.skills.boss;

const PLANETS = ['Zorgon', 'Krypta', 'Glaxor', 'Bleurk', 'Néo-Mars', 'Xénon Prime', 'Plouto-X', 'Vortexia', 'Grumulon', 'Astéria',
  'Kalamar', 'Zébulon', 'Nébula-9', 'Octopia', 'Frimousse', 'Tartempion', 'Quasarix', 'Moumoune', 'Sirius B', 'Gloubi'];
/** Name of the planet of a sector (the planet of sector 10 is the 1st), stable for everyone. */
export function planetName(stage) {
  const i = Math.max(0, Math.ceil(stage / 10) - 1);
  const round = Math.floor(i / PLANETS.length);
  return `${PLANETS[i % PLANETS.length]}${round ? ` ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][round - 1] || round + 1}` : ''}`;
}
/** Planets conquered once `maxStage` is reached. */
export const planetsConquered = (maxStage) => Math.max(0, Math.floor((maxStage - 1) / 10));

// Jimmy's saucer: crosses the field now and then; catching it gives a random bonus.
export const ufoInterval = (s) => [45, 90].map((v) => v * (1 - 0.15 * s.skills.ufo));
export const UFO_FRENZY = { factor: 3, duration: 30 };

/** Look of the sectors: the palette changes every 10 sectors (after each boss). */
export const THEMES = [
  { name: 'Nébuleuse', colors: ['#4b3fb8', '#5a45d6', '#6b3fc4', '#3f6fd8', '#4f9fe0', '#58b4e6', '#56c8d6', '#62d6c6', '#7c5cff'], bg: [8, 8, 20] },
  { name: 'Glace', colors: ['#bfe9ff', '#8fd3f4', '#6cb8e6', '#a5c9ff', '#d8f3ff', '#7fa8d9', '#9ee6f0', '#e6f7ff'], bg: [6, 16, 28] },
  { name: 'Lave', colors: ['#ff5d3a', '#ff8a3d', '#e2402f', '#ffb938', '#c92f45', '#ff6f59', '#f2542d', '#ffa062'], bg: [24, 6, 6] },
  { name: 'Trésor', colors: ['#ffd166', '#f4b942', '#e8a33d', '#fff1a8', '#d4a017', '#ffe08a', '#c98f2b', '#f7c948'], bg: [22, 16, 4] },
  { name: 'Jungle alien', colors: ['#2ecc8f', '#62d67a', '#a8e063', '#1fa67a', '#56c596', '#8bd346', '#3fbf6f', '#b7f171'], bg: [4, 20, 12] },
  { name: 'Abysses', colors: ['#1f4e8c', '#2563a6', '#17728d', '#2b8a9e', '#3a4fb0', '#1b3a6b', '#2f9ab5', '#4368c9'], bg: [3, 8, 22] },
  { name: 'Néon', colors: ['#ff3cac', '#784ba0', '#2b86c5', '#ff61d8', '#00e5ff', '#b14cff', '#ff9ff3', '#5f27cd'], bg: [14, 4, 20] },
];
export const themeFor = (stage) => THEMES[Math.floor((stage - 1) / 10) % THEMES.length];

// Prestige skill tree, paid with stars (kept forever, like the prestige count).
export const SKILLS = {
  power: { label: 'Noyau de neutron', emoji: '⚛️', desc: 'Dégâts +25 %', max: 20, cost: (l) => 2 + 2 * l },
  fleet: { label: 'Flotte de départ', emoji: '🛸', desc: '+2 éclaireurs au départ', max: 5, cost: (l) => 1 + l },
  bank: { label: 'Trésor de départ', emoji: '💰', desc: 'Commence avec 1K, 10K, 100K… crédits', max: 5, cost: (l) => 1 + l },
  boost: { label: 'Turbo', emoji: '⚡', desc: 'Accélération +5 s', max: 5, cost: (l) => 1 + l },
  merge: { label: 'Fusion compacte', emoji: '🧬', desc: 'Fusion à 4 vaisseaux au lieu de 5', max: 1, cost: () => 6 },
  gold: { label: 'Filon d’or', emoji: '🪙', desc: 'Blocs dorés +3 %', max: 5, cost: (l) => 1 + l },
  ufo: { label: 'Radar à soucoupes', emoji: '📡', desc: 'Soucoupe 15 % plus fréquente', max: 4, cost: (l) => 2 + l },
  boss: { label: 'Chronomètre', emoji: '⏱️', desc: '+10 s pour conquérir une planète', max: 3, cost: (l) => 2 + l },
};

export const STAT_KEYS = ['blocks', 'golds', 'bosses', 'ufos', 'merges', 'taps', 'boosts', 'sectors', 'playTime'];

// Prestige: start over from zero for 10M credits (×2 after each prestige: 10M, 20M, 40M…);
// every prestige adds +10 % damage (compounded), stars and 10 prestige points for the ship workshop.
export const PRESTIGE_BASE_COST = 10_000_000;
export const PRESTIGE_COST_GROWTH = 2;
export const PRESTIGE_BONUS = 0.1;
export const PRESTIGE_POINTS = 10;

/**
 * Ship workshop (unlocked by the first prestige, paid with prestige points, kept forever):
 * a caliber per tier (+25 % damage per level) and one special module per tier.
 */
export const CALIBER = { bonus: 0.25, max: 10, cost: (l) => 5 + 5 * l };
export const MODULES = [
  { name: 'Essaim', desc: 'Éclaireurs 50 % plus rapides', cost: 15 },
  { name: 'Double tir', desc: 'Chasseurs : 30 % de chance de frapper deux fois', cost: 20 },
  { name: 'Foreuse', desc: 'Frégates : perçage à 70 % des dégâts au lieu de 40 %', cost: 25 },
  { name: 'Lunette', desc: 'Croiseurs : +50 % de chance de critique au lieu de +25 %', cost: 30 },
  { name: 'Onde amplifiée', desc: 'Destroyers : onde de choc plus large et à 50 %', cost: 35 },
  { name: 'Obus lourds', desc: 'Cuirassés : bombardement à 100 % des dégâts', cost: 40 },
  { name: 'Hangar', desc: 'Vaisseaux-mères : 4 drones au lieu de 2', cost: 50 },
  { name: 'Rayon focalisé', desc: 'Neutrons : le rayon frappe tout le secteur à 25 %', cost: 60 },
];

/** Workshop, finger section: Jimmy's tap gets its own caliber and modules. */
export const FINGER_CALIBER = { bonus: 0.5, max: 10, cost: (l) => 5 + 5 * l };
export const FINGER_MODULES = {
  crit: { name: 'Ongle affûté', emoji: '💅', desc: 'Toucher : +25 % de chance de critique', cost: 15 },
  splash: { name: 'Pichenette sismique', emoji: '🌊', desc: 'Toucher : 50 % des dégâts aux blocs proches', cost: 25 },
  auto: { name: 'Doigt automatique', emoji: '🤖', desc: 'Jimmy touche tout seul un bloc 2 fois par seconde', cost: 40 },
};

export function newSave() {
  return {
    v: SAVE_VERSION,
    money: 0,
    totalEarned: 0,
    stage: 1,
    maxStage: 1,
    bought: 0, // tier-0 ships ever bought: slowly raises their price
    tiers: TIERS.map((_, i) => ({ count: i === 0 ? 1 : 0, level: 1 })),
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0])),
    prestige: 0, // resets done: damage ×1.1 each
    stars: 0, // unspent prestige stars
    pp: 0, // unspent prestige points (ship workshop)
    ppEarned: 0, // prestige points earned in total (the workshop opens at 10)
    workshop: {
      caliber: TIERS.map(() => 0),
      modules: TIERS.map(() => false),
      finger: 0,
      fingerModules: Object.fromEntries(Object.keys(FINGER_MODULES).map((k) => [k, false])),
    },
    skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0])),
    runBest: 1, // best sector of this run (stars at prestige)
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), // lifetime
    daily: null, // { date, missions: [{ kind, target, progress, claimed }], bonus }
    rate: 0, // average income per second while playing (for offline earnings)
    savedAt: Date.now(),
  };
}

/** Repairs a save read from storage or the server (older versions, tampering). */
export function normalizeSave(raw) {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : min);
  const s = { ...base };
  s.money = num(raw.money);
  s.totalEarned = num(raw.totalEarned);
  s.stage = Math.floor(num(raw.stage, 1));
  s.maxStage = Math.max(s.stage, Math.floor(num(raw.maxStage, 1)));
  s.bought = Math.floor(num(raw.bought));
  s.tiers = TIERS.map((_, i) => ({
    count: Math.min(MAX_SHIPS_PER_TIER, Math.floor(num(raw.tiers?.[i]?.count))),
    level: Math.floor(num(raw.tiers?.[i]?.level, 1)),
  }));
  if (!s.tiers.some((t) => t.count > 0)) s.tiers[0].count = 1;
  for (const k of Object.keys(UPGRADES)) s.upgrades[k] = Math.min(UPGRADES[k].max, Math.floor(num(raw.upgrades?.[k])));
  s.prestige = Math.floor(num(raw.prestige));
  s.stars = Math.floor(num(raw.stars));
  s.pp = Math.floor(num(raw.pp));
  s.workshop = {
    caliber: TIERS.map((_, i) => Math.min(CALIBER.max, Math.floor(num(raw.workshop?.caliber?.[i])))),
    modules: TIERS.map((_, i) => Boolean(raw.workshop?.modules?.[i])),
    finger: Math.min(FINGER_CALIBER.max, Math.floor(num(raw.workshop?.finger))),
    fingerModules: Object.fromEntries(Object.keys(FINGER_MODULES).map((k) => [k, Boolean(raw.workshop?.fingerModules?.[k])])),
  };
  // Every prestige is worth 10 points, including those done before the points existed:
  // points owned + points spent in the workshop always add up to what was earned.
  s.ppEarned = Math.max(Math.floor(num(raw.ppEarned)), s.prestige * PRESTIGE_POINTS);
  s.pp = Math.max(s.pp, s.ppEarned - workshopSpent(s.workshop));
  for (const k of Object.keys(SKILLS)) s.skills[k] = Math.min(SKILLS[k].max, Math.floor(num(raw.skills?.[k])));
  s.runBest = Math.max(s.stage, Math.floor(num(raw.runBest, 1)));
  for (const k of STAT_KEYS) s.stats[k] = num(raw.stats?.[k]);
  s.daily = raw.daily && typeof raw.daily === 'object' && Array.isArray(raw.daily.missions) ? {
    date: String(raw.daily.date || ''),
    bonus: Boolean(raw.daily.bonus),
    missions: raw.daily.missions.slice(0, 3).filter((m) => MISSIONS[m?.kind]).map((m) => ({
      kind: m.kind, target: Math.max(1, Math.floor(num(m.target, 1))), progress: num(m.progress), claimed: Boolean(m.claimed),
    })),
  } : null;
  s.rate = num(raw.rate);
  s.savedAt = num(raw.savedAt) || Date.now();
  return s;
}

// ---- ships ---------------------------------------------------------------------------

/** Damage of one hit from a ship of tier `t` at level `level` (×2 every 25 levels). */
export const shipDamage = (t, level) => 8 ** t * (1 + 0.3 * (level - 1)) * 2 ** Math.floor((level - 1) / 25);

/** Permanent damage multiplier earned with prestiges. */
export const prestigeFactor = (s) => (1 + PRESTIGE_BONUS) ** s.prestige;

/** Permanent damage multiplier of the skill tree. */
export const skillFactor = (s) => 1 + 0.25 * s.skills.power;

/** Damage of one hit from a ship of the fleet (level, prestige and skills included). */
export const fleetDamage = (s, t) => shipDamage(t, s.tiers[t].level) * prestigeFactor(s) * skillFactor(s) * caliberFactor(s, t);

/** Damage multiplier of a tier's caliber (workshop). */
export const caliberFactor = (s, t) => 1 + CALIBER.bonus * s.workshop.caliber[t];
export const hasModule = (s, t) => s.workshop.modules[t];

/** Price of the next `n` levels of a tier (geometric series). */
export function levelCost(t, level, n = 1) {
  const r = 1.13;
  const first = 10 * 25 ** t * r ** (level - 1);
  return n === 1 ? first : first * ((r ** n - 1) / (r - 1));
}

/** How many levels the money pays for (at least 0, at most `cap`). */
export function affordableLevels(t, level, money, cap = 1000) {
  let n = 0;
  while (n < cap && levelCost(t, level, n + 1) <= money) n += 1;
  return n;
}

/**
 * Price of the next tier-0 ship: it rises with the fleet (and drops again after a merge),
 * and slowly with every ship ever bought.
 */
export const buyCost = (count, bought = 0) => 10 * 1.35 ** count * 1.02 ** bought;
export const shipCost = (s) => buyCost(s.tiers[0].count, s.bought);

/** Price of the next `n` tier-0 ships. */
export function buyCostN(s, n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += buyCost(s.tiers[0].count + i, s.bought + i);
  return total;
}
export function affordableShips(s, cap = MAX_SHIPS_PER_TIER) {
  let n = 0;
  let total = 0;
  while (n < cap && s.tiers[0].count + n < MAX_SHIPS_PER_TIER) {
    total += buyCost(s.tiers[0].count + n, s.bought + n);
    if (total > s.money) break;
    n += 1;
  }
  return n;
}

export const canBuy = (s, n = 1) => n >= 1 && s.tiers[0].count + n <= MAX_SHIPS_PER_TIER && s.money >= buyCostN(s, n);
export const mergeCost = (s) => MERGE_COST - s.skills.merge;
export const canMerge = (s, t) => t > 0 && s.tiers[t - 1].count >= mergeCost(s) && s.tiers[t].count < MAX_SHIPS_PER_TIER;
/** A tier is shown once the player owns (or could merge into) it. */
export const tierVisible = (s, t) => t === 0 || s.tiers[t].count > 0 || s.tiers[t - 1].count > 0 || s.tiers[t].level > 1;

export function buyShip(s, n = 1) {
  if (!canBuy(s, n)) return false;
  s.money -= buyCostN(s, n);
  s.tiers[0].count += n;
  s.bought += n;
  return true;
}

export function mergeShips(s, t) {
  if (!canMerge(s, t)) return false;
  s.tiers[t - 1].count -= mergeCost(s);
  s.tiers[t].count += 1;
  track(s, 'merges');
  return true;
}

export function levelUp(s, t, n = 1) {
  if (n < 1) return false;
  const cost = levelCost(t, s.tiers[t].level, n);
  if (s.money < cost) return false;
  s.money -= cost;
  s.tiers[t].level += n;
  return true;
}

// ---- upgrades --------------------------------------------------------------------------

export const upgradeCost = (k, lvl) => UPGRADES[k].base * UPGRADES[k].growth ** lvl;
export const canUpgrade = (s, k) => s.upgrades[k] < UPGRADES[k].max && s.money >= upgradeCost(k, s.upgrades[k]);

export function buyUpgrade(s, k) {
  if (!canUpgrade(s, k)) return false;
  s.money -= upgradeCost(k, s.upgrades[k]);
  s.upgrades[k] += 1;
  return true;
}

export const speedFactor = (s) => 1 + 0.08 * s.upgrades.speed;
export const gainFactor = (s) => 1.15 ** s.upgrades.gain;
export const critChance = (s) => 0.03 * s.upgrades.crit;
export const CRIT_FACTOR = 5;

/** Tapping a block: grows with upgrades and follows the best ship so it stays useful. */
export function clickDamage(s) {
  let best = 0;
  s.tiers.forEach((tier, t) => { if (tier.count > 0) best = Math.max(best, fleetDamage(s, t)); });
  return Math.max(1, best * 0.5) * 1.5 ** s.upgrades.click * (1 + FINGER_CALIBER.bonus * s.workshop.finger);
}

// ---- prestige ------------------------------------------------------------------------------

export const prestigeCost = (s) => PRESTIGE_BASE_COST * PRESTIGE_COST_GROWTH ** s.prestige;
export const canPrestige = (s) => s.money >= prestigeCost(s);

/** Stars earned by a prestige: 1, plus 1 per 10 sectors reached in the run. */
export const starsFor = (s) => 1 + Math.floor(s.runBest / 10);

/**
 * Back to secteur 1 with an empty fleet (the credits left are lost). Kept: prestige count,
 * stars and skills, prestige points and workshop, record, lifetime earnings and stats, daily missions.
 */
export function doPrestige(s) {
  if (!canPrestige(s)) return false;
  const keep = {
    prestige: s.prestige + 1, stars: s.stars + starsFor(s), skills: s.skills, maxStage: s.maxStage,
    pp: s.pp + PRESTIGE_POINTS, ppEarned: s.ppEarned + PRESTIGE_POINTS, workshop: s.workshop,
    totalEarned: s.totalEarned, stats: s.stats, daily: s.daily,
  };
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, newSave(), keep);
  // Starting bonuses of the skill tree.
  s.tiers[0].count += 2 * s.skills.fleet;
  s.money = s.skills.bank ? 100 * 10 ** s.skills.bank : 0;
  return true;
}

/** The workshop (and its tab) opens once 10 prestige points have been earned. */
export const WORKSHOP_UNLOCK = 10;
export const workshopOpen = (s) => s.ppEarned >= WORKSHOP_UNLOCK;

/** Prestige points already spent in a workshop. */
export function workshopSpent(w) {
  let spent = 0;
  w.caliber.forEach((lvl, t) => { for (let l = 0; l < lvl; l++) spent += CALIBER.cost(l); if (w.modules[t]) spent += MODULES[t].cost; });
  for (let l = 0; l < w.finger; l++) spent += FINGER_CALIBER.cost(l);
  for (const [k, m] of Object.entries(FINGER_MODULES)) if (w.fingerModules[k]) spent += m.cost;
  return spent;
}
export const caliberCost = (s, t) => CALIBER.cost(s.workshop.caliber[t]);
export const canBuyCaliber = (s, t) => workshopOpen(s) && s.workshop.caliber[t] < CALIBER.max && s.pp >= caliberCost(s, t);
export function buyCaliber(s, t) {
  if (!canBuyCaliber(s, t)) return false;
  s.pp -= caliberCost(s, t);
  s.workshop.caliber[t] += 1;
  return true;
}
export const canBuyModule = (s, t) => workshopOpen(s) && !s.workshop.modules[t] && s.pp >= MODULES[t].cost;
export function buyModule(s, t) {
  if (!canBuyModule(s, t)) return false;
  s.pp -= MODULES[t].cost;
  s.workshop.modules[t] = true;
  return true;
}

export const fingerCost = (s) => FINGER_CALIBER.cost(s.workshop.finger);
export const canBuyFinger = (s) => workshopOpen(s) && s.workshop.finger < FINGER_CALIBER.max && s.pp >= fingerCost(s);
export function buyFinger(s) {
  if (!canBuyFinger(s)) return false;
  s.pp -= fingerCost(s);
  s.workshop.finger += 1;
  return true;
}
export const hasFingerModule = (s, k) => s.workshop.fingerModules[k];
export const canBuyFingerModule = (s, k) => workshopOpen(s) && !s.workshop.fingerModules[k] && s.pp >= FINGER_MODULES[k].cost;
export function buyFingerModule(s, k) {
  if (!canBuyFingerModule(s, k)) return false;
  s.pp -= FINGER_MODULES[k].cost;
  s.workshop.fingerModules[k] = true;
  return true;
}

export const skillCost = (k, lvl) => SKILLS[k].cost(lvl);
export const canBuySkill = (s, k) => s.skills[k] < SKILLS[k].max && s.stars >= skillCost(k, s.skills[k]);
export function buySkill(s, k) {
  if (!canBuySkill(s, k)) return false;
  s.stars -= skillCost(k, s.skills[k]);
  s.skills[k] += 1;
  return true;
}

// ---- stages ------------------------------------------------------------------------------

/** Total HP of all the blocks of a stage. */
export const stageHp = (stage) => 150 * 1.35 ** (stage - 1);
/** Bonus paid when a block breaks, relative to its HP. */
export const BREAK_BONUS = 0.5;
/** Bonus paid when the whole stage is cleared. */
export const stageClearBonus = (stage) => stageHp(stage) * 0.25;

// ---- money --------------------------------------------------------------------------------

export function earn(s, amount) {
  const gained = amount * gainFactor(s);
  s.money += gained;
  s.totalEarned += gained;
  return gained;
}

/** Money earned while away: a share of the income rate, for a capped time. */
export function offlineEarnings(s, now = Date.now()) {
  const seconds = Math.max(0, (now - s.savedAt) / 1000);
  const cap = (2 + s.upgrades.offline) * 3600;
  const share = 0.1 + 0.1 * s.upgrades.offline;
  return { amount: s.rate * Math.min(seconds, cap) * share, seconds: Math.min(seconds, cap), away: seconds };
}

/** Credits worth `minutes` of play (quiz rewards, missions); never tiny for new players. */
export const rewardCredits = (s, minutes) => Math.max(s.rate * 60 * minutes, stageHp(s.stage) * minutes * 0.2);

// ---- stats & daily missions ---------------------------------------------------------------

export function track(s, kind, n = 1) {
  if (s.stats[kind] !== undefined) s.stats[kind] += n;
  for (const m of s.daily?.missions || []) if (m.kind === kind && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
}

export const MISSIONS = {
  blocks: { label: (n) => `Casse ${n} blocs`, targets: [150, 300, 500] },
  taps: { label: (n) => `Touche ${n} fois un bloc`, targets: [100, 200, 300] },
  merges: { label: (n) => `Fais ${n} fusions`, targets: [2, 4, 6] },
  boosts: { label: (n) => `Utilise ${n} fois l’accélération`, targets: [2, 3, 5] },
  ufos: { label: (n) => `Attrape ${n} soucoupe${n > 1 ? 's' : ''}`, targets: [1, 2, 3] },
  sectors: { label: (n) => `Termine ${n} secteurs`, targets: [10, 20, 30] },
  golds: { label: (n) => `Casse ${n} blocs dorés`, targets: [3, 5, 8] },
  bosses: { label: (n) => `Conquiers ${n} planète${n > 1 ? 's' : ''}`, targets: [1, 2] },
};
export const MISSION_REWARD_MINUTES = 10;

/** Small deterministic PRNG: the same missions for everyone on a given day. */
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Today's 3 missions (created on the first call of the day). */
export function dailyMissions(s, dateKey) {
  if (s.daily?.date === dateKey) return s.daily;
  const rnd = seeded(dateKey);
  const kinds = Object.keys(MISSIONS).filter((k) => k !== 'bosses' || s.maxStage >= 10);
  const picked = [];
  while (picked.length < 3 && kinds.length) picked.push(...kinds.splice(Math.floor(rnd() * kinds.length), 1));
  s.daily = {
    date: dateKey,
    bonus: false,
    missions: picked.map((kind) => {
      const { targets } = MISSIONS[kind];
      return { kind, target: targets[Math.floor(rnd() * targets.length)], progress: 0, claimed: false };
    }),
  };
  return s.daily;
}

/** Claims a finished mission: credits, and 1 star once all three are claimed. */
export function claimMission(s, i) {
  const m = s.daily?.missions[i];
  if (!m || m.claimed || m.progress < m.target) return null;
  m.claimed = true;
  const credits = rewardCredits(s, MISSION_REWARD_MINUTES);
  s.money += credits;
  s.totalEarned += credits;
  let star = false;
  if (!s.daily.bonus && s.daily.missions.every((x) => x.claimed)) {
    s.daily.bonus = true;
    s.stars += 1;
    star = true;
  }
  return { credits, star };
}

// ---- display --------------------------------------------------------------------------------

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1,234 · 12.3K · 4.56M … then scientific notation. */
export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1).replace('.', ',') : String(Math.floor(n));
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '').replace('.', ',');
  const v = n / 1000 ** tier;
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const num = (Math.floor(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.?0+$/, (m) => (m.startsWith('.') || digits ? '' : m));
  return `${num.replace('.', ',')}${SUFFIXES[tier]}`;
}
