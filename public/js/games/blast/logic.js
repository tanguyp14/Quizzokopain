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
  5: { name: 'Marquage', desc: 'le bloc touché prend +50 % de dégâts de toute la flotte pendant 4 s' },
  6: { name: 'Drones et aura', desc: '2 drones d’escorte, et une zone autour de lui : +10 % de dégâts aux coups portés dedans' },
  7: { name: 'Rayon Neutron', desc: 'chaque coup frappe aussi tous les blocs du secteur à 100 %' },
};
export const MAX_SHIPS_PER_TIER = Infinity; // no limit (the field shows at most 60 ships per tier, see the engine)

export const UPGRADES = {
  speed: { label: 'Réacteurs', emoji: '💨', desc: 'Vitesse des vaisseaux +8 %', base: 200, growth: 2.1, max: 25 },
  gain: { label: 'Aspirateur à crédits', emoji: '🧲', desc: 'Gains +15 %', base: 500, growth: 2.4, max: 40 },
  click: { label: 'Doigt de Jimmy', emoji: '👆', desc: 'Toucher : +0,3 % des dégâts par seconde de la flotte', base: 50, growth: 1.9, max: 30 },
  crit: { label: 'Coups critiques', emoji: '💥', desc: '+3 % de chance de coup ×5', base: 1000, growth: 3, max: 15 },
  offline: { label: 'Pilote automatique', emoji: '🌙', desc: 'Absence : +10 % et +1 h (crédits, secteurs, étoiles et minerais)', base: 5000, growth: 4, max: 5 },
  // Advanced upgrades (« 🔬 Améliorations avancées »): unlocked for good with stars, in two
  // tiers (adv: 1 for 50 ⭐, adv: 2 for 150 ⭐), then bought with credits every run like the others.
  chain: { label: 'Réaction en chaîne', emoji: '⚡', desc: 'Un bloc qui casse inflige 5 % de sa vie max à ses voisins', base: 1e6, growth: 3, max: 10, adv: 1 },
  siege: { label: 'Siège planétaire', emoji: '🪐', desc: 'Dégâts contre les planètes +20 %', base: 2e6, growth: 2.5, max: 15, adv: 1 },
  sweep: { label: 'Nettoyage express', emoji: '💨', desc: 'Prime de fin de secteur +25 %', base: 1.5e6, growth: 2.5, max: 20, adv: 1 },
  plasma: { label: 'Plasma', emoji: '🔥', desc: 'Chaque coup brûle le bloc : +3 % de ses dégâts par seconde, pendant ~3 s', base: 1e9, growth: 4, max: 10, adv: 2 },
  elite: { label: 'Escadrille d’élite', emoji: '🎖️', desc: 'Bonus d’escadrille +3 % par type en service', base: 2e9, growth: 4, max: 10, adv: 2 },
};
/** Unlocking the advanced upgrades: tier 1 then tier 2, paid once with stars, kept forever. */
export const ADV_UNLOCKS = [null, { stars: 50, label: 'Palier 1' }, { stars: 150, label: 'Palier 2' }];
export const upgradeOpen = (s, k) => (UPGRADES[k].adv || 0) <= s.advTier;
export const canUnlockAdv = (s) => s.advTier < ADV_UNLOCKS.length - 1 && s.stars >= ADV_UNLOCKS[s.advTier + 1].stars;
export function unlockAdv(s) {
  if (!canUnlockAdv(s)) return false;
  s.stars -= ADV_UNLOCKS[s.advTier + 1].stars;
  s.advTier += 1;
  return true;
}
export const ADV = { chain: 0.05, chainRadius: 170, siege: 0.2, sweep: 0.25, plasma: 0.03, plasmaFade: 3, elite: 0.03 };

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
/**
 * Planet weakness: every planet is vulnerable to one ship type (×5 damage from it). The type follows
 * the progression (one more tier possible every 40 sectors) and changes from one planet to the next.
 */
export const PLANET_WEAK = { factor: 5, tierEvery: 40 };
export function planetWeakTier(stage) {
  const maxTier = Math.min(7, Math.floor(stage / PLANET_WEAK.tierEvery));
  const h = Math.imul(stage ^ 0x5bd1e995, 2654435761) >>> 0;
  return h % (maxTier + 1);
}
export const bossTime = (s) => 30 + 10 * s.skills.boss + 5 * s.forge.relics.totem;
/** Ore given by a conquered planet (relic « Totem » +50 % per level). */
// It grows with the sector (×1 at sector 50, ×0.2 at sector 10, ×5 at sector 250): farming a low planet
// that dies in one hit gives little, conquering far away gives a lot.
export const planetOre = (s, stage = s.stage) => Math.max(1, Math.round(FORGE.planetOre * (1 + 0.5 * s.forge.relics.totem) * Math.max(0.2, stage / 50) * resonance(s)));

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
export const squadronBonus = (s) => SQUADRON.bonus + ADV.elite * (s.upgrades.elite || 0);
export const squadronFactor = (s) => 1 + squadronBonus(s) * squadronTypes(s);

/**
 * Full formation: a chain of types in service from the Éclaireur up (at least one ship of each)
 * multiplies the whole fleet's damage: 3 types ×1.5, 4 ×2, 5 ×3, 6 ×4, 7 ×6, all 8 ×10.
 * (Merges eat the lower tiers: the « Réserve de flotte » keeps one of each.)
 */
export const FORMATION = [1, 1, 1, 1.5, 2, 3, 4, 6, 10];
export function formationLength(s) {
  let n = 0;
  while (n < s.tiers.length && s.tiers[n].count > 0) n += 1;
  return n;
}
export const formationFactor = (s) => FORMATION[formationLength(s)];

/**
 * Synergies (bought with stars, kept forever): a bonus when both ship types are in service.
 */
export const SYNERGIES = {
  crossfire: { name: 'Tir croisé', emoji: '🎯', tiers: [1, 3], desc: 'Chasseurs : +15 % de coups critiques', cost: 60 },
  piercemark: { name: 'Perce-marque', emoji: '🔱', tiers: [2, 5], desc: 'Le perçage des frégates profite deux fois du marquage', cost: 80 },
  aurawave: { name: 'Onde d’aura', emoji: '🌊', tiers: [4, 6], desc: 'Une onde de choc lancée dans une aura fait double dégâts', cost: 100 },
  guidance: { name: 'Guidage', emoji: '📡', tiers: [0, 7], desc: 'Les éclaireurs guident le rayon Neutron : +50 %', cost: 120 },
};
export const canBuySynergy = (s, k) => !s.synergies[k] && s.stars >= SYNERGIES[k].cost;
export function buySynergy(s, k) {
  if (!canBuySynergy(s, k)) return false;
  s.stars -= SYNERGIES[k].cost;
  s.synergies[k] = true;
  return true;
}
/** A synergy works when bought and both of its ship types are in service. */
export const synergyOn = (s, k) => Boolean(s.synergies?.[k]) && SYNERGIES[k].tiers.every((t) => s.tiers[t].count > 0);

