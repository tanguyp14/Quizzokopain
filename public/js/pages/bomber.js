// Jimmy Bomber: the page. Home (create / join an arena, the Top), lobby (seats, bots, rounds to
// win), the live game (canvas, scores, touch pad) and the end of the game.
import {
  state, actions, forms, render, api, esc, avatar, toast, title,
} from '../core.js';
import { createBomberView } from '../games/bomber/engine.js';
import { WIN_TARGETS, BONUSES, ROUND_TIME } from '../games/bomber/logic.js';
import { notesButton } from '../patchnotes.js';

let B = null; // { code, arena (public state), view, top, me, banner }

const emit = (event, payload) => new Promise((resolve) => {
  if (!state.socket) { resolve({ ok: false, error: 'Connexion perdue, recharge la page.' }); return; }
  state.socket.emit(event, payload || {}, resolve);
});

export async function bomberPage() {
  const m = location.hash.match(/^#\/bomber\/([A-Za-z0-9]{4,8})/);
  const code = m ? m[1].toUpperCase() : null;
  if (!B) B = { code: null, arena: null, view: null, top: [], me: null, banner: null };
  listen();
  state.view = () => {};
  state.ui.cleanup = cleanup;
  if (code && B.code !== code) {
    render('<p class="muted">Connexion à l’arène…</p>');
    const r = await emit('bomber:join', { code });
    if (!r.ok) { toast(r.error, true); B.code = null; location.replace('#/bomber'); return; }
    B.code = r.code;
  }
  if (!code && B.code) await leaveArena();
  if (B.code && !B.arena && B.seen?.code === B.code) B.arena = B.seen;
  if (!B.code) {
    const top = await api('/api/bomber/top').catch(() => ({ players: [], me: null }));
    if (!location.hash.startsWith('#/bomber') || B.code) return;
    B.top = top.players;
    B.me = top.me;
  }
  draw();
}

/** Leaving the page (not just changing screen inside it) leaves the arena. */
function cleanup() {
  if (location.hash.startsWith('#/bomber')) return;
  unlisten();
  B?.view?.destroy();
  if (B?.code) emit('bomber:leave');
  B = null;
}

async function leaveArena() {
  B.view?.destroy();
  B.view = null;
  B.arena = null;
  const was = B.code;
  B.code = null;
  if (was) await emit('bomber:leave');
}

// ---- socket events ----

let bound = null;
function listen() {
  const sock = state.socket;
  if (!sock || bound === sock) return;
  unlisten();
  bound = sock;
  sock.on('bomber:state', onState);
  sock.on('bomber:round', onRound);
  sock.on('bomber:tick', onTick);
  sock.on('bomber:grid', onGrid);
  sock.on('bomber:events', onEvents);
  sock.on('bomber:you', onYou);
  sock.on('bomber:roundEnd', onRoundEnd);
  sock.on('bomber:closed', onClosed);
}
function unlisten() {
  if (!bound) return;
  for (const [ev, fn] of [['bomber:state', onState], ['bomber:round', onRound], ['bomber:tick', onTick], ['bomber:grid', onGrid],
    ['bomber:events', onEvents], ['bomber:you', onYou], ['bomber:roundEnd', onRoundEnd], ['bomber:closed', onClosed]]) bound.off(ev, fn);
  bound = null;
}

function onState(a) {
  if (!B) return;
  B.seen = a; // may arrive just before the reply to « create » / « join »
  if (a.code !== B.code) return;
  const before = B.arena?.phase;
  B.arena = a;
  if (a.phase === 'play' && before === 'play' && B.view) { hudScores(); return; }
  if (a.phase !== 'play') { B.view?.destroy(); B.view = null; }
  draw();
}
let pendingRound = null;
function onRound(r) {
  if (!B) return;
  B.banner = null;
  const banner = document.getElementById('bm-banner');
  if (banner) banner.hidden = true;
  if (!B.view) pendingRound = r;
  else B.view.round(r);
  ensureView();
}
const onTick = (t) => B?.view?.tick(t);
const onGrid = (g) => B?.view?.grid(g);
function onEvents(list) {
  B?.view?.events(list);
  for (const e of list) {
    if (e.type === 'death' && e.id === state.me.id) setBanner('💀 Tu as sauté ! Regarde la fin de la manche…');
    if (e.type === 'closing') setBanner('⚠️ Le temps est écoulé : l’arène se referme !', 2500);
  }
}
const onYou = (pos) => B?.view?.you(pos);
function onRoundEnd({ winner }) {
  const seat = B?.arena?.seats.find((s) => s && s.id === winner);
  setBanner(seat ? `🏆 ${seat.id === state.me.id ? 'Tu gagnes' : `${esc(seat.name)} gagne`} la manche !` : '💥 Personne ne survit : manche nulle', 3000);
}
function onClosed() {
  if (!B) return;
  toast('L’arène a été fermée.', true);
  B.code = null;
  location.hash = '#/bomber';
}

function setBanner(html, ms = 0) {
  if (!B) return;
  B.banner = html;
  const el = document.getElementById('bm-banner');
  if (el) { el.innerHTML = html; el.hidden = false; }
  if (ms) setTimeout(() => { if (B && B.banner === html) { B.banner = null; const e = document.getElementById('bm-banner'); if (e) e.hidden = true; } }, ms);
}

// ---- screens ----

function draw() {
  if (!B) return;
  if (!B.code || !B.arena) return render(homeHtml());
  const a = B.arena;
  if (a.phase === 'lobby') return render(lobbyHtml(a));
  if (a.phase === 'over') return render(overHtml(a));
  render(gameHtml(a));
  ensureView();
}

const num = (n) => Math.round(n || 0).toLocaleString('fr-FR');
const seatName = (s) => (s.id === state.me.id ? `${esc(s.name)} (toi)` : esc(s.name));
const seatAvatar = (s, size) => (s.bot ? `<span class="bm-bot" style="width:${size}px;height:${size}px">🤖</span>` : avatar({ username: s.name, avatar: s.avatar, frame: s.frame }, size));

function homeHtml() {
  return `<div class="bm">
    <section class="card bm-hero">
      <div class="bm-hero-art" aria-hidden="true">💣👽🪨</div>
      <div>
        <h1 style="margin:0">${title('💣', 'Jimmy Bomber')}</h1>
        <p class="muted">Des aliens, des astéroïdes et des bombes à neutrons. Jusqu’à 4 dans l’arène : le dernier debout gagne la manche. Les bots 🤖 complètent les places vides.</p>
        <div class="row" style="flex-wrap:wrap;gap:10px">
          <button class="btn accent big" data-action="bm-create">🚀 Créer une arène</button>
          <form data-form="bm-join" class="row bm-join"><input type="text" name="code" maxlength="8" placeholder="Code de l’arène" autocomplete="off" required>
            <button class="btn">Rejoindre</button></form>
        </div>
        <div style="margin-top:10px">${notesButton('bomber')}</div>
      </div>
    </section>
    <div class="bm-home-grid">
      <section class="card">
        <h2 style="margin-top:0">🎮 Comment jouer</h2>
        <ul class="bm-rules">
          <li><kbd>←↑↓→</kbd> ou <kbd>ZQSD</kbd>/<kbd>WASD</kbd> pour bouger, <kbd>Espace</kbd> pour poser une bombe (boutons à l’écran sur mobile).</li>
          <li>Les bombes explosent en croix et font sauter les astéroïdes 🪨. Elles s’enchaînent !</li>
          <li>Bonus cachés : ${Object.values(BONUSES).map((b) => `${b.emoji} ${b.name}`).join(' · ')}.</li>
          <li>Au bout de ${ROUND_TIME / 60} minutes, l’arène se referme en spirale.</li>
          <li>Seules les victoires contre d’autres joueurs comptent pour le Top.</li>
        </ul>
        ${B.me ? `<p class="small muted" style="margin:0">Toi : ${B.me.wins} victoire${B.me.wins > 1 ? 's' : ''} · ${num(B.me.kills)} alien${B.me.kills > 1 ? 's' : ''} explosé${B.me.kills > 1 ? 's' : ''} · ${B.me.games} partie${B.me.games > 1 ? 's' : ''}</p>` : ''}
      </section>
      <section class="card">
        <h2 style="margin-top:0">🏆 Top Bomber</h2>
        ${B.top.length ? `<ol class="bl-rank">${B.top.map((p, k) => `<li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${avatar(p, 26)}
          <span class="bl-rank-name">${esc(p.username)}</span><span class="badge">🏆 ${p.wins}</span><span class="small muted">💥 ${num(p.kills)}</span></li>`).join('')}</ol>`
          : '<p class="muted">Personne au classement : lance la première arène !</p>'}
      </section>
    </div>
  </div>`;
}

function lobbyHtml(a) {
  const host = a.host === state.me.id;
  const link = `${location.origin}/#/bomber/${a.code}`;
  const filled = a.seats.filter(Boolean).length;
  return `<div class="bm">
    <section class="card bm-lobby">
      <div class="bm-lobby-head">
        <div><h1 style="margin:0">${title('💣', 'Arène')} <span class="bm-code">${a.code}</span></h1>
          <p class="muted small" style="margin:4px 0 0">Partage le code ou le lien à tes potes. ${host ? 'Tu es l’hôte : c’est toi qui lances.' : 'L’hôte lance la partie.'}</p></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn ghost sm" data-action="copy" data-text="${esc(link)}">🔗 Copier le lien</button>
          <button class="btn ghost sm" data-action="copy" data-text="${a.code}">📋 Code</button>
          <button class="btn ghost sm" data-action="bm-leave">🚪 Quitter</button>
        </div>
      </div>
      <div class="bm-seats">${a.seats.map((s, i) => (s ? `<div class="bm-seat" style="--sc:${s.color}">
          ${seatAvatar(s, 64)}<strong>${seatName(s)}</strong><span class="small muted">${s.bot ? 'Bot' : s.id === a.host ? '👑 Hôte' : s.connected ? 'Prêt' : 'Déconnecté'}</span></div>`
        : `<div class="bm-seat empty"><span class="bm-empty">${i + 1}</span><span class="small muted">Place libre</span></div>`)).join('')}</div>
      ${host ? `<div class="bm-controls">
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-action="bm-bot" data-add="1" ${filled >= 4 ? 'disabled' : ''}>🤖 Ajouter un bot</button>
          <button class="btn ghost sm" data-action="bm-bot" data-add="" ${a.seats.some((s) => s?.bot) ? '' : 'disabled'}>➖ Retirer un bot</button></div>
        <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><span class="small muted">Manches pour gagner :</span>
          ${WIN_TARGETS.map((t) => `<button class="btn ghost sm ${a.target === t ? 'active' : ''}" data-action="bm-target" data-t="${t}">${t}</button>`).join('')}</div>
        <button class="btn accent big" data-action="bm-start" ${filled < 2 ? 'disabled' : ''}>💣 Lancer la partie</button>
      </div>` : `<p class="center muted">En attente de l’hôte… · ${a.target} manche${a.target > 1 ? 's' : ''} pour gagner</p>`}
    </section>
  </div>`;
}

function scoresHtml(a) {
  return a.seats.filter(Boolean).map((s) => `<div class="bm-score" style="--sc:${s.color}">${seatAvatar(s, 28)}<span class="bm-score-name">${seatName(s)}</span>
    <span class="bm-wins">${'★'.repeat(s.wins)}<span class="muted">${'☆'.repeat(Math.max(0, a.target - s.wins))}</span></span></div>`).join('');
}

function gameHtml(a) {
  return `<div class="bm bm-game">
    <div class="bm-top">
      <div class="bm-scores" id="bm-scores">${scoresHtml(a)}</div>
      <div class="bm-hud" id="bm-hud"></div>
    </div>
    <div class="bm-stage"><canvas id="bm-canvas"></canvas><div class="bm-banner" id="bm-banner" ${B.banner ? '' : 'hidden'}>${B.banner || ''}</div></div>
    <div class="bm-pad">
      <div class="bm-dpad">
        <button class="btn" data-dir="up" aria-label="Haut">▲</button>
        <button class="btn" data-dir="left" aria-label="Gauche">◄</button>
        <button class="btn" data-dir="down" aria-label="Bas">▼</button>
        <button class="btn" data-dir="right" aria-label="Droite">►</button>
      </div>
      <button class="btn accent bm-bomb-btn" id="bm-bomb" aria-label="Poser une bombe">💣</button>
    </div>
    <p class="small muted center bm-help">Manche ${a.round} · <kbd>←↑↓→</kbd>/<kbd>ZQSD</kbd> bouger · <kbd>Espace</kbd> bombe ·
      <button class="btn ghost sm" data-action="bm-leave">🚪 Quitter</button></p>
  </div>`;
}

function overHtml(a) {
  const ranked = a.seats.filter(Boolean).sort((x, y) => y.wins - x.wins || y.kills - x.kills);
  const champ = a.seats.find((s) => s && s.id === a.result?.champion);
  return `<div class="bm">
    <section class="card bm-over">
      <div class="bm-trophy">🏆</div>
      <h1 style="margin:0">${champ ? (champ.id === state.me.id ? 'Victoire !' : `${esc(champ.name)} gagne !`) : 'Partie terminée'}</h1>
      ${a.result && !a.result.versus ? '<p class="small muted">Partie contre des bots : elle ne compte pas pour le Top.</p>' : ''}
      <ol class="bm-podium">${ranked.map((s, i) => `<li style="--sc:${s.color}"><span class="bm-place">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${seatAvatar(s, 36)}
        <strong>${seatName(s)}</strong><span class="badge">★ ${s.wins}</span><span class="small muted">💥 ${s.kills}</span></li>`).join('')}</ol>
      <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
        ${a.host === state.me.id ? '<button class="btn accent big" data-action="bm-again">🔁 Revanche</button>' : '<span class="muted">L’hôte peut relancer une revanche.</span>'}
        <button class="btn ghost" data-action="bm-leave">🚪 Quitter l’arène</button>
      </div>
    </section>
  </div>`;
}

// ---- the live game ----

function ensureView() {
  if (!B || B.arena?.phase !== 'play') return;
  const canvas = document.getElementById('bm-canvas');
  if (!canvas) return;
  if (B.view && B.view.canvas === canvas) return;
  B.view?.destroy();
  const seats = () => B?.arena?.seats.filter(Boolean) || [];
  B.view = createBomberView(canvas, {
    myId: state.me.id,
    socket: state.socket,
    colorOf: (id) => seats().find((s) => s.id === id)?.color,
    nameOf: (id) => seats().find((s) => s.id === id)?.name,
    onHud: hud,
  });
  B.view.canvas = canvas;
  if (pendingRound) { B.view.round(pendingRound); pendingRound = null; }
  for (const b of document.querySelectorAll('.bm-dpad button')) {
    const d = b.dataset.dir;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); B?.view?.press(d); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => B?.view?.release(d));
  }
  document.getElementById('bm-bomb')?.addEventListener('pointerdown', (e) => { e.preventDefault(); B?.view?.bomb(); });
}

