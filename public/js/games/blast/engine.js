// Jimmy Blast — simulation and canvas rendering.
// The world is a fixed 1000 × 1000 square, only scaled to the screen (same field
// and same number of blocks for everyone, whatever the device), generated for each stage:
// random polygons (Voronoi cells with gaps and clearings) that ships fly into.
import {
  TIERS, fleetDamage, clickDamage, critChance, CRIT_FACTOR, speedFactor, stageHp, BREAK_BONUS, stageClearBonus, earn, BOOST,
} from './logic.js';

const WORLD_W = 1000;
const BLOCK_COLORS = ['#4b3fb8', '#5a45d6', '#6b3fc4', '#3f6fd8', '#4f9fe0', '#58b4e6', '#56c8d6', '#62d6c6', '#7c5cff'];
const BASE_SPEED = 340; // world units per second
const MAX_PARTICLES = 500;
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
function generateBlocks(W, H, stage) {
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
    blocks.push({ poly, c, area: a, color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)], flash: 0, alive: true });
  }
  const total = blocks.reduce((sum, b) => sum + b.area, 0);
  const hp = stageHp(stage);
  for (const b of blocks) {
    b.maxHp = (hp * b.area) / total;
    b.hp = b.maxHp;
    const xs = b.poly.map((p) => p[0]);
    const ys = b.poly.map((p) => p[1]);
    b.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return { blocks, spawn: clearings[0] };
}

// ---- engine ----------------------------------------------------------------------------------

/**
 * hooks.onEarn(amount) · hooks.onStage(stage) · hooks.onBreak()
 * The engine mutates `save` (money, stage) through logic.js helpers.
 */