/** Swarm sectors (every 5th sector, 3, 8, 13…): many small blocks, ideal for area damage. */
/** Cuirassé « Marquage »: the block hit takes more damage from the whole fleet for a while (support ship). */
/** Vaisseau-mère aura: hits landed within its circle deal more (bigger circle with the « Hangar » module). */
export const AURA = { bonus: 0.1, radius: 110, moduleRadius: 180 };
export const MARK = { factor: 1.5, duration: 4, moduleFactor: 2, moduleDuration: 6 };
export const isSwarmStage = (stage) => !isBossStage(stage) && stage >= 8 && stage % 5 === 3;

// Prestige skill tree, paid with stars (kept forever, like the prestige count).
export const SKILLS = {
  // Infinite bonuses (no cap, exponential prices): there is always something to buy with stars.
  power: {
    label: 'Noyau de neutron', emoji: '⚛️', desc: 'Dégâts +25 % par niveau', max: Infinity,
    cost: (l) => (l < 20 ? 2 + 2 * l : Math.round(42 * 1.15 ** (l - 20))),
  },
  portal: {
    label: 'Portail temporel', emoji: '🌀', desc: 'Chaque partie commence 10 secteurs plus loin (11, 21, 31…), avec les crédits des secteurs sautés ; au plus à la moitié de ton record', max: Infinity,
    cost: (l) => Math.round(40 * 1.15 ** l),
  },
  critdmg: { label: 'Coups dévastateurs', emoji: '💢', desc: 'Dégâts critiques +10 % par niveau (×5 → ×5,5 → ×6…)', max: Infinity, cost: (l) => Math.round(4 * 1.28 ** l) },
  cosmic: { label: 'Gains cosmiques', emoji: '💫', desc: 'Crédits +10 % par niveau', max: Infinity, cost: (l) => Math.round(3 * 1.25 ** l) },
  hyper: { label: 'Hyperpropulsion', emoji: '🌠', desc: 'Vaisseaux plus rapides (jusqu’à +50 %)', max: Infinity, cost: (l) => Math.round(4 * 1.3 ** l) },
  constellation: { label: 'Constellation', emoji: '✨', desc: 'Étoiles gagnées au prestige +10 % par niveau', max: Infinity, cost: (l) => Math.round(5 * 1.35 ** l) },
  vein: { label: 'Géologue', emoji: '⛏️', desc: 'Blocs de minerai +0,5 % par niveau (Forge)', max: Infinity, cost: (l) => Math.round(3 * 1.25 ** l) },
  refine: { label: 'Raffinage', emoji: '🧪', desc: '+1 minerai par bloc de minerai cassé, par niveau (Forge)', max: Infinity, cost: (l) => Math.round(4 * 1.3 ** l) },
  academy: { label: 'Académie des pilotes', emoji: '🎓', desc: '+1 🔷 point de prestige gagné par prestige', max: Infinity, cost: (l) => Math.round(6 * 1.4 ** l) },
  night: { label: 'Longue veille', emoji: '🌙', desc: 'Gains hors ligne : +1 h de durée par niveau', max: Infinity, cost: (l) => Math.round(2 * 1.3 ** l) },
  fleet: {
    label: 'Flotte de départ', emoji: '🛸', desc: '+5 éclaireurs au départ par niveau', max: Infinity,
    cost: (l) => (l < 5 ? 1 + l : Math.round(6 * 1.35 ** (l - 5))),
  },
  shipyard: { label: 'Chantier naval', emoji: '🏗️', desc: 'Éclaireurs 5 % moins chers par niveau, et leur prix monte 3 % moins vite à chaque achat (jusqu’à −70 %)', max: Infinity, cost: (l) => Math.round(4 * 1.3 ** l) },
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
  autoLevel: {
    label: 'Instructeur de vol', emoji: '📈', desc: 'Bouton « Auto niv. » sur chaque vaisseau : ses niveaux montent tout seuls dès que les crédits le permettent',
    max: 1, cost: () => 45, prestige: 7,
  },
  autoAsc: {
    label: 'Ascension automatique', emoji: '🌟', desc: 'Bouton « Auto asc. » sur chaque vaisseau : il fait son ascension tout seul au cap (crédits, minerais et Alliage requis)',
    max: 1, cost: () => 80, prestige: 10,
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
/** Ore of one ore block: by sector, +1 per « Raffinage » level (star tree). */
export const oreYield = (s, stage = s.stage) => Math.round((oreAmount(stage) + (s.skills.refine || 0)) * resonance(s));

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
/** The ores are a cycle (none is really dearer): 3 of any ore for 1 of any other. */
export const alembicCost = () => ALEMBIC_RATE;

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
 * The workshop does what the forge doesn't (the forge boosts damage): « Soute à butin » (saved as
 * `caliber`), +10 % credits earned by the tier's hits per level, no cap.
 * The former « Brise-blindage » was removed: its prices (kept here) are refunded when a save loads.
 */
const OLD_PIERCE_COST = (l, t = 0) => Math.round((4 + 4 * l) * 1.15 ** l * (1 + 0.3 * t));
/** Second modules (much dearer, need the first one): the ship's power goes further. */
export const MODULES2 = [
  { name: 'Nuée', desc: 'Éclaireurs : 25 % de chance de frapper deux fois', cost: 150 },
  { name: 'Salve', desc: 'Chasseurs : double tir à 60 % au lieu de 30 %', cost: 200 },
  { name: 'Trépan', desc: 'Frégates : perçage deux fois plus rapide', cost: 250 },
  { name: 'Tireur d’élite', desc: 'Croiseurs : +25 % de critiques en plus (50 % au total)', cost: 300 },
  { name: 'Double onde', desc: 'Destroyers : onde de choc à 80 %, encore plus large', cost: 350 },
  { name: 'Marquage de zone', desc: 'Cuirassés : le marquage touche aussi les blocs voisins', cost: 400 },
  { name: 'Aura renforcée', desc: 'Vaisseaux-mères : aura à +25 % au lieu de +10 %', cost: 500 },
  { name: 'Surcharge', desc: 'Neutrons : le rayon frappe tout le secteur à 200 %', cost: 600 },
];
export const MODULES = [
  { name: 'Essaim', desc: 'Éclaireurs 50 % plus rapides', cost: 15 },
  { name: 'Double tir', desc: 'Chasseurs : 30 % de chance de frapper deux fois', cost: 20 },
  { name: 'Foreuse', desc: 'Frégates : perçage à 70 % des dégâts au lieu de 40 %', cost: 25 },
  { name: 'Lunette', desc: 'Croiseurs : coups critiques à 200 %, soit ×10 au lieu de ×5', cost: 30 },
  { name: 'Onde amplifiée', desc: 'Destroyers : onde de choc plus large et à 50 %', cost: 35 },
  { name: 'Obus marqueurs', desc: 'Cuirassés : marquage +100 % de dégâts pendant 6 s', cost: 40 },
  { name: 'Hangar', desc: 'Vaisseaux-mères : 4 drones au lieu de 2 et une aura plus grande', cost: 50 },
  { name: 'Rayon focalisé', desc: 'Neutrons : le rayon frappe tout le secteur à 150 %', cost: 60 },
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
    starsV2: true, // second-degree stars: the catch-up for older prestiges is paid (once)
    pp: 0, // unspent prestige points (ship workshop)
    forge: {
      unlocked: false, res: RESOURCES.map(() => 0), alloy: TIERS.map(() => 0), stab: TIERS.map(() => 0),
      alembic: false, relicsOpen: false, relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 0])), ppPaid: 0,
    },
    ppEarned: 0, // prestige points earned in total (the workshop opens at 10)
    workshop: {
      caliber: TIERS.map(() => 0),
      modules: TIERS.map(() => false),
      modules2: TIERS.map(() => false),
      finger: 0,
      fingerModules: Object.fromEntries(Object.keys(FINGER_MODULES).map((k) => [k, false])),
    },
    skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0])),
    runBest: 1, // best sector of this run (stars at prestige)
    locked: null, // interspace travel: sector the fleet stays in (null = classic conquest)
    auto: TIERS.map(() => false), // automatic buying / merging per tier
    reserve: TIERS.map(() => 0), // ships of each tier kept out of merges (star tree « Réserve de flotte »)
    ach: {}, // « Plan d'attaque »: achievement id → 1 reached, 2 reward collected
    synergies: {}, // synergy id → true (bought with stars, kept forever)
    advTier: 0, // advanced upgrades unlocked: 0, 1 or 2 (stars, kept forever)
    achPoints: 0, // achievement points (sent with the save for the Top)
    autoLevel: TIERS.map(() => false), // levels bought automatically per tier (« Instructeur de vol »)
    autoAscOn: TIERS.map(() => false), // ascensions done automatically per tier (« Ascension automatique »)
    autoUpg: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, false])), // upgrades bought automatically (« Ingénieur de bord »)
    launch: TIERS.map(() => 0), // « Départ lancé » steps per tier (starting level 25, 50, 75, 100)
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), // lifetime
    daily: null, // { date, missions: [{ kind, target, progress, claimed }], bonus }
    rate: 0, // average income per second while playing (for offline earnings)
    // « Big Bang » (from sector 500): everything starts over; dark matter and its shop are eternal.
    bigBangs: 0,
    dm: 0, // unspent dark matter
    dmShop: Object.fromEntries(Object.keys(DM_SHOP).map((k) => [k, 0])),
    legacy: { ...NO_LEGACY }, // what the previous universes did (lifetime goals of the « Plan d'attaque »)
    autoPrestigeOn: false, // « Pilote total » II
    autoPrestigeAt: 0, // sector of the automatic prestige (0: as soon as possible)
    autoBoostOn: true, // « Accélération automatique »
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
  // « Brise-blindage » removed: the points spent on it come back (once: it is not saved any more).
  TIERS.forEach((_, t) => { for (let l = 0; l < Math.min(8, Math.floor(num(raw.workshop?.pierce?.[t]))); l++) s.pp += OLD_PIERCE_COST(l, t); });
  s.workshop = {
    caliber: TIERS.map((_, i) => Math.min(CALIBER.max, Math.floor(num(raw.workshop?.caliber?.[i])))),
    modules: TIERS.map((_, i) => Boolean(raw.workshop?.modules?.[i])),
    modules2: TIERS.map((_, i) => Boolean(raw.workshop?.modules?.[i] && raw.workshop?.modules2?.[i])),
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
  // Removed workshop drones: points and ores back (once: they are not saved any more).
  TIERS.forEach((_, t) => {
    for (let n = 0; n < Math.min(60, Math.floor(num(raw.workshop?.drones?.[t]))); n++) {
      const { pp, ores } = oldDroneCost(t, n);
      s.pp += pp;
      for (const { res, amount } of ores) s.forge.res[res] += amount;
    }
  });
  s.ppEarned = Math.max(Math.floor(num(raw.ppEarned)), s.prestige * PRESTIGE_POINTS);
  s.pp = Math.max(s.pp, s.ppEarned - workshopSpent(s.workshop) - (s.forge.unlocked ? FORGE.cost : 0) - s.forge.ppPaid);
  for (const k of Object.keys(SKILLS)) s.skills[k] = Math.min(SKILLS[k].max, Math.floor(num(raw.skills?.[k])));
  s.runBest = Math.max(s.stage, Math.floor(num(raw.runBest, 1)));
  s.auto = TIERS.map((_, i) => Boolean(raw.auto?.[i]));
  s.reserve = TIERS.map((_, i) => Math.floor(num(raw.reserve?.[i])));
  s.synergies = Object.fromEntries(Object.keys(SYNERGIES).filter((k) => raw.synergies?.[k]).map((k) => [k, true]));
  s.advTier = Math.min(ADV_UNLOCKS.length - 1, Math.floor(num(raw.advTier)));
  s.ach = Object.fromEntries(Object.entries(raw.ach && typeof raw.ach === 'object' ? raw.ach : {})
    .filter(([id, v]) => achDef(id) && (v === 1 || v === 2)));
  s.achPoints = achievementPoints(s);
  s.autoUpg = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, Boolean(raw.autoUpg?.[k])]));
  s.autoLevel = TIERS.map((_, i) => Boolean(raw.autoLevel?.[i]));
  // Older saves: auto ascension followed « Auto niv. ».
  s.autoAscOn = TIERS.map((_, i) => Boolean(Array.isArray(raw.autoAscOn) ? raw.autoAscOn[i] : raw.autoLevel?.[i]));
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
  s.bigBangs = Math.floor(num(raw.bigBangs));
  s.dm = Math.floor(num(raw.dm));
  s.dmShop = Object.fromEntries(Object.entries(DM_SHOP).map(([k, it]) => [k, Math.min(it.max, Math.floor(num(raw.dmShop?.[k])))]));
  s.legacy = Object.fromEntries(Object.keys(NO_LEGACY).map((k) => [k, Math.floor(num(raw.legacy?.[k]))]));
  s.autoPrestigeOn = Boolean(raw.autoPrestigeOn);
  s.autoPrestigeAt = Math.floor(num(raw.autoPrestigeAt));
  s.autoBoostOn = raw.autoBoostOn === undefined ? true : Boolean(raw.autoBoostOn);
  // Saves from before the second-degree stars: the past prestiges are paid the difference, once.
  s.starsV2 = true;
  if (!raw.starsV2) {
    s.starsCatchUp = retroStars(s); // shown once by the page, then dropped
    s.stars += s.starsCatchUp;
  }
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
export const fleetDamage = (s, t) => shipDamage(t, s.tiers[t].level) * prestigeFactor(s) * skillFactor(s) * singularityFactor(s)
  * alloyFactor(s, t) * astrolabeFactor(s) * ascensionFactor(s, t) * squadronFactor(s) * formationFactor(s);

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
export const hasModule = (s, t) => s.workshop.modules[t];
export const hasModule2 = (s, t) => Boolean(s.workshop.modules2?.[t]);

