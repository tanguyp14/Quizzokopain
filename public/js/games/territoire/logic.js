// Territoire — rules on a grid, inspired by Qix and JezzBall (pure: no DOM, testable with node).
//
// Jimmy's ship flies anywhere over the conquered land. Going into the empty zone draws a
// trail; closing it on the land conquers every empty area without an asteroid. An asteroid shut
// in an area small enough for its size explodes (the smaller the asteroid, the tighter the area
// must be). An asteroid touching the trail, or the ship while it draws, costs a life. Destroy
// every asteroid to go to the next planet.

export const GRID = 100; // cells per side
export const EMPTY = 0;
export const LAND = 1;
export const TRAIL = 2;
export const LIVES = 3;
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const AREA = (GRID - 2) ** 2; // the inner zone (the ring excluded)

/**
 * Asteroid sizes. radius: body, in cells · speed: × the planet speed · limit: largest area (share
 * of the zone) that destroys it · points: for destroying it.
 */
export const SIZES = {
  big: { name: 'gros', radius: 3.2, speed: 0.75, limit: 0.08, points: 1000 },
  medium: { name: 'moyen', radius: 2.2, speed: 1, limit: 0.04, points: 1500 },
  small: { name: 'petit', radius: 1.4, speed: 1.3, limit: 0.02, points: 2500 },
};
/** Largest area (in cells) that destroys an asteroid of this size. */
export const limitCells = (size) => Math.round(SIZES[size].limit * AREA);

const idx = (x, y) => y * GRID + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID;

/**
 * Asteroids and speed of a level (cells per second): one more every 2 planets (8 at most),
 * fewer big ones and more small ones as the planets go.
 */
export function levelSpec(level) {
  const n = Math.min(2 + Math.floor((level - 1) / 2), 8);
  const big = Math.max(1, Math.round(n * Math.max(0.15, 0.5 - 0.1 * (level - 1))));
  const small = Math.min(n - big, Math.round(n * Math.min(0.5, 0.1 * (level - 1))));
  const sizes = [...Array(n)].map((_, i) => (i < big ? 'big' : i < big + small ? 'small' : 'medium'));
  return { sizes, speed: 12 + 1.5 * Math.min(level, 12) };
}

/** A new asteroid of this size at (x, y), going in a random direction. */
export function newAsteroid(size, x, y, rand = Math.random) {
  const a = rand() * Math.PI * 2;
  return { size, x, y, vx: Math.cos(a), vy: Math.sin(a), phase: rand() * 6 };
}

/** A new level: the outer ring is land, the ship in the middle of the bottom edge. */
export function newLevel(level = 1, rand = Math.random) {
  const grid = new Uint8Array(GRID * GRID);
  for (let i = 0; i < GRID; i++) {
    grid[idx(i, 0)] = LAND;
    grid[idx(i, GRID - 1)] = LAND;
    grid[idx(0, i)] = LAND;
    grid[idx(GRID - 1, i)] = LAND;
  }
  const spec = levelSpec(level);
  const asteroids = spec.sizes.map((size) => newAsteroid(size, 25 + rand() * 50, 20 + rand() * 45, rand));
  return {
    level, grid, spec, asteroids,
    ship: { x: GRID >> 1, y: GRID - 1 },
    trail: [], // cells of the trail being drawn, in order
    claimed: 0, // share of the inner zone conquered
  };
}

/** A land cell next to the void (8 neighbours): drawn brighter, as the shore. */
export function isEdge(grid, x, y) {
  if (!inside(x, y) || grid[idx(x, y)] !== LAND) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && inside(x + dx, y + dy) && grid[idx(x + dx, y + dy)] === EMPTY) return true;
    }
  }
  return false;
}

/** Share of the inner zone (the ring excluded) that is land. */
export function claimedShare(grid) {
  let land = 0;
  for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) if (grid[idx(x, y)] === LAND) land += 1;
  return land / AREA;
}

/**
 * One step of the ship. It flies freely over the land (to reach any empty area, even one cut
 * off from the others); into the void it draws a trail;
 * back on the land the trail closes. Returns { moved, closed: cells conquered or 0, kills }.
 */
export function moveShip(s, dir) {
  const none = { moved: false, closed: 0, kills: [] };
  const [dx, dy] = DIRS[dir] || [0, 0];
  const nx = s.ship.x + dx;
  const ny = s.ship.y + dy;
  if (!inside(nx, ny) || (!dx && !dy)) return none;
  const cell = s.grid[idx(nx, ny)];
  const drawing = s.trail.length > 0;
  if (cell === TRAIL) return none; // never across its own trail
  if (cell === LAND) {
    s.ship.x = nx;
    s.ship.y = ny;
    return drawing ? { moved: true, ...closeTrail(s) } : { ...none, moved: true };
  }
  // Into the void: draw.
  s.grid[idx(nx, ny)] = TRAIL;
  s.trail.push([nx, ny]);
  s.ship.x = nx;
  s.ship.y = ny;
  return { ...none, moved: true };
}

