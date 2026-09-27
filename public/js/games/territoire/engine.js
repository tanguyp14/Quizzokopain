// Territoire — canvas engine: loop, input, enemies, collisions and drawing.
import {
  GRID, LAND, TRAIL, GOAL, LIVES, newLevel, moveShip, moveSentinel, moveGloubi, loseTrail, isEdge, capturePoints, levelBonus,
} from './logic.js';

const SIZE = 600; // logical canvas size
const CELL = SIZE / GRID;
const SPEED = { land: 30, draw: 20 }; // ship, cells per second
const INVULNERABLE = 2; // seconds after a hit
const PAD = 14; // margin around the field, so the ship and the sentinels on the outer edge show whole

/** Creates the game on a canvas. hooks: { onChange(info), onOver(result) }. */
export function createTerritoire(canvas, hooks = {}) {
  const ctx = canvas.getContext('2d');
  const land = document.createElement('canvas');
  land.width = GRID;
  land.height = GRID;
  const lctx = land.getContext('2d');
  const noise = Float32Array.from({ length: GRID * GRID }, () => Math.random());
  const stars = [...Array(90)].map(() => ({ x: Math.random() * SIZE, y: Math.random() * SIZE, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));

  let s = null;
  let lives = LIVES;
  let score = 0;
  let phase = 'ready'; // ready · play · levelup · over
  let dir = null;
  const held = [];
  let acc = 0;
  let invulnerable = 0;
  let banner = null; // { text, sub, until }
  let particles = [];
  let dirty = true;
  let now = 0;
  let last = 0;
  let raf = 0;

  const info = () => ({ level: s?.level || 1, claimed: s?.claimed || 0, lives, score, phase });
  const changed = () => hooks.onChange?.(info());

  function start(level = 1) {
    s = newLevel(level);
    if (level === 1) { lives = LIVES; score = 0; }
    phase = 'play';
    invulnerable = 1;
    dirty = true;
    banner = { text: `Planète ${level}`, sub: `Conquiers ${Math.round(GOAL * 100)} % du territoire`, until: now + 2 };
    changed();
  }

  function burst(x, y, color, n = 24) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.5, color });
    }
  }

  function hit() {
    if (invulnerable > 0 || phase !== 'play') return;
    lives -= 1;
    burst((s.ship.x + 0.5) * CELL, (s.ship.y + 0.5) * CELL, '#ff5d73', 40);
    loseTrail(s);
    dirty = true;
    invulnerable = INVULNERABLE;
    if (lives <= 0) {
      phase = 'over';
      banner = null; // the page shows the end panel
      hooks.onOver?.({ score, level: s.level });
    }
    changed();
  }

  function update(dt) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    if (phase === 'levelup' && now >= banner.until) start(s.level + 1);
    if (phase !== 'play') return;
    invulnerable = Math.max(0, invulnerable - dt);

    // Ship: one cell at a time, slower while drawing.
    if (dir) {
      acc += dt * (s.trail.length ? SPEED.draw : SPEED.land);
      while (acc >= 1) {
        acc -= 1;
        const r = moveShip(s, dir);
        if (!r.moved) { acc = 0; break; }
        dirty = true;
        if (r.closed) {
          const pts = capturePoints(r.closed, s.level);
          score += pts;
          burst((s.ship.x + 0.5) * CELL, (s.ship.y + 0.5) * CELL, '#7dffb3', 30);
          floatBanner(`+${pts.toLocaleString('fr-FR')}`);
          if (s.claimed >= GOAL) {
            const bonus = levelBonus(s.level, s.claimed);
            score += bonus;
            if (s.level % 3 === 0) lives += 1;
            phase = 'levelup';
            banner = { text: 'Planète conquise ! 👽', sub: `Bonus +${bonus.toLocaleString('fr-FR')}${s.level % 3 === 0 ? ' · +1 vie' : ''}`, until: now + 2.5 };
          }
          changed();
          break;
        }
      }
    } else acc = 0;

    // Enemies.
    for (const g of s.gloubis) {
      if (moveGloubi(s, g, dt)) hit();
      if (s.trail.length && Math.hypot(g.x - s.ship.x, g.y - s.ship.y) < 2.8) hit();
    }
    for (const t of s.sentinels) {
      t.t += dt * s.spec.sentinelSpeed;
      while (t.t >= 1) { t.t -= 1; moveSentinel(s, t); }
      if (Math.max(Math.abs(t.x - s.ship.x), Math.abs(t.y - s.ship.y)) <= 1) hit();
    }
  }

  let popup = null;
  function floatBanner(text) { popup = { text, x: (s.ship.x + 0.5) * CELL, y: (s.ship.y + 0.5) * CELL, until: now + 1 }; }

  // ---- drawing ----

  function paintLand() {
    const img = lctx.createImageData(GRID, GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        const c = s.grid[i];
        let rgb = null;
        if (c === LAND) {
          if (isEdge(s.grid, x, y)) rgb = [177, 140, 255];
          else {
            // Alien land: purple to green, with some texture.
            const n = noise[i];
            const k = (x + y) / (2 * GRID);
            rgb = [Math.round(58 + 30 * n - 20 * k), Math.round(40 + 70 * k + 25 * n), Math.round(110 - 30 * k + 20 * n)];
          }
        } else if (c === TRAIL) rgb = [111, 255, 255];
        if (rgb) { img.data.set([...rgb, 255], i * 4); }
      }
    }
    lctx.putImageData(img, 0, 0);
    dirty = false;
  }

  // Asteroids (the enemies bouncing in the void): rocky, lumpy, slowly spinning, shaded like a small planet.
  const rocks = new WeakMap();
  function rockOf(g) {
    let r = rocks.get(g);
    if (!r) {
      const n = 11;
      r = {
        edge: [...Array(n)].map(() => 0.78 + Math.random() * 0.32),
        craters: [...Array(4)].map(() => ({ a: Math.random() * Math.PI * 2, d: Math.random() * 0.55, r: 0.14 + Math.random() * 0.16 })),
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6),
        tint: Math.random(),
      };
      rocks.set(g, r);
    }
    return r;
  }
  function drawAsteroid(g) {
    const x = (g.x + 0.5) * CELL;
    const y = (g.y + 0.5) * CELL;
    const R = 16;
    const rock = rockOf(g);
    const rot = now * rock.spin;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(255, 170, 90, 0.45)';
    ctx.shadowBlur = 14;
    // Lumpy outline.
    ctx.beginPath();
    rock.edge.forEach((k, i) => {
      const a = rot + (i / rock.edge.length) * Math.PI * 2;
      const px = Math.cos(a) * R * k;
      const py = Math.sin(a) * R * k;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.closePath();
    // Lit from the top left, like the planets of Blast.
    const grad = ctx.createRadialGradient(-R * 0.4, -R * 0.4, 1, 0, 0, R * 1.1);
    const warm = rock.tint > 0.5;
    grad.addColorStop(0, warm ? '#d8b08a' : '#b9b2c9');
    grad.addColorStop(0.55, warm ? '#8a6448' : '#6f6784');
    grad.addColorStop(1, warm ? '#3a2618' : '#2a2436');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.clip();
    // Craters.
    for (const c of rock.craters) {
      const cx = Math.cos(rot + c.a) * c.d * R;
      const cy = Math.sin(rot + c.a) * c.d * R;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath(); ctx.arc(cx, cy, c.r * R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx - 0.6, cy - 0.6, c.r * R, Math.PI * 0.9, Math.PI * 1.7); ctx.stroke();
    }
    // Night side.
    const shade = ctx.createLinearGradient(-R, -R, R, R);
    shade.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = shade;
    ctx.fillRect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
    ctx.restore();
    ctx.restore();
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr); }
    const k = canvas.width / SIZE;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // Space.
    ctx.fillStyle = '#07061a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (const st of stars) {
      ctx.globalAlpha = 0.4 + Math.sin(now * 2 + st.p) * 0.3;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const f = (SIZE - 2 * PAD) / SIZE;
    ctx.setTransform(k * f, 0, 0, k * f, k * PAD, k * PAD);
    if (s) {
      if (dirty) paintLand();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(land, 0, 0, SIZE, SIZE);
      for (const g of s.gloubis) drawAsteroid(g);
      // Sentinels: space invaders patrolling the edges (a little bob, red glow).
      ctx.font = '28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of s.sentinels) {
        ctx.save();
        ctx.shadowColor = '#ff5d73';
        ctx.shadowBlur = 12;
        ctx.fillText('👾', (t.x + 0.5) * CELL, (t.y + 0.5) * CELL + Math.sin(now * 8 + t.x) * 1.5);
        ctx.restore();
      }
      // The ship: Jimmy's saucer (blinks while invulnerable).
      if (phase !== 'over' && (invulnerable <= 0 || Math.floor(now * 10) % 2)) {
        ctx.font = '28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#7dffb3';
        ctx.shadowBlur = 14;
        ctx.fillText('🛸', (s.ship.x + 0.5) * CELL, (s.ship.y + 0.5) * CELL);
        ctx.shadowBlur = 0;
      }
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (popup && now < popup.until) {
      ctx.globalAlpha = popup.until - now;
      ctx.fillStyle = '#7dffb3';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(popup.text, popup.x, popup.y - 24 - (1 - (popup.until - now)) * 20);
      ctx.globalAlpha = 1;
    }
    if (banner && now < banner.until) {
      ctx.fillStyle = 'rgba(7, 6, 26, 0.55)';
      ctx.fillRect(0, SIZE / 2 - 55, SIZE, 110);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(banner.text, SIZE / 2, SIZE / 2 - 12);
      ctx.fillStyle = '#c9b8ff';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(banner.sub, SIZE / 2, SIZE / 2 + 24);
    }
  }

  function frame(t) {
    now = t / 1000;
    const dt = Math.min(0.05, now - (last || now));
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ---- input ----
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right' };
  const press = (d) => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); held.push(d); dir = d; };
  const release = (d) => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); dir = held[held.length - 1] || null; };
  const onKeyDown = (e) => {
    const d = KEYS[e.key] || KEYS[e.key?.toLowerCase()];
    if (!d || e.target.closest?.('input, textarea')) return;
    e.preventDefault();
    press(d);
  };
  const onKeyUp = (e) => { const d = KEYS[e.key] || KEYS[e.key?.toLowerCase()]; if (d) release(d); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const onBlur = () => { held.length = 0; dir = null; };
  window.addEventListener('blur', onBlur);

  raf = requestAnimationFrame(frame);
  return {
    start,
    press,
    release,
    info,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
