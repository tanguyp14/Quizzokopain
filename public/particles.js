/* Animated particle network background (particles.js-like, dependency-free). */
(() => {
  'use strict';
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['255,255,255', '255,185,56', '124,92,255', '93,224,255'];
  const LINK_DIST = 130;
  const mouse = { x: -9999, y: -9999 };
  let w = 0; let h = 0; let dpr = 1; let particles = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(110, (w * h) / 14000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 2 + 0.8,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }

  function frame() {
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
      ctx.fillStyle = `rgba(${p.c},.85)`;
      ctx.fill();
    }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]; const b = particles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) {
          ctx.strokeStyle = `rgba(255,255,255,${0.18 * (1 - d / LINK_DIST)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { resize(); if (reduceMotion) frame(); });
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  resize();
  frame();
})();
