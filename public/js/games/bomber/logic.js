// Jimmy Bomber: the rules, shared by the server (which runs the arena) and the page (which
// moves its own alien at once and draws the rest). Positions are in tiles: a player standing in
// the middle of cell (3, 5) is at x = 3.5, y = 5.5.

export const W = 15;
export const H = 13;
export const EMPTY = 0;
export const WALL = 1;
export const CRATE = 2;

export const MAX_PLAYERS = 4;
export const TICK_MS = 50; // the server's step (20 per second)
export const FUSE = 2.4; // seconds before a bomb blows
export const FLAME = 0.55; // seconds a flame stays
export const ROUND_TIME = 120; // then the arena closes in
export const CLOSE_EVERY = 0.22; // one cell of the closing spiral every …
export const CRATE_SHARE = 0.72;
export const BONUS_SHARE = 0.32; // crates hiding a bonus
export const WIN_TARGETS = [1, 2, 3, 5];

export const BONUSES = {
  bomb: { emoji: '💣', name: 'Bombe en plus', max: 8 },
  fire: { emoji: '🔥', name: 'Portée +1', max: 10 },
  speed: { emoji: '⚡', name: 'Vitesse', max: 5 },
};
const BONUS_KEYS = Object.keys(BONUSES);

export const COLORS = ['#7dffb3', '#ff6b9a', '#38c8ff', '#ffb938'];
export const SPAWNS = [[1, 1], [W - 2, H - 2], [W - 2, 1], [1, H - 2]];

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_KEYS = Object.keys(DIRS);

export const speedOf = (p) => 3.4 + 0.55 * (p.speed || 0);
export const cellOf = (v) => Math.floor(v);
export const key = (x, y) => y * W + x;

/** A small seeded random (mulberry32), so a round can be replayed in the tests. */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The arena: a frame of walls, a pillar every other cell, crates elsewhere (not near the spawns). */
export function newGrid(rand) {
  const grid = new Array(W * H).fill(EMPTY);
  const hidden = {}; // cell -> bonus under a crate
  const nearSpawn = (x, y) => SPAWNS.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x % 2 === 0 && y % 2 === 0)) grid[key(x, y)] = WALL;
      else if (!nearSpawn(x, y) && rand() < CRATE_SHARE) {
        grid[key(x, y)] = CRATE;
        if (rand() < BONUS_SHARE) hidden[key(x, y)] = BONUS_KEYS[Math.floor(rand() * BONUS_KEYS.length)];
      }
    }
  }
  return { grid, hidden };
}

/** The closing spiral: every free cell, from the edge inwards. */
export function spiral() {
  const out = [];
  let x0 = 1; let y0 = 1; let x1 = W - 2; let y1 = H - 2;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
    x0++; y0++; x1--; y1--;
  }
  return out.filter(([x, y]) => !(x % 2 === 0 && y % 2 === 0));
}

/**
 * A new round. `players`: [{ id, bot }] in slot order. Each gets a spawn corner, 1 bomb, range 2.
 */
export function newRound(players, seed = Date.now()) {
  const rand = rng(seed);
  const { grid, hidden } = newGrid(rand);
  return {
    seed,
    grid,
    hidden,
    bonuses: {}, // cell -> bonus lying on the ground
    bombs: [], // { id, x, y, owner, range, left }
    flames: [], // { x, y, left, owner }
    players: players.map((p, i) => ({
      id: p.id, bot: Boolean(p.bot), slot: i, x: SPAWNS[i][0] + 0.5, y: SPAWNS[i][1] + 0.5, dir: 'down',
      alive: true, bombs: 1, range: 2, speed: 0, kills: 0, killedBy: null,
    })),
    t: 0,
    closing: null, // index in the spiral once the arena closes
    closeAcc: 0,
    nextBomb: 1,
    rand,
  };
}

export const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const bombAt = (s, x, y) => s.bombs.find((b) => b.x === x && b.y === y);

/** Can `p` stand in cell (x, y)? Walls, crates and bombs block (not the bomb under its feet). */
export function free(s, x, y, p = null) {
  if (!inside(x, y) || s.grid[key(x, y)] !== EMPTY) return false;
  if (bombAt(s, x, y) && !(p && cellOf(p.x) === x && cellOf(p.y) === y)) return false;
  return true;
}

/**
 * Moves `p` for `dt` seconds towards `dir`, along the lanes: the alien lines up on the row (or
 * the column) before entering the next cell, and slides round a corner when it is a little off.
 */
