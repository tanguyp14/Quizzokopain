// L'Empire de Jimmy — rules of a player's empire (pure, used by the server as the authority and
// by the page for the live display). Step 1: up to 3 planets, each with random resource rates
// (a resource can be missing), buildings per planet, research for the empire, a queue, and
// production over time (even offline). Resources are shared by the whole empire. No PvP: trade,
// the Great Projects and the Swarm come next and build on this.

export const RESOURCES = {
  metal: { name: 'Métal', emoji: '🔩', color: '#c9d1e0' },
  crystal: { name: 'Cristal', emoji: '💎', color: '#8fd3ff' },
  plasma: { name: 'Plasma', emoji: '🔥', color: '#ff8a5b' },
};
export const RES_KEYS = Object.keys(RESOURCES);
export const MAX_PLANETS = 3;
const MINE_OF = { metal: 'mineMetal', crystal: 'mineCrystal', plasma: 'minePlasma' };

/** Buildings (one set per planet): cost of level 1, growth per level, what they do. */
export const BUILDINGS = {
  mineMetal: { name: 'Mine de métal', emoji: '⛏️', res: 'metal', cost: { metal: 60, crystal: 15 }, growth: 1.5, energy: 10, desc: 'Produit du métal' },
  mineCrystal: { name: 'Mine de cristal', emoji: '💠', res: 'crystal', cost: { metal: 48, crystal: 24 }, growth: 1.6, energy: 10, desc: 'Produit du cristal' },
  minePlasma: { name: 'Extracteur de plasma', emoji: '🌡️', res: 'plasma', cost: { metal: 225, crystal: 75 }, growth: 1.5, energy: 20, desc: 'Produit du plasma' },
  power: { name: 'Centrale solaire', emoji: '☀️', cost: { metal: 75, crystal: 30 }, growth: 1.5, desc: 'Produit l’énergie qui fait tourner les mines de la planète' },
  storage: { name: 'Entrepôts', emoji: '📦', cost: { metal: 1000, crystal: 500 }, growth: 2, desc: 'Plus de place pour chaque ressource de l’empire' },
  robotics: { name: 'Usine de robots', emoji: '🤖', cost: { metal: 400, crystal: 120, plasma: 200 }, growth: 2, desc: 'Construit plus vite sur cette planète' },
  shipyard: { name: 'Chantier spatial', emoji: '🛠️', cost: { metal: 400, crystal: 200, plasma: 100 }, growth: 2, desc: 'Construit les vaisseaux (cargos) ; chaque niveau les construit plus vite' },
  lab: { name: 'Laboratoire', emoji: '🔬', cost: { metal: 200, crystal: 400, plasma: 200 }, growth: 2, desc: 'Débloque la recherche (le meilleur laboratoire de l’empire compte)' },
};
/** Research (for the whole empire). */
export const RESEARCH = {
  energy: { name: 'Technologie de l’énergie', emoji: '⚡', cost: { crystal: 800, plasma: 400 }, growth: 2, desc: 'Énergie des centrales +10 % par niveau' },
  extraction: { name: 'Extraction avancée', emoji: '🛠️', cost: { metal: 1000, crystal: 500 }, growth: 2, desc: 'Production de toutes les mines +5 % par niveau' },
  logistics: { name: 'Logistique', emoji: '🚚', cost: { metal: 800, crystal: 800, plasma: 400 }, growth: 2, desc: 'Entrepôts +20 % de place par niveau (et plus tard : cargos)' },
  colonization: { name: 'Colonisation', emoji: '🚀', cost: { metal: 4000, crystal: 8000, plasma: 4000 }, growth: 2.5, max: 2, desc: 'Niveau 1 : une 2ᵉ planète · niveau 2 : une 3ᵉ planète' },
};

/**
 * Progression: what must exist before a building (on the same planet) or a research shows up.
 * Research needs are checked on the empire (best laboratory, research levels).
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
    shipyard: { robotics: 2 },
  },
  research: {
    energy: { lab: 1 },
    extraction: { lab: 2, 'r:energy': 2 },
    logistics: { lab: 3, storage: 2 },
    colonization: { lab: 3, 'r:energy': 3, 'r:extraction': 2 },
  },
};
/** Price of a new colony (the 2nd, then the 3rd planet). */
export const colonyCost = (n) => ({ metal: 10000 * 3 ** (n - 1), crystal: 8000 * 3 ** (n - 1), plasma: 4000 * 3 ** (n - 1) });

