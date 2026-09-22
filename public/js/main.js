// Entry point: routing, global socket, navigation and event delegation.
import {
  $app, state, actions, forms, api, go, toast, esc, avatar, sessionSet, rerender,
} from './core.js';
import { authPage } from './pages/auth.js';
import { homePage, historyPage } from './pages/home.js';
import { themesPage } from './pages/themes.js';
import { myThemesPage, editorPage } from './pages/myThemes.js';
import { statsPage } from './pages/stats.js';
import { profilePage, setMyAvatar } from './pages/profile.js';
import { adminPage } from './pages/admin.js';
import {
  roomPage, leaveRoom, onRoomState, rejoinAfterReconnect,
} from './pages/room.js';

const $userbox = document.getElementById('userbox');
const $nav = document.getElementById('nav');
const $notices = document.getElementById('notices');

// ---- header ------------------------------------------------------------------

const NAV = [
  ['#/', '🎮 Jouer'],
  ['#/themes', '📚 Quiz'],
  ['#/my-themes', '✍️ Mes quiz'],
  ['#/stats', '📊 Stats'],
];

function renderHeader() {
  const { me } = state;
  if (!me) {
    $nav.innerHTML = '';
    $userbox.innerHTML = '';
    return;
  }
  const hash = location.hash || '#/';
  const current = (href) => (href === '#/' ? hash === '#/' || hash.startsWith('#/room') || hash.startsWith('#/history') : hash.startsWith(href));
  const items = [...NAV];
  if (me.role === 'superadmin') items.push(['#/admin', `👑 Admin${state.pendingThemes ? ` <span class="nav-badge">${state.pendingThemes}</span>` : ''}`]);
  $nav.innerHTML = items.map(([href, label]) => `<a href="${href}" class="${current(href) ? 'active' : ''}">${label}</a>`).join('');
  $userbox.innerHTML = `<a href="#/profile" class="me-link" title="Mon profil">${avatar(me, 32)}<span class="who">${esc(me.username)}</span></a>
    <button class="btn ghost sm" data-action="logout">Déconnexion</button>`;
}
document.addEventListener('me-changed', renderHeader);

// ---- realtime ----------------------------------------------------------------

function ensureSocket() {
  if (state.socket) return;
  const socket = io({ transports: ['websocket', 'polling'] });
  state.socket = socket;
  socket.on('connect', rejoinAfterReconnect);
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      socket.disconnect();
      state.socket = null;
      state.me = null;
      go('#/login');
    }
  });
  socket.on('disconnect', (reason) => {
    // The server cut us off on purpose: account suspended or password reset.
    if (reason === 'io server disconnect') {
      state.socket = null;
      state.me = null;
      toast('Ta session a été fermée.', true);
      go('#/login');
    }
  });
  socket.on('room:state', onRoomState);
  socket.on('room:kicked', () => {
    toast('Tu as été retiré de la room.', true);
    state.roomCode = null;
    state.room = null;
    go('#/');
  });
  socket.on('room:closed', () => {
    toast('Cette room a été fermée.', true);
    state.roomCode = null;
    state.room = null;
    go('#/');
  });
  socket.on('invite:new', showInvite);
  socket.on('app:version', onVersion);
  socket.on('me:avatar', (url) => { if (state.me && state.me.avatar !== url) setMyAvatar(url); });
  socket.on('themes:changed', () => {
    state.catalog = null;
    if (state.me?.role === 'superadmin') refreshMe();
    if (state.room?.phase === 'lobby' && state.room.isHost) rerender();
  });
}

// The server says which build it runs; if it changes while this tab is open
// (a deploy happened), offer a reload so the new CSS/JS are used.
let loadedVersion = null;
function onVersion(version) {
  if (!loadedVersion) { loadedVersion = version; return; }
  if (version === loadedVersion || document.querySelector('.notice.update')) return;
  const el = document.createElement('div');
  el.className = 'notice update';
  el.innerHTML = `<div><strong>🆕 Nouvelle version de Quizzokopain</strong><br><span class="muted small">Recharge pour en profiter${state.room && !['lobby', 'finished'].includes(state.room.phase) ? ' (après ta partie)' : ''}.</span></div>
    <div class="row"><button class="btn accent sm" data-reload>Recharger</button><button class="btn ghost sm" data-dismiss>Plus tard</button></div>`;
  $notices.appendChild(el);
}

