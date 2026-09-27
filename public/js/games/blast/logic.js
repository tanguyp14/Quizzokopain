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
/** Fewer ships for the last tiers: 4 destroyers → 1 cuirassé, 3 cuirassés → 1 vaisseau-mère, 3 vaisseaux-mères → 1 Neutron. */
export const MERGE_COSTS = [5, 5, 5, 5, 5, 4, 3, 3]; // by tier obtained (index 0 unused)

/** Powers of the higher tiers (applied by the engine). */
export const ABILITIES = {
  2: { name: 'Perforation', desc: 'perce les blocs en continu' },
  3: { name: 'Visée', desc: '+25 % de critiques' },
  4: { name: 'Onde de choc', desc: '30 % aux blocs proches' },
  5: { name: 'Marquage', desc: 'le bloc touché prend +50 % de dégâts 4 s et perd son blindage' },
  6: { name: 'Drones', desc: '2 drones d’escorte' },
  7: { name: 'Rayon Neutron', desc: '10 % sur tout le secteur' },
};
export const MAX_SHIPS_PER_TIER = Infinity; // no limit (the field shows at most 60 ships per tier, see the engine)

export const UPGRADES = {
  speed: { label: 'Réacteurs', emoji: '💨', desc: 'Vitesse des vaisseaux +8 %', base: 200, growth: 2.1, max: 25 },
  gain: { label: 'Aspirateur à crédits', emoji: '🧲', desc: 'Gains +15 %', base: 500, growth: 2.4, max: 40 },
  click: { label: 'Doigt de Jimmy', emoji: '👆', desc: 'Toucher : +0,3 % des dégâts par seconde de la flotte', base: 50, growth: 1.9, max: 30 },
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
export const bossTime = (s) => 30 + 10 * s.skills.boss + 5 * s.forge.relics.totem;
/** Ore given by a conquered planet (relic « Totem » +50 % per level). */
export const planetOre = (s) => Math.round(FORGE.planetOre * (1 + 0.5 * s.forge.relics.totem));

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
export const ufoInterval = (s) => [45, 90].map((v) => v * (1 - 0.15 * s.skills.ufo) * Math.max(0.25, 0.9 ** s.forge.relics.orb));
export const UFO_FRENZY = { factor: 3, duration: 30 };
/** Saucer bonus durations (relic « Orbe » +20 % per level). */
export const ufoBonusFactor = (s) => 1 + 0.2 * s.forge.relics.orb;

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

// ---- fleet variety ---------------------------------------------------------------------------

/**
 * Each zone favours two ship types (×3 damage) and resists one (×0.5), so the best fleet
 * depends on where you are. Tiers: 0 Éclaireur, 1 Chasseur, 2 Frégate, 3 Croiseur,
 * 4 Destroyer, 5 Cuirassé, 6 Vaisseau-mère, 7 Neutron.
 */
export const ZONE_AFFINITY = [
  { weak: [0, 1], resist: 7 }, // Nébuleuse
  { weak: [4, 5], resist: 0 }, // Glace: shatters under splash damage
  { weak: [2, 3], resist: 1 }, // Lave
  { weak: [1, 6], resist: 2 }, // Trésor
  { weak: [3, 7], resist: 4 }, // Jungle alien
  { weak: [2, 5], resist: 3 }, // Abysses
  { weak: [0, 7], resist: 5 }, // Néon
];
export const ZONE_BONUS = 3;
export const ZONE_MALUS = 0.5;
export const zoneAffinity = (stage) => ZONE_AFFINITY[Math.floor((stage - 1) / 10) % ZONE_AFFINITY.length];
export function zoneFactor(stage, t) {
  const z = zoneAffinity(stage);
  return z.weak.includes(t) ? ZONE_BONUS : z.resist === t ? ZONE_MALUS : 1;
}

/** Squadron: +15 % damage for the whole fleet per ship type in service (10 ships, or level 50 with one ship). */
export const SQUADRON = { bonus: 0.15, ships: 10, level: 50 };
export const squadronTypes = (s) => s.tiers.filter((tier) => tier.count >= SQUADRON.ships || (tier.count > 0 && tier.level >= SQUADRON.level)).length;
export const squadronFactor = (s) => 1 + SQUADRON.bonus * squadronTypes(s);

/**
 * Special blocks (besides gold, bombs and ores):
 * - armored (from sector 11): only 20 % of the damage, except drilling and critical hits;
 * - regenerating (from sector 21): heal 5 % a second when left alone for a second;
 * - swarm sectors (every 5th sector, 3, 8, 13…): many small blocks, ideal for area damage.
 */
/** Cuirassé « Marquage »: the block hit takes more damage from the whole fleet for a while (support ship). */
export const MARK = { factor: 1.5, duration: 4, moduleFactor: 2, moduleDuration: 6 };
export const ARMOR = { chance: 0.07, from: 11, factor: 0.2 };
export const REGEN = { chance: 0.06, from: 21, rate: 0.05, delay: 1 };
/**
 * Sealed block (from sector 31, in 30 % of the sectors, one at most): only one ship type can
 * damage it (its hits, drilling, shock wave, beam or drones), the others fly through. It blocks
 * the sector: without that type in the fleet, no way through (merge up, or travel elsewhere).
 * Kept reasonable: the type is one the sector allows, one more tier every 40 sectors (Chasseur
 * from 40, Frégate from 80… Neutron from 280). The block pays ×3 when it breaks.
 */
export const SEAL = { chance: 0.3, from: 31, bonus: 3, tierEvery: 40 };
export const sealMaxTier = (stage) => Math.min(TIERS.length - 1, Math.floor(stage / SEAL.tierEvery));
/** Ship type sealing a new block of this sector. */
export const sealTier = (stage, r = Math.random()) => Math.floor(r * (sealMaxTier(stage) + 1));
export const isSwarmStage = (stage) => !isBossStage(stage) && stage >= 8 && stage % 5 === 3;

// Prestige skill tree, paid with stars (kept forever, like the prestige count).
export const SKILLS = {
  // Infinite bonuses (no cap, exponential prices): there is always something to buy with stars.
  power: {
    label: 'Noyau de neutron', emoji: '⚛️', desc: 'Dégâts +25 % par niveau', max: Infinity,
    cost: (l) => (l < 20 ? 2 + 2 * l : Math.round(42 * 1.15 ** (l - 20))),
  },
  cosmic: { label: 'Gains cosmiques', emoji: '💫', desc: 'Crédits +10 % par niveau', max: Infinity, cost: (l) => Math.round(3 * 1.25 ** l) },
  hyper: { label: 'Hyperpropulsion', emoji: '🌠', desc: 'Vaisseaux plus rapides (jusqu’à +50 %)', max: Infinity, cost: (l) => Math.round(4 * 1.3 ** l) },
  constellation: { label: 'Constellation', emoji: '✨', desc: 'Étoiles gagnées au prestige +10 % par niveau', max: Infinity, cost: (l) => Math.round(5 * 1.35 ** l) },
  vein: { label: 'Géologue', emoji: '⛏️', desc: 'Blocs de minerai +0,5 % par niveau (Forge)', max: Infinity, cost: (l) => Math.round(3 * 1.25 ** l) },
  academy: { label: 'Académie des pilotes', emoji: '🎓', desc: '+1 🔷 point de prestige gagné par prestige', max: Infinity, cost: (l) => Math.round(6 * 1.4 ** l) },
  night: { label: 'Longue veille', emoji: '🌙', desc: 'Gains hors ligne : +1 h de durée par niveau', max: Infinity, cost: (l) => Math.round(2 * 1.3 ** l) },
  fleet: {
    label: 'Flotte de départ', emoji: '🛸', desc: '+5 éclaireurs au départ par niveau', max: Infinity,
    cost: (l) => (l < 5 ? 1 + l : Math.round(6 * 1.35 ** (l - 5))),
  },
  shipyard: { label: 'Chantier naval', emoji: '🏗️', desc: 'Éclaireurs 5 % moins chers par niveau', max: Infinity, cost: (l) => Math.round(4 * 1.3 ** l) },
  // Capped bonuses.

  bank: { label: 'Trésor de départ', emoji: '💰', desc: 'Commence avec 1K, 10K, 100K… crédits', max: 5, cost: (l) => 1 + l },
  boost: { label: 'Turbo', emoji: '⚡', desc: 'Accélération +5 s', max: 5, cost: (l) => 1 + l },
  merge: { label: 'Fusion compacte', emoji: '🧬', desc: 'Une fusion demande un vaisseau de moins (4 au lieu de 5 ; 2 au lieu de 3 pour les plus gros)', max: 1, cost: () => 6 },
  gold: { label: 'Filon d’or', emoji: '🪙', desc: 'Blocs dorés +3 %', max: 5, cost: (l) => 1 + l },
  ufo: { label: 'Radar à soucoupes', emoji: '📡', desc: 'Soucoupe 15 % plus fréquente', max: 4, cost: (l) => 2 + l },
  boss: { label: 'Chronomètre', emoji: '⏱️', desc: '+10 s pour conquérir une planète', max: 3, cost: (l) => 2 + l },
  travel: {
    label: 'Voyage interspatial', emoji: '🌌', desc: 'Choisis ton secteur parmi ceux déjà atteints et restes-y (pour farmer un minerai, une planète…)',
    max: 1, cost: () => 20, prestige: 5,
  },
  auto: {
    label: 'Chantier automatique', emoji: '🤖', desc: 'Bouton « Auto » sur chaque vaisseau : achat et fusion automatiques dès que possible',
    max: 1, cost: () => 25, prestige: 7,
  },
  reserve: {
    label: 'Réserve de flotte', emoji: '🛡️', desc: 'Garde un minimum de vaisseaux de chaque type : les fusions (manuelles ou auto) n’y touchent pas',
    max: 1, cost: () => 30,
  },
  starfind: {
    label: 'Télescope', emoji: '🔭', desc: 'Blocs étoile (1 ⭐) : +0,1 % de chance par secteur, plafond 20 % puis +1 % par niveau',
    max: 31, cost: (l) => 100 + 10 * l,
  },
  autoUpg: {
    label: 'Ingénieur de bord', emoji: '🔧', desc: 'Bouton « Auto » sur chaque amélioration : achetée dès que les crédits le permettent',
    max: 1, cost: () => 40,
  },
};

export const STAT_KEYS = ['blocks', 'golds', 'bosses', 'ufos', 'merges', 'taps', 'boosts', 'sectors', 'playTime', 'ores', 'starsFound'];

// ---- Forge (from prestige 5, unlocked for 15 prestige points) --------------------------------
// Once open, some blocks hold the ore of their zone (one ore per 10 sectors, like the themes).
// Ores are kept forever and pay advanced ship upgrades through recipes.
export const FORGE = { prestige: 5, cost: 15, oreChance: 0.1, planetOre: 5 };
export const RESOURCES = [
  { name: 'Poussière d’étoile', emoji: '✨', color: '#c9b8ff' },
  { name: 'Cristal de glace', emoji: '🧊', color: '#bfe9ff' },
  { name: 'Obsidienne', emoji: '🌋', color: '#ff7a45' },
  { name: 'Pépite solaire', emoji: '🌞', color: '#ffd166' },
  { name: 'Spore alien', emoji: '🍄', color: '#7dffb3' },
  { name: 'Perle abyssale', emoji: '🐚', color: '#6fb7ff' },
  { name: 'Plasma néon', emoji: '💠', color: '#ff61d8' },
];
/** Ore of a sector's zone (sectors 1-10 → 0, 11-20 → 1…, cycling like the themes). */
export const resourceFor = (stage) => Math.floor((stage - 1) / 10) % RESOURCES.length;
/** Ore units in one ore block: more in deeper sectors. */
export const oreAmount = (stage) => 1 + Math.floor(stage / 25);

/**
 * Advanced upgrades per tier: alloy (+15 % damage per level) and stabilizers (shorter,
 * straighter bounces: -8 % per level, so more hits). Recipes use two ores that depend on the tier,
 * higher tiers needing ores from deeper zones.
 */
const cycle = (start) => [...Array(7).keys()].map((i) => (start + i) % 7);
export const FORGE_UPGRADES = {
  alloy: {
    name: 'Alliage', emoji: '🔩', desc: 'Dégâts +15 % par niveau, sans limite', bonus: 0.15, max: Infinity,
    ores: (t) => cycle(t), base: [8, 6, 4, 3, 3, 2, 2],
  },
  stab: {
    name: 'Stabilisateurs', emoji: '🧲', desc: 'Rebonds plus courts : plus de coups (−8 % par niveau, puis de moins en moins)', bonus: 0.08, max: Infinity,
    // Frigates never bounce (they pierce): for them, the stabilizers speed up the drilling.
    descFor: (t) => (t === 2 ? 'Perçage plus rapide : plus de coups (+8 % par niveau, puis de moins en moins)' : null),
    ores: (t) => cycle(t + 2), base: [10, 8, 5, 4, 3, 3, 2],
  },
};
/** Forge prices grow exponentially with the level (no level cap: the forge never ends). */
export const FORGE_GROWTH = 1.9;
/**
 * Recipe of the next level: [{ res, amount }]. The higher the level, the more different ores:
 * 2 up to level 2, 3 up to 5, 4 up to 10, 5 up to 15, 6 up to 20, then all 7.
 */
export const forgeRecipe = (k, t, lvl) => {
  const u = FORGE_UPGRADES[k];
  const kinds = lvl < 2 ? 2 : lvl < 5 ? 3 : lvl < 10 ? 4 : lvl < 15 ? 5 : lvl < 20 ? 6 : 7;
  return u.ores(t).slice(0, kinds).map((res, i) => ({ res, amount: Math.round(u.base[i] * FORGE_GROWTH ** lvl) }));
};

// ---- Forge extensions: alembic and relics (unlocked with stars AND prestige points) -----------

/** What unlocking costs: both the stars and the prestige points. */
export const FORGE_UNLOCKS = {
  alembic: { name: 'Alambic', emoji: '⚗️', prestige: 5, stars: 40, pp: 25 },
  relics: { name: 'Reliques de Jimmy', emoji: '🏺', prestige: 10, stars: 150, pp: 80 },
};

/** Alembic: 3 of an ore for 1 of the next zone's ore (×3 per zone of distance), 1 for 1 the other way. */
export const ALEMBIC_RATE = 3;
export const alembicCost = (from, to) => (to > from ? ALEMBIC_RATE ** (to - from) : 1);

/**
 * Relics: end-game, global bonuses without a level cap. Every level needs all 7 ores in huge
 * amounts (×2.5 per level).
 */
export const RELICS = {
  totem: { name: 'Totem des planètes', emoji: '🗿', desc: '+5 s pour conquérir une planète et +50 % de minerai par planète', base: 400 },
  orb: { name: 'Orbe de la soucoupe', emoji: '🔮', desc: 'Soucoupe 10 % plus fréquente et bonus 20 % plus longs', base: 500 },
  astrolabe: { name: 'Astrolabe', emoji: '🧭', desc: 'Dégâts de la flotte +0,5 % par secteur de ton record', base: 800 },
  crown: { name: 'Couronne de Jimmy', emoji: '👑', desc: 'Prestige : +25 % d’étoiles et +2 🔷 points', base: 1000 },
};
export const RELIC_GROWTH = 2.5;
export const relicRecipe = (k, lvl) => RESOURCES.map((_, res) => ({ res, amount: Math.round(RELICS[k].base * RELIC_GROWTH ** lvl * (1 + 0.15 * res)) }));

// Prestige: start over from zero for 10M credits, +10M after each prestige (10M, 20M, 30M…);
// every prestige adds +10 % damage (compounded), stars and 10 prestige points for the ship workshop.
export const PRESTIGE_BASE_COST = 10_000_000;
export const PRESTIGE_COST_STEP = 10_000_000;
export const PRESTIGE_BONUS = 0.1;
export const PRESTIGE_POINTS = 10;

/**
 * Ship workshop (unlocked by the first prestige, paid with prestige points, kept forever):
 * a caliber per tier (+25 % damage per level) and one special module per tier.
 */
/** Caliber: no level cap; the price rises with the level (+5 then ×1.1 each level) and with the tier (+40 % per tier). */
export const CALIBER = { bonus: 0.1, max: Infinity, cost: (l, t = 0) => Math.round((5 + 5 * l) * 1.1 ** l * (1 + 0.4 * t)) };
/**
 * The workshop does what the forge doesn't (the forge boosts damage):
 * - « Soute à butin » (saved as `caliber`): +10 % credits earned by the tier's hits per level, no cap;
 * - « Brise-blindage »: the tier gets through armored blocks, from 20 % of its damage to 100 % in 8 levels.
 */
export const PIERCE = { max: 8, cost: (l, t = 0) => Math.round((4 + 4 * l) * 1.15 ** l * (1 + 0.3 * t)) };
export const MODULES = [
  { name: 'Essaim', desc: 'Éclaireurs 50 % plus rapides', cost: 15 },
  { name: 'Double tir', desc: 'Chasseurs : 30 % de chance de frapper deux fois', cost: 20 },
  { name: 'Foreuse', desc: 'Frégates : perçage à 70 % des dégâts au lieu de 40 %', cost: 25 },
  { name: 'Lunette', desc: 'Croiseurs : coups critiques à 200 %, soit ×10 au lieu de ×5', cost: 30 },
  { name: 'Onde amplifiée', desc: 'Destroyers : onde de choc plus large et à 50 %', cost: 35 },
  { name: 'Obus marqueurs', desc: 'Cuirassés : marquage +100 % de dégâts pendant 6 s', cost: 40 },
  { name: 'Hangar', desc: 'Vaisseaux-mères : 4 drones au lieu de 2', cost: 50 },
  { name: 'Rayon focalisé', desc: 'Neutrons : le rayon frappe tout le secteur à 25 %', cost: 60 },
];

/** Workshop, finger section: Jimmy's tap gets its own caliber and modules. */
export const FINGER_CALIBER = { bonus: 0.1, max: 10, cost: (l) => 5 + 5 * l };
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
    tiers: TIERS.map((_, i) => ({ count: i === 0 ? 1 : 0, level: 1, asc: 0 })), // asc: ascensions (level caps passed)
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0])),
    prestige: 0, // resets done: damage ×1.1 each
    stars: 0, // unspent prestige stars
    pp: 0, // unspent prestige points (ship workshop)
    forge: {
      unlocked: false, res: RESOURCES.map(() => 0), alloy: TIERS.map(() => 0), stab: TIERS.map(() => 0),
      alembic: false, relicsOpen: false, relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 0])), ppPaid: 0,
    },
    ppEarned: 0, // prestige points earned in total (the workshop opens at 10)
    workshop: {
      caliber: TIERS.map(() => 0),
      pierce: TIERS.map(() => 0),
      modules: TIERS.map(() => false),
      finger: 0,
      fingerModules: Object.fromEntries(Object.keys(FINGER_MODULES).map((k) => [k, false])),
    },
    skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0])),
    runBest: 1, // best sector of this run (stars at prestige)
    locked: null, // interspace travel: sector the fleet stays in (null = classic conquest)
    auto: TIERS.map(() => false), // automatic buying / merging per tier
    reserve: TIERS.map(() => 0), // ships of each tier kept out of merges (star tree « Réserve de flotte »)
    autoUpg: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, false])), // upgrades bought automatically (« Ingénieur de bord »)
    launch: TIERS.map(() => 0), // « Départ lancé » steps per tier (starting level 25, 50, 75, 100)
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
    asc: Math.floor(num(raw.tiers?.[i]?.asc)),
  }));
  if (!s.tiers.some((t) => t.count > 0)) s.tiers[0].count = 1;
  for (const k of Object.keys(UPGRADES)) s.upgrades[k] = Math.min(UPGRADES[k].max, Math.floor(num(raw.upgrades?.[k])));
  s.prestige = Math.floor(num(raw.prestige));
  s.stars = Math.floor(num(raw.stars));
  s.pp = Math.floor(num(raw.pp));
  s.workshop = {
    caliber: TIERS.map((_, i) => Math.min(CALIBER.max, Math.floor(num(raw.workshop?.caliber?.[i])))),
    pierce: TIERS.map((_, i) => Math.min(PIERCE.max, Math.floor(num(raw.workshop?.pierce?.[i])))),
    modules: TIERS.map((_, i) => Boolean(raw.workshop?.modules?.[i])),
    finger: Math.min(FINGER_CALIBER.max, Math.floor(num(raw.workshop?.finger))),
    fingerModules: Object.fromEntries(Object.keys(FINGER_MODULES).map((k) => [k, Boolean(raw.workshop?.fingerModules?.[k])])),
  };
  // Every prestige is worth 10 points, including those done before the points existed:
  // points owned + points spent in the workshop always add up to what was earned.
  s.forge = {
    unlocked: Boolean(raw.forge?.unlocked),
    res: RESOURCES.map((_, i) => Math.floor(num(raw.forge?.res?.[i]))),
    alloy: TIERS.map((_, i) => Math.min(FORGE_UPGRADES.alloy.max, Math.floor(num(raw.forge?.alloy?.[i])))),
    stab: TIERS.map((_, i) => Math.min(FORGE_UPGRADES.stab.max, Math.floor(num(raw.forge?.stab?.[i])))),
    alembic: Boolean(raw.forge?.alembic),
    relicsOpen: Boolean(raw.forge?.relicsOpen),
    relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, Math.floor(num(raw.forge?.relics?.[k]))])),
    ppPaid: Math.floor(num(raw.forge?.ppPaid)), // prestige points spent on forge unlocks (alembic, relics)
  };
  s.ppEarned = Math.max(Math.floor(num(raw.ppEarned)), s.prestige * PRESTIGE_POINTS);
  s.pp = Math.max(s.pp, s.ppEarned - workshopSpent(s.workshop) - (s.forge.unlocked ? FORGE.cost : 0) - s.forge.ppPaid);
  for (const k of Object.keys(SKILLS)) s.skills[k] = Math.min(SKILLS[k].max, Math.floor(num(raw.skills?.[k])));
  s.runBest = Math.max(s.stage, Math.floor(num(raw.runBest, 1)));
  s.auto = TIERS.map((_, i) => Boolean(raw.auto?.[i]));
  s.reserve = TIERS.map((_, i) => Math.floor(num(raw.reserve?.[i])));
  s.autoUpg = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, Boolean(raw.autoUpg?.[k])]));
  s.launch = TIERS.map((_, i) => Math.floor(num(raw.launch?.[i])));
  s.locked = s.skills.travel && Number.isInteger(raw.locked) && raw.locked >= 1 && raw.locked <= s.runBest ? raw.locked : null;
  if (s.locked) s.stage = s.locked;
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

