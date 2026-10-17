// Jimmy Bomber: the arena on a canvas. The page's own alien moves at once (and tells the server
// where it is); the others are drawn a tenth of a second late, smoothly, between two server ticks.
import * as L from './logic.js';

const IMG = {};
const img = (code) => {
  if (typeof Image === 'undefined') return null;
  if (!IMG[code]) IMG[code] = Object.assign(new Image(), { src: `/emoji/${code}.webp` });
  return IMG[code];
};
const EMOJI = { alien: '1f47d', bot: '1f916', bomb: '1f4a3', rock: '1faa8', fire: '1f525', speed: '26a1', skull: '1f480' };
const BONUS_IMG = { bomb: EMOJI.bomb, fire: EMOJI.fire, speed: EMOJI.speed };
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyZ: 'up', KeyQ: 'left',
};
const DELAY = 100; // ms the others are drawn late

export function createBomberView(canvas, { myId, socket, colorOf, nameOf, onHud }) {
  const ctx = canvas.getContext('2d');
  const stars = Array.from({ length: 70 }, () => [Math.random(), Math.random(), Math.random() * 1.4 + 0.3]);
  let s = null; // local copy of the round: grid, bombs, flames, bonuses, players
  let snaps = []; // [{ at, p: Map(id -> [x, y, alive, dir]) }]
  let me = null; // my alien (predicted here)
  let startsAt = 0;
  const held = []; // directions held, last pressed first
  let lastSent = 0;
  let sentPos = '';
  let raf = 0;
  let last = performance.now();
  let shake = 0;
  const blasts = []; // { x, y, at }
  const deaths = new Map(); // id -> time of death (for the fade)
  let tile = 32;

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const maxH = Math.max(260, window.innerHeight - (window.innerWidth < 700 ? 300 : 210));
    tile = Math.max(14, Math.floor(Math.min(box.width / L.W, maxH / L.H)));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${tile * L.W}px`;
    canvas.style.height = `${tile * L.H}px`;
    canvas.width = Math.round(tile * L.W * dpr);
    canvas.height = Math.round(tile * L.H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- server messages ----

  function round(r) {
    startsAt = performance.now() + (r.startsAt - r.now); // the server's countdown, on this page's clock
    s = {
      grid: r.grid.slice(), bombs: [], flames: [], bonuses: {}, hidden: {}, closing: null,
      players: r.players.map((p) => ({ ...p, alive: true })),
    };
    for (const [x, y, b] of r.bonuses || []) s.bonuses[L.key(x, y)] = b;
    me = s.players.find((p) => p.id === myId) || null;
    snaps = [];
    deaths.clear();
    blasts.length = 0;
    hud();
  }
  function tick(t) {
    if (!s) return;
    const p = new Map(t.p.map(([id, x, y, a, d, bombs, range, speed]) => [id, { x, y, alive: Boolean(a), d, bombs, range, speed }]));
    snaps.push({ at: performance.now(), p });
    if (snaps.length > 12) snaps.shift();
    s.bombs = t.b.map(([id, x, y, left]) => ({ id, x, y, left }));
    s.flames = t.f.map(([x, y]) => ({ x, y }));
    s.bonuses = {};
    for (const [x, y, b] of t.u) s.bonuses[L.key(x, y)] = b;
    s.t = t.t;
    for (const pl of s.players) {
      const q = p.get(pl.id);
      if (!q) continue;
      if (pl.alive && !q.alive) deaths.set(pl.id, performance.now());
      pl.alive = q.alive;
      pl.bombs = q.bombs; pl.range = q.range; pl.speed = q.speed;
      if (pl !== me) { pl.x = q.x; pl.y = q.y; pl.dir = { u: 'up', d: 'down', l: 'left', r: 'right' }[q.d] || pl.dir; }
    }
    hud();
  }
  function grid(changes) {
    if (!s) return;
    for (const [x, y, v] of changes) s.grid[L.key(x, y)] = v;
  }
  function events(list) {
    for (const e of list) {
      if (e.type === 'boom') { blasts.push({ x: e.x, y: e.y, at: performance.now() }); shake = Math.min(8, shake + 3); }
      if (e.type === 'drop' && s && !s.bombs.some((b) => b.x === e.x && b.y === e.y)) s.bombs.push({ x: e.x, y: e.y, left: L.FUSE });
    }
  }
  function you([x, y]) { if (me) { me.x = x; me.y = y; } }

  // ---- input ----

  const press = (d) => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); held.unshift(d); };
  const release = (d) => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); };
  function bomb() {
    if (!me || !me.alive || performance.now() < startsAt) return;
    socket.emit('bomber:bomb');
    // Shown at once; the server's tick confirms it.
    const x = Math.floor(me.x);
    const y = Math.floor(me.y);
    if (!s.bombs.some((b) => b.x === x && b.y === y) && s.bombs.filter((b) => b.owner === myId || b.mine).length < me.bombs) s.bombs.push({ x, y, left: L.FUSE, mine: true });
  }
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const d = KEYS[e.code];
    if (d) { e.preventDefault(); if (e.type === 'keydown') press(d); else release(d); return; }
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && e.type === 'keydown' && !e.repeat) { e.preventDefault(); bomb(); }
  };
  const onBlur = () => { held.length = 0; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', resize);

  // ---- loop ----

  function update(dt) {
    if (!s || !me || !me.alive || performance.now() < startsAt) return;
    if (held[0]) L.move(s, me, held[0], dt);
    const now = performance.now();
    const pos = `${me.x.toFixed(2)},${me.y.toFixed(2)}`;
    if (now - lastSent > 50 && pos !== sentPos) {
      socket.emit('bomber:move', [Math.round(me.x * 100) / 100, Math.round(me.y * 100) / 100, me.dir]);
      lastSent = now;
      sentPos = pos;
    }
  }

  /** Where another alien is drawn: between the two snapshots around (now − DELAY). */
  function shown(p) {
    const at = performance.now() - DELAY;
    let a = null;
    let b = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].at <= at) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    }
    const pa = a?.p.get(p.id);
    const pb = b?.p.get(p.id);
    if (!pa) return p;
    if (!pb) return pa;
    const k = Math.min(1, (at - a.at) / Math.max(1, b.at - a.at));
    return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
  }

  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  function draw(now) {
    const T = tile;
    const Wpx = T * L.W;
    const Hpx = T * L.H;
    ctx.save();
    if (shake > 0.1) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; }
    // Space.
    const bg = ctx.createLinearGradient(0, 0, Wpx, Hpx);
    bg.addColorStop(0, '#1a1147');
    bg.addColorStop(1, '#0d0a24');
    ctx.fillStyle = bg;
    ctx.fillRect(-10, -10, Wpx + 20, Hpx + 20);
    ctx.fillStyle = '#fff';
    for (const [sx, sy, r] of stars) { ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(now / 1500 + sx * 20)); ctx.fillRect(sx * Wpx, sy * Hpx, r, r); }
    ctx.globalAlpha = 1;
    if (!s) { ctx.restore(); return; }
    // Floor, walls, asteroids.
    for (let y = 0; y < L.H; y++) {
      for (let x = 0; x < L.W; x++) {
        const v = s.grid[L.key(x, y)];
        const px = x * T;
        const py = y * T;
        if (v === L.WALL) {
          const g = ctx.createLinearGradient(px, py, px, py + T);
          g.addColorStop(0, '#5b4bb8');
          g.addColorStop(1, '#2a2063');
          ctx.fillStyle = g;
          rounded(px + 1, py + 1, T - 2, T - 2, T * 0.18);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.fillRect(px + T * 0.18, py + T * 0.12, T * 0.64, T * 0.08);
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          for (const [rx, ry] of [[0.22, 0.75], [0.78, 0.75]]) { ctx.beginPath(); ctx.arc(px + rx * T, py + ry * T, T * 0.05, 0, 7); ctx.fill(); }
        } else {
          ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)';
          ctx.fillRect(px, py, T, T);
          if (v === L.CRATE) {
            const im = img(EMOJI.rock);
            if (im?.complete && im.naturalWidth) ctx.drawImage(im, px + T * 0.06, py + T * 0.06, T * 0.88, T * 0.88);
            else { ctx.fillStyle = '#8a7a6a'; rounded(px + 3, py + 3, T - 6, T - 6, T * 0.3); ctx.fill(); }
          }
        }
      }
    }
    // Bonuses.
    for (const [k, b] of Object.entries(s.bonuses)) {
      const x = (Number(k) % L.W) * T;
      const y = Math.floor(Number(k) / L.W) * T;
      const bob = Math.sin(now / 250 + Number(k)) * T * 0.05;
      const glow = ctx.createRadialGradient(x + T / 2, y + T / 2, 1, x + T / 2, y + T / 2, T * 0.55);
      glow.addColorStop(0, 'rgba(125,255,179,.55)');
      glow.addColorStop(1, 'rgba(125,255,179,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, T, T);
      const im = img(BONUS_IMG[b]);
      if (im?.complete && im.naturalWidth) ctx.drawImage(im, x + T * 0.18, y + T * 0.18 + bob, T * 0.64, T * 0.64);
    }
    // Bombs.
    for (const b of s.bombs) {
      const left = Math.max(0, b.left ?? L.FUSE);
      const beat = 1 + 0.08 * Math.sin(now / (60 + left * 80));
      const sz = T * 0.8 * beat;
      const cx = b.x * T + T / 2;
      const cy = b.y * T + T / 2;
      const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, T * 0.7);
      glow.addColorStop(0, `rgba(255,120,140,${0.75 - left / 6})`);
      glow.addColorStop(1, 'rgba(255,77,109,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - T, cy - T, 2 * T, 2 * T);
      const im = img(EMOJI.bomb);
      if (im?.complete && im.naturalWidth) ctx.drawImage(im, cx - sz / 2, cy - sz / 2, sz, sz);
      else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx, cy, sz / 2.4, 0, 7); ctx.fill(); }
    }
    // Flames: plasma.
    ctx.globalCompositeOperation = 'lighter';
    for (const f of s.flames) {
      const cx = f.x * T + T / 2;
      const cy = f.y * T + T / 2;
      const flick = 0.85 + 0.15 * Math.sin(now / 40 + f.x * 3 + f.y);
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, T * 0.75 * flick);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.35, 'rgba(255,185,56,.9)');
      g.addColorStop(0.75, 'rgba(255,77,109,.55)');
      g.addColorStop(1, 'rgba(124,92,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - T, cy - T, 2 * T, 2 * T);
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const e = blasts[i];
      const k = (now - e.at) / 400;
      if (k >= 1) { blasts.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,217,138,${1 - k})`;
      ctx.lineWidth = T * 0.12 * (1 - k);
      ctx.beginPath();
      ctx.arc(e.x * T + T / 2, e.y * T + T / 2, T * (0.3 + k * 1.4), 0, 7);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // Aliens.
    const order = [...s.players].sort((a, b) => a.y - b.y);
    for (const p of order) {
      const pos = p === me ? p : shown(p);
      const cx = pos.x * T;
      const cy = pos.y * T;
      const color = colorOf(p.id) || '#fff';
      if (!p.alive) {
        const since = now - (deaths.get(p.id) || 0);
        if (since > 1600) continue;
        ctx.globalAlpha = Math.max(0, 1 - since / 1600);
        const im = img(EMOJI.skull);
        if (im?.complete && im.naturalWidth) ctx.drawImage(im, cx - T * 0.4, cy - T * 0.5 - since / 60, T * 0.8, T * 0.8);
        ctx.globalAlpha = 1;
        continue;
      }
      const moving = p === me ? Boolean(held[0]) : true;
      const hop = moving ? Math.abs(Math.sin(now / 90)) * T * 0.06 : 0;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + T * 0.36, T * 0.32, T * 0.1, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, T * 0.08);
      ctx.shadowColor = color;
      ctx.shadowBlur = T * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy - hop, T * 0.4, 0, 7);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const im = img(p.id < 0 ? EMOJI.bot : EMOJI.alien);
      if (im?.complete && im.naturalWidth) ctx.drawImage(im, cx - T * 0.38, cy - T * 0.4 - hop, T * 0.76, T * 0.76);
      // Name tag.
      const name = p === me ? 'Toi' : nameOf(p.id) || '';
      ctx.font = `700 ${Math.max(9, Math.round(T * 0.3))}px "Space Grotesk", sans-serif`;
      ctx.textAlign = 'center';
      const w = ctx.measureText(name).width + 8;
      ctx.fillStyle = 'rgba(13,10,36,.75)';
      rounded(cx - w / 2, cy - T * 0.95, w, T * 0.36, 6);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(name, cx, cy - T * 0.68);
    }
    // Countdown.
    const wait = startsAt - performance.now();
    if (wait > 0) {
      ctx.fillStyle = 'rgba(13,10,36,.45)';
      ctx.fillRect(0, 0, Wpx, Hpx);
      ctx.font = `700 ${T * 3}px "Space Grotesk", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb938';
      ctx.fillText(String(Math.ceil(wait / 1000)), Wpx / 2, Hpx / 2 + T);
    }
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function hud() {
    if (!s) return;
    onHud?.({ me, t: s.t || 0, closing: (s.t || 0) >= L.ROUND_TIME, alive: s.players.filter((p) => p.alive).length });
  }

  resize();
  raf = requestAnimationFrame(loop);
  return {
    round, tick, grid, events, you, press, release, bomb, resize,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', resize);
    },
  };
}
