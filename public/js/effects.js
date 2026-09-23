// Celebrations for a right answer: confetti, and the particle background turns green.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#2ecc8f', '#ffb938', '#7c5cff', '#ff5d73', '#3fa9f5', '#ffffff'];

export function confetti({ count = 180, duration = 2800 } = {}) {
  if (reduceMotion) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  // Two bursts from the lower corners, towards the centre.
  const pieces = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const speed = 10 + Math.random() * 10;
    return {
      x: left ? w * 0.1 : w * 0.9,
      y: h * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 11 + Math.random() * 11,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[i % COLORS.length],
    };
  });

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
    for (const p of pieces) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/** A small squadron of 3D flying saucers crossing the screen, each at its own height and speed. */
export function ufoFlyby(count = 5) {
  if (reduceMotion) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'ufo';
    el.setAttribute('aria-hidden', 'true');
    const size = 48 + Math.random() * 52;
    el.style.width = `${size}px`;
    el.innerHTML = '<img src="/emoji/1f6f8.webp" alt="">';
    document.body.appendChild(el);
    const leftToRight = i % 2 === 0;
    const y = h * (0.08 + Math.random() * 0.6);
    const from = leftToRight ? -size - 20 : w + 20;
    const to = leftToRight ? w + 20 : -size - 20;
    const bob = 12 + Math.random() * 18;
    const tilt = leftToRight ? 8 : -8;
    const at = (k, dy, r) => ({ transform: `translate(${from + (to - from) * k}px, ${y + dy}px) rotate(${r}deg)`, offset: k });
    const anim = el.animate(
      [at(0, 0, tilt), at(0.25, -bob, -tilt / 2), at(0.5, bob, tilt / 2), at(0.75, -bob, -tilt / 2), at(1, 0, tilt)],
      { duration: 1800 + Math.random() * 1400, delay: i * 180 + Math.random() * 200, easing: 'ease-in-out', fill: 'both' },
    );
    anim.onfinish = () => el.remove();
  }
}

/** Confetti, flying saucers, and the particle network glows green for 2 seconds. */
export function celebrate() {
  confetti();
  ufoFlyby();
  window.dispatchEvent(new CustomEvent('qzk:flash', { detail: { rgb: [46, 204, 143], ms: 2000 } }));
}
