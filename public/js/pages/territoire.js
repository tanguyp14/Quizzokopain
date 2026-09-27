// Territoire: Qix-like game page (canvas, score, record, Top, touch controls).
import {
  state, actions, render, api, esc, avatar, title,
} from '../core.js';
import { createTerritoire } from '../games/territoire/engine.js';
import { GOAL } from '../games/territoire/logic.js';

const GAME = 'territoire';
let t = null; // { engine, best, bestLevel, games, board }

const num = (n) => Math.round(n).toLocaleString('fr-FR');

export async function territoirePage() {
  render('<p class="muted">Chargement du territoire…</p>');
  const [save, board] = await Promise.all([
    api(`/api/arcade/${GAME}/save`).then((r) => r.save?.data || {}).catch(() => ({})),
    api(`/api/arcade/${GAME}/leaderboard`).then((r) => r.bySector || r.players || []).catch(() => []),
  ]);
  if (!location.hash.startsWith('#/territoire')) return;
  t = { best: Number(save.best) || 0, bestLevel: Number(save.bestLevel) || 0, games: Number(save.games) || 0, board };
  render(pageHtml());
  const canvas = document.getElementById('tr-canvas');
  t.engine = createTerritoire(canvas, { onChange: hud, onOver: gameOver });
  state.view = () => {}; // the page draws itself
  state.ui.cleanup = leave;
  // Touch controls: hold a direction button.
  for (const b of document.querySelectorAll('.tr-pad button')) {
    const d = b.dataset.dir;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); t?.engine.press(d); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => t?.engine.release(d));
  }
  hud(t.engine.info());
  renderBoard();
}

function leave() {
  if (!t) return;
  t.engine.destroy();
  t = null;
}

function pageHtml() {
  return `<div class="tr">
    <section class="tr-play">
      <div class="tr-canvas-wrap card">
        <canvas id="tr-canvas" aria-label="Territoire"></canvas>
        <div class="tr-start" id="tr-start">
          <p style="font-size:3rem;margin:0">🛸</p>
          <h2 style="margin:0">${title('👽', 'Territoire')}</h2>
          <p class="muted">Conquiers ${Math.round(GOAL * 100)} % de chaque planète pour Jimmy, sans te faire couper par les astéroïdes.</p>
          <button class="btn accent" data-action="tr-start">Jouer</button>
        </div>
      </div>
      <div class="tr-pad" aria-label="Commandes">
        <button class="btn" data-dir="up" aria-label="Haut">▲</button>
        <button class="btn" data-dir="left" aria-label="Gauche">◄</button>
        <button class="btn" data-dir="down" aria-label="Bas">▼</button>
        <button class="btn" data-dir="right" aria-label="Droite">►</button>
      </div>
    </section>
    <aside class="tr-side stack">
      <div class="card tr-hud">
        <div class="tr-stat"><span class="muted small">Planète</span><strong id="tr-level">1</strong></div>
        <div class="tr-stat"><span class="muted small">Territoire</span><strong id="tr-claimed">0 %</strong></div>
        <div class="tr-stat"><span class="muted small">Vies</span><strong id="tr-lives">❤️❤️❤️</strong></div>
        <div class="tr-stat"><span class="muted small">Score</span><strong id="tr-score">0</strong></div>
        <div class="bl-bar tr-bar"><span id="tr-bar"></span><i style="left:${GOAL * 100}%"></i></div>
        <p class="small muted" id="tr-best"></p>
      </div>
      <div class="card small stack">
        <strong>Comment jouer</strong>
        <p>🛸 Ta soucoupe longe les bords conquis. Avec les <kbd>flèches</kbd> (ou <kbd>ZQSD</kbd>, ou les boutons sur mobile), fonce dans le vide pour tracer une ligne.</p>
        <p>🟪 Reviens sur la terre ferme : toute la zone fermée sans astéroïde est conquise. Plus la zone est grande, plus elle rapporte.</p>
        <p>☄️ Les <strong>astéroïdes</strong> qui rebondissent dans le vide coupent ta ligne s’ils la touchent. 👾 Les <strong>sentinelles</strong> patrouillent sur les bords : évite-les.</p>
        <p>🏁 ${Math.round(GOAL * 100)} % conquis : planète suivante (plus d’astéroïdes et de sentinelles), et +1 vie toutes les 3 planètes.</p>
      </div>
      <div class="card">
        <h3 style="margin:0 0 10px">🏆 Top</h3>
        <div id="tr-board"></div>
      </div>
    </aside>
  </div>`;
}

const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };

function hud(info) {
  if (!t) return;
  set('tr-level', String(info.level));
  set('tr-claimed', `${Math.floor(info.claimed * 100)} %`);
  set('tr-lives', info.lives > 0 ? '❤️'.repeat(Math.min(info.lives, 8)) : '💀');
  set('tr-score', num(info.score));
  const bar = document.getElementById('tr-bar');
  if (bar) bar.style.width = `${Math.min(100, info.claimed * 100)}%`;
  set('tr-best', `Record : <strong>${num(t.best)}</strong>${t.bestLevel ? ` · planète ${t.bestLevel}` : ''} · ${t.games} partie${t.games > 1 ? 's' : ''}`);
}

async function gameOver({ score, level }) {
  if (!t) return;
  t.games += 1;
  const record = score > t.best;
  if (record) { t.best = score; t.bestLevel = level; }
  hud(t.engine.info());
  const $s = document.getElementById('tr-start');
  if ($s) {
    $s.hidden = false;
    $s.innerHTML = `<p style="font-size:3rem;margin:0">${record ? '🏆' : '💥'}</p>
      <h2 style="margin:0">${record ? 'Nouveau record !' : 'Fin de partie'}</h2>
      <p>Score : <strong>${num(score)}</strong> · planète ${level}</p>
      <button class="btn accent" data-action="tr-start">Rejouer</button>`;
  }
  try {
    await api(`/api/arcade/${GAME}/save`, {
      method: 'PUT',
      body: { data: { best: t.best, bestLevel: t.bestLevel, games: t.games }, score: t.best },
    });
    const r = await api(`/api/arcade/${GAME}/leaderboard`);
    if (t) { t.board = r.bySector || r.players || []; renderBoard(); }
  } catch { /* offline: the record is sent with the next game */ }
}

function renderBoard() {
  const $b = document.getElementById('tr-board');
  if (!$b || !t) return;
  $b.innerHTML = t.board.length ? `<ol class="bl-rank">${t.board.slice(0, 10).map((p, i) => `
    <li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(p, 28)}
      <span class="bl-rank-name">${esc(p.username)}</span><span class="badge">${num(p.score)}</span></li>`).join('')}</ol>`
    : '<p class="muted">Personne au classement pour l’instant.</p>';
}

actions['tr-start'] = () => {
  if (!t) return;
  document.getElementById('tr-start').hidden = true;
  t.engine.start(1);
  document.getElementById('tr-canvas')?.focus?.();
};

export const _debug = { get game() { return t; } };
