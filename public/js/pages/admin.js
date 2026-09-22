import {
  state, actions, render, show, api, toast, esc, fmtDate, plural, avatar, difficultyBadge, keywordChips, levelsHtml, answerText, TYPE_LABELS, draft,
  mediaHtml, title, sourceHtml,
} from '../core.js';
import { statusBadge } from './myThemes.js';

const TABS = [
  ['pending', '⏳ À valider'],
  ['themes', '📚 Tous les quiz'],
  ['users', '👥 Comptes'],
  ['rooms', '🟢 Rooms en cours'],
];

state.ui.adminTab = 'pending';
state.ui.adminOpen = null; // id of the theme whose questions are expanded
let data = {};

export async function adminPage() {
  if (state.me.role !== 'superadmin') return render('<div class="card">Réservé au SuperAdmin.</div>');
  state.ui.onThemeChange = () => adminPage();
  try {
    const tab = state.ui.adminTab;
    const [overview, payload] = await Promise.all([
      api('/api/admin/overview'),
      tab === 'pending' ? api('/api/admin/themes?status=pending')
        : tab === 'themes' ? api(`/api/admin/themes?status=${state.ui.adminStatus || 'all'}&q=${encodeURIComponent(draft('admin-tq'))}`)
          : tab === 'users' ? api(`/api/admin/users?q=${encodeURIComponent(draft('admin-uq'))}`)
            : Promise.resolve({}),
    ]);
    data = { overview, ...payload };
    if (state.ui.adminOpen && !data.full?.[state.ui.adminOpen]) await loadQuestions(state.ui.adminOpen);
  } catch (err) {
    return render(`<div class="card">${esc(err.message)}</div>`);
  }
  state.pendingThemes = data.overview.pendingThemes;
  document.dispatchEvent(new Event('me-changed'));
  show(renderAdmin);
}

async function loadQuestions(id) {
  const { theme } = await api(`/api/my-themes/${id}`);
  data.full = { ...(data.full || {}), [id]: theme.questions };
}

function renderAdmin() {
  const tab = state.ui.adminTab;
  const { overview } = data;
  let body = '';
  if (tab === 'pending') body = pendingTab();
  else if (tab === 'themes') body = themesTab();
  else if (tab === 'users') body = usersTab();
  else body = roomsTab();
  render(`
    <h1>${title('👑', 'Espace SuperAdmin')}</h1>
    <div class="tiles" style="margin-bottom:16px">
      <div class="tile"><div class="tile-value">${overview.pendingThemes}</div><div class="tile-label">quiz à valider</div></div>
      <div class="tile"><div class="tile-value">${overview.users}</div><div class="tile-label">comptes</div></div>
      <div class="tile"><div class="tile-value">${overview.rooms.length}</div><div class="tile-label">rooms ouvertes</div></div>
    </div>
    <div class="tabs admin-tabs">${TABS.map(([k, label]) => `<button data-action="admin-tab" data-tab="${k}" class="${tab === k ? 'active' : ''}">${label}${k === 'pending' && overview.pendingThemes ? ` (${overview.pendingThemes})` : ''}</button>`).join('')}</div>
    ${body}`);
}