let lastHud = '';
function hud({ me, t, closing, alive }) {
  const el = document.getElementById('bm-hud');
  if (!el) return;
  const left = Math.max(0, ROUND_TIME - t);
  const html = `${me ? `<span class="badge">💣 ${me.bombs}</span><span class="badge">🔥 ${me.range}</span><span class="badge">⚡ ${me.speed}</span>` : ''}
    <span class="badge ${closing ? 'bad' : ''}">⏱️ ${closing ? 'L’arène se referme !' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`}</span>
    <span class="badge">👽 ${alive} en vie</span>`;
  if (html !== lastHud) { el.innerHTML = html; lastHud = html; }
}
function hudScores() {
  const el = document.getElementById('bm-scores');
  if (el && B?.arena) el.innerHTML = scoresHtml(B.arena);
}

// ---- actions ----

actions['bm-create'] = async () => {
  const r = await emit('bomber:create');
  if (!r.ok) return toast(r.error, true);
  B.code = r.code;
  location.hash = `#/bomber/${r.code}`;
};
forms['bm-join'] = async (form) => {
  const code = String(form.elements.code.value || '').trim().toUpperCase();
  if (code) location.hash = `#/bomber/${code}`;
};
actions['bm-leave'] = async () => {
  await leaveArena();
  location.hash = '#/bomber';
};
actions['bm-bot'] = async (el) => { const r = await emit('bomber:bot', { add: Boolean(el.dataset.add) }); if (!r.ok) toast(r.error, true); };
actions['bm-target'] = async (el) => { const r = await emit('bomber:target', { target: Number(el.dataset.t) }); if (!r.ok) toast(r.error, true); };
actions['bm-start'] = async () => { const r = await emit('bomber:start'); if (!r.ok) toast(r.error, true); };
actions['bm-again'] = async () => { const r = await emit('bomber:lobby'); if (!r.ok) toast(r.error, true); };