/** Ships (built at a planet with a shipyard, kept by the empire). */
export const SHIPS = {
  cargo: { name: 'Cargo', emoji: '🛰️', cost: { metal: 2000, crystal: 2000 }, capacity: 5000, desc: 'Transporte 5 000 ressources vers un autre joueur, puis revient' },
};
export const SHIP_REQUIRES = { cargo: { shipyard: 1 } };

export const START_RES = { metal: 500, crystal: 500, plasma: 100 };
const HOUR = 3600 * 1000;

// ---- random planets ------------------------------------------------------------------------------

/** Small seeded PRNG (mulberry32): a planet is the same wherever it is computed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SYL_A = ['Zor', 'Glax', 'Kre', 'Vu', 'Pli', 'Orb', 'Nu', 'Xan', 'Tro', 'Bleu', 'Mira', 'Quo', 'Sel', 'Tar', 'Ygg', 'Fen', 'Oph', 'Rhé'];
const SYL_B = ['gon', 'or', 'ta', 'lia', 'mox', 'rith', 'bul', 'phi', 'zar', 'ne', 'dra', 'kis', 'vel', 'uun', 'op', 'ria', 'xo', 'thé'];
const SUFFIX = ['Prime', 'II', 'III', 'b', 'Major', 'Minor', 'Nova', ''];

/**
 * A random planet. Rates per resource: a multiplier from ×0.3 to ×2.2 (the production of that
 * resource), or 0 when the resource is missing. The home planet always has the three resources;
 * a colony can lack one or two (never all three). Every planet has a strong and a weak point.
 */
export function randomPlanet(seed, { home = false } = {}) {
  const r = rng(seed);
  const v = rng(seed ^ 0x9e3779b9); // its own stream for the name and the look (independent of the rates)
  const pick = (arr) => arr[Math.floor(v() * arr.length)];
  const rates = {};
  for (const k of RES_KEYS) rates[k] = Math.round((0.3 + r() * 1.9) * 100) / 100;
  // A strong and a weak resource.
  const order = [...RES_KEYS].sort(() => r() - 0.5);
  rates[order[0]] = Math.max(rates[order[0]], Math.round((1.4 + r() * 0.8) * 100) / 100);
  rates[order[1]] = Math.min(rates[order[1]], Math.round((0.3 + r() * 0.5) * 100) / 100);
  if (!home) {
    // Colonies: the weak resource may be missing, sometimes another one too.
    if (r() < 0.6) rates[order[1]] = 0;
    if (r() < 0.25) rates[order[2]] = 0;
  }
  const hue = Math.floor(v() * 360);
  return {
    seed,
    name: `${pick(SYL_A)}${pick(SYL_B)} ${pick(SUFFIX) || String(100 + Math.floor(v() * 900))}`.trim(),
    rates,
    look: {
      a: `hsl(${hue} ${45 + Math.floor(v() * 40)}% ${55 + Math.floor(v() * 15)}%)`,
      b: `hsl(${(hue + 20 + Math.floor(v() * 120)) % 360} ${35 + Math.floor(v() * 40)}% ${22 + Math.floor(v() * 15)}%)`,
      bands: v() < 0.55 ? 2 + Math.floor(v() * 5) : 0,
      tilt: Math.floor(v() * 50) - 25,
      ring: v() < 0.35,
      spots: v() < 0.5,
    },
    buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 0])),
  };
}

// ---- state ----------------------------------------------------------------------------------

export function newEmpire(now = Date.now(), seed = Math.floor(Math.random() * 2 ** 31)) {
  return {
    v: 2,
    planets: [randomPlanet(seed, { home: true })],
    res: { ...START_RES },
    research: Object.fromEntries(Object.keys(RESEARCH).map((k) => [k, 0])),
    ships: Object.fromEntries(Object.keys(SHIPS).map((k) => [k, 0])), // ships at home (the ones in flight are in the fleets)
    coords: galaxyCoords(seed),
    queue: [], // [{ kind: 'building', planet, key, level, endsAt } | { kind: 'research', key, level, endsAt }]
    lastTick: now,
    createdAt: now,
  };
}