function themeReview(t, { review }) {
  const open = state.ui.adminOpen === t.id;
  const questions = data.full?.[t.id];
  return `<div class="card stack">
    <div class="spread">
      <div class="row"><span style="font-size:2rem">${esc(t.emoji)}</span>
        <div><h3 style="margin:0">${esc(t.name)}</h3><span class="muted small">par <strong>${esc(t.authorName)}</strong> · ${fmtDate(t.updatedAt)}</span></div></div>
      ${statusBadge(t.status)}
    </div>
    <div class="row"><span class="badge">❓ ${plural(t.questionCount, 'question')}</span>${levelsHtml(t.levels)}
      <span class="badge">🎮 joué ${t.playCount} fois</span><span class="badge">⭐ ${t.favoriteCount}</span></div>
    ${t.description ? `<p class="muted small" style="margin:0">${esc(t.description)}</p>` : ''}
    <div class="kws">${keywordChips(t.keywords)}</div>
    ${t.status === 'rejected' && t.reviewNote ? `<p class="review-note">💬 ${esc(t.reviewNote)}</p>` : ''}
    <button class="btn ghost sm" data-action="admin-open" data-id="${t.id}">${open ? '▲ Masquer les questions' : '▼ Voir les questions et réponses'}</button>
    ${open && questions ? `<ol class="q-list">${questions.map((q) => `
      <li><div>${difficultyBadge(q.difficulty || t.difficulty)} <span class="chip">${esc(TYPE_LABELS[q.type])}</span> <strong>${esc(q.prompt)}</strong>
        ${q.media ? mediaHtml(q.media, true) : ''}
        <div class="small">✅ ${esc(answerText(q))}${q.choices ? ` <span class="muted">(${q.choices.map(esc).join(' / ')})</span>` : ''}${q.accept?.length ? ` <span class="muted">· aussi : ${q.accept.map(esc).join(', ')}</span>` : ''}</div>${sourceHtml(q.source)}</div></li>`).join('')}</ol>` : ''}
    <div class="row">
      ${review || t.status !== 'approved' ? `<button class="btn good sm" data-action="approve-theme" data-id="${t.id}">✅ Valider</button>` : ''}
      ${review || t.status !== 'rejected' ? `<button class="btn bad sm" data-action="reject-theme" data-id="${t.id}">❌ Refuser</button>` : ''}
      <a class="btn ghost sm" href="#/my-themes/${t.id}">✏️ Modifier</a>
      <button class="btn ghost sm" data-action="delete-theme" data-id="${t.id}" data-name="${esc(t.name)}">🗑 Supprimer</button>
    </div>
  </div>`;
}

function pendingTab() {
  return data.themes.length ? `<div class="stack">${data.themes.map((t) => themeReview(t, { review: true })).join('')}</div>`
    : '<div class="card center muted">🎉 Aucun quiz en attente de validation.</div>';
}

function themesTab() {
  const st = state.ui.adminStatus || 'all';
  return `<div class="card stack">
      <input id="admin-tq" type="search" data-draft data-admin-search placeholder="🔎 Nom, mot-clé ou pseudo…">
      <div class="row">${[['all', 'Tous'], ['approved', '✅ Validés'], ['pending', '⏳ En attente'], ['rejected', '❌ Refusés']]
    .map(([k, l]) => `<button class="pill ${st === k ? 'active' : ''}" data-action="admin-status" data-status="${k}">${l}</button>`).join('')}</div>
    </div>
    <p class="muted small">Les quiz intégrés de Quizzokopain ne sont pas listés ici (ils sont dans le code).</p>
    <div class="stack">${data.themes.map((t) => themeReview(t, { review: false })).join('') || '<div class="card center muted">Aucun quiz.</div>'}</div>`;
}