export function move(s, p, dir, dt) {
  if (!p.alive || !DIRS[dir]) return;
  p.dir = dir;
  const [dx, dy] = DIRS[dir];
  let left = speedOf(p) * dt;
  const horizontal = dx !== 0;
  const along = horizontal ? 'x' : 'y';
  const across = horizontal ? 'y' : 'x';
  const step = horizontal ? dx : dy;
  for (let guard = 0; guard < 4 && left > 1e-6; guard++) {
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    const lane = (horizontal ? cy : cx) + 0.5;
    const off = lane - p[across];
    const nx = cx + dx;
    const ny = cy + dy;
    const centre = (horizontal ? cx : cy) + 0.5;
    const ahead = (p[along] - centre) * step; // how far past the centre, in the direction of travel
    if (free(s, nx, ny, p)) {
      if (Math.abs(off) > 1e-6) { // line up first
        const c = Math.min(left, Math.abs(off));
        p[across] += Math.sign(off) * c;
        left -= c;
        continue;
      }
      p[along] += step * left;
      left = 0;
    } else if (ahead < -1e-6) { // walk up to the middle of the cell
      const c = Math.min(left, -ahead);
      p[along] += step * c;
      left -= c;
    } else {
      // Blocked: slide towards the neighbour lane when the alien already leans into it.
      const side = Math.sign(-off) || 0;
      if (Math.abs(off) > 0.12 && side) {
        const sx = horizontal ? cx + dx : cx + side;
        const sy = horizontal ? cy + side : cy + dy;
        const bx = horizontal ? cx : cx + side;
        const by = horizontal ? cy + side : cy;
        if (free(s, sx, sy, p) && free(s, bx, by, p)) {
          const c = Math.min(left, 0.5 - Math.abs(off) + 0.001);
          p[across] += side * c;
          left -= c;
          continue;
        }
      }
      if (ahead > 0) p[along] = centre; // never past the middle of a blocked way
      left = 0;
    }
  }
}

/** Drops a bomb under `p` if it has one left and the cell is free of bombs. */
export function dropBomb(s, p) {
  if (!p.alive) return null;
  const x = cellOf(p.x);
  const y = cellOf(p.y);
  if (bombAt(s, x, y) || s.bombs.filter((b) => b.owner === p.id).length >= p.bombs) return null;
  const b = { id: s.nextBomb++, x, y, owner: p.id, range: p.range, left: FUSE };
  s.bombs.push(b);
  return b;
}

/** The cells a bomb at (x, y) with `range` would burn (stops at walls, burns the first crate). */
export function blastCells(s, x, y, range) {
  const out = [[x, y]];
  for (const [dx, dy] of Object.values(DIRS)) {
    for (let i = 1; i <= range; i++) {
      const cx = x + dx * i;
      const cy = y + dy * i;
      if (!inside(cx, cy)) break;
      const t = s.grid[key(cx, cy)];
      if (t === WALL) break;
      out.push([cx, cy]);
      if (t === CRATE) break;
    }
  }
  return out;
}

/**
 * One step of `dt` seconds: fuses, explosions (in chains), flames, burnt crates, bonuses, deaths,
 * then the closing arena. Returns the events of the step, for sounds and messages.
 */
