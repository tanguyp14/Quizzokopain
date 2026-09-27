// L'Empire de Jimmy — rules of a player's empire (pure, used by the server as the authority and
// by the page for the live display). Step 1: one planet, production over time (even offline),
// buildings and research with a queue. No PvP: the other steps (trade, Great Projects, the Swarm)
// build on this.

export const RESOURCES = {
  metal: { name: 'Métal', emoji: '🔩', color: '#c9d1e0' },
  crystal: { name: 'Cristal', emoji: '💎', color: '#8fd3ff' },
  plasma: { name: 'Plasma', emoji: '🔥', color: '#ff8a5b' },
};
export const RES_KEYS = Object.keys(RESOURCES);

/** Planet types: one resource produced twice as fast (the others a little less): trade is the way. */
export const PLANET_TYPES = {
  volcanic: { name: 'Volcanique', emoji: '🌋', best: 'plasma', colors: ['#ff8a3d', '#8a2a12'] },
  icy: { name: 'Glacée', emoji: '🧊', best: 'crystal', colors: ['#bfe9ff', '#2d5f8a'] },
  rocky: { name: 'Rocheuse', emoji: '🪨', best: 'metal', colors: ['#c9b8a0', '#5a4a3a'] },
};
export const SPECIALTY = { best: 2, other: 0.8 };

/** Buildings: cost of level 1, growth per level, what they do. */
export const BUILDINGS = {
  mineMetal: { name: 'Mine de métal', emoji: '⛏️', res: 'metal', cost: { metal: 60, crystal: 15 }, growth: 1.5, energy: 10, desc: 'Produit du métal' },
  mineCrystal: { name: 'Mine de cristal', emoji: '💠', res: 'crystal', cost: { metal: 48, crystal: 24 }, growth: 1.6, energy: 10, desc: 'Produit du cristal' },
  minePlasma: { name: 'Extracteur de plasma', emoji: '🌡️', res: 'plasma', cost: { metal: 225, crystal: 75 }, growth: 1.5, energy: 20, desc: 'Produit du plasma' },
  power: { name: 'Centrale solaire', emoji: '☀️', cost: { metal: 75, crystal: 30 }, growth: 1.5, desc: 'Produit l’énergie qui fait tourner les mines' },
  storage: { name: 'Entrepôts', emoji: '📦', cost: { metal: 1000, crystal: 500 }, growth: 2, desc: 'Plus de place pour chaque ressource' },
  robotics: { name: 'Usine de robots', emoji: '🤖', cost: { metal: 400, crystal: 120, plasma: 200 }, growth: 2, desc: 'Construit plus vite (−9 % de temps par niveau, puis de moins en moins)' },
  lab: { name: 'Laboratoire', emoji: '🔬', cost: { metal: 200, crystal: 400, plasma: 200 }, growth: 2, desc: 'Débloque la recherche et la rend plus rapide' },
};
/**
 * Progression: what must be built (or researched) before a building or research shows up.
 * At first only the metal mine and the solar plant; everything else unlocks step by step.
 */
export const REQUIRES = {
  building: {
    mineMetal: {},
    power: {},
    mineCrystal: { mineMetal: 2 },
    minePlasma: { mineCrystal: 2, power: 3 },
    storage: { mineMetal: 4 },
    robotics: { mineMetal: 5, power: 4 },
    lab: { mineCrystal: 4, robotics: 1 },
  },
  research: {
    energy: { lab: 1 },
    extraction: { lab: 2, 'r:energy': 2 },
    logistics: { lab: 3, storage: 2 },
  },
};
/** What is still missing to unlock a building / research: [{ name, emoji, level, have }] (empty = unlocked). */
export function missing(e, kind, key) {
  return Object.entries(REQUIRES[kind][key] || {}).map(([req, level]) => {
    const isResearch = req.startsWith('r:');
    const k = isResearch ? req.slice(2) : req;
    const def = isResearch ? RESEARCH[k] : BUILDINGS[k];
    const have = isResearch ? e.research[k] : e.buildings[k];
    return { name: def.name, emoji: def.emoji, level, have };
  }).filter((m) => m.have < m.level);
}
export const unlocked = (e, kind, key) => missing(e, kind, key).length === 0;

