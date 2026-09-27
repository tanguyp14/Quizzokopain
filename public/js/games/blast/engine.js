// Jimmy Blast — simulation and canvas rendering.
// The world is a fixed 1000 × 1000 square, only scaled to the screen (same field
// and same number of blocks for everyone, whatever the device), generated for each stage:
// random polygons (Voronoi cells with gaps and clearings) that ships fly into.
import {
  TIERS, fleetDamage, clickDamage, critChance, CRIT_FACTOR, speedFactor, stageHp, BREAK_BONUS, stageClearBonus, earn, BOOST,
  boostDuration, GOLD_FACTOR, goldChance, BOMB_CHANCE, BOMB, isBossStage, BOSS_HP_FACTOR, bossTime, ufoInterval, UFO_FRENZY,
  themeFor, track, rewardCredits, planetName, fmt, hasModule, hasFingerModule,
  forgeOpen, FORGE, RESOURCES, resourceFor, oreAmount, collectOre, bounceFactor,
} from './logic.js';

const WORLD_W = 1000;
const BASE_SPEED = 340; // world units per second
const MAX_PARTICLES = 500;
const TAP = 8; // damage-meter slot of the player's taps (0-7 are the ship tiers)
const DPS_SLICE = 0.5; // seconds per slice of the damage meter
const DPS_SLICES = 30; // → damage per second averaged over the last 15 s
const DRILL = { every: 0.2, share: 0.4, boosted: 0.7 }; // frigates inside a block: 40 % (70 % with the module) 5×/s
const rand = (a, b) => a + Math.random() * (b - a);

// ---- geometry ------------------------------------------------------------------------------

/** Keeps the part of a polygon on the side of the line where a·p <= b (Sutherland–Hodgman). */
function clip(poly, ax, ay, b) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = ax * p[0] + ay * p[1] - b;
    const dq = ax * q[0] + ay * q[1] - b;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Random blocks: Voronoi cells of scattered seeds, minus one or two clearings for the ships. */
function generateBlocks(W, H, stage, save) {
  const theme = themeFor(stage);
  const pickColor = () => theme.colors[Math.floor(Math.random() * theme.colors.length)];
  if (isBossStage(stage)) return generateBoss(W, H, stage, theme);
  const seeds = [];
  const count = Math.round(rand(24, 32));
  const minDist = Math.sqrt((W * H) / count) * 0.6;
  for (let tries = 0; seeds.length < count && tries < 3000; tries++) {
    const s = [rand(0, W), rand(0, H)];
    if (seeds.every((o) => Math.hypot(o[0] - s[0], o[1] - s[1]) > minDist)) seeds.push(s);
  }
  const clearings = [{ x: rand(W * 0.3, W * 0.7), y: rand(H * 0.3, H * 0.7), r: Math.min(W, H) * rand(0.25, 0.33) }];
  if (Math.random() < 0.6) clearings.push({ x: rand(0, W), y: rand(0, H), r: Math.min(W, H) * rand(0.12, 0.2) });

  const blocks = [];
  for (const s of seeds) {
    if (clearings.some((c) => Math.hypot(c.x - s[0], c.y - s[1]) < c.r)) continue;
    let poly = [[0, 0], [W, 0], [W, H], [0, H]];
    for (const o of seeds) {
      if (o === s) continue;
      // Half-plane of the points closer to s than to o.
      const ax = o[0] - s[0];
      const ay = o[1] - s[1];
      poly = clip(poly, ax, ay, (o[0] ** 2 + o[1] ** 2 - s[0] ** 2 - s[1] ** 2) / 2);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    // Gap between blocks: pull every corner towards the centre.
    const c = centroid(poly);
    const gap = 7;
    poly = poly.map(([x, y]) => {
      const d = Math.hypot(x - c[0], y - c[1]) || 1;
      return [x - ((x - c[0]) / d) * gap, y - ((y - c[1]) / d) * gap];
    });
    const a = area(poly);
    if (a < 900) continue;
    const r = Math.random();
    const gold = goldChance(save);
    const ore = forgeOpen(save) ? FORGE.oreChance : 0;
    const kind = r < gold ? 'gold' : r < gold + BOMB_CHANCE ? 'bomb' : r < gold + BOMB_CHANCE + ore ? 'ore' : null;
    const color = kind === 'gold' ? '#ffd166' : kind === 'bomb' ? '#3a2233' : pickColor();
    blocks.push({ poly, c, area: a, color, kind, flash: 0, alive: true });
  }
  const total = blocks.reduce((sum, b) => sum + b.area, 0);
  const hp = stageHp(stage);
  for (const b of blocks) {
    b.maxHp = (hp * b.area) / total;
    b.hp = b.maxHp;
    setBox(b);
  }
  return { blocks, spawn: clearings[0], theme };
}

/**
 * Planet sector: a round planet with thin rings in the middle (only the globe can be hit);
 * the fleet starts from a corner.
 */
function generateBoss(W, H, stage, theme) {
  const c = [W / 2, H / 2];
  const R = 235;
  const n = 48;
  const poly = [...Array(n).keys()].map((i) => [c[0] + Math.cos((i / n) * Math.PI * 2) * R, c[1] + Math.sin((i / n) * Math.PI * 2) * R]);
  const pick = () => theme.colors[Math.floor(Math.random() * theme.colors.length)];
  const b = {
    poly, c, area: area(poly), color: pick(), kind: 'boss', flash: 0, alive: true,
    planet: {
      R,
      name: planetName(stage),
      tilt: rand(-0.45, 0.45),
      rings: Math.random() < 0.85 ? [1.45, 1.6, 1.72, 1.9].filter(() => Math.random() < 0.8) : [],
      ringColor: pick(),
      bands: [...Array(5).keys()].map(() => ({ y: rand(-0.9, 0.9), h: rand(0.05, 0.16), color: pick() })),
      craters: [...Array(6).keys()].map(() => ({ a: rand(0, Math.PI * 2), d: rand(0, 0.75), r: rand(0.05, 0.13) })),
    },
  };
  b.maxHp = stageHp(stage) * BOSS_HP_FACTOR;
  b.hp = b.maxHp;
  setBox(b);
  const corner = [[110, 110], [W - 110, 110], [110, H - 110], [W - 110, H - 110]][Math.floor(Math.random() * 4)];
  return { blocks: [b], spawn: { x: corner[0], y: corner[1] }, theme };
}

function setBox(b) {
  const xs = b.poly.map((p) => p[0]);
  const ys = b.poly.map((p) => p[1]);
  b.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const UFO_IMG = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: '/emoji/1f6f8.webp' });