/** Damage of one hit from a ship of tier `t` at level `level` (×2 every 10 levels). */
export const shipDamage = (t, level) => 8 ** t * (1 + 0.3 * (level - 1)) * 2 ** Math.floor((level - 1) / 10);

/** Permanent damage multiplier earned with prestiges. */
export const prestigeFactor = (s) => (1 + PRESTIGE_BONUS) ** s.prestige;

/** Permanent damage multiplier of the skill tree. */
export const skillFactor = (s) => 1 + 0.25 * s.skills.power;

/** Damage of one hit from a ship of the fleet (level, prestige and skills included). */
export const fleetDamage = (s, t) => shipDamage(t, s.tiers[t].level) * prestigeFactor(s) * skillFactor(s)
  * alloyFactor(s, t) * astrolabeFactor(s) * ascensionFactor(s, t) * squadronFactor(s);

/** Relic « Astrolabe »: +0.5 % damage per sector of the record, per level. */
export const astrolabeFactor = (s) => 1 + 0.005 * s.maxStage * s.forge.relics.astrolabe;

/** Forge: alloy damage multiplier and stabilizer bounce factor of a tier. */
export const alloyFactor = (s, t) => 1 + FORGE_UPGRADES.alloy.bonus * s.forge.alloy[t];
/** Bounce (or drilling interval) factor: -8 % per level up to level 5, then -7 % of what is left, 0.2 at least. */
export const bounceFactor = (s, t) => {
  const lvl = s.forge.stab[t];
  return lvl <= 5 ? 1 - FORGE_UPGRADES.stab.bonus * lvl : Math.max(0.2, 0.6 * 0.93 ** (lvl - 5));
};