export function step(s, dt) {
  const events = [];
  s.t += dt;
  for (const f of s.flames) f.left -= dt;
  s.flames = s.flames.filter((f) => f.left > 0);
  for (const b of s.bombs) b.left -= dt;
  // Explosions, in chains: a flame reaching a bomb sets it off at once.
  let blowing = s.bombs.filter((b) => b.left <= 0);
  const burnt = new Set();
  while (blowing.length) {
    const next = [];
    for (const b of blowing) {
      s.bombs = s.bombs.filter((o) => o !== b);
      events.push({ type: 'boom', x: b.x, y: b.y, owner: b.owner });
      for (const [x, y] of blastCells(s, b.x, b.y, b.range)) {
        const k = key(x, y);
        if (s.grid[k] === CRATE) burnt.add(k);
        else if (s.bonuses[k]) delete s.bonuses[k]; // a bonus on the ground burns
        s.flames.push({ x, y, left: FLAME, owner: b.owner });
        const other = bombAt(s, x, y);
        if (other && !next.includes(other) && !blowing.includes(other)) next.push(other);
      }
    }
    blowing = next;
  }
  for (const k of burnt) {
    s.grid[k] = EMPTY;
    if (s.hidden[k]) { s.bonuses[k] = s.hidden[k]; delete s.hidden[k]; }
    events.push({ type: 'crate', x: k % W, y: Math.floor(k / W) });
  }
  // Flames kill; bonuses are picked up.
  const flameAt = new Map(s.flames.map((f) => [key(f.x, f.y), f]));
  for (const p of s.players) {
    if (!p.alive) continue;
    const k = key(cellOf(p.x), cellOf(p.y));
    const f = flameAt.get(k);
    if (f) {
      p.alive = false;
      p.killedBy = f.owner;
      const killer = s.players.find((o) => o.id === f.owner);
      if (killer && killer !== p) killer.kills += 1;
      events.push({ type: 'death', id: p.id, by: f.owner });
      continue;
    }
    const bonus = s.bonuses[k];
    if (bonus) {
      delete s.bonuses[k];
      if (bonus === 'bomb') p.bombs = Math.min(BONUSES.bomb.max, p.bombs + 1);
      if (bonus === 'fire') p.range = Math.min(BONUSES.fire.max, p.range + 1);
      if (bonus === 'speed') p.speed = Math.min(BONUSES.speed.max, p.speed + 1);
      events.push({ type: 'bonus', id: p.id, bonus });
    }
  }
  // Time is up: the arena closes in, one cell after the other.
  if (s.t >= ROUND_TIME) {
    if (s.closing === null) { s.closing = 0; s.spiral = spiral(); events.push({ type: 'closing' }); }
    s.closeAcc += dt;
    while (s.closeAcc >= CLOSE_EVERY && s.closing < s.spiral.length) {
      s.closeAcc -= CLOSE_EVERY;
      const [x, y] = s.spiral[s.closing++];
      const k = key(x, y);
      s.grid[k] = WALL;
      delete s.bonuses[k];
      delete s.hidden[k];
      s.bombs = s.bombs.filter((b) => !(b.x === x && b.y === y));
      events.push({ type: 'wall', x, y });
      for (const p of s.players) {
        if (p.alive && cellOf(p.x) === x && cellOf(p.y) === y) {
          p.alive = false;
          events.push({ type: 'death', id: p.id, by: null });
        }
      }
    }
  }
  return events;
}

export const alive = (s) => s.players.filter((p) => p.alive);

// ---- bots -------------------------------------------------------------------------

/** For every cell, the time left before a flame reaches it (Infinity when safe). */
export function dangerMap(s) {
  const danger = new Array(W * H).fill(Infinity);
  // Chains: a bomb caught by another one blows with it.
  const bombs = s.bombs.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of bombs) {
      for (const [x, y] of blastCells(s, b.x, b.y, b.range)) {
        const o = bombs.find((c) => c.x === x && c.y === y);
        if (o && o.left > b.left) { o.left = b.left; changed = true; }
      }
    }
  }
  for (const b of bombs) {
    for (const [x, y] of blastCells(s, b.x, b.y, b.range)) {
      const k = key(x, y);
      danger[k] = Math.min(danger[k], b.left);
    }
  }
  for (const f of s.flames) danger[key(f.x, f.y)] = Math.min(danger[key(f.x, f.y)], f.left - FLAME); // burning until f.left
  if (s.closing !== null && s.spiral) {
    for (let i = s.closing; i < Math.min(s.spiral.length, s.closing + 12); i++) {
      const [x, y] = s.spiral[i];
      danger[key(x, y)] = Math.min(danger[key(x, y)], (i - s.closing) * CLOSE_EVERY);
    }
  }
  return danger;
}

/** Breadth-first walk from (x, y): distance and first step of every reachable cell. */
function walk(s, x, y, p, danger, speed) {
  const dist = new Map([[key(x, y), 0]]);
  const first = new Map();
  const queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.shift();
    const d = dist.get(key(cx, cy));
    for (const dir of DIR_KEYS) {
      const [dx, dy] = DIRS[dir];
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (dist.has(k) || !free(s, nx, ny, null)) continue;
      // Don't be in a cell while it burns (from `danger` to `danger + FLAME`).
      const enter = (d + 0.4) / speed - 0.1;
      const leave = (d + 1.6) / speed + 0.1;
      if (danger[k] < leave && danger[k] + FLAME > enter) continue;
      dist.set(k, d + 1);
      first.set(k, d === 0 ? dir : first.get(key(cx, cy)));
      queue.push([nx, ny]);
    }
  }
  return { dist, first };
}

/** Would `p` still find a safe cell after dropping a bomb right here? */
function canEscape(s, p) {
  const x = cellOf(p.x);
  const y = cellOf(p.y);
  const fake = { ...s, bombs: [...s.bombs, { x, y, range: p.range, left: FUSE, owner: p.id }] };
  const danger = dangerMap(fake);
  const { dist } = walk(fake, x, y, p, danger, speedOf(p));
  for (const [k, d] of dist) if (danger[k] === Infinity && d / speedOf(p) < FUSE - 0.9) return true;
  return false;
}

