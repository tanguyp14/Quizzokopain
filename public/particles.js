/* Animated particle network background (particles.js-like, dependency-free). */
(() => {
  'use strict';
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = [[255, 255, 255], [255, 185, 56], [124, 92, 255], [93, 224, 255]];
  const LINK = [200, 190, 255];
  const CURSOR = [255, 185, 56];
  // "Flash": after a right answer everything turns green for a moment, then fades back.
  let flash = null; // { rgb, until, ms }
  const FADE_MS = 500;
  function flashAmount(now) {
    if (!flash) return 0;
    const left = flash.until - now;
    if (left <= 0) { flash = null; return 0; }
    return Math.min(1, left / FADE_MS);
  }
  const mix = (c, k) => (k ? c.map((v, i) => Math.round(v + (flash.rgb[i] - v) * k)) : c).join(',');
  const LINK_DIST = 150;
  const mouse = { x: -9999, y: -9999 };
  let w = 0; let h = 0; let dpr = 1; let particles = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.max(45, Math.min(140, (w * h) / 11000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2.2 + 1.4,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }

  function frame(now = performance.now()) {
    const k = flashAmount(now);
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      if (!reduceMotion) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        // gentle repulsion around the cursor
        const dx = p.x - mouse.x; const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 10000 && d2 > 0) { p.x += dx / Math.sqrt(d2); p.y += dy / Math.sqrt(d2); }
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${mix(p.c, k)},1)`;
      ctx.shadowColor = `rgba(${mix(p.c, k)},.9)`;
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]; const b = particles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) {
          ctx.strokeStyle = `rgba(${mix(LINK, k)},${(0.45 + 0.35 * k) * (1 - d / LINK_DIST)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
      if (d < 180) {
        ctx.strokeStyle = `rgba(${mix(CURSOR, k)},${0.6 * (1 - d / 180)})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }
    if (!reduceMotion || flash) requestAnimationFrame(frame);
  }

  window.addEventListener('qzk:flash', (e) => {
    const { rgb = [46, 204, 143], ms = 2000 } = e.detail || {};
    const wasIdle = reduceMotion && !flash;
    flash = { rgb, until: performance.now() + ms };
    if (wasIdle) requestAnimationFrame(frame); // static background: redraw while it glows
  });

  window.addEventListener('resize', () => { resize(); if (reduceMotion) frame(); });
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  resize();
  frame();
})();