/**
 * The workshop drones (bought per tier) were removed (too many ships on screen): their prices are
 * refunded, prestige points and ores, when a save loads. Only the mother ships keep their own drones.
 */
const oldDroneCost = (t, n) => {
  const amount = Math.round(30 * 1.9 ** n * (1 + 0.3 * t));
  return { pp: Math.round(15 * 1.6 ** n * (1 + 0.3 * t)), ores: [{ res: (t + 3) % 7, amount }, { res: (t + 5) % 7, amount: Math.round(amount / 2) }] };
};
/** Drones flying with a tier: only the mother ships' own 2 (4 with the « Hangar » module). */
export const droneCount = (s, t) => (t === 6 ? s.tiers[6].count * (hasModule(s, 6) ? 4 : 2) : 0);
export const DRONE_SHARE = 0.15;

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
export const buyCost = (count, bought = 0, rise = 1) => 10 * (1 + 0.25 * rise) ** count * (1 + 0.01 * rise) ** bought;
/** Star tree « Chantier naval »: -5 % on scouts per level (compounded)… */
export const shipDiscount = (s) => 0.95 ** s.skills.shipyard;
/** …and their price rises 3 % slower per level (compounded, down to 30 % of the normal rise). */
export const shipRise = (s) => Math.max(0.3, 0.97 ** s.skills.shipyard);
export const shipCost = (s) => buyCost(s.tiers[0].count, s.bought, shipRise(s)) * shipDiscount(s);