/** Research. */
export const RESEARCH = {
  energy: { name: 'Technologie de l’énergie', emoji: '⚡', cost: { crystal: 800, plasma: 400 }, growth: 2, desc: 'Énergie des centrales +10 % par niveau' },
  extraction: { name: 'Extraction avancée', emoji: '🛠️', cost: { metal: 1000, crystal: 500 }, growth: 2, desc: 'Production de toutes les mines +5 % par niveau' },
  logistics: { name: 'Logistique', emoji: '🚚', cost: { metal: 800, crystal: 800, plasma: 400 }, growth: 2, desc: 'Entrepôts +20 % de place par niveau (et plus tard : cargos)' },
};

export const START_RES = { metal: 500, crystal: 500, plasma: 0 };
const HOUR = 3600 * 1000;

// ---- state ----------------------------------------------------------------------------------

const planetName = (seed) => {
  const a = ['Zor', 'Glax', 'Kre', 'Vu', 'Pli', 'Orb', 'Nu', 'Xan', 'Tro', 'Bleu'];
  const b = ['gon', 'or', 'ta', 'lia', 'mox', 'rith', 'bul', 'phi', 'zar', 'ne'];
  return `${a[seed % a.length]}${b[Math.floor(seed / 10) % b.length]}-${100 + (seed % 900)}`;
};

export function newEmpire(type, now = Date.now(), seed = Math.floor(Math.random() * 100000)) {
  if (!PLANET_TYPES[type]) throw new Error('Type de planète inconnu.');
  return {
    v: 1,
    planet: { type, name: planetName(seed) },
    res: { ...START_RES },
    buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 0])),
    research: Object.fromEntries(Object.keys(RESEARCH).map((k) => [k, 0])),
    queue: [], // [{ kind: 'building' | 'research', key, level, endsAt }] — one of each at a time
    lastTick: now,
    createdAt: now,
  };
}

/** Repairs a stored empire (unknown keys dropped, numbers checked). */
export function normalizeEmpire(raw) {
  if (!raw || !PLANET_TYPES[raw.planet?.type]) return null;
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const e = newEmpire(raw.planet.type, n(raw.createdAt) || Date.now(), 0);
  e.planet.name = String(raw.planet.name || e.planet.name).slice(0, 40);
  for (const k of RES_KEYS) e.res[k] = n(raw.res?.[k]);
  for (const k of Object.keys(BUILDINGS)) e.buildings[k] = Math.floor(n(raw.buildings?.[k]));
  for (const k of Object.keys(RESEARCH)) e.research[k] = Math.floor(n(raw.research?.[k]));
  e.queue = (Array.isArray(raw.queue) ? raw.queue : [])
    .filter((q) => (q.kind === 'building' ? BUILDINGS[q.key] : q.kind === 'research' && RESEARCH[q.key]))
    .map((q) => ({ kind: q.kind, key: q.key, level: Math.floor(n(q.level)), endsAt: n(q.endsAt) }));
  e.lastTick = n(raw.lastTick) || Date.now();
  return e;
}

// ---- economy ---------------------------------------------------------------------------------

const grow = (base, growth, level) => Object.fromEntries(Object.entries(base).map(([r, v]) => [r, Math.floor(v * growth ** (level - 1))]));
/** Price of a building or research level. */
export const buildingCost = (key, level) => grow(BUILDINGS[key].cost, BUILDINGS[key].growth, level);
export const researchCost = (key, level) => grow(RESEARCH[key].cost, RESEARCH[key].growth, level);

/** Build time (ms): grows with the price, shorter with the robots factory. */
export function buildTime(e, key, level) {
  const c = buildingCost(key, level);
  const hours = ((c.metal || 0) + (c.crystal || 0) + (c.plasma || 0)) / (2500 * (1 + e.buildings.robotics));
  return Math.max(5000, Math.round(hours * HOUR));
}
export function researchTime(e, key, level) {
  const c = researchCost(key, level);
  const hours = ((c.metal || 0) + (c.crystal || 0) + (c.plasma || 0)) / (1000 * (1 + e.buildings.lab));
  return Math.max(5000, Math.round(hours * HOUR));
}

/** Energy produced and needed. */
export function energy(e) {
  const b = e.buildings;
  const made = Math.floor(20 * b.power * 1.1 ** b.power * (1 + 0.1 * e.research.energy));
  const used = ['mineMetal', 'mineCrystal', 'minePlasma'].reduce((sum, k) => sum + Math.ceil(BUILDINGS[k].energy * b[k] * 1.1 ** b[k]), 0);
  return { made, used, ratio: used ? Math.min(1, made / used) : 1 };
}