/** Repairs a stored empire (unknown keys dropped, numbers checked). Older formats start over. */
export function normalizeEmpire(raw) {
  if (!raw || raw.v !== 2 || !Array.isArray(raw.planets) || !raw.planets.length) return null;
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const e = newEmpire(n(raw.createdAt) || Date.now(), 1);
  e.planets = raw.planets.slice(0, MAX_PLANETS).map((p, i) => {
    const fresh = randomPlanet(Math.floor(n(p.seed)), { home: i === 0 });
    for (const k of Object.keys(BUILDINGS)) fresh.buildings[k] = Math.floor(n(p.buildings?.[k]));
    return fresh;
  });
  for (const k of RES_KEYS) e.res[k] = n(raw.res?.[k]);
  for (const k of Object.keys(RESEARCH)) e.research[k] = Math.min(RESEARCH[k].max ?? Infinity, Math.floor(n(raw.research?.[k])));
  for (const k of Object.keys(SHIPS)) e.ships[k] = Math.floor(n(raw.ships?.[k]));
  e.coords = raw.coords && Number.isFinite(raw.coords.x) ? { x: Math.floor(n(raw.coords.x)), y: Math.floor(n(raw.coords.y)) } : galaxyCoords(Math.floor(n(raw.planets[0]?.seed)));
  e.queue = (Array.isArray(raw.queue) ? raw.queue : [])
    .filter((q) => (q.kind === 'building' ? BUILDINGS[q.key] && e.planets[q.planet] : q.kind === 'ship' ? SHIPS[q.key] && e.planets[q.planet] : q.kind === 'research' && RESEARCH[q.key]))
    .map((q) => ({
      kind: q.kind, ...(q.kind !== 'research' && { planet: Math.floor(n(q.planet)) }), key: q.key, endsAt: n(q.endsAt),
      ...(q.kind === 'ship' ? { count: Math.max(1, Math.floor(n(q.count))) } : { level: Math.floor(n(q.level)) }),
    }));
  e.lastTick = n(raw.lastTick) || Date.now();
  if (raw.butch) e.butch = { visit: Math.floor(n(raw.butch.visit)), bought: Math.floor(n(raw.butch.bought)) };
  return e;
}

// ---- economy ---------------------------------------------------------------------------------

const grow = (base, growth, level) => Object.fromEntries(Object.entries(base).map(([r, v]) => [r, Math.floor(v * growth ** (level - 1))]));
export const buildingCost = (key, level) => grow(BUILDINGS[key].cost, BUILDINGS[key].growth, level);
export const researchCost = (key, level) => grow(RESEARCH[key].cost, RESEARCH[key].growth, level);
/** Best laboratory of the empire (research needs and speed). */
export const bestLab = (e) => Math.max(...e.planets.map((p) => p.buildings.lab));

/** Build time (ms): grows with the price, shorter with the planet's robots factory. */
export function buildTime(e, planet, key, level) {
  const c = buildingCost(key, level);
  const hours = ((c.metal || 0) + (c.crystal || 0) + (c.plasma || 0)) / (2500 * (1 + e.planets[planet].buildings.robotics));
  return Math.max(5000, Math.round(hours * HOUR));
}
export function researchTime(e, key, level) {
  const c = researchCost(key, level);
  const hours = ((c.metal || 0) + (c.crystal || 0) + (c.plasma || 0)) / (1000 * (1 + bestLab(e)));
  return Math.max(5000, Math.round(hours * HOUR));
}

/** Energy of a planet: produced by its plant, used by its mines. */
export function energy(e, planet) {
  const b = e.planets[planet].buildings;
  const made = Math.floor(20 * b.power * 1.1 ** b.power * (1 + 0.1 * e.research.energy));
  const used = ['mineMetal', 'mineCrystal', 'minePlasma'].reduce((sum, k) => sum + Math.ceil(BUILDINGS[k].energy * b[k] * 1.1 ** b[k]), 0);
  return { made, used, ratio: used ? Math.min(1, made / used) : 1 };
}