function usersTab() {
  return `<div class="card stack">
    <input id="admin-uq" type="search" data-draft data-admin-search placeholder="🔎 Rechercher un pseudo…">
    <div class="table-wrap"><table class="history">
      <thead><tr><th>Compte</th><th>Inscrit le</th><th>Parties</th><th>Quiz</th><th>Actions</th></tr></thead>
      <tbody>${data.users.map((u) => `<tr class="${u.banned ? 'banned' : ''}">
        <td><span class="row">${avatar(u, 30)}<strong>${esc(u.username)}</strong>${u.role === 'superadmin' ? ' <span class="badge st-approved">👑</span>' : ''}${u.banned ? ' <span class="badge st-rejected">Suspendu</span>' : ''}</span></td>
        <td class="small">${fmtDate(u.createdAt)}</td><td>${u.gamesPlayed}</td><td>${u.themesCount}</td>
        <td>${u.role === 'superadmin' ? '<span class="muted small">—</span>' : `<span class="row">
          <button class="btn ${u.banned ? 'good' : 'ghost'} sm" data-action="ban-user" data-id="${u.id}" data-banned="${u.banned ? 0 : 1}" data-name="${esc(u.username)}">${u.banned ? 'Réactiver' : 'Suspendre'}</button>
          <button class="btn ghost sm" data-action="reset-password" data-id="${u.id}" data-name="${esc(u.username)}">🔑 Mot de passe</button>
          ${u.avatar ? `<button class="btn ghost sm" data-action="remove-user-avatar" data-id="${u.id}">🖼️ Retirer la photo</button>` : ''}
          <button class="btn bad sm" data-action="delete-user" data-id="${u.id}" data-name="${esc(u.username)}">🗑</button></span>`}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function roomsTab() {
  const { rooms } = data.overview;
  return rooms.length ? `<div class="card"><ul class="list">${rooms.map((r) => `
    <li><span><strong class="mono">${esc(r.code)}</strong> · admin ${esc(r.host)} · ${plural(r.players, 'joueur')} · ${esc(r.theme || 'lobby')} <span class="chip">${esc(r.phase)}</span></span>
    <span class="row"><a class="btn ghost sm" href="#/room/${esc(r.code)}">Rejoindre</a>
    <button class="btn bad sm" data-action="close-room" data-code="${esc(r.code)}">Fermer</button></span></li>`).join('')}</ul></div>`
    : '<div class="card center muted">Aucune room ouverte.</div>';
}

// ---- actions -------------------------------------------------------------------

const act = async (fn, msg) => {
  try {
    await fn();
    if (msg) toast(msg);
    adminPage();
  } catch (err) { toast(err.message, true); }
};

actions['admin-tab'] = (el) => { state.ui.adminTab = el.dataset.tab; state.ui.adminOpen = null; adminPage(); };
actions['admin-status'] = (el) => { state.ui.adminStatus = el.dataset.status; adminPage(); };
actions['admin-open'] = async (el) => {
  const id = Number(el.dataset.id);
  state.ui.adminOpen = state.ui.adminOpen === id ? null : id;
  if (state.ui.adminOpen) {
    try { await loadQuestions(id); } catch (err) { return toast(err.message, true); }
  }
  renderAdmin();
};
actions['approve-theme'] = (el) => act(() => api(`/api/admin/themes/${el.dataset.id}/approve`, { method: 'POST' }), 'Quiz validé ✅ — il est maintenant dans la liste');
actions['reject-theme'] = (el) => {
  const note = prompt('Motif du refus (visible par le créateur) :', '');
  if (note === null) return;
  act(() => api(`/api/admin/themes/${el.dataset.id}/reject`, { method: 'POST', body: { note } }), 'Quiz refusé');
};
actions['ban-user'] = (el) => {
  const ban = el.dataset.banned === '1';
  if (ban && !confirm(`Suspendre ${el.dataset.name} ? Il sera déconnecté immédiatement.`)) return;
  act(() => api(`/api/admin/users/${el.dataset.id}/ban`, { method: 'POST', body: { banned: ban } }), ban ? 'Compte suspendu' : 'Compte réactivé');
};
actions['reset-password'] = (el) => {
  const password = prompt(`Nouveau mot de passe pour ${el.dataset.name} (6 caractères min.) :`);
  if (!password) return;
  act(() => api(`/api/admin/users/${el.dataset.id}/password`, { method: 'POST', body: { password } }), 'Mot de passe changé');
};
actions['remove-user-avatar'] = (el) => act(() => api(`/api/admin/users/${el.dataset.id}/avatar`, { method: 'DELETE' }), 'Photo retirée');
actions['delete-user'] = (el) => {
  if (!confirm(`Supprimer définitivement le compte ${el.dataset.name} ? Son historique reste visible sous son pseudo.`)) return;
  act(() => api(`/api/admin/users/${el.dataset.id}`, { method: 'DELETE' }), 'Compte supprimé');
};
actions['close-room'] = (el) => {
  if (!confirm(`Fermer la room ${el.dataset.code} ? Les joueurs seront renvoyés à l’accueil.`)) return;
  act(() => api(`/api/admin/rooms/${el.dataset.code}`, { method: 'DELETE' }), 'Room fermée');
};

let searchTimer;
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-admin-search]')) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(adminPage, 250);
});