/** Price of the next `n` tier-0 ships. */
export function buyCostN(s, n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += buyCost(s.tiers[0].count + i, s.bought + i, shipRise(s)) * shipDiscount(s);
  return total;
}
export function affordableShips(s, cap = 100_000) {
  let n = 0;
  let total = 0;
  while (n < cap && s.tiers[0].count + n < MAX_SHIPS_PER_TIER) {
    total += buyCost(s.tiers[0].count + n, s.bought + n, shipRise(s)) * shipDiscount(s);
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
export const canUpgrade = (s, k) => upgradeOpen(s, k) && s.upgrades[k] < UPGRADES[k].max && s.money >= upgradeCost(k, s.upgrades[k]);

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
/** Critical hit multiplier: ×5, +10 % per « Coups dévastateurs » level (star tree). */
export const critFactor = (s) => CRIT_FACTOR * (1 + 0.1 * (s.skills.critdmg || 0));
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

/**
 * Base stars of a prestige reaching sector `r`: 1 + r/10 up to sector 100, then r²/1000 (second degree),
 * so a run that goes far pays much more than several short ones (100 → 11, 250 → 63, 400 → 161).
 */
export const baseStars = (r) => 1 + Math.floor(Math.max(r / 10, (r * r) / 1000));
/** Stars earned by a prestige (star tree « Constellation », relic « Couronne »). */
export const starsFor = (s) => Math.floor(baseStars(s.runBest) * (1 + 0.1 * s.skills.constellation) * (1 + 0.25 * s.forge.relics.crown) * resonance(s));
/**
 * One-time catch-up for the prestiges done before the second-degree stars: each past prestige k is taken
 * at the sector it had to reach (20 + 5k, at most 75 % of the record, the record growing evenly over
 * the prestiges), and pays the difference between both formulas.
 */
export function retroStars(s) {
  let total = 0;
  for (let k = 0; k < s.prestige; k++) {
    const record = s.maxStage * ((k + 1) / s.prestige);
    const r = Math.min(PRESTIGE_SECTOR.base + PRESTIGE_SECTOR.step * k, Math.floor(PRESTIGE_SECTOR.recordShare * record));
    total += baseStars(r) - (1 + Math.floor(r / 10));
  }
  return Math.floor(total * (1 + 0.1 * s.skills.constellation) * (1 + 0.25 * s.forge.relics.crown));
}
/** Prestige points per prestige (relic « Couronne » +2 per level). */
export const prestigePoints = (s) => PRESTIGE_POINTS + 2 * s.forge.relics.crown + s.skills.academy;

/**
 * Back to secteur 1 with an empty fleet (the credits left are lost). Kept: prestige count,
 * stars and skills, prestige points and workshop, record, lifetime earnings and stats, daily missions.
 */
export function doPrestige(s) {
  if (!canPrestige(s)) return false;
  const keep = {
    prestige: s.prestige + 1, stars: s.stars + starsFor(s), starsV2: true, skills: s.skills, maxStage: s.maxStage,
    pp: s.pp + prestigePoints(s), ppEarned: s.ppEarned + prestigePoints(s), workshop: s.workshop, forge: s.forge,
    reserve: s.reserve, auto: s.auto, autoUpg: s.autoUpg, autoLevel: s.autoLevel, autoAscOn: s.autoAscOn, launch: s.launch, advTier: s.advTier, synergies: s.synergies, ach: s.ach, achPoints: s.achPoints,
    totalEarned: s.totalEarned, stats: s.stats, daily: s.daily,
    bigBangs: s.bigBangs, dm: s.dm, dmShop: s.dmShop, legacy: s.legacy,
    autoPrestigeOn: s.autoPrestigeOn, autoPrestigeAt: s.autoPrestigeAt, autoBoostOn: s.autoBoostOn,
  };
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, newSave(), keep);
  // Starting bonuses of the skill tree.
  s.tiers[0].count += START_FLEET_PER_LEVEL * s.skills.fleet;
  s.tiers.forEach((_, t) => applyLaunch(s, t));
  s.money = s.skills.bank ? 100 * 10 ** s.skills.bank : 0;
  // « Portail temporel »: a later start, with the credits of the skipped sectors.
  const start = portalStart(s);
  if (start > 1) {
    s.stage = start;
    s.runBest = start;
    s.money += portalCredits(start);
  }
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

/**
 * « Instructeur de vol »: levels up the tiers set to « Auto niv. », always the cheapest next level
 * first (so the tiers keep up with each other), up to the ascension cap. Returns how many levels.
 */
export const canAutoLevel = (s) => s.skills.autoLevel > 0;
export const canAutoAsc = (s) => s.skills.autoAsc > 0;
export function autoLevelUp(s, maxSteps = 500) {
  let n = 0;
  if (!canAutoLevel(s) && !canAutoAsc(s)) return n;
  for (let step = 0; step < maxSteps; step++) {
    // « Ascension automatique »: a tier set to « Auto asc. » ascends at its cap as soon as it can.
    if (canAutoAsc(s)) s.autoAscOn.forEach((on, t) => { if (on && atLevelCap(s, t) && ascend(s, t)) n += 1; });
    if (!canAutoLevel(s)) break;
    let best = -1;
    let bestCost = Infinity;
    s.autoLevel.forEach((on, t) => {
      if (!on || !canLevel(s, t) || s.tiers[t].level + 1 > levelCap(s, t)) return;
      const c = levelCost(t, s.tiers[t].level);
      if (c < bestCost) { bestCost = c; best = t; }
    });
    if (best < 0 || !levelUp(s, best)) break;
    n += 1;
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
  w.caliber.forEach((lvl, t) => {
    for (let l = 0; l < lvl; l++) spent += CALIBER.cost(l, t);
    if (w.modules[t]) spent += MODULES[t].cost;
    if (w.modules2?.[t]) spent += MODULES2[t].cost;
  });
  for (let l = 0; l < w.finger; l++) spent += FINGER_CALIBER.cost(l);
  for (const [k, m] of Object.entries(FINGER_MODULES)) if (w.fingerModules[k]) spent += m.cost;
  return spent;
}
export const caliberCost = (s, t) => CALIBER.cost(s.workshop.caliber[t], t);
export const canBuyCaliber = (s, t) => workshopOpen(s) && s.workshop.caliber[t] < CALIBER.max && s.pp >= caliberCost(s, t);
export function buyCaliber(s, t) {
  if (!canBuyCaliber(s, t)) return false;
  s.pp -= caliberCost(s, t);
  s.workshop.caliber[t] += 1;
  return true;
}
export const canBuyModule2 = (s, t) => workshopOpen(s) && s.workshop.modules[t] && !s.workshop.modules2[t] && s.pp >= MODULES2[t].cost;
export function buyModule2(s, t) {
  if (!canBuyModule2(s, t)) return false;
  s.pp -= MODULES2[t].cost;
  s.workshop.modules2[t] = true;
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
/** « Portail temporel »: starting sector of a run, 10 more per level, at most half of the record. */
export function portalStart(s) {
  const wanted = 1 + 10 * (s.skills.portal || 0);
  const cap = 1 + 10 * Math.floor(s.maxStage / 20);
  return Math.max(1, Math.min(wanted, cap));
}
/** Credits the skipped sectors would have paid (damage, blocks broken, sector bonuses). */
export function portalCredits(start) {
  let total = 0;
  for (let k = 1; k < start; k++) total += stageHp(k) * (1 + BREAK_BONUS) + stageClearBonus(k);
  return total;
}
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

/**
 * Sectors played while away (same capped time and share as the offline credits): the fleet keeps
 * clearing sectors at its theoretical damage. Locked by interspace travel, it farms that sector;
 * otherwise it moves on until a planet resists, then farms the sector before it. Stars (« Télescope »)
 * and ores (Forge) come with the sectors; the credits stay those of offlineEarnings.
 */
export const AFK = { minSectorTime: 3, blocks: 18, swarmBlocks: 45, maxSectors: 20000 };
export function offlineProgress(s, seconds) {
  const out = { sectors: 0, stars: 0, ores: RESOURCES.map(() => 0), from: s.stage, planets: 0, stuck: null };
  const dps = fleetPower(s);
  let time = seconds * (0.1 + 0.1 * s.upgrades.offline);
  if (!(dps > 0) || time < AFK.minSectorTime) return out;
  let blocked = false; // a planet resisted: stay in the sector before it
  let starOdds = 0;
  while (time > 0 && out.sectors < AFK.maxSectors) {
    const boss = isBossStage(s.stage);
    const fight = (stageHp(s.stage) * (boss ? BOSS_HP_FACTOR : 1)) / dps;
    if (boss && fight > bossTime(s)) {
      out.stuck = s.stage;
      if (s.locked) break; // the chosen planet is out of reach: nothing to farm
      s.stage = Math.max(1, s.stage - 1);
      blocked = true;
      continue;
    }
    time -= Math.max(AFK.minSectorTime, fight + (boss ? 1.6 : 0.9));
    if (time < 0) break;
    out.sectors += 1;
    track(s, 'sectors');
    if (boss) {
      out.planets += 1;
      track(s, 'bosses');
      if (forgeOpen(s)) { const n = planetOre(s); collectOre(s, resourceFor(s.stage), n); out.ores[resourceFor(s.stage)] += n; }
    } else {
      starOdds += starBlockChance(s);
      if (forgeOpen(s)) {
        const n = Math.round((isSwarmStage(s.stage) ? AFK.swarmBlocks : AFK.blocks) * oreChance(s) * oreYield(s));
        collectOre(s, resourceFor(s.stage), n);
        out.ores[resourceFor(s.stage)] += n;
      }
    }
    if (!s.locked && !blocked) {
      s.stage += 1;
      s.maxStage = Math.max(s.maxStage, s.stage);
      s.runBest = Math.max(s.runBest, s.stage);
    }
  }
  // Star blocks: the expected number, the fraction left to chance.
  out.stars = Math.floor(starOdds) + (Math.random() < starOdds % 1 ? 1 : 0);
  for (let i = 0; i < out.stars; i++) findStar(s);
  return out;
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
// ---- « Plan d'attaque »: achievements --------------------------------------------------------
// Permanent goals (kept through prestiges). Reached ones are marked on the spot (even a goal that
// only holds for a moment, like owning a Neutron) and their reward is collected by hand. The
// reward depends on the difficulty: stars or prestige points, and achievement points for the Top.
export const ACH_DIFFICULTY = {
  facile: { label: 'Facile', color: '#7dffb3', points: 10, stars: 5, pp: 0 },
  moyen: { label: 'Moyen', color: '#6fb7ff', points: 25, stars: 0, pp: 15 },
  difficile: { label: 'Difficile', color: '#ff9f6b', points: 50, stars: 30, pp: 0 },
  legendaire: { label: 'Légendaire', color: '#ffd166', points: 100, stars: 60, pp: 40 },
};
const stat = (k) => (s) => s.stats[k] || 0;
// (desc is a getter: fmt is defined further down the module)
const series = (cat, emoji, value, steps, desc) => steps.map(([id, name, target, diff]) => ({ id, cat, emoji, name, get desc() { return desc(target); }, value, target, diff }));
export const ACHIEVEMENTS = [
  ...series('Conquête', '🗺️', (s) => s.maxStage, [
    ['sector25', 'Premiers pas', 25, 'facile'], ['sector100', 'Explorateur', 100, 'moyen'],
    ['sector250', 'Au-delà des étoiles', 250, 'difficile'], ['sector500', 'Bord de l’univers', 500, 'legendaire'],
  ], (n) => `Atteindre le secteur ${fmt(n)}`),
  ...series('Conquête', '🚩', stat('bosses'), [
    ['planets10', 'Drapeau planté', 10, 'facile'], ['planets100', 'Colonisateur', 100, 'moyen'],
    ['planets500', 'Empire galactique', 500, 'difficile'], ['planets2000', 'Maître des mondes', 2000, 'legendaire'],
  ], (n) => `Conquérir ${fmt(n)} planètes`),
  ...series('Prestige', '⭐', (s) => lifetime(s, 'prestige'), [
    ['prestige1', 'Renaissance', 1, 'facile'], ['prestige10', 'Vétéran', 10, 'moyen'],
    ['prestige30', 'Légende vivante', 30, 'difficile'], ['prestige75', 'Éternel', 75, 'legendaire'],
  ], (n) => `Faire ${n} prestige${n > 1 ? 's' : ''}`),
  ...series('Flotte', '🧬', stat('merges'), [
    ['merges100', 'Assembleur', 100, 'facile'], ['merges2k', 'Chantier naval', 2000, 'moyen'], ['merges20k', 'Usine stellaire', 20000, 'difficile'],
  ], (n) => `Faire ${fmt(n)} fusions`),
  { id: 'cuirasse', cat: 'Flotte', emoji: '🛡️', name: 'Poids lourd', desc: 'Avoir un Cuirassé', value: (s) => Math.min(1, s.tiers[5].count), target: 1, diff: 'moyen' },
  { id: 'neutron', cat: 'Flotte', emoji: '⚛️', name: 'Cœur de neutron', desc: 'Avoir un Neutron', value: (s) => Math.min(1, s.tiers[7].count), target: 1, diff: 'difficile' },
  { id: 'armada', cat: 'Flotte', emoji: '🎖️', name: 'Armada complète', desc: 'Avoir les 8 types de vaisseaux en même temps', value: (s) => s.tiers.filter((t) => t.count > 0).length, target: 8, diff: 'legendaire' },
  { id: 'asc1', cat: 'Flotte', emoji: '🌟', name: 'Ascension', desc: 'Faire une ascension', value: (s) => s.tiers.reduce((n, t) => n + (t.asc || 0), 0), target: 1, diff: 'moyen' },
  { id: 'asc10', cat: 'Flotte', emoji: '🌟', name: 'Transcendance', desc: '10 ascensions en tout dans la flotte', value: (s) => s.tiers.reduce((n, t) => n + (t.asc || 0), 0), target: 10, diff: 'difficile' },
  ...series('Destruction', '🧱', stat('blocks'), [
    ['blocks10k', 'Casseur', 10000, 'facile'], ['blocks250k', 'Démolisseur', 250000, 'moyen'], ['blocks2m', 'Broyeur de mondes', 2000000, 'difficile'],
  ], (n) => `Casser ${fmt(n)} blocs`),
  ...series('Destruction', '✨', stat('golds'), [
    ['golds500', 'Chercheur d’or', 500, 'facile'], ['golds5k', 'Ruée vers l’or', 5000, 'moyen'], ['golds50k', 'Roi Midas', 50000, 'difficile'],
  ], (n) => `Casser ${fmt(n)} blocs dorés`),
  ...series('Destruction', '👆', stat('taps'), [
    ['taps1k', 'Doigt agile', 1000, 'facile'], ['taps20k', 'Doigt d’acier', 20000, 'moyen'], ['taps200k', 'Doigt de Jimmy', 200000, 'difficile'],
  ], (n) => `Toucher ${fmt(n)} fois un bloc`),
  ...series('Exploration', '🛸', stat('ufos'), [
    ['ufos10', 'Observateur', 10, 'facile'], ['ufos100', 'Chasseur d’OVNI', 100, 'moyen'], ['ufos500', 'Ami des aliens', 500, 'difficile'],
  ], (n) => `Attraper ${fmt(n)} soucoupes`),
  ...series('Exploration', '⛏️', stat('ores'), [
    ['ores1k', 'Prospecteur', 1000, 'facile'], ['ores50k', 'Mineur', 50000, 'moyen'], ['ores1m', 'Magnat des minerais', 1000000, 'difficile'],
  ], (n) => `Récolter ${fmt(n)} minerais`),
  ...series('Exploration', '🔭', stat('starsFound'), [
    ['starfound1', 'Astronome', 1, 'facile'], ['starfound50', 'Cartographe du ciel', 50, 'difficile'],
  ], (n) => `Trouver ${n} étoile${n > 1 ? 's' : ''} dans les secteurs`),
  ...series('Fortune', '🪙', (s) => s.totalEarned, [
    ['earn1b', 'Petit pécule', 1e9, 'facile'], ['earn1qa', 'Fortune cosmique', 1e15, 'moyen'],
    ['earn1sx', 'Trésor galactique', 1e21, 'difficile'], ['earn1no', 'Banque de l’univers', 1e30, 'legendaire'],
  ], (n) => `Gagner ${fmt(n)} crédits en tout`),
  ...series('Fortune', '⏱️', stat('playTime'), [
    ['time1h', 'Pilote', 3600, 'facile'], ['time10h', 'Commandant', 36000, 'moyen'], ['time100h', 'Amiral', 360000, 'difficile'],
  ], (n) => `Jouer ${n / 3600} h`),
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/**
 * Endless legendary goals (the game has no end): each chain has levels I, II, III… with a target
 * that keeps growing; once one is reached, the next one shows up. Ids: `inf:<chain>:<level>`.
 */
const ascTotal = (s) => s.tiers.reduce((n, t) => n + (t.asc || 0), 0);
export const ACH_CHAINS = {
  sector: { emoji: '🌌', name: 'Conquête sans fin', value: (s) => s.maxStage, target: (k) => 500 + 250 * k, desc: (n) => `Atteindre le secteur ${fmt(n)}` },
  planets: { emoji: '🪐', name: 'Collection de mondes', value: stat('bosses'), target: (k) => 2000 * (k + 1), desc: (n) => `Conquérir ${fmt(n)} planètes` },
  prestige: { emoji: '👑', name: 'Dynastie', value: (s) => lifetime(s, 'prestige'), target: (k) => 75 + 25 * k, desc: (n) => `Faire ${n} prestiges` },
  asc: { emoji: '🌟', name: 'Au-delà du ciel', value: ascTotal, target: (k) => 10 + 10 * k, desc: (n) => `${n} ascensions en tout dans la flotte` },
  earn: { emoji: '💰', name: 'Trésor infini', value: (s) => s.totalEarned, target: (k) => 1e30 * 1e6 ** k, desc: (n) => `Gagner ${fmt(n)} crédits en tout` },
  blocks: { emoji: '💥', name: 'Poussière d’univers', value: stat('blocks'), target: (k) => 2e6 * 5 ** k, desc: (n) => `Casser ${fmt(n)} blocs` },
  golds: { emoji: '🏆', name: 'Pluie d’or', value: stat('golds'), target: (k) => 50000 * 4 ** k, desc: (n) => `Casser ${fmt(n)} blocs dorés` },
  ufos: { emoji: '👽', name: 'Ambassadeur alien', value: stat('ufos'), target: (k) => 500 * 3 ** k, desc: (n) => `Attraper ${fmt(n)} soucoupes` },
  stars: { emoji: '🔭', name: 'Chasseur d’étoiles', value: stat('starsFound'), target: (k) => 100 * k, desc: (n) => `Trouver ${fmt(n)} étoiles dans les secteurs` },
  alloy: { emoji: '🔩', name: 'Métallurgiste', value: (s) => lifetime(s, 'alloy'), target: (k) => 40 * k, desc: (n) => `${n} niveaux de Forge (alliage + stabilisateurs)` },
  relics: { emoji: '🏺', name: 'Gardien des reliques', value: (s) => lifetime(s, 'relics'), target: (k) => 5 * k, desc: (n) => `${n} niveaux de reliques` },
  launch: { emoji: '🚀', name: 'Rampe de lancement', value: (s) => lifetime(s, 'launch'), target: (k) => 10 * k, desc: (n) => `${n} paliers de Départ lancé` },
  bang: { emoji: '💥', name: 'Créateur d’univers', value: (s) => s.bigBangs, target: (k) => k, desc: (n) => `Faire ${n} Big Bang${n > 1 ? 's' : ''}` },
  time: { emoji: '⌛', name: 'Veilleur éternel', value: stat('playTime'), target: (k) => 360000 * (k + 1), desc: (n) => `Jouer ${fmt(n / 3600)} h` },
  // Procedural chains: the difficulty goes round (moyen → difficile → légendaire → moyen…), and the target
  // grows a bit faster at each full round, so there is always a goal within reach and one far away.
  merges: { emoji: '🏭', name: 'Chaîne de montage', value: stat('merges'), target: (k) => 20000 * 1.6 ** k, desc: (n) => `Faire ${fmt(n)} fusions`, cycle: true },
  taps: { emoji: '🖐️', name: 'Doigt infatigable', value: stat('taps'), target: (k) => 200000 * 1.5 ** k, desc: (n) => `Toucher ${fmt(n)} fois un bloc`, cycle: true },
  ores: { emoji: '💎', name: 'Veine inépuisable', value: stat('ores'), target: (k) => 1e6 * 1.7 ** k, desc: (n) => `Récolter ${fmt(n)} minerais`, cycle: true },
  sectors: { emoji: '🧹', name: 'Nettoyeur de secteurs', value: stat('sectors'), target: (k) => 5000 * 1.5 ** k, desc: (n) => `Terminer ${fmt(n)} secteurs`, cycle: true },
  boosts: { emoji: '⚡', name: 'Pied au plancher', value: stat('boosts'), target: (k) => 200 * 1.5 ** k, desc: (n) => `Utiliser ${fmt(n)} fois l’accélération`, cycle: true },
  skills: { emoji: '🌌', name: 'Carte du ciel', value: (s) => lifetime(s, 'skills'), target: (k) => 40 + 15 * k, desc: (n) => `${n} niveaux dans l’arbre des étoiles`, cycle: true },
  caliber: { emoji: '🎯', name: 'Armurier', value: (s) => lifetime(s, 'caliber'), target: (k) => 20 + 10 * k, desc: (n) => `${n} niveaux de calibre dans l’atelier`, cycle: true },
};
const CHAIN_CYCLE = ['moyen', 'difficile', 'legendaire'];
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n) => ROMAN.reduce((out, [v, r]) => { while (n >= v) { out += r; n -= v; } return out; }, '');
function chainAch(key, k) {
  const c = ACH_CHAINS[key];
  const target = Math.round(c.target(k));
  const diff = c.cycle ? CHAIN_CYCLE[(k - 1) % CHAIN_CYCLE.length] : 'legendaire';
  return { id: `inf:${key}:${k}`, cat: c.cycle ? '🔁 Défis sans fin' : '♾️ Légendes sans fin', emoji: c.emoji, name: `${c.name} ${roman(k)}`, get desc() { return c.desc(target); }, value: c.value, target, diff };
}
/** Any achievement by id, endless ones included (null if unknown). */
export function achDef(id) {
  if (ACH_BY_ID[id]) return ACH_BY_ID[id];
  const m = /^inf:(\w+):(\d+)$/.exec(id);
  return m && ACH_CHAINS[m[1]] && Number(m[2]) >= 1 && Number(m[2]) <= 10000 ? chainAch(m[1], Number(m[2])) : null;
}
/** The goals to show: the fixed ones, then for each endless chain the levels reached and the next one. */
export function achList(s) {
  const list = [...ACHIEVEMENTS];
  for (const key of Object.keys(ACH_CHAINS)) {
    for (let k = 1; k <= 10000; k++) {
      const a = chainAch(key, k);
      list.push(a);
      if (!s.ach[a.id] && a.value(s) < a.target) break;
    }
  }
  return list;
}
/** State of an achievement in the save: 0 not yet, 1 reached (reward to collect), 2 collected. */
export const achState = (s, id) => s.ach[id] || 0;
export const achProgress = (s, a) => Math.min(1, a.value(s) / a.target);
/** Marks the goals just reached; returns them (for a notification). */
export function updateAchievements(s) {
  const fresh = [];
  for (const a of achList(s)) if (!s.ach[a.id] && a.value(s) >= a.target) { s.ach[a.id] = 1; fresh.push(a); }
  // An endless level reached may reveal the next one, reached too: go again.
  if (fresh.length) fresh.push(...updateAchievements(s));
  s.achPoints = achievementPoints(s);
  return fresh;
}
/** Achievement points (reached goals, collected or not): the Top ranks by them. */
export const achievementPoints = (s) => Object.keys(s.ach).reduce((n, id) => n + (achDef(id) ? ACH_DIFFICULTY[achDef(id).diff].points : 0), 0);
export function claimAchievement(s, id) {
  if (achState(s, id) !== 1 || !achDef(id)) return null;
  const { stars, pp } = ACH_DIFFICULTY[achDef(id).diff];
  s.ach[id] = 2;
  s.stars += stars;
  s.pp += pp;
  s.ppEarned += pp;
  return { stars, pp };
}

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

// ---- « Big Bang » and the dark matter shop ---------------------------------------------------
// From sector 400 in a run (+25 per Big Bang done): absolutely everything starts over (prestiges, stars, star tree, workshop,
// Forge…) for 1 🌑 dark matter. Kept: the dark matter shop (eternal), the « Plan d'attaque », the record
// and the lifetime stats. The saves of a new universe rank above every prestige of the previous one.

export const BIG_BANG = { sector: 400, step: 25, resonance: 0.1 };
/** Sector to reach in the run for the next Big Bang: 400, then 425, 450… (the fleet gets stronger each time). */
export const bigBangSector = (bangs) => BIG_BANG.sector + BIG_BANG.step * bangs;
/** « Résonance cosmique »: each Big Bang done gives +10 % prestige stars and ores, for good. */
export const resonance = (s) => 1 + BIG_BANG.resonance * (s.bigBangs || 0);
/** Lifetime counters of the previous universes (the « Plan d'attaque » counts what was done in all of them). */
export const NO_LEGACY = { prestige: 0, alloy: 0, relics: 0, launch: 0, skills: 0, caliber: 0 };
/** Automation of the star tree kept by « Pilote total » (not counted twice in the lifetime skills). */
export const PILOT_SKILLS = ['auto', 'autoUpg', 'autoLevel', 'autoAsc'];
const sumOf = (arr) => arr.reduce((n, v) => n + v, 0);
function current(s, k) {
  switch (k) {
    case 'prestige': return s.prestige;
    case 'alloy': return sumOf(s.forge.alloy) + sumOf(s.forge.stab);
    case 'relics': return sumOf(Object.values(s.forge.relics));
    case 'launch': return sumOf(s.launch);
    case 'skills': return sumOf(Object.values(s.skills));
    case 'caliber': return sumOf(s.workshop.caliber);
    default: return 0;
  }
}
/** A counter over every universe (this one included). */
export const lifetime = (s, k) => current(s, k) + (s.legacy?.[k] || 0);
/** The lifetime counters once this universe ends (what the Big Bang keeps). */
export function legacyAfter(s) {
  const out = Object.fromEntries(Object.keys(NO_LEGACY).map((k) => [k, lifetime(s, k)]));
  if (s.dmShop.pilot >= 1) out.skills -= sumOf(PILOT_SKILLS.map((k) => s.skills[k]));
  return out;
}

/**
 * Dark matter shop: price N+1 (the Singularité: 1 then 3, 4, 5…), except the fixed-price automatic
 * acceleration. Frames: one per level, shown around the name in the Top (more can be added later).
 */
export const DM_SHOP = {
  singularity: { label: 'Singularité', emoji: '🌀', desc: 'Dégâts +50 % par niveau (×1,5 → ×2 → ×2,5…)', max: Infinity, cost: (l) => (l ? l + 2 : 1) },
  heritage: { label: 'Héritage stellaire', emoji: '🌠', desc: 'Chaque univers commence avec +25 ⭐ et +15 🔷 par niveau', max: Infinity, cost: (l) => l + 1 },
  pilot: {
    label: 'Pilote total', emoji: '🤖', max: 2, cost: (l) => l + 1,
    desc: 'I : les automatismes de l’arbre des étoiles (Chantier, Ingénieur, Instructeur, Ascension auto) sont gardés au Big Bang · II : prestige automatique',
  },
  autoBoost: { label: 'Accélération automatique', emoji: '⚡', desc: 'L’accélération se relance toute seule dès qu’elle est rechargée', max: 1, cost: () => 10 },
  frame: { label: 'Cadre cosmique', emoji: '🖼️', desc: 'Un cadre autour de ton pseudo dans le Top, de plus en plus beau à chaque niveau', max: 3, cost: (l) => l + 1 },
};
export const DM_FRAMES = ['', 'Nébuleuse', 'Supernova', 'Trou noir'];
export const singularityFactor = (s) => 1 + 0.5 * (s.dmShop?.singularity || 0);
export const dmCost = (k, lvl) => DM_SHOP[k].cost(lvl);
/** Dark matter spent in the shop (the server checks that it never exceeds the Big Bangs). */
export const dmSpent = (shop) => Object.entries(DM_SHOP).reduce((n, [k, it]) => {
  for (let l = 0; l < (shop?.[k] || 0); l++) n += it.cost(l);
  return n;
}, 0);
export const canBuyDm = (s, k) => s.dmShop[k] < DM_SHOP[k].max && s.dm >= dmCost(k, s.dmShop[k]);
export function buyDm(s, k) {
  if (!canBuyDm(s, k)) return false;
  s.dm -= dmCost(k, s.dmShop[k]);
  s.dmShop[k] += 1;
  return true;
}

export const bigBangVisible = (s) => s.bigBangs > 0 || s.maxStage >= BIG_BANG.sector;
export const canBigBang = (s) => s.runBest >= bigBangSector(s.bigBangs);
export function doBigBang(s) {
  if (!canBigBang(s)) return false;
  const pilot = s.dmShop.pilot >= 1;
  const keep = {
    bigBangs: s.bigBangs + 1, dm: s.dm + 1, dmShop: s.dmShop, legacy: legacyAfter(s),
    ach: s.ach, achPoints: s.achPoints, maxStage: s.maxStage, stats: s.stats, totalEarned: s.totalEarned, daily: s.daily,
    autoPrestigeOn: s.autoPrestigeOn, autoPrestigeAt: s.autoPrestigeAt, autoBoostOn: s.autoBoostOn,
  };
  const kept = pilot ? { skills: Object.fromEntries(PILOT_SKILLS.map((k) => [k, s.skills[k]])), auto: s.auto, autoUpg: s.autoUpg, autoLevel: s.autoLevel, autoAscOn: s.autoAscOn } : null;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, newSave(), keep);
  if (kept) {
    Object.assign(s.skills, kept.skills);
    Object.assign(s, { auto: kept.auto, autoUpg: kept.autoUpg, autoLevel: kept.autoLevel, autoAscOn: kept.autoAscOn });
  }
  // « Héritage stellaire »: a head start in stars and prestige points.
  const h = s.dmShop.heritage;
  s.stars = 25 * h;
  s.pp = 15 * h;
  s.ppEarned = 15 * h;
  return true;
}
/** Order of two saves: a later universe first, then more prestiges (a save never goes back). */
export const runRank = (d) => Math.floor(Number(d?.bigBangs) || 0) * 1e6 + Math.floor(Number(d?.prestige) || 0);