/** Damage multiplier of a tier's caliber (workshop). */
/** Workshop « Soute à butin »: credits multiplier of a tier's hits. */
export const lootFactor = (s, t) => 1 + CALIBER.bonus * s.workshop.caliber[t];
/** Share of a tier's damage that gets through armored blocks (workshop « Brise-blindage »). */
export const armorFactor = (s, t) => ARMOR.factor + (1 - ARMOR.factor) * ((s.workshop.pierce?.[t] || 0) / PIERCE.max);
export const hasModule = (s, t) => s.workshop.modules[t];

/**
 * Price factor of a tier's levels: ×25 per tier up to the frigates, then only ×3. A merge turns
 * 5 ships into 1 hitting 8× harder (×1.6), and levels are bought for the whole tier: at ×25 per
 * tier, piling every ship on frigates and levelling them was always the best deal. At ×3, going
 * up a tier costs about as many levels as the merge brings, and the higher tiers' powers make
 * the difference.
 */
export const levelTierFactor = (t) => 25 ** Math.min(t, 2) * 3 ** Math.max(0, t - 2);
/** Price of the next `n` levels of a tier (geometric series). */
export function levelCost(t, level, n = 1) {
  const r = 1.17;
  const first = 10 * levelTierFactor(t) * r ** (level - 1);
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
export const buyCost = (count, bought = 0) => 10 * 1.25 ** count * 1.01 ** bought;
/** Star tree « Chantier naval »: -5 % on scouts per level (compounded). */
export const shipDiscount = (s) => 0.95 ** s.skills.shipyard;
export const shipCost = (s) => buyCost(s.tiers[0].count, s.bought) * shipDiscount(s);

/** Price of the next `n` tier-0 ships. */
export function buyCostN(s, n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += buyCost(s.tiers[0].count + i, s.bought + i) * shipDiscount(s);
  return total;
}
export function affordableShips(s, cap = 100_000) {
  let n = 0;
  let total = 0;
  while (n < cap && s.tiers[0].count + n < MAX_SHIPS_PER_TIER) {
    total += buyCost(s.tiers[0].count + n, s.bought + n) * shipDiscount(s);
    if (total > s.money) break;
    n += 1;
  }
  return n;
}

export const canBuy = (s, n = 1) => n >= 1 && s.tiers[0].count + n <= MAX_SHIPS_PER_TIER && s.money >= buyCostN(s, n);
/** Ships of tier t-1 needed for one ship of tier t (« Fusion compacte »: one less). */
export const mergeCost = (s, t) => MERGE_COSTS[t] - s.skills.merge;
/** Ships of a tier that merges may use (the reserve is kept once the star-tree skill is owned). */
export const mergeable = (s, t) => Math.max(0, s.tiers[t].count - (s.skills.reserve ? s.reserve[t] || 0 : 0));
export const canMerge = (s, t) => t > 0 && mergeable(s, t - 1) >= mergeCost(s, t) && s.tiers[t].count < MAX_SHIPS_PER_TIER;
/** Sets the minimum of ships kept for a tier. */
export function setReserve(s, t, n) {
  if (!s.skills.reserve) return false;
  s.reserve[t] = Math.max(0, Math.floor(Number(n) || 0));
  return true;
}
/** A tier is shown once the player owns (or could merge into) it. */
export const tierVisible = (s, t) => t === 0 || s.tiers[t].count > 0 || s.tiers[t - 1].count > 0 || s.tiers[t].level > 1;

export function buyShip(s, n = 1) {
  if (!canBuy(s, n)) return false;
  s.money -= buyCostN(s, n);
  s.tiers[0].count += n;
  s.bought += n;
  return true;
}

/** How many merges into tier `t` are possible right now. */
export const possibleMerges = (s, t) => (t > 0
  ? Math.max(0, Math.min(Math.floor(mergeable(s, t - 1) / mergeCost(s, t)), MAX_SHIPS_PER_TIER - s.tiers[t].count)) : 0);

/** Merges `n` times (as many as possible when fewer are possible); returns how many were made. */
export function mergeShips(s, t, n = 1) {
  const count = Math.min(n, possibleMerges(s, t));
  if (count < 1) return 0;
  s.tiers[t - 1].count -= mergeCost(s, t) * count;
  s.tiers[t].count += count;
  track(s, 'merges', count);
  return count;
}

/** A tier can only be levelled once the player owns at least one of its ships. */
export const canLevel = (s, t) => s.tiers[t].count > 0;

// ---- ascension: a level cap every 100 levels (once the workshop is open) ---------------------
// Reaching level 100 (then 200, 300…) blocks the levels until an « ascension » is paid: a big
// amount of credits (plus ores once the forge is open). Each ascension multiplies the tier's
// damage by 5. Without the workshop there is no cap (and the feature stays hidden).
export const ASCENSION = { every: 100, factor: 5, credits: 200 };
export const ascensionActive = (s) => workshopOpen(s);
/** Highest level reachable before the next ascension (Infinity when ascensions are not active). */
export const levelCap = (s, t) => (ascensionActive(s) ? ASCENSION.every * ((s.tiers[t].asc || 0) + 1) : Infinity);
export const atLevelCap = (s, t) => s.tiers[t].level >= levelCap(s, t);
export const ascensionFactor = (s, t) => ASCENSION.factor ** (s.tiers[t].asc || 0);
/** Price of the next ascension: ~200 levels' worth of the next level, and a little of 2 ores of the tier's zones. */
export function ascensionCost(s, t) {
  const a = (s.tiers[t].asc || 0) + 1;
  return {
    credits: levelCost(t, levelCap(s, t)) * ASCENSION.credits,
    ores: forgeOpen(s) ? [{ res: t % 7, amount: 25 * a * a }, { res: (t + 3) % 7, amount: 12 * a * a }] : [],
  };
}
/** Ascension n needs the tier's forge « Alliage » at level n at least (the forge opens the way). */
export const ascensionForgeLevel = (s, t) => (s.tiers[t].asc || 0) + 1;
export const ascensionForgeReady = (s, t) => forgeOpen(s) && s.forge.alloy[t] >= ascensionForgeLevel(s, t);

export function canAscend(s, t) {
  if (!ascensionActive(s) || !atLevelCap(s, t)) return false; // no ship needed: the levels belong to the tier
  if (!ascensionForgeReady(s, t)) return false;
  const { credits, ores } = ascensionCost(s, t);
  return s.money >= credits && ores.every(({ res, amount }) => s.forge.res[res] >= amount);
}
export function ascend(s, t) {
  if (!canAscend(s, t)) return false;
  const { credits, ores } = ascensionCost(s, t);
  s.money -= credits;
  for (const { res, amount } of ores) s.forge.res[res] -= amount;
  s.tiers[t].asc = (s.tiers[t].asc || 0) + 1;
  return true;
}

export function levelUp(s, t, n = 1) {
  if (n < 1 || !canLevel(s, t) || s.tiers[t].level + n > levelCap(s, t)) return false;
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

export const speedFactor = (s) => (1 + 0.08 * s.upgrades.speed) * (1 + 0.5 * (1 - 0.95 ** s.skills.hyper));
export const gainFactor = (s) => 1.15 ** s.upgrades.gain * (1 + 0.1 * s.skills.cosmic);
/** Share of ore blocks once the forge is open (star tree « Géologue » included, 30 % at most). */
export const oreChance = (s) => Math.min(0.3, FORGE.oreChance + 0.005 * s.skills.vein);
export const critChance = (s) => 0.03 * s.upgrades.crit;
export const CRIT_FACTOR = 5;
/** « Lunette » workshop module: the cruisers' crits deal 200 % of a normal crit. */
export const LUNETTE_CRIT = 2;

/** Average hits per second of one ship (measured in play), for the fleet's theoretical damage. */
export const HITS_PER_SECOND = 1.3;
/** Theoretical damage per second of the whole fleet. */
export const fleetPower = (s) => s.tiers.reduce((sum, tier, t) => sum + tier.count * fleetDamage(s, t) * HITS_PER_SECOND, 0);
/** Share of the fleet's damage per second dealt by one tap: 1 %, +0.3 % per « Doigt de Jimmy » level (10 % at most). */
export const tapShare = (s) => 0.01 + 0.003 * s.upgrades.click;

/**
 * Tapping a block: a share of the whole fleet's damage per second, so the fleet stays the heart
 * of the game and the finger a helping hand (at least 1, which matters with the first ships).
 */
export function clickDamage(s) {
  return Math.max(1, fleetPower(s) * tapShare(s)) * (1 + FINGER_CALIBER.bonus * s.workshop.finger);
}

// ---- prestige ------------------------------------------------------------------------------

export const prestigeCost = (s) => PRESTIGE_BASE_COST + PRESTIGE_COST_STEP * s.prestige;
/**
 * Sector to reach in the run before a prestige: 20, +5 per prestige done, so every run has to go
 * further; capped at 75 % of the all-time record (at least 20) so it never becomes a wall.
 */
export const PRESTIGE_SECTOR = { base: 20, step: 5, recordShare: 0.75 };
export const prestigeSector = (s) => Math.min(
  PRESTIGE_SECTOR.base + PRESTIGE_SECTOR.step * s.prestige,
  Math.max(PRESTIGE_SECTOR.base, Math.floor(PRESTIGE_SECTOR.recordShare * s.maxStage)),
);
export const prestigeSectorReached = (s) => s.runBest >= prestigeSector(s);
export const canPrestige = (s) => s.money >= prestigeCost(s) && prestigeSectorReached(s);

/** Stars earned by a prestige: 1, plus 1 per 10 sectors reached in the run. */
export const starsFor = (s) => Math.floor((1 + Math.floor(s.runBest / 10)) * (1 + 0.1 * s.skills.constellation) * (1 + 0.25 * s.forge.relics.crown));
/** Prestige points per prestige (relic « Couronne » +2 per level). */
export const prestigePoints = (s) => PRESTIGE_POINTS + 2 * s.forge.relics.crown + s.skills.academy;

/**
 * Back to secteur 1 with an empty fleet (the credits left are lost). Kept: prestige count,
 * stars and skills, prestige points and workshop, record, lifetime earnings and stats, daily missions.
 */
export function doPrestige(s) {
  if (!canPrestige(s)) return false;
  const keep = {
    prestige: s.prestige + 1, stars: s.stars + starsFor(s), skills: s.skills, maxStage: s.maxStage,
    pp: s.pp + prestigePoints(s), ppEarned: s.ppEarned + prestigePoints(s), workshop: s.workshop, forge: s.forge,
    reserve: s.reserve, auto: s.auto, autoUpg: s.autoUpg, launch: s.launch,
    totalEarned: s.totalEarned, stats: s.stats, daily: s.daily,
  };
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, newSave(), keep);
  // Starting bonuses of the skill tree.
  s.tiers[0].count += START_FLEET_PER_LEVEL * s.skills.fleet;
  s.tiers.forEach((_, t) => applyLaunch(s, t));
  s.money = s.skills.bank ? 100 * 10 ** s.skills.bank : 0;
  return true;
}

/** The workshop (and its tab) opens once 10 prestige points have been earned. */
export const WORKSHOP_UNLOCK = 10;
export const workshopOpen = (s) => s.ppEarned >= WORKSHOP_UNLOCK;

// ---- automatic shipyard ------------------------------------------------------------------------

export const canAuto = (s) => s.skills.auto > 0;
/**
 * Turns the automatic buying of a tier on or off. A tier needs the ones below it (a merge uses
 * 5 ships of the tier below): on also turns the lower tiers on, off also turns the higher ones off.
 */
export function setAuto(s, t, on) {
  if (!canAuto(s)) return false;
  s.auto = s.auto.map((v, i) => (on ? v || i <= t : v && i < t));
  return true;
}
/**
 * One round of the shipyard: merges whatever it can, then buys one scout, and again, like a
 * player would (merging keeps the scout count, hence their price, low). Returns what was done.
 */
export function autoBuy(s, maxSteps = 500) {
  const done = { merged: 0, bought: 0 };
  if (!canAuto(s)) return done;
  for (let step = 0; step < maxSteps; step++) {
    let acted = false;
    for (let t = 1; t < TIERS.length; t++) {
      while (s.auto[t] && mergeShips(s, t)) { done.merged += 1; acted = true; }
    }
    if (s.auto[0] && buyShip(s, 1)) { done.bought += 1; acted = true; }
    if (!acted) break;
  }
  return done;
}

/** « Ingénieur de bord »: buys the upgrades set to « Auto » as long as the credits allow. Returns how many. */
export const canAutoUpgrade = (s) => s.skills.autoUpg > 0;
export function autoUpgrade(s) {
  let n = 0;
  if (!canAutoUpgrade(s)) return n;
  for (let more = true; more;) {
    more = false;
    for (const k of Object.keys(UPGRADES)) if (s.autoUpg[k] && buyUpgrade(s, k)) { n += 1; more = true; }
  }
  return n;
}

// ---- interspace travel ------------------------------------------------------------------------

export const canTravel = (s) => s.skills.travel > 0;
/** Goes to a sector already reached in this run and stays there. */
export function travelTo(s, stage) {
  if (!canTravel(s) || !Number.isInteger(stage) || stage < 1 || stage > s.runBest) return false;
  s.locked = stage;
  s.stage = stage;
  return true;
}
/** Back to the classic conquest, from the best sector of the run. */
export function resumeConquest(s) {
  s.locked = null;
  s.stage = s.runBest;
  return true;
}

// ---- forge -----------------------------------------------------------------------------------

/** The forge tab shows up from prestige 5 (or once unlocked). */
export const forgeVisible = (s) => s.prestige >= FORGE.prestige || s.forge.unlocked;
export const forgeOpen = (s) => s.forge.unlocked;
export const canUnlockForge = (s) => !s.forge.unlocked && s.prestige >= FORGE.prestige && s.pp >= FORGE.cost;
export function unlockForge(s) {
  if (!canUnlockForge(s)) return false;
  s.pp -= FORGE.cost;
  s.forge.unlocked = true;
  return true;
}

/** Ore collected from a block or a planet. */
export function collectOre(s, res, amount) {
  s.forge.res[res] += amount;
  track(s, 'ores', amount);
}

export const canForge = (s, k, t) => forgeOpen(s) && s.forge[k][t] < FORGE_UPGRADES[k].max
  && forgeRecipe(k, t, s.forge[k][t]).every(({ res, amount }) => s.forge.res[res] >= amount);
export function forgeUpgrade(s, k, t) {
  if (!canForge(s, k, t)) return false;
  for (const { res, amount } of forgeRecipe(k, t, s.forge[k][t])) s.forge.res[res] -= amount;
  s.forge[k][t] += 1;
  return true;
}

/** Alembic and relics: shown from their prestige, unlocked with stars and prestige points. */
export const forgeFeatureOpen = (s, f) => (f === 'alembic' ? s.forge.alembic : s.forge.relicsOpen);
export const forgeFeatureVisible = (s, f) => forgeOpen(s) && (forgeFeatureOpen(s, f) || s.prestige >= FORGE_UNLOCKS[f].prestige);
export const canUnlockFeature = (s, f) => forgeOpen(s) && !forgeFeatureOpen(s, f) && s.prestige >= FORGE_UNLOCKS[f].prestige
  && s.stars >= FORGE_UNLOCKS[f].stars && s.pp >= FORGE_UNLOCKS[f].pp;
export function unlockFeature(s, f) {
  if (!canUnlockFeature(s, f)) return false;
  s.stars -= FORGE_UNLOCKS[f].stars;
  s.pp -= FORGE_UNLOCKS[f].pp;
  s.forge.ppPaid += FORGE_UNLOCKS[f].pp;
  if (f === 'alembic') s.forge.alembic = true; else s.forge.relicsOpen = true;
  return true;
}

/** How many units of `to` the alembic can make from the `from` ore right now. */
export const alembicMax = (s, from, to) => (from === to ? 0 : Math.floor(s.forge.res[from] / alembicCost(from, to)));
/** Transmutes `n` units of `to` (fewer if not enough); returns how many were made. */
export function transmute(s, from, to, n) {
  if (!s.forge.alembic) return 0;
  const made = Math.min(n, alembicMax(s, from, to));
  if (made < 1) return 0;
  s.forge.res[from] -= made * alembicCost(from, to);
  s.forge.res[to] += made;
  return made;
}

export const canForgeRelic = (s, k) => s.forge.relicsOpen && relicRecipe(k, s.forge.relics[k]).every(({ res, amount }) => s.forge.res[res] >= amount);
export function forgeRelic(s, k) {
  if (!canForgeRelic(s, k)) return false;
  for (const { res, amount } of relicRecipe(k, s.forge.relics[k])) s.forge.res[res] -= amount;
  s.forge.relics[k] += 1;
  return true;
}

/** Prestige points already spent in a workshop. */
export function workshopSpent(w) {
  let spent = 0;
  w.caliber.forEach((lvl, t) => { for (let l = 0; l < lvl; l++) spent += CALIBER.cost(l, t); if (w.modules[t]) spent += MODULES[t].cost; });
  (w.pierce || []).forEach((lvl, t) => { for (let l = 0; l < lvl; l++) spent += PIERCE.cost(l, t); });
  for (let l = 0; l < w.finger; l++) spent += FINGER_CALIBER.cost(l);
  for (const [k, m] of Object.entries(FINGER_MODULES)) if (w.fingerModules[k]) spent += m.cost;
  return spent;
}
export const pierceCost = (s, t) => PIERCE.cost(s.workshop.pierce[t], t);
export const canBuyPierce = (s, t) => workshopOpen(s) && s.workshop.pierce[t] < PIERCE.max && s.pp >= pierceCost(s, t);
export function buyPierce(s, t) {
  if (!canBuyPierce(s, t)) return false;
  s.pp -= pierceCost(s, t);
  s.workshop.pierce[t] += 1;
  return true;
}
export const caliberCost = (s, t) => CALIBER.cost(s.workshop.caliber[t], t);
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

export const START_FLEET_PER_LEVEL = 5;
/**
 * « Télescope »: chance that a (non-planet) sector hides a star block. It grows with the sector
 * (+0.1 % per sector) up to a cap: 20 % with the first level, +1 % per level after (50 % at most).
 */
export const STARFIND = { perSector: 0.001, cap: 0.2, capStep: 0.01 };
export const starBlockCap = (s) => (s.skills.starfind ? STARFIND.cap + STARFIND.capStep * (s.skills.starfind - 1) : 0);
export const starBlockChance = (s, stage = s.stage) => Math.min(starBlockCap(s), STARFIND.perSector * stage);
export function findStar(s) {
  s.stars += 1;
  track(s, 'starsFound');
}

/**
 * « Départ lancé » (star tree, needs the forge): each tier starts every run 25 levels higher per
 * step, without limit. Paid with stars AND two ores of the tier's zones, dearer at each step and
 * for higher tiers. Past level 100 the ascensions below the starting level come with it (level
 * 125 starts with ascension 1…), so each step past a cap needs the tier's forge « Alliage » at the
 * level an ascension would. Bought now, it also lifts the current level.
 */
export const LAUNCH = { step: 25, max: Infinity };
export const launchLevel = (s, t, k = s.launch[t]) => (k ? LAUNCH.step * k : 1);
/** Ascensions included in a starting level (level 101-200 → 1, 201-300 → 2…). */
export const launchAsc = (s, t, k = s.launch[t]) => (ascensionActive(s) ? Math.max(0, Math.ceil(launchLevel(s, t, k) / ASCENSION.every) - 1) : 0);
/** Alliage level needed for the next step (0 while it stays under the first cap). */
export const launchAlloyNeed = (s, t) => launchAsc(s, t, s.launch[t] + 1);
/** Starting level and ascensions of a tier (after a prestige, or lifted by a new step). */
function applyLaunch(s, t) {
  const tier = s.tiers[t];
  tier.asc = Math.max(tier.asc || 0, launchAsc(s, t));
  tier.level = Math.max(tier.level, launchLevel(s, t));
}
export function launchCost(s, t) {
  const k = s.launch[t];
  const amount = Math.round(60 * 2.2 ** k * (1 + 0.3 * t));
  return {
    stars: Math.round((8 + 6 * k) * (1 + 0.5 * t)),
    ores: [{ res: t % 7, amount }, { res: (t + 1) % 7, amount: Math.round(amount / 2) }],
  };
}
export function canLaunch(s, t) {
  if (!forgeOpen(s) || s.launch[t] >= LAUNCH.max || s.forge.alloy[t] < launchAlloyNeed(s, t)) return false;
  const { stars, ores } = launchCost(s, t);
  return s.stars >= stars && ores.every(({ res, amount }) => s.forge.res[res] >= amount);
}
export function buyLaunch(s, t) {
  if (!canLaunch(s, t)) return false;
  const { stars, ores } = launchCost(s, t);
  s.stars -= stars;
  for (const { res, amount } of ores) s.forge.res[res] -= amount;
  s.launch[t] += 1;
  applyLaunch(s, t);
  return true;
}
export const skillCost = (k, lvl) => SKILLS[k].cost(lvl);
/** Some skills need a prestige level first. */
export const skillLocked = (s, k) => (SKILLS[k].prestige || 0) > s.prestige && s.skills[k] === 0;
export const canBuySkill = (s, k) => !skillLocked(s, k) && s.skills[k] < SKILLS[k].max && s.stars >= skillCost(k, s.skills[k]);
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
  const cap = (2 + s.upgrades.offline + s.skills.night) * 3600;
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
/** Stars for finishing the 3 daily missions: twice the prestige count (1 before the first prestige). */
export const dailyStars = (s) => Math.max(1, 2 * s.prestige);
export function claimMission(s, i) {
  const m = s.daily?.missions[i];
  if (!m || m.claimed || m.progress < m.target) return null;
  m.claimed = true;
  const credits = rewardCredits(s, MISSION_REWARD_MINUTES);
  s.money += credits;
  s.totalEarned += credits;
  let stars = 0;
  if (!s.daily.bonus && s.daily.missions.every((x) => x.claimed)) {
    s.daily.bonus = true;
    stars = dailyStars(s);
    s.stars += stars;
  }
  return { credits, star: stars > 0, stars };
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
