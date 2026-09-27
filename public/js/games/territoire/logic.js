// Territoire — Qix-like rules on a grid (pure: no DOM, testable with node).
//
// Jimmy's ship moves along the edges of the conquered land. Going into the empty zone draws a
// trail; closing it on the land conquers every empty area without a Gloubi (the space jellyfish
// bouncing in the void). The Gloubi touching the trail, or a sentinel drone patrolling the edges
// touching the ship, costs a life. Conquer 75 % of the zone to go to the next level.

export const GRID = 100; // cells per side
export const EMPTY = 0;
export const LAND = 1;
export const TRAIL = 2;
export const GOAL = 0.75; // share of the zone to conquer
export const LIVES = 3;
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const idx = (x, y) => y * GRID + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID;

/** Enemies and speeds of a level (cells per second). */
export function levelSpec(level) {
  return {
    gloubis: 1 + Math.floor((level - 1) / 3),
    gloubiSpeed: 16 + 2 * Math.min(level, 12),
    sentinels: Math.min(1 + Math.floor(level / 2), 6),
    sentinelSpeed: 10 + Math.min(level, 10),
  };
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
  const gloubis = [...Array(spec.gloubis)].map(() => {
    const a = rand() * Math.PI * 2;
    return { x: 30 + rand() * 40, y: 25 + rand() * 40, vx: Math.cos(a), vy: Math.sin(a), phase: rand() * 6 };
  });
  const sentinels = [...Array(spec.sentinels)].map((_, i) => ({ x: Math.round((i + 1) * GRID / (spec.sentinels + 1)), y: 0, px: -1, py: -1, t: 0 }));
  return {
    level, grid, spec, gloubis, sentinels,
    ship: { x: GRID >> 1, y: GRID - 1 },
    trail: [], // cells of the trail being drawn, in order
    claimed: 0, // share of the inner zone conquered
  };
}

/** A land cell next to the void (8 neighbours): where the ship and the sentinels can move. */
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
  return land / ((GRID - 2) ** 2);
}

/**
 * One step of the ship. On the land it follows the edges; into the void it draws a trail;
 * back on the land the trail closes. Returns { moved, closed: cells conquered or 0 }.
 */
export function moveShip(s, dir) {
  const [dx, dy] = DIRS[dir] || [0, 0];
  const nx = s.ship.x + dx;
  const ny = s.ship.y + dy;
  if (!inside(nx, ny) || (!dx && !dy)) return { moved: false, closed: 0 };
  const cell = s.grid[idx(nx, ny)];
  const drawing = s.trail.length > 0;
  if (cell === TRAIL) return { moved: false, closed: 0 }; // never across its own trail
  if (cell === LAND) {
    if (!drawing && !isEdge(s.grid, nx, ny)) return { moved: false, closed: 0 }; // stay on the edges
    s.ship.x = nx;
    s.ship.y = ny;
    return { moved: true, closed: drawing ? closeTrail(s) : 0 };
  }
  // Into the void: draw.
  s.grid[idx(nx, ny)] = TRAIL;
  s.trail.push([nx, ny]);
  s.ship.x = nx;
  s.ship.y = ny;
  return { moved: true, closed: 0 };
}

/**
 * The trail touches the land: it becomes land, and so does every empty area without a Gloubi.
 * Returns how many cells were conquered.
 */
export function closeTrail(s) {
  const { grid } = s;
  let gained = s.trail.length;
  for (const [x, y] of s.trail) grid[idx(x, y)] = LAND;
  s.trail = [];
  // Flood fill from every Gloubi: those areas stay empty.
  const keep = new Uint8Array(GRID * GRID);
  const stack = [];
  for (const g of s.gloubis) {
    const gx = Math.max(1, Math.min(GRID - 2, Math.round(g.x)));
    const gy = Math.max(1, Math.min(GRID - 2, Math.round(g.y)));
    if (grid[idx(gx, gy)] === EMPTY && !keep[idx(gx, gy)]) { keep[idx(gx, gy)] = 1; stack.push(idx(gx, gy)); }
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const j = idx(x + dx, y + dy);
      if (inside(x + dx, y + dy) && !keep[j] && grid[j] === EMPTY) { keep[j] = 1; stack.push(j); }
    }
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY && !keep[i]) { grid[i] = LAND; gained += 1; }
  }
  s.claimed = claimedShare(grid);
  // Sentinels caught inside the new land go back to the nearest edge.
  for (const t of s.sentinels) if (!isEdge(grid, t.x, t.y)) Object.assign(t, nearestEdge(grid, t.x, t.y), { px: -1, py: -1 });
  return gained;
}

/** Nearest edge cell (breadth-first search over the grid). */
export function nearestEdge(grid, x, y) {
  const seen = new Uint8Array(GRID * GRID);
  const queue = [[x, y]];
  seen[idx(x, y)] = 1;
  for (let q = 0; q < queue.length; q++) {
    const [cx, cy] = queue[q];
    if (isEdge(grid, cx, cy)) return { x: cx, y: cy };
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (inside(nx, ny) && !seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; queue.push([nx, ny]); }
    }
  }
  return { x, y };
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

/** One step of a sentinel along the edges (never straight back unless it has to). */
export function moveSentinel(s, t, rand = Math.random) {
  const options = Object.values(DIRS).map(([dx, dy]) => [t.x + dx, t.y + dy])
    .filter(([x, y]) => isEdge(s.grid, x, y) && !(x === t.px && y === t.py));
  const [nx, ny] = options.length ? options[Math.floor(rand() * options.length)] : [t.px, t.py];
  if (nx < 0) return;
  t.px = t.x;
  t.py = t.y;
  t.x = nx;
  t.y = ny;
}

/** Moves a Gloubi (continuous position, in cells); it bounces off the land. Returns true if it cuts the trail. */
export function moveGloubi(s, g, dt, rand = Math.random) {
  const speed = s.spec.gloubiSpeed;
  // A little wandering, like a jellyfish.
  const turn = (rand() - 0.5) * 2.5 * dt;
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  [g.vx, g.vy] = [g.vx * c - g.vy * sn, g.vx * sn + g.vy * c];
  const solid = (x, y) => !inside(Math.round(x), Math.round(y)) || s.grid[idx(Math.round(x), Math.round(y))] === LAND;
  let nx = g.x + g.vx * speed * dt;
  let ny = g.y + g.vy * speed * dt;
  if (solid(nx, g.y)) { g.vx = -g.vx; nx = g.x; }
  if (solid(g.x, ny)) { g.vy = -g.vy; ny = g.y; }
  if (solid(nx, ny)) { nx = g.x; ny = g.y; }
  g.x = nx;
  g.y = ny;
  g.phase += dt;
  // Body of about 3 cells: touching the trail cuts it.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(g.x) + dx;
      const y = Math.round(g.y) + dy;
      if (inside(x, y) && s.grid[idx(x, y)] === TRAIL) return true;
    }
  }
  return false;
}

/** Points for conquered cells: more for a bigger area at once, and for higher levels. */
export const capturePoints = (cells, level) => Math.round(cells * (1 + cells / 800) * (1 + 0.25 * (level - 1)));
/** Level bonus: 1000 per level, plus 500 per % above the goal. */
export const levelBonus = (level, share) => 1000 * level + Math.max(0, Math.round((share - GOAL) * 100)) * 500;
