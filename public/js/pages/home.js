import {
  state, actions, forms, render, show, api, go, toast, esc, fmtDate, plural, avatar, draft, wave, sourceHtml, anecdoteHtml,
} from '../core.js';

export function homePage() {
  const me = state.me;
  show(() => render(`
    <section class="hero">
      <h1>${wave(`Salut ${me.username}`, { once: true })}</h1>
      <p class="muted">Jimmy 👽 te salue. Crée une room privée, partage le lien, et que le meilleur gagne.</p>
    </section>
    <div id="invites"></div>
    <div class="grid-2">
      <div class="card stack">
        <h2>🎉 Créer une room</h2>
        <p class="muted">Tu seras l’admin de la session : tu choisis le quiz, tu lances les questions et tu valides les réponses libres.</p>
        <button class="btn accent big block" data-action="create-room">Créer une room</button>
        <div class="row">
          <button class="btn big" style="flex:1" data-action="create-solo">🎯 Jouer en solo</button>
          <a class="btn ghost big center" style="flex:1" href="#/themes">📚 Les quiz</a>
        </div>
      </div>
      <div class="card stack">
        <h2>🔑 Rejoindre une room</h2>
        <form data-form="join" class="stack">
          <input id="join-code" class="code-input" type="text" maxlength="5" placeholder="CODE" autocomplete="off" data-draft required aria-label="Code de la room">
          <button class="btn big block" type="submit">Rejoindre</button>
        </form>
        <p class="muted small">Tes amis peuvent aussi t’inviter directement : l’invitation apparaît ici et en notification.</p>
      </div>
    </div>
    <div class="card stack" style="margin-top:16px">
      <div class="spread"><h2 style="margin:0">🕘 Mes derniers quiz</h2><a href="#/stats" class="small">Voir mes stats →</a></div>
      <div id="history-list"><p class="muted">Chargement…</p></div>
    </div>`));
  loadInvites();
  loadHistory();
}

async function loadInvites() {
  try {
    const { invitations } = await api('/api/invitations');
    const $el = document.getElementById('invites');
    if (!$el) return;
    $el.innerHTML = invitations.length ? `<div class="card stack invite-card" style="margin-bottom:16px">
      <h2 style="margin:0">📨 Invitations reçues</h2>
      <ul class="list">${invitations.map((i) => `
        <li><span><strong>${esc(i.from)}</strong> t’invite dans la room <strong>${esc(i.code)}</strong>${i.theme ? ` · ${esc(i.theme)}` : ''}</span>
        <span class="row"><button class="btn accent sm" data-action="accept-invite" data-code="${esc(i.code)}">Rejoindre</button>
        <button class="btn ghost sm" data-action="dismiss-invite" data-code="${esc(i.code)}">Ignorer</button></span></li>`).join('')}</ul></div>` : '';
  } catch { /* ignore */ }
}

async function loadHistory() {
  try {
    const { games } = await api('/api/history');
    const $list = document.getElementById('history-list');
    if (!$list) return;
    $list.innerHTML = games.length ? `<ul class="list">${games.slice(0, 10).map(historyItem).join('')}</ul>`
      : '<p class="muted">Aucune partie pour l’instant. Lance-toi !</p>';
  } catch (err) {
    toast(err.message, true);
  }
}

function historyItem(g) {
  const result = g.myRank
    ? `<span class="chip ${g.myRank === 1 ? 'accent' : ''}">${g.myRank === 1 ? '🏆' : `#${g.myRank}`} · ${g.myScore}/${g.questionCount} pt${g.myScore > 1 ? 's' : ''}</span>`
    : '<span class="chip">🎙️ Admin</span>';
  return `<li><a class="li-link" href="#/history/${g.id}">
    <span><strong>${esc(g.theme)}</strong><br><span class="muted small">${fmtDate(g.endedAt)} · ${plural(g.playerCount, 'joueur')} · gagnant : ${esc(g.winner || '—')}</span></span>
    ${result}</a></li>`;
}

export async function historyPage(id) {
  render('<p class="muted">Chargement…</p>');
  let game;
  try {
    ({ game } = await api(`/api/history/${id}`));
  } catch (err) {
    return render(`<div class="card"><p>${esc(err.message)}</p><a href="#/">← Retour</a></div>`);
  }
  const { players } = game;
  show(() => render(`
    <p><a href="#/">← Accueil</a></p>
    <div class="card stack">
      <div class="spread"><h2 style="margin:0">${esc(game.theme)}</h2><span class="muted small">${fmtDate(game.endedAt)} · room ${esc(game.roomCode)} · admin : ${esc(game.hostName)}</span></div>
      <ul class="list scoreboard">${players.map((p) => `<li><span class="pos">${p.rank}.</span>${avatar({ username: p.username }, 28)}<span class="name">${esc(p.username)}</span><span class="pts">${plural(p.score, 'pt')}</span></li>`).join('')}</ul>
    </div>
    <div class="card stack" style="margin-top:16px">
      <h3>Questions & réponses</h3>
      ${game.questions.map((q, i) => `
        <div class="stack" style="padding:12px 0;border-top:1px solid var(--line)">
          <div class="spread"><strong>${i + 1}. ${esc(q.prompt)}</strong><span class="chip">${esc(q.typeLabel)}</span></div>
          ${q.media?.emoji ? `<div class="center" style="font-size:2rem">${esc(q.media.emoji)}</div>` : ''}
          <div>✅ <strong>${esc(q.answer)}</strong></div>
          ${anecdoteHtml(q.explanation)}
          ${sourceHtml(q.source)}
          <div class="row">${players.map((p) => {
            const a = p.answers[i] || {};
            return `<span class="chip ${a.correct ? 'good' : 'bad'}">${esc(p.username)} : ${esc(a.given ?? '—')} ${a.correct ? '✓' : '✗'}</span>`;
          }).join('')}</div>
        </div>`).join('')}
    </div>`));
}

/** Creates a room, optionally with starting settings ({ hostPlays: true } for solo, { themeId }). */
export async function createRoom(settings = {}) {
  try {
    const { code } = await api('/api/rooms', { method: 'POST', body: settings });
    go(`#/room/${code}`);
  } catch (err) { toast(err.message, true); }
}

actions['create-room'] = () => createRoom();
actions['create-solo'] = () => createRoom({ hostPlays: true });
actions['accept-invite'] = (el) => go(`#/room/${el.dataset.code}`);
actions['dismiss-invite'] = async (el) => {
  await api(`/api/invitations/${el.dataset.code}`, { method: 'DELETE' }).catch(() => {});
  loadInvites();
};

forms.join = async () => {
  const code = draft('join-code').toUpperCase();
  if (!code) return;
  try {
    await api(`/api/rooms/${encodeURIComponent(code)}`);
    delete state.drafts['join-code'];
    go(`#/room/${code}`);
  } catch (err) { toast(err.message, true); }
};