function showInvite(inv) {
  if (state.roomCode === inv.code) return;
  const el = document.createElement('div');
  el.className = 'notice';
  el.innerHTML = `<div><strong>📨 ${esc(inv.from)}</strong> t’invite à jouer${inv.theme ? ` · ${esc(inv.theme)}` : ''}<br><span class="muted small">Room ${esc(inv.code)}</span></div>
    <div class="row"><button class="btn accent sm" data-join="${esc(inv.code)}">Rejoindre</button><button class="btn ghost sm" data-dismiss>Plus tard</button></div>`;
  $notices.appendChild(el);
  setTimeout(() => el.remove(), 30000);
}

$notices.addEventListener('click', (e) => {
  const notice = e.target.closest('.notice');
  if (!notice) return;
  if (e.target.closest('[data-reload]')) { location.reload(); return; }
  const code = e.target.closest('[data-join]')?.dataset.join;
  if (code) go(`#/room/${code}`);
  if (code || e.target.closest('[data-dismiss]')) notice.remove();
});

async function refreshMe() {
  try {
    const res = await api('/api/me');
    state.me = res.user;
    state.pendingThemes = res.pendingThemes || 0;
  } catch {
    state.me = null;
  }
  renderHeader();
}

// ---- routing -----------------------------------------------------------------

async function route() {
  const hash = location.hash || '#/';
  if (!state.me) await refreshMe();
  state.ui.onThemeChange = null;

  const roomMatch = hash.match(/^#\/room\/([A-Za-z0-9]+)/);
  const nextCode = roomMatch ? roomMatch[1].toUpperCase() : null;
  if (state.roomCode && state.roomCode !== nextCode) leaveRoom();

  renderHeader();
  if (!state.me) {
    if (nextCode) sessionSet('qzk_after_login', hash);
    return authPage();
  }
  ensureSocket();
  window.scrollTo({ top: 0 });

  if (hash.startsWith('#/login')) return go('#/');
  if (nextCode) return roomPage(nextCode);
  let m;
  if ((m = hash.match(/^#\/history\/(\d+)/))) return historyPage(Number(m[1]));
  if (hash.startsWith('#/themes')) return themesPage();
  if (hash === '#/my-themes/new') return editorPage(null);
  if ((m = hash.match(/^#\/my-themes\/(\d+)/))) return editorPage(Number(m[1]));
  if (hash.startsWith('#/my-themes')) return myThemesPage();
  if (hash.startsWith('#/stats')) return statsPage();
  if (hash.startsWith('#/profile')) return profilePage();
  if (hash.startsWith('#/admin')) return adminPage();
  return homePage();
}

// ---- global actions & event delegation ----------------------------------------

actions.logout = async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  leaveRoom();
  state.socket?.disconnect();
  state.socket = null;
  state.me = null;
  state.catalog = null;
  go('#/login');
};

actions.copy = async (el) => {
  try {
    await navigator.clipboard.writeText(el.dataset.text);
    toast('Copié !');
  } catch {
    prompt('Copie ce texte :', el.dataset.text);
  }
};

function dispatchClick(e) {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action] && !el.disabled) {
    e.preventDefault();
    actions[el.dataset.action](el);
  }
}
$app.addEventListener('click', dispatchClick);
$userbox.addEventListener('click', dispatchClick);

$app.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  const name = form.dataset.form === 'question' ? `question:${form.dataset.prefix}` : form.dataset.form;
  if (forms[name]) {
    e.preventDefault();
    forms[name](form);
  }
});

let liveTimer;
$app.addEventListener('input', (e) => {
  if (!e.target.matches('[data-draft]')) return;
  state.drafts[e.target.id] = e.target.value;
  if (e.target.matches('[data-live]')) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(rerender, 120);
  }
});

$app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-draft]')) state.drafts[el.id] = el.value;
  if (el.matches('[data-rerender]')) rerender();
});

// Brand: split once so hovering plays a weight wave across the letters.
for (const el of document.querySelectorAll('.wave-hover')) {
  el.innerHTML = [...el.textContent].map((c, i) => `<span class="ch" style="--i:${i}">${esc(c)}</span>`).join('');
}

window.addEventListener('hashchange', route);
route();