/** Production per hour of one planet (its rates, its energy). */
export function planetProduction(e, planet) {
  const p = e.planets[planet];
  const { ratio } = energy(e, planet);
  const boost = 1 + 0.05 * e.research.extraction;
  const out = {};
  for (const res of RES_KEYS) {
    const l = p.buildings[MINE_OF[res]];
    const base = res === 'metal' ? 30 : res === 'crystal' ? 20 : 10;
    const passive = planet === 0 ? (res === 'metal' ? 30 : res === 'crystal' ? 15 : 5) : 0; // a little on the home planet
    out[res] = (passive + base * l * 1.1 ** l * ratio * boost) * p.rates[res];
  }
  return out;
}
/** Production per hour of the whole empire. */
export function production(e) {
  const out = Object.fromEntries(RES_KEYS.map((r) => [r, 0]));
  e.planets.forEach((_, i) => { const p = planetProduction(e, i); for (const r of RES_KEYS) out[r] += p[r]; });
  return out;
}

/** Storage room per resource (all the planets' warehouses). */
export const storageCap = (e) => Math.floor(e.planets.reduce((sum, p) => sum + 10000 * 1.8 ** p.buildings.storage, 0) * (1 + 0.2 * e.research.logistics));

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
    if (next.kind === 'building') e.planets[next.planet].buildings[next.key] = next.level;
    else if (next.kind === 'ship') e.ships[next.key] += next.count;
    else e.research[next.key] = next.level;
    e.queue.splice(e.queue.indexOf(next), 1);
    done.push(next);
  }
  produce(now);
  return done;
}

// ---- progression -----------------------------------------------------------------------------

/** What is still missing to unlock a building (on a planet) or a research: [{ name, emoji, level, have }]. */
export function missing(e, kind, key, planet = 0) {
  return Object.entries(REQUIRES[kind][key] || {}).map(([req, level]) => {
    const isResearch = req.startsWith('r:');
    const k = isResearch ? req.slice(2) : req;
    const def = isResearch ? RESEARCH[k] : BUILDINGS[k];
    let have;
    if (isResearch) have = e.research[k];
    else if (kind === 'research') have = Math.max(...e.planets.map((p) => p.buildings[k]));
    else have = e.planets[planet].buildings[k];
    return { name: def.name, emoji: def.emoji, level, have };
  }).filter((m) => m.have < m.level);
}
export const unlocked = (e, kind, key, planet = 0) => missing(e, kind, key, planet).length === 0;
/** A mine can't be built where its resource is missing. */
export const resourceMissing = (e, planet, key) => Boolean(BUILDINGS[key].res) && e.planets[planet].rates[BUILDINGS[key].res] === 0;

const canPay = (e, cost) => RES_KEYS.every((r) => e.res[r] >= (cost[r] || 0));
const pay = (e, cost) => { for (const r of RES_KEYS) e.res[r] -= cost[r] || 0; };

/** Why a building / research can't start (null if it can). One building job per planet, one research. */
export function buildBlocker(e, planet, key) {
  if (!BUILDINGS[key] || !e.planets[planet]) return 'Bâtiment inconnu.';
  if (resourceMissing(e, planet, key)) return `Pas de ${RESOURCES[BUILDINGS[key].res].name.toLowerCase()} sur cette planète.`;
  if (!unlocked(e, 'building', key, planet)) return 'Pas encore débloqué.';
  if (e.queue.some((q) => q.kind === 'building' && q.planet === planet)) return 'Un chantier est déjà en cours sur cette planète.';
  if (!canPay(e, buildingCost(key, e.planets[planet].buildings[key] + 1))) return 'Pas assez de ressources.';
  return null;
}
export function researchBlocker(e, key) {
  if (!RESEARCH[key]) return 'Recherche inconnue.';
  if (e.research[key] >= (RESEARCH[key].max ?? Infinity)) return 'Niveau maximum.';
  if (!unlocked(e, 'research', key)) return 'Pas encore débloqué.';
  if (e.queue.some((q) => q.kind === 'research')) return 'Une recherche est déjà en cours.';
  if (!canPay(e, researchCost(key, e.research[key] + 1))) return 'Pas assez de ressources.';
  return null;
}

