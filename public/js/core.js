// Shared client state, rendering and helpers.

export const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

export const state = {
  me: null,
  pendingThemes: 0,
  catalog: null,
  socket: null,
  room: null, // latest room state from the server
  roomCode: null, // room the current route points to
  clockOffset: 0,
  drafts: {}, // input id -> value, survives re-renders
  ui: {},
  view: null, // function re-rendering the current page
};

// Actions and forms, filled by the page modules and dispatched by main.js.
export const actions = {};
export const forms = {};

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (ts) => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
export const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
export const LETTERS = 'ABCDEF';

let toastTimer;
export function toast(msg, bad = false) {
  $toast.textContent = msg;
  $toast.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = 'toast'; }, 2800);
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !['/api/login', '/api/me'].includes(path)) {
    state.me = null;
    go('#/login');
  }
  if (!res.ok) throw new Error(data.error || 'Erreur réseau.');
  return data;
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

/** Replaces the page while keeping typed text and focus. */
export function render(html) {
  const active = document.activeElement;
  const focusId = active && $app.contains(active) ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  $app.innerHTML = html;
  for (const el of $app.querySelectorAll('[data-draft]')) {
    if (state.drafts[el.id] !== undefined) el.value = state.drafts[el.id];
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch { /* not a text input */ }
    }
  }
  const autofocus = !focusId && $app.querySelector('[data-autofocus]');
  if (autofocus) autofocus.focus({ preventScroll: true });
  document.dispatchEvent(new Event('rendered'));
}

/** Registers the function that redraws the current page and draws it. */
export function show(view) {
  state.view = view;
  return view();
}
export const rerender = () => state.view && state.view();

export const draft = (id) => (state.drafts[id] ?? '').toString().trim();
export function clearDrafts(prefix, keep = []) {
  for (const k of Object.keys(state.drafts)) if (k.startsWith(prefix) && !keep.includes(k)) delete state.drafts[k];
}

// ---- display helpers -------------------------------------------------------

const AVATAR_COLORS = ['#7c5cff', '#ff5d73', '#3fa9f5', '#2ecc8f', '#ffb938', '#b16cff', '#ff8a3d', '#1fc8c8'];

/** Profile picture, or coloured initials when the account has none. */
export function avatar(user, size = 32) {
  const name = user?.username || '?';
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (user?.avatar) return `<img class="avatar" src="${esc(user.avatar)}" alt="" style="${style}" loading="lazy">`;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const initials = [...name].slice(0, 2).join('').toUpperCase();
  return `<span class="avatar initials" style="${style};background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}" aria-hidden="true">${esc(initials)}</span>`;
}

export const DIFFICULTIES = {
  facile: { label: 'Facile', emoji: '🟢' },
  moyen: { label: 'Moyen', emoji: '🟠' },
  difficile: { label: 'Difficile', emoji: '🔴' },
};
export function difficultyBadge(level) {
  const d = DIFFICULTIES[level];
  return d ? `<span class="badge diff-${level}">${d.emoji} ${d.label}</span>` : '';
}

/** "🟢 3 · 🟠 5 · 🔴 2": how many questions of each level a quiz has. */
export function levelsHtml(levels) {
  if (!levels) return '';
  return `<span class="levels" title="Questions par difficulté">${Object.entries(DIFFICULTIES)
    .filter(([k]) => levels[k]).map(([k, d]) => `<span>${d.emoji} ${levels[k]}</span>`).join('')}</span>`;
}

export function keywordChips(keywords = []) {
  return keywords.map((k) => `<span class="kw">#${esc(k)}</span>`).join('');
}

export function answerText(q) {
  switch (q.type) {
    case 'qcm': return q.choices?.[q.answer] ?? '';
    case 'vraifaux': return q.answer ? 'Vrai' : 'Faux';
    case 'estimation': return `${Number(q.answer).toLocaleString('fr-FR')}${q.unit ? ` ${q.unit}` : ''}`;
    default: return q.answer;
  }
}

export const TYPE_LABELS = {
  qcm: 'QCM', vraifaux: 'Vrai ou faux', libre: 'Réponse libre', rebus: 'Rébus', image: 'Devine l’image', estimation: 'Estimation',
};

export function mediaHtml(media, small = false) {
  if (!media) return '';
  return `<div class="q-media">
    ${media.imageUrl ? `<img src="${esc(media.imageUrl)}" alt="Image de la question" referrerpolicy="no-referrer" ${small ? 'style="max-height:140px"' : ''}>` : ''}
    ${media.emoji ? `<div class="emoji" ${small ? 'style="font-size:2rem"' : ''}>${esc(media.emoji)}</div>` : ''}
  </div>`;
}

export async function loadCatalog(force = false) {
  if (!state.catalog || force) state.catalog = await api('/api/catalog');
  return state.catalog;
}

export function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
export function sessionTake(k) {
  try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; }
}