/**
 * A bot's choice for this step: { dir (or null to stand still), bomb }.
 * It flees the flames, picks bonuses, blows crates and hunts the other players.
 */
export function botThink(s, p) {
  const x = cellOf(p.x);
  const y = cellOf(p.y);
  const here = key(x, y);
  const danger = dangerMap(s);
  const speed = speedOf(p);
  const { dist, first } = walk(s, x, y, p, danger, speed);
  const centred = Math.abs(p.x - x - 0.5) < 0.12 && Math.abs(p.y - y - 0.5) < 0.12;
  const toward = (k) => first.get(k) || null;
  const nearest = (pred) => {
    let best = null;
    let bd = Infinity;
    for (const [k, d] of dist) if (d < bd && pred(k)) { best = k; bd = d; }
    return best;
  };
  // 1. In danger: run to the nearest safe cell.
  if (danger[here] !== Infinity) {
    let safe = nearest((k) => danger[k] === Infinity);
    if (safe === null) { // nowhere safe: the cell that burns last
      let late = -Infinity;
      for (const k of dist.keys()) if (danger[k] > late) { late = danger[k]; safe = k; }
    }
    return { dir: safe === here ? null : toward(safe), bomb: false };
  }
  // 2. A good spot to drop a bomb: an enemy in line of fire, or a crate next to us.
  const enemies = s.players.filter((o) => o.alive && o.id !== p.id);
  const blast = blastCells(s, x, y, p.range);
  const hitsEnemy = enemies.some((e) => blast.some(([bx, by]) => bx === cellOf(e.x) && by === cellOf(e.y)));
  const nextToCrate = Object.values(DIRS).some(([dx, dy]) => s.grid[key(x + dx, y + dy)] === CRATE);
  if (centred && (hitsEnemy || (nextToCrate && s.rand() < 0.7)) && canEscape(s, p)) {
    return { dir: null, bomb: true };
  }
  // 3. Somewhere to go: a bonus, then a crate to blow, then the closest enemy.
  const safeCell = (k) => danger[k] === Infinity;
  let target = nearest((k) => k !== here && s.bonuses[k] && safeCell(k));
  if (target === null) {
    target = nearest((k) => {
      const cx = k % W;
      const cy = Math.floor(k / W);
      return safeCell(k) && Object.values(DIRS).some(([dx, dy]) => s.grid[key(cx + dx, cy + dy)] === CRATE);
    });
    if (target === here) target = null;
  }
  if (target === null && enemies.length) {
    target = nearest((k) => k !== here && safeCell(k) && enemies.some((e) => Math.abs(cellOf(e.x) - (k % W)) + Math.abs(cellOf(e.y) - Math.floor(k / W)) <= 1));
  }
  if (target === null) {
    // Wander a little.
    const options = DIR_KEYS.filter((d) => { const [dx, dy] = DIRS[d]; const k = key(x + dx, y + dy); return free(s, x + dx, y + dy, null) && safeCell(k); });
    return { dir: options.length && s.rand() < 0.3 ? options[Math.floor(s.rand() * options.length)] : null, bomb: false };
  }
  return { dir: toward(target), bomb: false };
}

/** Moves a bot for `dt` along its choice: it keeps to the cell centres to turn cleanly. */
export function botMove(s, p, dt) {
  const choice = botThink(s, p);
  if (choice.bomb) dropBomb(s, p);
  if (choice.dir) move(s, p, choice.dir, dt);
  else {
    // Stand in the middle of the cell.
    const cx = cellOf(p.x) + 0.5;
    const cy = cellOf(p.y) + 0.5;
    const c = speedOf(p) * dt;
    p.x += Math.max(-c, Math.min(c, cx - p.x));
    p.y += Math.max(-c, Math.min(c, cy - p.y));
  }
  return choice;
}

/**
 * Is the position a player reports plausible? Close enough to the last one for the time gone,
 * and on a cell it can stand on.
 */
export function plausibleMove(s, p, x, y, seconds) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const reach = speedOf(p) * Math.max(seconds, 0.05) * 1.35 + 0.25;
  if (Math.hypot(x - p.x, y - p.y) > reach) return false;
  const cx = cellOf(x);
  const cy = cellOf(y);
  if (!inside(cx, cy) || s.grid[key(cx, cy)] !== EMPTY) return false;
  const b = bombAt(s, cx, cy);
  if (b && !(cellOf(p.x) === cx && cellOf(p.y) === cy)) return false;
  return true;
}