/** Production per hour of each resource (with the planet's specialty and the energy available). */
export function production(e) {
  const { ratio } = energy(e);
  const best = PLANET_TYPES[e.planet.type].best;
  const boost = 1 + 0.05 * e.research.extraction;
  const out = {};
  for (const k of ['mineMetal', 'mineCrystal', 'minePlasma']) {
    const { res } = BUILDINGS[k];
    const l = e.buildings[k];
    const base = res === 'metal' ? 30 : res === 'crystal' ? 20 : 10;
    const passive = res === 'metal' ? 30 : res === 'crystal' ? 15 : 5; // a little even without mines
    out[res] = (passive + base * l * 1.1 ** l * ratio * boost) * (res === best ? SPECIALTY.best : SPECIALTY.other);
  }
  return out;
}

/** Storage room per resource. */
export const storageCap = (e) => Math.floor(10000 * 1.8 ** e.buildings.storage * (1 + 0.2 * e.research.logistics));

/**
 * Brings the empire up to `now`: production (capped by the storage) and finished jobs, in order
 * (a finished mine produces more from the moment it is done). Returns the jobs finished.
 */
export function advance(e, now = Date.now()) {
  const done = [];
  const produce = (until) => {
    const dt = Math.max(0, until - e.lastTick) / HOUR;
    if (!dt) return;
    const p = production(e);
    const cap = storageCap(e);
    for (const r of RES_KEYS) if (e.res[r] < cap) e.res[r] = Math.min(cap, e.res[r] + p[r] * dt);
    e.lastTick = until;
  };
  for (;;) {
    const next = e.queue.filter((q) => q.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt)[0];
    if (!next) break;
    produce(next.endsAt);
    if (next.kind === 'building') e.buildings[next.key] = next.level;
    else e.research[next.key] = next.level;
    e.queue.splice(e.queue.indexOf(next), 1);
    done.push(next);
  }
  produce(now);
  return done;
}

const canPay = (e, cost) => RES_KEYS.every((r) => e.res[r] >= (cost[r] || 0));
const pay = (e, cost) => { for (const r of RES_KEYS) e.res[r] -= cost[r] || 0; };

/** Why a building / research can't start (null if it can). */
export function buildBlocker(e, key) {
  if (!BUILDINGS[key]) return 'Bâtiment inconnu.';
  if (!unlocked(e, 'building', key)) return 'Pas encore débloqué.';
  if (e.queue.some((q) => q.kind === 'building')) return 'Un chantier est déjà en cours.';
  if (!canPay(e, buildingCost(key, e.buildings[key] + 1))) return 'Pas assez de ressources.';
  return null;
}
export function researchBlocker(e, key) {
  if (!RESEARCH[key]) return 'Recherche inconnue.';
  if (!unlocked(e, 'research', key)) return 'Pas encore débloqué.';
  if (e.queue.some((q) => q.kind === 'research')) return 'Une recherche est déjà en cours.';
  if (e.queue.some((q) => q.kind === 'building' && q.key === 'lab')) return 'Le laboratoire est en travaux.';
  if (!canPay(e, researchCost(key, e.research[key] + 1))) return 'Pas assez de ressources.';
  return null;
}

export function startBuilding(e, key, now = Date.now()) {
  const why = buildBlocker(e, key);
  if (why) throw new Error(why);
  const level = e.buildings[key] + 1;
  pay(e, buildingCost(key, level));
  e.queue.push({ kind: 'building', key, level, endsAt: now + buildTime(e, key, level) });
}
export function startResearch(e, key, now = Date.now()) {
  const why = researchBlocker(e, key);
  if (why) throw new Error(why);
  const level = e.research[key] + 1;
  pay(e, researchCost(key, level));
  e.queue.push({ kind: 'research', key, level, endsAt: now + researchTime(e, key, level) });
}
/** Cancels a job: its price comes back. */
export function cancel(e, kind) {
  const i = e.queue.findIndex((q) => q.kind === kind);
  if (i < 0) return false;
  const q = e.queue[i];
  const cost = kind === 'building' ? buildingCost(q.key, q.level) : researchCost(q.key, q.level);
  for (const r of RES_KEYS) e.res[r] += cost[r] || 0;
  e.queue.splice(i, 1);
  return true;
}

/** Empire power (for later rankings): total levels. */
export const empirePoints = (e) => Object.values(e.buildings).reduce((a, b) => a + b, 0) + Object.values(e.research).reduce((a, b) => a + b, 0);