export function createBlast(canvas, save, hooks = {}) {
  const ctx = canvas.getContext('2d');
  let W = WORLD_W;
  let H = WORLD_W;
  let blocks = [];
  let spawn = { x: W / 2, y: H / 2 };
  let ships = [];
  let particles = [];
  let texts = [];
  let running = false;
  let raf = 0;
  let last = 0;
  let now = 0;
  let boostUntil = 0;
  let nextStageAt = 0;
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  let greenUntil = 0;

  function newStage() {
    ({ blocks, spawn } = generateBlocks(W, H, save.stage));
    for (const s of ships) { s.x = spawn.x + rand(-40, 40); s.y = spawn.y + rand(-40, 40); s.target = null; s.trail = []; }
  }

  function makeShip(tier) {
    const a = rand(0, Math.PI * 2);
    return {
      tier, x: spawn.x + rand(-30, 30), y: spawn.y + rand(-30, 30), vx: Math.cos(a) * 100, vy: Math.sin(a) * 100,
      target: null, retreat: 0, trail: [], trailT: 0,
    };
  }

  /** Matches the ships on screen to the fleet in the save. */
  function syncFleet() {
    TIERS.forEach((_, t) => {
      const want = save.tiers[t].count;
      const have = ships.filter((s) => s.tier === t);
      for (let i = have.length; i < want; i++) ships.push(makeShip(t));
      for (let i = want; i < have.length; i++) ships.splice(ships.indexOf(have[i]), 1);
    });
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

  function hit(block, base, x, y, fromClick = false) {
    if (!block.alive) return;
    const crit = Math.random() < critChance(save);
    const boost = now < boostUntil ? BOOST.factor : 1;
    const dmg = base * boost * (crit ? CRIT_FACTOR : 1);
    const dealt = Math.min(dmg, block.hp);
    block.hp -= dealt;
    block.flash = 1;
    const gained = earn(save, dealt);
    hooks.onEarn?.(gained);
    sparks(x, y, block.color, crit ? 10 : fromClick ? 6 : 2);
    if (crit) floatText(x, y, `CRIT ${fmtShort(dmg)}`, '#ffd166', 1);
    else if (fromClick) floatText(x, y, fmtShort(dmg), '#fff', 0.8);
    if (block.hp <= block.maxHp * 1e-9) breakBlock(block);
  }

  function breakBlock(block) {
    block.alive = false;
    block.hp = 0;
    const bonus = earn(save, block.maxHp * BREAK_BONUS);
    hooks.onEarn?.(bonus);
    hooks.onBreak?.();
    floatText(block.c[0], block.c[1], `+${fmtShort(bonus)}`, '#7dffb3', 1.1);
    for (let i = 0; i < 18; i++) {
      const p = block.poly[i % block.poly.length];
      const a = Math.atan2(p[1] - block.c[1], p[0] - block.c[0]) + rand(-0.6, 0.6);
      const v = rand(80, 320);
      addParticle({
        x: block.c[0] + (p[0] - block.c[0]) * rand(0.2, 0.8), y: block.c[1] + (p[1] - block.c[1]) * rand(0.2, 0.8),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.6, 1.2), size: rand(8, 22), color: block.color, rot: rand(0, 6), vr: rand(-6, 6), shard: true,
      });
    }
    if (blocks.every((b) => !b.alive)) {
      const bonus2 = earn(save, stageClearBonus(save.stage));
      hooks.onEarn?.(bonus2);
      save.stage += 1;
      save.maxStage = Math.max(save.maxStage, save.stage);
      nextStageAt = now + 0.9;
      greenUntil = now + 0.9;
      floatText(W / 2, H / 2, `Secteur ${save.stage} !`, '#ffffff', 2.2, 2);
      hooks.onStage?.(save.stage);
    }
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
  function floatText(x, y, text, color, life = 1, size = 1) {
    if (texts.length > 40) texts.shift();
    texts.push({ x, y, text, color, life, max: life, size });
  }

  // ---- simulation ----

  function step(dt) {
    const speed = BASE_SPEED * speedFactor(save) * (now < boostUntil ? BOOST.factor : 1);
    const alive = blocks.filter((b) => b.alive);
    if (!alive.length && nextStageAt && now >= nextStageAt) { nextStageAt = 0; newStage(); return; }

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
      else if (s.target?.alive) {
        const dx = s.target.c[0] - s.x;
        const dy = s.target.c[1] - s.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, dt * 4);
        s.vx += ((dx / d) * speed - s.vx) * k;
        s.vy += ((dy / d) * speed - s.vy) * k;
      }
      const v = Math.hypot(s.vx, s.vy) || 1;
      if (v > speed * 1.2) { s.vx *= (speed * 1.2) / v; s.vy *= (speed * 1.2) / v; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = Math.max(0, Math.min(W, s.x)); }
      if (s.y < 0 || s.y > H) { s.vy = -s.vy; s.y = Math.max(0, Math.min(H, s.y)); }

      for (const b of alive) {
        if (!b.alive || s.x < b.box[0] || s.x > b.box[2] || s.y < b.box[1] || s.y > b.box[3] || !inside(b.poly, s.x, s.y)) continue;
        hit(b, fleetDamage(save, s.tier), s.x, s.y);
        // Bounce away from the block, then come back for another hit.
        const a = Math.atan2(s.y - b.c[1], s.x - b.c[0]) + rand(-0.7, 0.7);
        s.vx = Math.cos(a) * speed;
        s.vy = Math.sin(a) * speed;
        for (let i = 0; i < 12 && inside(b.poly, s.x, s.y); i++) { s.x += Math.cos(a) * 5; s.y += Math.sin(a) * 5; }
        s.retreat = rand(0.08, 0.2);
        if (Math.random() < 0.3) s.target = null;
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
  }

  // ---- rendering ----

  function draw() {
    const { scale, ox, oy, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    ctx.fillStyle = now < greenUntil ? 'rgba(20, 60, 40, .55)' : 'rgba(8, 8, 20, .55)';
    ctx.fillRect(0, 0, W, H);

    for (const b of blocks) {
      if (!b.alive) continue;
      // Damaged blocks shrink a little and fade, so progress is visible.
      const ratio = b.hp / b.maxHp;
      const k = 0.78 + 0.22 * ratio;
      ctx.beginPath();
      b.poly.forEach(([x, y], i) => {
        const px = b.c[0] + (x - b.c[0]) * k;
        const py = b.c[1] + (y - b.c[1]) * k;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.globalAlpha = 0.55 + 0.45 * ratio;
      ctx.fillStyle = b.color;
      ctx.fill();
      if (b.flash > 0) {
        ctx.globalAlpha = b.flash * 0.5;
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
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
      const { color } = TIERS[s.tier];
      const size = (9 + s.tier * 1.6) / Math.max(0.35, view.scale); // constant size on screen
      // Trail: small wireframe triangles fading out.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / Math.max(0.35, view.scale);
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

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 1.6);
      ctx.font = `700 ${Math.round((17 * t.size) / Math.max(0.35, view.scale))}px "Space Grotesk", system-ui, sans-serif`;
      ctx.lineWidth = 3 / Math.max(0.35, view.scale);
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
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

  // ---- input: tapping a block ----

  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - view.ox) / view.scale;
    const y = (e.clientY - r.top - view.oy) / view.scale;
    const b = blocks.find((bl) => bl.alive && inside(bl.poly, x, y));
    if (b) hit(b, clickDamage(save), x, y, true);
    else sparks(x, y, '#ffffff', 4);
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

  return {
    start,
    stop,
    destroy() { stop(); ro.disconnect(); canvas.removeEventListener('pointerdown', onPointer); },
    syncFleet,
    /** New field and fleet after a prestige (the save was reset). */
    restart() { particles = []; texts = []; ships = []; nextStageAt = 0; newStage(); syncFleet(); },
    boost() { boostUntil = now + BOOST.duration; },
    boostLeft: () => Math.max(0, boostUntil - now),
    /** Share of the stage's HP already destroyed (0…1). */
    progress() {
      const max = blocks.reduce((s, b) => s + b.maxHp, 0);
      return max ? 1 - blocks.reduce((s, b) => s + b.hp, 0) / max : 1;
    },
  };
}

function fmtShort(n) {
  if (n < 1000) return String(Math.round(n));
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const tier = Math.min(units.length, Math.floor(Math.log10(n) / 3));
  return `${(n / 1000 ** tier).toFixed(1).replace('.0', '')}${units[tier - 1]}`;
}