// ---- engine ----------------------------------------------------------------------------------

/**
 * hooks: onEarn(amount) · onStage(stage) · onBoss(won) · onUfo(kind, amount) · onTheme(name)
 * The engine mutates `save` (money, stage, stats) through logic.js helpers.
 */
export function createBlast(canvas, save, hooks = {}) {
  const ctx = canvas.getContext('2d');
  const W = WORLD_W;
  const H = WORLD_W;
  let blocks = [];
  let spawn = { x: W / 2, y: H / 2 };
  let theme = themeFor(save.stage);
  let ships = [];
  let particles = [];
  let texts = [];
  let running = false;
  let raf = 0;
  let last = 0;
  let now = 0;
  let boostUntil = 0;
  let frenzyUntil = 0;
  let nextStageAt = 0;
  let bossDeadline = 0;
  let ufo = null;
  let nextUfoAt = 0;
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  let greenUntil = 0;
  let shake = 0;

  const scheduleUfo = () => { const [a, b] = ufoInterval(save); nextUfoAt = now + rand(a, b); };

  function newStage() {
    const previous = theme;
    ({ blocks, spawn, theme } = generateBlocks(W, H, save.stage, save));
    for (const s of ships) { s.x = spawn.x + rand(-40, 40); s.y = spawn.y + rand(-40, 40); s.target = null; s.trail = []; s.through = null; }
    bossDeadline = isBossStage(save.stage) ? now + bossTime(save) : 0;
    if (bossDeadline) floatText(W / 2, 150, `🪐 Conquiers ${planetName(save.stage)} !`, '#ffffff', 2.4, 1.5);
    if (previous !== theme) {
      floatText(W / 2, H - 120, `Zone : ${theme.name}`, '#ffffff', 2.5, 1.4);
      hooks.onTheme?.(theme.name);
    }
  }

  function makeShip(tier, drone = false) {
    const a = rand(0, Math.PI * 2);
    return {
      tier, drone, x: spawn.x + rand(-30, 30), y: spawn.y + rand(-30, 30), vx: Math.cos(a) * 100, vy: Math.sin(a) * 100,
      target: null, retreat: 0, trail: [], trailT: 0, through: null,
    };
  }

  /** Matches the ships on screen to the fleet in the save (mother ships bring 2 drones each). */
  function syncFleet() {
    const sync = (t, drone, want) => {
      const have = ships.filter((s) => s.tier === t && s.drone === drone);
      for (let i = have.length; i < want; i++) ships.push(makeShip(t, drone));
      for (let i = want; i < have.length; i++) ships.splice(ships.indexOf(have[i]), 1);
    };
    TIERS.forEach((_, t) => sync(t, false, save.tiers[t].count));
    sync(6, true, save.tiers[6].count * (hasModule(save, 6) ? 4 : 2));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const scale = Math.min(r.width / W, r.height / H);
    view = { scale, ox: (r.width - W * scale) / 2, oy: (r.height - H * scale) / 2, dpr };
  }

  // ---- damage & money ----

  const damageFactor = () => (now < boostUntil ? BOOST.factor : 1) * (now < frenzyUntil ? UFO_FRENZY.factor : 1);

  /** One hit. opts: { click, critBonus, splash } — splash hits are quiet and never chain. */
  function hit(block, base, x, y, opts = {}) {
    if (!block.alive) return 0;
    const crit = !opts.splash && Math.random() < critChance(save) + (opts.critBonus || 0);
    const dmg = base * (opts.splash ? 1 : damageFactor()) * (crit ? CRIT_FACTOR : 1);
    const dealt = Math.min(dmg, block.hp);
    if (opts.tier !== undefined) meter.acc[opts.tier] += dealt;
    block.hp -= dealt;
    block.flash = opts.splash ? Math.max(block.flash, 0.4) : 1;
    const gained = earn(save, dealt * (block.kind === 'gold' ? GOLD_FACTOR : 1));
    hooks.onEarn?.(gained);
    if (!opts.splash) {
      sparks(x, y, block.kind === 'gold' ? '#ffe08a' : block.color, crit ? 10 : opts.click ? 6 : 2);
      if (crit) floatText(x, y, `CRIT ${fmtShort(dmg)}`, '#ffd166', 1);
      else if (opts.click) floatText(x, y, fmtShort(dmg), '#fff', 0.8);
    }
    if (block.hp <= block.maxHp * 1e-9) breakBlock(block);
    return dmg;
  }

  function splash(x, y, dmg, radius, except, tier) {
    for (const b of blocks) {
      if (!b.alive || b === except || Math.hypot(b.c[0] - x, b.c[1] - y) > radius) continue;
      hit(b, dmg, b.c[0], b.c[1], { splash: true, tier });
    }
    ring(x, y, radius);
  }

  function breakBlock(block) {
    block.alive = false;
    block.hp = 0;
    const bonus = earn(save, block.maxHp * BREAK_BONUS * (block.kind === 'gold' ? GOLD_FACTOR : 1));
    hooks.onEarn?.(bonus);
    track(save, 'blocks');
    if (block.kind === 'gold') track(save, 'golds');
    if (block.kind === 'ore') {
      const res = resourceFor(save.stage);
      const n = oreAmount(save.stage);
      collectOre(save, res, n);
      floatText(block.c[0], block.c[1] + 36, `+${n} ${RESOURCES[res].emoji}`, RESOURCES[res].color, 1.6, 1.3);
      sparks(block.c[0], block.c[1], RESOURCES[res].color, 16);
      hooks.onOre?.(res, n);
    }
    floatText(block.c[0], block.c[1], `+${fmtShort(bonus)}`, block.kind === 'gold' ? '#ffd166' : '#7dffb3', 1.1, block.kind === 'gold' ? 1.4 : 1);
    shards(block, block.kind === 'boss' ? 70 : 18);
    if (block.kind === 'bomb') {
      shake = Math.max(shake, 0.12);
      floatText(block.c[0], block.c[1] - 40, 'BOUM !', '#ff8a3d', 1.2, 1.5);
      for (const b of blocks) {
        if (b.alive && Math.hypot(b.c[0] - block.c[0], b.c[1] - block.c[1]) < BOMB.radius) hit(b, b.maxHp * BOMB.damage, b.c[0], b.c[1], { splash: true });
      }
      ring(block.c[0], block.c[1], BOMB.radius, '#ff8a3d');
    }
    if (blocks.every((b) => !b.alive) && !nextStageAt) clearStage();
  }

  function clearStage() {
    const boss = isBossStage(save.stage);
    const bonus2 = earn(save, stageClearBonus(save.stage) * (boss ? 8 : 1));
    hooks.onEarn?.(bonus2);
    track(save, 'sectors');
    if (boss) {
      track(save, 'bosses');
      if (forgeOpen(save)) {
        const res = resourceFor(save.stage);
        collectOre(save, res, FORGE.planetOre);
        floatText(W / 2, H / 2 + 60, `+${FORGE.planetOre} ${RESOURCES[res].emoji} ${RESOURCES[res].name}`, RESOURCES[res].color, 2.4, 1.2);
        hooks.onOre?.(res, FORGE.planetOre);
      }
      floatText(W / 2, H / 2 - 70, `🚩 ${planetName(save.stage)} conquise !`, '#ffd166', 2.6, 1.8);
      shake = 0.3;
      hooks.onBoss?.(true);
    }
    bossDeadline = 0;
    save.stage += 1;
    save.maxStage = Math.max(save.maxStage, save.stage);
    save.runBest = Math.max(save.runBest, save.stage);
    nextStageAt = now + (boss ? 1.6 : 0.9);
    greenUntil = now + 0.9;
    floatText(W / 2, H / 2, `Secteur ${save.stage} !`, '#ffffff', 2.2, 2);
    hooks.onStage?.(save.stage);
  }

  /** Planet not conquered in time: back to the previous sector to get stronger. */
  function failBoss() {
    bossDeadline = 0;
    for (const b of blocks) if (b.alive) { b.alive = false; shards(b, 30); }
    save.stage = Math.max(1, save.stage - 1);
    nextStageAt = now + 1.6;
    floatText(W / 2, H / 2, `${planetName(save.stage + 1)} résiste…`, '#ff6b8b', 2.4, 1.8);
    floatText(W / 2, H / 2 + 60, `Retour au secteur ${save.stage}`, '#ffffff', 2.4, 1.1);
    hooks.onBoss?.(false);
  }

  // ---- Jimmy's saucer ----

  function launchUfo() {
    const ltr = Math.random() < 0.5;
    ufo = { x: ltr ? -80 : W + 80, y: rand(120, H - 120), vx: (ltr ? 1 : -1) * rand(150, 200), t: 0 };
  }

  function catchUfo() {
    const kinds = ['credits', 'boost', 'frenzy'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const { x, y } = ufo;
    ufo = null;
    scheduleUfo();
    track(save, 'ufos');
    sparks(x, y, '#7dffb3', 30);
    ring(x, y, 120, '#7dffb3');
    let amount = 0;
    if (kind === 'credits') {
      amount = rewardCredits(save, 3);
      save.money += amount;
      save.totalEarned += amount;
      floatText(x, y, `🛸 +${fmtShort(amount)}`, '#7dffb3', 1.8, 1.4);
    } else if (kind === 'boost') {
      boostUntil = Math.max(boostUntil, now) + boostDuration(save);
      floatText(x, y, '🛸 Accélération offerte !', '#7dffb3', 1.8, 1.2);
    } else {
      frenzyUntil = now + UFO_FRENZY.duration;
      floatText(x, y, `🛸 Dégâts ×${UFO_FRENZY.factor} !`, '#7dffb3', 1.8, 1.3);
    }
    hooks.onUfo?.(kind, amount);
  }

  // ---- particles ----

  function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    p.max = p.life;
    particles.push(p);
  }
  function sparks(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(40, 220);
      addParticle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.5), size: rand(2, 4), color });
    }
  }
  function shards(block, n) {
    for (let i = 0; i < n; i++) {
      const p = block.poly[i % block.poly.length];
      const a = Math.atan2(p[1] - block.c[1], p[0] - block.c[0]) + rand(-0.6, 0.6);
      const v = rand(80, 320);
      addParticle({
        x: block.c[0] + (p[0] - block.c[0]) * rand(0.2, 0.8), y: block.c[1] + (p[1] - block.c[1]) * rand(0.2, 0.8),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.6, 1.2), size: rand(8, 22), color: block.color, rot: rand(0, 6), vr: rand(-6, 6), shard: true,
      });
    }
  }
  function ring(x, y, r, color = 'rgba(255,255,255,.8)') {
    addParticle({ x, y, vx: 0, vy: 0, life: 0.45, ring: r, color });
  }
  function floatText(x, y, text, color, life = 1, size = 1) {
    if (texts.length > 40) texts.shift();
    texts.push({ x, y, text, color, life, max: life, size });
  }

  // ---- simulation ----

  // Damage meter: real damage dealt per tier (drones count for their mother ship), over the last seconds.
  const meter = { acc: Array(TAP + 1).fill(0), slices: [], t: 0 };
  function tickMeter(dt) {
    meter.t += dt;
    if (meter.t < DPS_SLICE) return;
    // Each slice keeps the fleet size of that moment, for a per-ship average that does not jump on a purchase.
    meter.acc.counts = save.tiers.map((t) => t.count);
    meter.slices.push(meter.acc);
    if (meter.slices.length > DPS_SLICES) meter.slices.shift();
    meter.acc = Array(TAP + 1).fill(0);
    meter.t = 0;
  }
  function dpsPerShip(t) {
    const used = meter.slices.filter((sl) => sl.counts[t] > 0);
    if (!used.length) return 0;
    return used.reduce((sum, sl) => sum + sl[t] / sl.counts[t], 0) / (used.length * DPS_SLICE);
  }
  function dps(slot) {
    if (!meter.slices.length) return 0;
    return meter.slices.reduce((sum, sl) => sum + sl[slot], 0) / (meter.slices.length * DPS_SLICE);
  }

  function step(dt) {
    tickMeter(dt);
    tickAutoTap(dt);
    const speed = BASE_SPEED * speedFactor(save) * (now < boostUntil ? BOOST.factor : 1);
    const alive = blocks.filter((b) => b.alive);
    if (!alive.length && nextStageAt && now >= nextStageAt) { nextStageAt = 0; newStage(); return; }
    if (bossDeadline && now > bossDeadline && alive.length) failBoss();

    if (!ufo && now >= nextUfoAt) launchUfo();
    if (ufo) {
      ufo.t += dt;
      ufo.x += ufo.vx * dt;
      ufo.y += Math.sin(ufo.t * 3) * 40 * dt;
      if (ufo.x < -120 || ufo.x > W + 120) { ufo = null; scheduleUfo(); }
    }

    for (const s of ships) {
      if (!s.target?.alive && alive.length) {
        // Prefer a close block, with some randomness so the fleet spreads out.
        let best = null;
        let bestScore = Infinity;
        for (let i = 0; i < 4; i++) {
          const b = alive[Math.floor(Math.random() * alive.length)];
          const d = Math.hypot(b.c[0] - s.x, b.c[1] - s.y);
          if (d < bestScore) { bestScore = d; best = b; }
        }
        s.target = best;
      }
      if (s.retreat > 0) s.retreat -= dt;
      else if (s.target?.alive && !s.through) {
        const dx = s.target.c[0] - s.x;
        const dy = s.target.c[1] - s.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, dt * 4);
        s.vx += ((dx / d) * speed - s.vx) * k;
        s.vy += ((dy / d) * speed - s.vy) * k;
      }
      const v = Math.hypot(s.vx, s.vy) || 1;
      const max = speed * (s.drone ? 1.4 : 1.2) * (s.tier === 0 && hasModule(save, 0) ? 1.5 : 1);
      if (v > max) { s.vx *= max / v; s.vy *= max / v; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = Math.max(0, Math.min(W, s.x)); s.through = null; }
      if (s.y < 0 || s.y > H) { s.vy = -s.vy; s.y = Math.max(0, Math.min(H, s.y)); s.through = null; }

      // Piercing ships keep going through the block they already hit, damaging it all the way.
      if (s.through && (!s.through.alive || !inside(s.through.poly, s.x, s.y))) s.through = null;
      if (s.through) {
        s.drill -= dt;
        if (s.drill <= 0) {
          s.drill = DRILL.every;
          hit(s.through, fleetDamage(save, s.tier) * (hasModule(save, 2) ? DRILL.boosted : DRILL.share), s.x, s.y, { tier: s.tier });
        }
      }

      for (const b of alive) {
        if (!b.alive || b === s.through || s.x < b.box[0] || s.x > b.box[2] || s.y < b.box[1] || s.y > b.box[3] || !inside(b.poly, s.x, s.y)) continue;
        shipHit(s, b, speed);
        break;
      }

      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.035;
        s.trail.push([s.x, s.y, Math.atan2(s.vy, s.vx)]);
        if (s.trail.length > 10) s.trail.shift();
      }
    }

    for (const b of blocks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 6);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const t of texts) { t.y -= 40 * dt; t.life -= dt; }
    texts = texts.filter((t) => t.life > 0);
    shake = Math.max(0, shake - dt);
  }

  /** A ship reaches a block: damage plus the power of its tier. */
  function shipHit(s, b, speed) {
    const base = fleetDamage(save, s.tier) * (s.drone ? 0.15 : 1);
    const critBonus = s.tier === 3 ? (hasModule(save, 3) ? 0.5 : 0.25) : 0;
    const dmg = hit(b, base, s.x, s.y, { critBonus, tier: s.tier });
    if (!s.drone) {
      if (s.tier === 1 && hasModule(save, 1) && Math.random() < 0.3) hit(b, base, s.x, s.y, { tier: 1 });
      if (s.tier === 4) splash(s.x, s.y, dmg * (hasModule(save, 4) ? 0.5 : 0.3), hasModule(save, 4) ? 240 : 160, b, 4);
      if (s.tier === 5) splash(s.x, s.y, dmg * (hasModule(save, 5) ? 1 : 0.6), 280, b, 5);
      if (s.tier === 7) {
        const share = hasModule(save, 7) ? 0.25 : 0.1;
        for (const o of blocks) if (o.alive && o !== b) hit(o, dmg * share, o.c[0], o.c[1], { splash: true, tier: 7 });
      }
    }
    if (s.tier === 2 && !s.drone) {
      // Perforation: no bounce, straight through (drilling) towards another block.
      s.through = b;
      s.drill = DRILL.every;
      s.target = null;
      return;
    }
    // Bounce away from the block, then come back for another hit.
    // Stabilizers (forge): straighter and shorter bounces, so the ship comes back sooner.
    const steady = s.drone ? 1 : bounceFactor(save, s.tier);
    const a = Math.atan2(s.y - b.c[1], s.x - b.c[0]) + rand(-0.7, 0.7) * steady;
    s.vx = Math.cos(a) * speed;
    s.vy = Math.sin(a) * speed;
    for (let i = 0; i < 12 && inside(b.poly, s.x, s.y); i++) { s.x += Math.cos(a) * 5; s.y += Math.sin(a) * 5; }
    s.retreat = rand(0.08, 0.2) * steady;
    if (Math.random() < 0.3) s.target = null;
  }

  // ---- rendering ----

  function draw() {
    const { scale, ox, oy, dpr } = view;
    const k = 1 / Math.max(0.35, scale); // world units per screen pixel (constant-size details)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Light screen shake: bombs and beaten bosses only.
    const sx = shake > 0 ? rand(-4, 4) * shake * 2 : 0;
    const sy = shake > 0 ? rand(-4, 4) * shake * 2 : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sx), dpr * (oy + sy));

    const [r, g, bl] = theme.bg;
    const planet = blocks.find((b) => b.kind === 'boss' && b.alive);
    ctx.fillStyle = now < greenUntil ? 'rgba(20, 60, 40, .6)' : now < frenzyUntil ? `rgba(${r + 30}, ${g + 10}, ${bl + 30}, .6)` : `rgba(${r}, ${g}, ${bl}, .6)`;
    ctx.fillRect(0, 0, W, H);

    if (planet) drawPlanet(planet, k);
    for (const b of blocks) {
      if (!b.alive || b.kind === 'boss') continue;
      // Damaged blocks shrink a little and fade, so progress is visible.
      const ratio = b.hp / b.maxHp;
      const kk = 0.78 + 0.22 * ratio;
      roundedPath(b.poly.map(([x, y]) => [b.c[0] + (x - b.c[0]) * kk, b.c[1] + (y - b.c[1]) * kk]), 3 * k);
      ctx.globalAlpha = 0.55 + 0.45 * ratio;
      if (b.kind === 'gold') {
        const grad = ctx.createLinearGradient(b.box[0], b.box[1], b.box[2], b.box[3]);
        const shine = (Math.sin(now * 3 + b.c[0] * 0.01) + 1) / 2;
        grad.addColorStop(0, '#b8860b');
        grad.addColorStop(Math.min(0.9, Math.max(0.1, shine)), '#fff3b0');
        grad.addColorStop(1, '#e0a526');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = b.color;
      }
      ctx.fill();
      if (b.kind === 'bomb') {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3 * k;
        ctx.strokeStyle = `rgba(255, 138, 61, ${0.5 + Math.sin(now * 8) * 0.5})`;
        ctx.stroke();
      }
      if (b.kind === 'ore') {
        // Ore vein: glowing outline in the ore's colour.
        const pulse = 0.6 + Math.sin(now * 5 + b.c[0]) * 0.4;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 5 * k;
        ctx.strokeStyle = RESOURCES[resourceFor(save.stage)].color;
        ctx.stroke();
        ctx.globalAlpha = pulse * 0.8;
        ctx.lineWidth = 1.5 * k;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      if (b.flash > 0) {
        ctx.globalAlpha = b.flash * 0.5;
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (b.kind === 'bomb') emoji('💣', b.c[0], b.c[1], 30 * k);
      if (b.kind === 'ore') emoji(RESOURCES[resourceFor(save.stage)].emoji, b.c[0], b.c[1], (26 + Math.sin(now * 4) * 3) * k);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.ring * (1 - (p.life / p.max) * 0.6), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = p.color;
      if (p.shard) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2); ctx.lineTo(p.size / 2, p.size / 2); ctx.lineTo(-p.size / 2, p.size / 3);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    for (const s of ships) {
      const { color } = TIERS[s.drone ? 1 : s.tier];
      const size = (s.drone ? 6 : 9 + s.tier * 1.6) * k; // constant size on screen
      // Trail: small wireframe triangles fading out.
      ctx.strokeStyle = color;
      ctx.lineWidth = k;
      s.trail.forEach(([x, y, a], i) => {
        ctx.globalAlpha = (i / s.trail.length) * 0.45;
        tri(x, y, a, size * (0.3 + (i / s.trail.length) * 0.4));
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      tri(s.x, s.y, Math.atan2(s.vy, s.vx), size);
      ctx.fill();
    }

    if (ufo) {
      const size = 70;
      ctx.save();
      ctx.translate(ufo.x, ufo.y);
      ctx.rotate(Math.sin(ufo.t * 3) * 0.15);
      ctx.shadowColor = '#7dffb3';
      ctx.shadowBlur = 25;
      if (UFO_IMG?.complete && UFO_IMG.naturalWidth) ctx.drawImage(UFO_IMG, -size / 2, -size / 2, size, size);
      else emoji('🛸', 0, 0, size);
      ctx.restore();
    }

    // Planet: resistance bar and timer at the top of the field.
    if (planet && bossDeadline) {
      const left = Math.max(0, bossDeadline - now);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(100, 24, W - 200, 26);
      ctx.fillStyle = planet.planet.ringColor;
      ctx.fillRect(104, 28, (W - 208) * (planet.hp / planet.maxHp), 18);
      label(`🪐 ${planet.planet.name} · ${Math.ceil(left)} s`, W / 2, 76, left < 10 ? '#ff6b8b' : '#ffffff', 1.1);
      label(`❤️ ${fmt(planet.hp)} / ${fmt(planet.maxHp)} PV`, W / 2, 76 + 30 * k, '#ffd9e0', 0.9);
    }

    for (const t of texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 1.6);
      label(t.text, t.x, t.y, t.color, t.size);
    }
    ctx.globalAlpha = 1;

    function label(text, x, y, color, size) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(17 * size * k)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
  }

  function emoji(ch, x, y, size) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillText(ch, x, y);
  }

  /** A planet: back of the rings, shaded globe with bands and craters, front of the rings. */
  function drawPlanet(b, k) {
    const { R, tilt, rings, ringColor, bands, craters } = b.planet;
    const ratio = b.hp / b.maxHp;
    const r = R * (0.9 + 0.1 * ratio);
    const [cx, cy] = b.c;
    const ringArc = (back) => {
      for (const f of rings) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * f, r * f * 0.26, tilt, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
        ctx.strokeStyle = ringColor;
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(f * 9);
        ctx.lineWidth = (f > 1.7 ? 1.5 : 2.5) * k;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    ringArc(true);

    ctx.save();
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    for (const band of bands) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = band.color;
      ctx.fillRect(-r, band.y * r, r * 2, band.h * r);
    }
    ctx.rotate(-tilt);
    for (const c of craters) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(Math.cos(c.a) * c.d * r, Math.sin(c.a) * c.d * r, c.r * r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Light from the top left, night side bottom right.
    ctx.globalAlpha = 1;
    const shade = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,.35)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    if (b.flash > 0) {
      ctx.globalAlpha = b.flash * 0.35;
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
    ringArc(false);
  }

  /** Polygon path with slightly rounded corners (radius `r`, capped on short edges). */
  function roundedPath(pts, r) {
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.beginPath();
    ctx.moveTo(...mid(pts[n - 1], pts[0]));
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const o = pts[(i + n - 1) % n];
      const edge = Math.min(Math.hypot(q[0] - p[0], q[1] - p[1]), Math.hypot(o[0] - p[0], o[1] - p[1]));
      ctx.arcTo(p[0], p[1], ...mid(p, q), Math.min(r, edge / 3));
    }
    ctx.closePath();
  }

  /** Arrow-head ship pointing at angle `a`. */
  function tri(x, y, a, size) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pt = (fx, fy) => [x + fx * c - fy * s, y + fx * s + fy * c];
    ctx.beginPath();
    ctx.moveTo(...pt(size, 0));
    ctx.lineTo(...pt(-size * 0.7, size * 0.65));
    ctx.lineTo(...pt(-size * 0.35, 0));
    ctx.lineTo(...pt(-size * 0.7, -size * 0.65));
    ctx.closePath();
  }

  function frame(t) {
    if (!running) return;
    if (!canvas.isConnected) { stop(); return; }
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    now += dt;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ---- input: tapping a block (or the saucer) ----

  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - view.ox) / view.scale;
    const y = (e.clientY - r.top - view.oy) / view.scale;
    if (ufo && Math.hypot(ufo.x - x, ufo.y - y) < 70) { catchUfo(); return; }
    const b = blocks.find((bl) => bl.alive && inside(bl.poly, x, y));
    if (b) {
      track(save, 'taps');
      tap(b, x, y);
    } else sparks(x, y, '#ffffff', 4);
  }

  /** Jimmy's finger (by hand or automatic), with its workshop modules. */
  function tap(b, x, y) {
    const dmg = hit(b, clickDamage(save), x, y, { click: true, tier: TAP, critBonus: hasFingerModule(save, 'crit') ? 0.25 : 0 });
    if (hasFingerModule(save, 'splash')) splash(x, y, dmg * 0.5, 170, b, TAP);
  }

  let autoTap = 0;
  function tickAutoTap(dt) {
    if (!hasFingerModule(save, 'auto')) return;
    autoTap -= dt;
    if (autoTap > 0) return;
    autoTap = 0.5;
    const alive = blocks.filter((bl) => bl.alive);
    if (!alive.length) return;
    const b = alive[Math.floor(Math.random() * alive.length)];
    const x = b.c[0] + rand(-15, 15);
    const y = b.c[1] + rand(-15, 15);
    tap(b, x, y);
    addParticle({ x, y, vx: 0, vy: 0, life: 0.35, ring: 28, color: '#ffd98a' });
  }
  canvas.addEventListener('pointerdown', onPointer);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  newStage();
  syncFleet();
  resize();
  scheduleUfo();

  return {
    start,
    stop,
    destroy() { stop(); ro.disconnect(); canvas.removeEventListener('pointerdown', onPointer); },
    syncFleet,
    /** New field and fleet after a prestige (the save was reset). */
    restart() { particles = []; texts = []; ships = []; nextStageAt = 0; newStage(); syncFleet(); },
    boost() { boostUntil = now + boostDuration(save); },
    boostLeft: () => Math.max(0, boostUntil - now),
    frenzyLeft: () => Math.max(0, frenzyUntil - now),
    bossLeft: () => (bossDeadline ? Math.max(0, bossDeadline - now) : null),
    planetName: () => blocks.find((b) => b.kind === 'boss')?.planet.name || null,
    themeName: () => theme.name,
    /** Real damage per second of a tier (0-7), of the taps ('tap') or of everything (no argument). */
    dps(slot) {
      if (slot === 'tap') return dps(TAP);
      if (slot === undefined) return [...Array(TAP + 1).keys()].reduce((sum, i) => sum + dps(i), 0);
      return dps(slot);
    },
    /** Real damage per second of one ship of a tier, averaged over the same window. */
    dpsPerShip,
    /** Share of the stage's HP already destroyed (0…1). */
    progress() {
      const max = blocks.reduce((s, b) => s + b.maxHp, 0);
      return max ? 1 - blocks.reduce((s, b) => s + b.hp, 0) / max : 1;
    },
    // For tests: force a saucer / read the field.
    _launchUfo() { launchUfo(); },
    _blocks: () => blocks,
  };
}

function fmtShort(n) {
  if (n < 1000) return String(Math.round(n));
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const tier = Math.min(units.length, Math.floor(Math.log10(n) / 3));
  return `${(n / 1000 ** tier).toFixed(1).replace('.0', '')}${units[tier - 1]}`;
}