/**
 * The trail touches the land and becomes land. Each empty area is measured: an asteroid in an
 * area small enough for its size explodes, and an area left without asteroid becomes land.
 * Returns { closed: cells conquered, kills: [{ size, zone, x, y }] } (the destroyed asteroids).
 */
export function closeTrail(s) {
  const { grid } = s;
  let closed = s.trail.length;
  for (const [x, y] of s.trail) grid[idx(x, y)] = LAND;
  s.trail = [];
  // Flood fill the area of each asteroid (areas numbered from 1).
  const area = new Int32Array(GRID * GRID);
  const sizes = [0];
  const cellOf = (a) => idx(Math.max(1, Math.min(GRID - 2, Math.round(a.x))), Math.max(1, Math.min(GRID - 2, Math.round(a.y))));
  for (const a of s.asteroids) {
    const start = cellOf(a);
    if (grid[start] !== EMPTY || area[start]) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [start];
    area[start] = id;
    while (stack.length) {
      const i = stack.pop();
      n += 1;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      for (const [dx, dy] of Object.values(DIRS)) {
        const j = idx(x + dx, y + dy);
        if (inside(x + dx, y + dy) && !area[j] && grid[j] === EMPTY) { area[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  // An asteroid with no empty cell under it is shut in completely (an area of 0).
  const kills = [];
  s.asteroids = s.asteroids.filter((a) => {
    const zone = sizes[area[cellOf(a)]] || 0;
    if (zone > limitCells(a.size)) return true;
    kills.push({ size: a.size, zone, x: a.x, y: a.y });
    return false;
  });
  const alive = new Set(s.asteroids.map((a) => area[cellOf(a)]));
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY && !alive.has(area[i])) { grid[i] = LAND; closed += 1; }
  }
  s.claimed = claimedShare(grid);
  return { closed, kills };
}

/** The ship is hit: the trail vanishes and the ship goes back where it started drawing. */
export function loseTrail(s) {
  if (s.trail.length) {
    const [fx, fy] = s.trail[0];
    for (const [x, y] of s.trail) s.grid[idx(x, y)] = EMPTY;
    s.trail = [];
    // Back to the land cell the trail started from.
    for (const [dx, dy] of Object.values(DIRS)) {
      if (inside(fx + dx, fy + dy) && s.grid[idx(fx + dx, fy + dy)] === LAND) { s.ship.x = fx + dx; s.ship.y = fy + dy; return; }
    }
  }
}

/** Moves an asteroid (continuous position, in cells); it bounces off the land. Returns true if it cuts the trail. */
export function moveAsteroid(s, a, dt, rand = Math.random) {
  const { radius, speed: k } = SIZES[a.size];
  const speed = s.spec.speed * k;
  // A little wandering.
  const turn = (rand() - 0.5) * 2.5 * dt;
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  [a.vx, a.vy] = [a.vx * c - a.vy * sn, a.vx * sn + a.vy * c];
  const solid = (x, y) => !inside(Math.round(x), Math.round(y)) || s.grid[idx(Math.round(x), Math.round(y))] === LAND;
  // Bounces a little before its centre touches the land, so the big ones don't sink in the walls.
  const reach = Math.max(0, radius - 1);
  let nx = a.x + a.vx * speed * dt;
  let ny = a.y + a.vy * speed * dt;
  if (solid(nx + Math.sign(a.vx) * reach, a.y) || solid(nx, a.y)) { a.vx = -a.vx; nx = a.x; }
  if (solid(a.x, ny + Math.sign(a.vy) * reach) || solid(a.x, ny)) { a.vy = -a.vy; ny = a.y; }
  if (solid(nx, ny)) { nx = a.x; ny = a.y; }
  a.x = nx;
  a.y = ny;
  a.phase += dt;
  // Touching the trail with its body cuts it.
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = Math.round(a.x) + dx;
      const y = Math.round(a.y) + dy;
      if (inside(x, y) && s.grid[idx(x, y)] === TRAIL) return true;
    }
  }
  return false;
}

const levelFactor = (level) => 1 + 0.25 * (level - 1);
/** Points for conquered cells (a little: destroying asteroids is the goal). */
export const capturePoints = (cells, level) => Math.round(cells * 0.2 * levelFactor(level));
/**
 * Points for the asteroids destroyed by one trail: up to ×2 for a tight area, and a combo
 * (+50 % per extra asteroid) when several go at once.
 */
export function killPoints(kills, level) {
  if (!kills.length) return 0;
  const base = kills.reduce((t, k) => t + SIZES[k.size].points * (2 - Math.min(1, k.zone / limitCells(k.size))), 0);
  return Math.round(base * (1 + 0.5 * (kills.length - 1)) * levelFactor(level));
}
/** Planet bonus. */
export const levelBonus = (level) => 2000 * level;
/** The most a planet can give (every cell, every asteroid at once in no room): for the server check. */
export function maxPlanetScore(level) {
  const kills = levelSpec(level).sizes.map((size) => ({ size, zone: 0 }));
  return capturePoints(AREA, level) + killPoints(kills, level) + levelBonus(level);
}