export function startBuilding(e, planet, key, now = Date.now()) {
  const why = buildBlocker(e, planet, key);
  if (why) throw new Error(why);
  const level = e.planets[planet].buildings[key] + 1;
  pay(e, buildingCost(key, level));
  e.queue.push({ kind: 'building', planet, key, level, endsAt: now + buildTime(e, planet, key, level) });
}
export function startResearch(e, key, now = Date.now()) {
  const why = researchBlocker(e, key);
  if (why) throw new Error(why);
  const level = e.research[key] + 1;
  pay(e, researchCost(key, level));
  e.queue.push({ kind: 'research', key, level, endsAt: now + researchTime(e, key, level) });
}
/** Cancels a job (a planet's building, or the research): its price comes back. */
export function cancel(e, kind, planet = 0) {
  const i = e.queue.findIndex((q) => q.kind === kind && (kind !== 'building' || q.planet === planet));
  if (i < 0) return false;
  const q = e.queue[i];
  const cost = kind === 'building' ? buildingCost(q.key, q.level) : researchCost(q.key, q.level);
  for (const r of RES_KEYS) e.res[r] += cost[r] || 0;
  e.queue.splice(i, 1);
  return true;
}

/** Colonies: the Colonisation research allows a 2nd, then a 3rd planet (random, paid). */
export const colonySlots = (e) => Math.min(MAX_PLANETS, 1 + e.research.colonization);
export function colonyBlocker(e) {
  if (e.planets.length >= MAX_PLANETS) return 'Nombre maximum de planètes.';
  if (e.planets.length >= colonySlots(e)) return `Il faut la recherche Colonisation niveau ${e.planets.length}.`;
  if (!canPay(e, colonyCost(e.planets.length))) return 'Pas assez de ressources.';
  return null;
}
export function colonize(e, seed = Math.floor(Math.random() * 2 ** 31)) {
  const why = colonyBlocker(e);
  if (why) throw new Error(why);
  pay(e, colonyCost(e.planets.length));
  e.planets.push(randomPlanet(seed));
  return e.planets.length - 1;
}

/**
 * Butch Pakovski (an NPC merchant) comes by every 4 hours with one deal and no choice: a stock of
 * one resource, sold at a terrible fixed price in another one (e.g. 2 500 metal at 4 crystal
 * each). Take as much as you want from the stock until he leaves. The deal of a visit is the same
 * for everyone (a visit of Butch in the galaxy); the stock is per empire and grows with it.
 */
export const BUTCH = { name: 'Butch Pakovski', every: 4 * HOUR };
export function butchOffer(e, now = Date.now()) {
  const visit = Math.floor(now / BUTCH.every);
  const r = rng(visit * 2654435761);
  const sells = RES_KEYS[Math.floor(r() * 3)];
  const others = RES_KEYS.filter((k) => k !== sells);
  const wants = others[Math.floor(r() * 2)];
  const price = 3 + Math.floor(r() * 4); // 3 to 6 for 1
  // Stock: about 4 hours of the empire's production (at least 1 500), rounded to the hundred.
  const p = production(e);
  const avg = (p.metal + p.crystal + p.plasma) / 3;
  const stock = Math.max(1500, Math.round((avg * 4 * (0.8 + r() * 0.6)) / 100) * 100);
  const bought = e.butch?.visit === visit ? e.butch.bought : 0;
  return { visit, sells, wants, price, stock, left: Math.max(0, stock - bought), leavesAt: (visit + 1) * BUTCH.every };
}
export function butchBuy(e, amount, now = Date.now()) {
  const o = butchOffer(e, now);
  amount = Math.floor(Number(amount));
  if (!(amount > 0)) throw new Error('Quantité invalide.');
  if (amount > o.left) throw new Error(`Butch n’a plus que ${o.left} ${RESOURCES[o.sells].name.toLowerCase()}.`);
  const cost = amount * o.price;
  if (e.res[o.wants] < cost) throw new Error(`Il te faut ${cost} ${RESOURCES[o.wants].name.toLowerCase()}.`);
  e.res[o.wants] -= cost;
  e.res[o.sells] += amount;
  e.butch = { visit: o.visit, bought: (e.butch?.visit === o.visit ? e.butch.bought : 0) + amount };
  return { amount, cost };
}

// ---- step 2: ships, galaxy, trade -----------------------------------------------------------

/** Where an empire sits in the galaxy (a 100 × 100 map), from its home planet's seed. */
export function galaxyCoords(seed) {
  const r = rng((seed ^ 0x5bd1e995) >>> 0);
  return { x: 1 + Math.floor(r() * 100), y: 1 + Math.floor(r() * 100) };
}
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** One-way flight time between two empires: 5 min plus 2 min per unit of distance (faster with Logistique). */
export const flightTime = (e, to) => Math.round((5 + 2 * distance(e.coords, to)) * 60 * 1000 / (1 + 0.1 * e.research.logistics));
export const cargoCapacity = (e) => Math.floor(SHIPS.cargo.capacity * (1 + 0.1 * e.research.logistics));
/** Cargos needed to carry a load. */
export const cargosFor = (e, load) => Math.ceil(RES_KEYS.reduce((sum, r) => sum + (load[r] || 0), 0) / cargoCapacity(e));

/** Ship yard: best shipyard of the empire; ships are built one batch at a time. */
export const bestShipyard = (e) => Math.max(...e.planets.map((p) => p.buildings.shipyard || 0));
export const shipCost = (key, count) => Object.fromEntries(Object.entries(SHIPS[key].cost).map(([r, v]) => [r, v * count]));
export function shipTime(e, planet, key, count) {
  const c = shipCost(key, 1);
  const hours = ((c.metal || 0) + (c.crystal || 0) + (c.plasma || 0)) / (2500 * (1 + e.planets[planet].buildings.shipyard));
  return Math.max(5000, Math.round(hours * HOUR * count));
}
export function shipBlocker(e, planet, key, count) {
  if (!SHIPS[key] || !e.planets[planet]) return 'Vaisseau inconnu.';
  if (!(count >= 1)) return 'Quantité invalide.';
  if (Object.entries(SHIP_REQUIRES[key]).some(([b, l]) => (e.planets[planet].buildings[b] || 0) < l)) return 'Il faut un chantier spatial sur cette planète.';
  if (e.queue.some((q) => q.kind === 'ship')) return 'Des vaisseaux sont déjà en construction.';
  if (!canPay(e, shipCost(key, count))) return 'Pas assez de ressources.';
  return null;
}
export function startShips(e, planet, key, count, now = Date.now()) {
  count = Math.floor(Number(count));
  const why = shipBlocker(e, planet, key, count);
  if (why) throw new Error(why);
  pay(e, shipCost(key, count));
  e.queue.push({ kind: 'ship', planet, key, count, endsAt: now + shipTime(e, planet, key, count) });
}

/** Checks and takes a load to send (resources and the cargos to carry it). Returns the cargos used. */
export function prepareShipment(e, load) {
  const clean = Object.fromEntries(RES_KEYS.map((r) => [r, Math.max(0, Math.floor(Number(load?.[r]) || 0))]));
  const total = RES_KEYS.reduce((sum, r) => sum + clean[r], 0);
  if (!total) throw new Error('Rien à envoyer.');
  for (const r of RES_KEYS) if (e.res[r] < clean[r]) throw new Error(`Pas assez de ${RESOURCES[r].name.toLowerCase()}.`);
  const cargos = cargosFor(e, clean);
  if (e.ships.cargo < cargos) throw new Error(`Il faut ${cargos} cargo${cargos > 1 ? 's' : ''} (tu en as ${e.ships.cargo} au port).`);
  pay(e, clean);
  e.ships.cargo -= cargos;
  return { load: clean, cargos };
}

/** Market offers: « give X of a resource for Y of another », the offered part held until taken. */
export const MARKET = { maxOffers: 5 };
export function prepareOffer(e, give, giveAmount, want, wantAmount) {
  giveAmount = Math.floor(Number(giveAmount));
  wantAmount = Math.floor(Number(wantAmount));
  if (!RESOURCES[give] || !RESOURCES[want] || give === want) throw new Error('Offre impossible.');
  if (!(giveAmount > 0) || !(wantAmount > 0)) throw new Error('Quantités invalides.');
  if (e.res[give] < giveAmount) throw new Error(`Pas assez de ${RESOURCES[give].name.toLowerCase()}.`);
  e.res[give] -= giveAmount;
  return { give, giveAmount, want, wantAmount };
}

/** Empire power (for later rankings): total levels. */
export const empirePoints = (e) => e.planets.reduce((sum, p) => sum + Object.values(p.buildings).reduce((a, b) => a + b, 0), 0)
  + Object.values(e.research).reduce((a, b) => a + b, 0);
