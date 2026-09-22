/* Quizzokopain — client (vanilla JS, no build step). */
(() => {
  'use strict';

  const $app = document.getElementById('app');
  const $userbox = document.getElementById('userbox');
  const $toast = document.getElementById('toast');

  let me = null;
  let catalog = null;
  let socket = null;
  let room = null; // latest room state from the server
  let roomCode = null; // room the current route points to
  let clockOffset = 0;
  const drafts = {}; // input id -> value, survives re-renders
  const ui = { authTab: 'login', cqOpen: false };

  // ---- utils ---------------------------------------------------------------

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (ts) => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  const LETTERS = 'ABCDEF';

  let toastTimer;
  function toast(msg, bad = false) {
    $toast.textContent = msg;
    $toast.className = `toast show${bad ? ' bad' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.className = 'toast'; }, 2800);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !['/api/login', '/api/me'].includes(path)) {
      me = null;
      go('#/login');
    }
    if (!res.ok) throw new Error(data.error || 'Erreur réseau.');
    return data;
  }

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  /** Replaces the page while keeping typed text and focus. */
  function render(html) {
    const active = document.activeElement;
    const focusId = active && $app.contains(active) ? active.id : null;
    const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    $app.innerHTML = html;
    for (const el of $app.querySelectorAll('[data-draft]')) {
      if (drafts[el.id] !== undefined) el.value = drafts[el.id];
    }
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch { /* not a text input */ }
      }
    }
    const autofocus = !focusId && $app.querySelector('[data-autofocus]');
    if (autofocus) autofocus.focus();
    tick();
  }

  function renderUserbox() {
    $userbox.innerHTML = me
      ? `<span class="who">👤 <strong>${esc(me.username)}</strong></span><button class="btn ghost sm" data-action="logout">Déconnexion</button>`
      : '';
  }

  // ---- routing -------------------------------------------------------------

  async function route() {
    const hash = location.hash || '#/';
    if (!me) {
      try {
        me = (await api('/api/me')).user;
      } catch {
        me = null;
      }
    }
    renderUserbox();

    const roomMatch = hash.match(/^#\/room\/([A-Za-z0-9]+)/);
    const nextCode = roomMatch ? roomMatch[1].toUpperCase() : null;
    if (roomCode && roomCode !== nextCode) leaveRoom();

    if (!me) {
      if (nextCode) sessionStorageSet('qzk_after_login', hash);
      return renderAuth();
    }
    if (hash.startsWith('#/login')) return go('#/');
    if (nextCode) return enterRoom(nextCode);
    const histMatch = hash.match(/^#\/history\/(\d+)/);
    if (histMatch) return renderHistoryDetail(Number(histMatch[1]));
    return renderHome();
  }

  function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
  function sessionStorageTake(k) {
    try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; }
  }

  // ---- auth ----------------------------------------------------------------

  function renderAuth() {
    const login = ui.authTab === 'login';
    render(`
      <section class="hero">
        <h1>Quizzokopain 🥖</h1>
        <p class="muted">Des quiz gratuits entre potes, dans des rooms privées.<br>QCM, questions libres, rébus, films en emojis…</p>
      </section>
      <div class="card auth-card">
        <div class="tabs">
          <button data-action="auth-tab" data-tab="login" class="${login ? 'active' : ''}">Connexion</button>
          <button data-action="auth-tab" data-tab="register" class="${login ? '' : 'active'}">Créer un compte</button>
        </div>
        <form data-form="auth" class="stack">
          <div class="field"><label for="auth-user">Pseudo</label>
            <input id="auth-user" name="username" type="text" autocomplete="username" required minlength="3" maxlength="20" data-autofocus></div>
          <div class="field"><label for="auth-pass">Mot de passe</label>
            <input id="auth-pass" name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" required minlength="6"></div>
          <p class="error" id="auth-error"></p>
          <button class="btn accent big block" type="submit">${login ? 'Se connecter' : 'Créer mon compte'}</button>
        </form>
      </div>`);
  }

  // ---- home ----------------------------------------------------------------

  async function renderHome() {
    render(`
      <section class="hero">
        <h1>Salut ${esc(me.username)} 👋</h1>
        <p class="muted">Crée une room privée, partage le code, et que le meilleur gagne.</p>
      </section>
      <div class="grid-2">
        <div class="card stack">
          <h2>🎉 Créer une room</h2>
          <p class="muted">Tu seras l’admin de la session : tu choisis le thème, tu lances les questions et tu valides les réponses libres.</p>
          <button class="btn accent big block" data-action="create-room">Créer une room</button>
        </div>
        <div class="card stack">
          <h2>🔑 Rejoindre une room</h2>
          <form data-form="join" class="stack">
            <input id="join-code" class="code-input" type="text" maxlength="5" placeholder="CODE" autocomplete="off" data-draft required>
            <button class="btn big block" type="submit">Rejoindre</button>
          </form>
        </div>
      </div>
      <div class="card stack" style="margin-top:16px">
        <h2>🕘 Mes derniers quiz</h2>
        <div id="history-list"><p class="muted">Chargement…</p></div>
      </div>`);

    try {
      const { games } = await api('/api/history');
      const $list = document.getElementById('history-list');
      if (!$list) return;
      $list.innerHTML = games.length ? `<ul class="list">${games.map(historyItem).join('')}</ul>`
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
      <span><strong>${esc(g.theme)}</strong><br><span class="muted small">${fmtDate(g.endedAt)} · ${g.playerCount} joueur${g.playerCount > 1 ? 's' : ''} · gagnant : ${esc(g.winner || '—')}</span></span>
      ${result}</a></li>`;
  }

  async function renderHistoryDetail(id) {
    render('<p class="muted">Chargement…</p>');
    let game;
    try {
      ({ game } = await api(`/api/history/${id}`));
    } catch (err) {
      return render(`<div class="card"><p>${esc(err.message)}</p><a href="#/">← Retour</a></div>`);
    }
    const players = game.players;
    render(`
      <p><a href="#/">← Accueil</a></p>
      <div class="card stack">
        <div class="spread"><h2 style="margin:0">${esc(game.theme)}</h2><span class="muted small">${fmtDate(game.endedAt)} · room ${esc(game.roomCode)} · admin : ${esc(game.hostName)}</span></div>
        ${scoreboard(players.map((p) => ({ id: p.userId, username: p.username, score: p.score, rank: p.rank })))}
      </div>
      <div class="card stack" style="margin-top:16px">
        <h3>Questions & réponses</h3>
        ${game.questions.map((q, i) => `
          <div class="stack" style="padding:12px 0;border-top:1px solid var(--line)">
            <div class="spread"><strong>${i + 1}. ${esc(q.prompt)}</strong><span class="chip">${esc(q.typeLabel)}</span></div>
            ${q.media ? mediaHtml(q.media, true) : ''}
            <div>✅ <strong>${esc(q.answer)}</strong>${q.explanation ? ` <span class="muted small">— ${esc(q.explanation)}</span>` : ''}</div>
            <div class="row">${players.map((p) => {
              const a = p.answers[i] || {};
              return `<span class="chip ${a.correct ? 'good' : 'bad'}">${esc(p.username)} : ${esc(a.given ?? '—')} ${a.correct ? '✓' : '✗'}</span>`;
            }).join('')}</div>
          </div>`).join('')}
      </div>`);
  }

  // ---- room ----------------------------------------------------------------

  function ensureSocket() {
    if (socket) return socket;
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => { if (roomCode) joinRoom(); });
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') { me = null; go('#/login'); }
    });
    socket.on('room:state', (state) => {
      if (state.code !== roomCode) return;
      const prev = room;
      room = state;
      clockOffset = state.serverNow - Date.now();
      if (prev && (prev.index !== state.index || prev.phase !== state.phase)) clearAnswerDrafts();
      renderRoom();
    });
    socket.on('room:kicked', () => {
      toast('Tu as été retiré de la room.', true);
      roomCode = null;
      room = null;
      go('#/');
    });
    return socket;
  }

  function clearAnswerDrafts() {
    for (const k of Object.keys(drafts)) if (k.startsWith('ans-')) delete drafts[k];
  }

  function joinRoom() {
    socket.emit('room:join', { code: roomCode }, (res) => {
      if (!res.ok) {
        toast(res.error, true);
        roomCode = null;
        go('#/');
      }
    });
  }

  function enterRoom(code) {
    if (roomCode === code && room) return renderRoom();
    roomCode = code;
    room = null;
    render('<p class="muted center">Connexion à la room…</p>');
    ensureSocket();
    if (socket.connected) joinRoom();
  }

  function leaveRoom() {
    if (socket?.connected) socket.emit('room:leave');
    roomCode = null;
    room = null;
  }

  function send(event, payload = {}) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res) => {
        if (!res?.ok) toast(res?.error || 'Erreur', true);
        resolve(res?.ok);
      });
    });
  }

  function renderRoom() {
    if (!room) return;
    switch (room.phase) {
      case 'lobby': return renderLobby();
      case 'finished': return renderFinished();
      default: return renderGame();
    }
  }

  function playersList(withKick) {
    if (!room.players.length) return '<p class="muted">Personne pour l’instant… partage le code !</p>';
    return `<ul class="list">${room.players.map((p) => `
      <li><span class="row"><span class="dot ${p.connected ? '' : 'off'}"></span><strong>${esc(p.username)}</strong>${p.id === room.me ? ' <span class="muted small">(toi)</span>' : ''}</span>
      ${withKick ? `<button class="btn ghost sm" data-action="kick" data-user="${p.id}" title="Retirer">✕</button>` : ''}</li>`).join('')}</ul>`;
  }

  function themeLabel(id) {
    const all = [...(catalog?.special || []), ...(catalog?.themes || [])];
    const t = all.find((x) => x.id === id);
    return t ? `${t.emoji} ${t.name}` : id;
  }

  async function loadCatalog() {
    if (!catalog) catalog = await api('/api/catalog');
    return catalog;
  }

  function renderLobby() {
    if (!catalog) {
      loadCatalog().then(renderRoom).catch((err) => toast(err.message, true));
      return render('<p class="muted center">Chargement…</p>');
    }
    const s = room.settings;
    const invite = `${location.origin}/#/room/${room.code}`;
    const host = room.isHost;
    const themeBtn = (t) => `<button class="theme-btn ${s.themeId === t.id ? 'active' : ''}" ${host ? `data-action="set-theme" data-id="${t.id}"` : 'disabled'}>
      <span class="e">${t.emoji}</span><span>${esc(t.name)}</span></button>`;
    const timeOpts = [0, 15, 20, 30, 45, 60, 90];

    render(`
      <div class="card center stack">
        <div class="muted">Code de la room</div>
        <div class="room-code">${esc(room.code)}</div>
        <div class="row" style="justify-content:center">
          <button class="btn ghost sm" data-action="copy" data-text="${esc(invite)}">🔗 Copier le lien d’invitation</button>
          <button class="btn ghost sm" data-action="copy" data-text="${esc(room.code)}">📋 Copier le code</button>
        </div>
        <div class="muted small">Admin : <strong>${esc(room.host.username)}</strong>${host ? ' (toi)' : ''}</div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card stack">
          <h3>👥 Joueurs (${room.players.length})</h3>
          ${playersList(host)}
          ${host ? '' : '<p class="muted small">⏳ En attente du lancement par l’admin…</p>'}
        </div>

        <div class="card stack ${host ? 'host-panel' : ''}">
          <h3>⚙️ Réglages ${host ? '<span class="host-badge small">· admin</span>' : ''}</h3>
          <div>
            <label>Thème</label>
            <div class="themes">${catalog.special.map(themeBtn).join('')}${catalog.themes.map(themeBtn).join('')}</div>
          </div>
          <div class="grid-2">
            <div><label for="set-count">Nombre de questions</label>
              <select id="set-count" data-setting="questionCount" ${host ? '' : 'disabled'}>
                ${[5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${s.questionCount === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select></div>
            <div><label for="set-time">Temps par question</label>
              <select id="set-time" data-setting="timeLimit" ${host ? '' : 'disabled'}>
                ${timeOpts.map((t) => `<option value="${t}" ${s.timeLimit === t ? 'selected' : ''}>${t ? `${t} s` : 'Illimité'}</option>`).join('')}
              </select></div>
          </div>
          <div>
            <label>Types de questions</label>
            <div class="checks">${catalog.types.map((t) => `
              <label class="check"><input type="checkbox" data-type="${t.id}" ${s.types.includes(t.id) ? 'checked' : ''} ${host ? '' : 'disabled'}> ${esc(t.label)}</label>`).join('')}</div>
            <p class="muted small">Les réponses libres, rébus et images sont validées par l’admin. Estimation : le plus proche marque le point.</p>
          </div>
          ${room.customQuestionCount ? `<p class="chip accent">✍️ ${room.customQuestionCount} question(s) perso ajoutée(s)</p>` : ''}
          ${host ? `<button class="btn accent big block" data-action="start" ${room.players.length ? '' : 'disabled'}>🚀 Lancer la partie</button>` : ''}
        </div>
      </div>

      ${host ? customQuestionsPanel() : ''}

      <p class="center" style="margin-top:20px"><a href="#/">← Quitter la room</a></p>`);
  }

  function customQuestionsPanel() {
    const type = drafts['cq-type'] || 'qcm';
    const field = (id, label, attrs = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="text" data-draft ${attrs}></div>`;
    let specific = '';
    if (type === 'qcm') {
      specific = `<div class="grid-2">${[0, 1, 2, 3].map((i) => field(`cq-choice-${i}`, `Choix ${LETTERS[i]}${i < 2 ? ' *' : ''}`)).join('')}</div>
        <div class="field"><label for="cq-correct">Bonne réponse</label>
          <select id="cq-correct" data-draft>${[0, 1, 2, 3].map((i) => `<option value="${i}">Choix ${LETTERS[i]}</option>`).join('')}</select></div>`;
    } else if (type === 'vraifaux') {
      specific = `<div class="field"><label for="cq-vf">Réponse</label>
        <select id="cq-vf" data-draft><option value="true">Vrai</option><option value="false">Faux</option></select></div>`;
    } else if (type === 'estimation') {
      specific = `<div class="grid-2">${field('cq-answer', 'Valeur exacte *', 'inputmode="decimal"')}${field('cq-unit', 'Unité (optionnel)')}</div>`;
    } else {
      specific = `${field('cq-answer', 'Réponse attendue *')}
        ${field('cq-accept', 'Autres réponses acceptées (séparées par des virgules)')}`;
    }
    const media = ['rebus', 'image'].includes(type) || drafts['cq-emoji'] || drafts['cq-image'];
    return `
      <details class="card" id="cq-panel" style="margin-top:16px" ${ui.cqOpen ? 'open' : ''}>
        <summary style="cursor:pointer;font-weight:800">✍️ Ajouter mes propres questions (${room.customQuestionCount})</summary>
        <div class="stack" style="margin-top:14px">
          ${room.customQuestions?.length ? `<ul class="list">${room.customQuestions.map((q, i) => `
            <li><span><span class="chip">${esc(q.typeLabel)}</span> ${esc(q.prompt)} ${q.media?.emoji ? esc(q.media.emoji) : ''} <span class="muted small">→ ${esc(q.answer)}</span></span>
            <button class="btn ghost sm" data-action="remove-cq" data-index="${i}">✕</button></li>`).join('')}</ul>` : ''}
          <form data-form="custom-question" class="stack">
            <div class="grid-2">
              <div class="field"><label for="cq-type">Type</label>
                <select id="cq-type" data-draft data-rerender>${catalog.types.map((t) => `<option value="${t.id}" ${t.id === type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
              ${field('cq-prompt', type === 'rebus' || type === 'image' ? 'Question (optionnel)' : 'Question *')}
            </div>
            ${media ? `<div class="grid-2">${field('cq-emoji', 'Emojis / texte à deviner')}${field('cq-image', 'ou URL d’une image', 'inputmode="url" placeholder="https://…"')}</div>`
              : '<p class="muted small">Astuce : choisis le type « Devine l’image » ou « Rébus » pour ajouter des emojis ou une image.</p>'}
            ${specific}
            <button class="btn" type="submit">➕ Ajouter la question</button>
          </form>
          <p class="muted small">Tes questions sont mélangées à celles du thème choisi (ou jouées seules avec « Mes questions »).</p>
        </div>
      </details>`;
  }

  function mediaHtml(media, small = false) {
    if (!media) return '';
    return `<div class="q-media">
      ${media.imageUrl ? `<img src="${esc(media.imageUrl)}" alt="Image de la question" referrerpolicy="no-referrer" ${small ? 'style="max-height:140px"' : ''}>` : ''}
      ${media.emoji ? `<div class="emoji" ${small ? 'style="font-size:2rem"' : ''}>${esc(media.emoji)}</div>` : ''}
    </div>`;
  }

  function renderGame() {
    const q = room.question;
    const host = room.isHost;
    const answered = room.players.filter((p) => p.answered).length;
    const header = `
      <div class="q-head">
        <span class="chip">${esc(room.theme ? `${room.theme.emoji} ${room.theme.name}` : '')}</span>
        <span class="chip accent">Question ${room.index + 1} / ${room.total}</span>
        <span class="chip">${esc(q.typeLabel)}</span>
        <span class="chip" id="timer-text">${room.deadline ? '' : '∞'}</span>
      </div>
      ${room.deadline ? '<div class="timer"><div id="timer-bar" style="width:100%"></div></div>' : ''}
      <h2 class="q-prompt">${esc(q.prompt)}</h2>
      ${mediaHtml(q.media)}`;

    let body = '';
    if (room.phase === 'question') body = host ? hostQuestionView(q, answered) : playerQuestionView(q);
    else if (room.phase === 'correction') body = host ? correctionView() : `<p class="center muted big">⏳ L’admin corrige les réponses…</p>${myAnswerLine()}`;
    else if (room.phase === 'reveal') body = revealView(q);

    render(`
      <div class="card stack">${header}${body}</div>
      <div class="grid-2" style="margin-top:16px">
        <div class="card stack">
          <h3>🏆 Classement</h3>
          ${scoreboard(room.players, room.phase === 'question')}
        </div>
        ${host ? `<div class="card stack host-panel">
          <h3>🎙️ Panneau admin</h3>
          <p class="muted small">${room.phase === 'question' ? `${answered} / ${room.players.filter((p) => p.connected).length} joueurs ont répondu.` : ''}</p>
          <button class="btn bad sm" data-action="end">⏹ Terminer la partie maintenant</button>
        </div>` : ''}
      </div>`);
  }

  function myAnswerLine() {
    return room.myAnswer ? `<p class="center">Ta réponse : <strong>${esc(room.myAnswer.text)}</strong></p>` : '';
  }

  function choicesHtml(q, { interactive, selected, correct }) {
    if (q.type === 'vraifaux') {
      return `<div class="choices vf">${[true, false].map((v) => {
        const cls = [selected === v ? 'selected' : '', correct !== undefined ? (correct === v ? 'correct' : 'dim') : ''].join(' ');
        return `<button class="choice ${cls}" ${interactive ? `data-action="answer" data-value="${v}"` : 'disabled'}>${v ? '👍 Vrai' : '👎 Faux'}</button>`;
      }).join('')}</div>`;
    }
    return `<div class="choices">${q.choices.map((c, i) => {
      const cls = [selected === i ? 'selected' : '', correct !== undefined ? (correct === i ? 'correct' : 'dim') : ''].join(' ');
      return `<button class="choice ${cls}" ${interactive ? `data-action="answer" data-value="${i}"` : 'disabled'}><span class="letter">${LETTERS[i]}</span>${esc(c)}</button>`;
    }).join('')}</div>`;
  }

  function playerQuestionView(q) {
    const mine = room.myAnswer;
    if (q.type === 'qcm' || q.type === 'vraifaux') {
      return `${choicesHtml(q, { interactive: true, selected: mine?.value })}
        <p class="center muted small">${mine ? '✅ Réponse enregistrée — tu peux encore changer d’avis.' : 'Choisis ta réponse !'}</p>`;
    }
    const id = `ans-${room.index}`;
    const numeric = q.type === 'estimation';
    return `<form data-form="answer" class="stack">
        <div class="answer-box">
          <input id="${id}" type="text" data-draft ${numeric ? 'inputmode="decimal" placeholder="Ton estimation' + (q.unit ? ` (${esc(q.unit)})` : '') + '"' : 'placeholder="Ta réponse"'} autocomplete="off" maxlength="200" data-autofocus>
          <button class="btn accent" type="submit">${mine ? 'Modifier' : 'Valider'}</button>
        </div>
      </form>
      <p class="center muted small">${mine ? `✅ Réponse envoyée : <strong>${esc(mine.text)}</strong> — tu peux la modifier jusqu’à la fin.` : ''}</p>`;
  }

  function hostQuestionView(q, answered) {
    const expected = `<div class="answer-reveal"><span class="muted small">Réponse attendue (visible par toi seul)</span><br>
      <span class="big">${esc(q.answer)}</span>${q.accept?.length ? `<br><span class="muted small">Aussi acceptées : ${q.accept.map(esc).join(', ')}</span>` : ''}</div>`;
    const choices = q.choices || q.type === 'vraifaux' ? choicesHtml(q, { interactive: false }) : '';
    return `${choices}${expected}
      <div class="row">${room.players.map((p) => `<span class="chip ${p.answered ? 'good' : ''}">${p.answered ? '✓' : '…'} ${esc(p.username)}</span>`).join('')}</div>
      <button class="btn accent big block" data-action="close">⏭ Clore la question (${answered} réponse${answered > 1 ? 's' : ''})</button>`;
  }

  function correctionView() {
    return `<div class="stack">
      <div class="answer-reveal"><span class="muted small">Réponse attendue</span><br><span class="big">${esc(room.question.answer)}</span></div>
      <p class="muted small">Pré-correction automatique : ajuste si besoin puis valide.</p>
      <ul class="list">${room.correction.map((c) => `
        <li><span><strong>${esc(c.username)}</strong> : ${esc(c.answer)}</span>
        <span class="toggle">
          <button data-action="verdict" data-user="${c.userId}" data-correct="true" class="${c.correct ? 'on-good' : ''}">✓</button>
          <button data-action="verdict" data-user="${c.userId}" data-correct="false" class="${c.correct ? '' : 'on-bad'}">✗</button>
        </span></li>`).join('')}</ul>
      <button class="btn accent big block" data-action="validate">✅ Valider la correction</button>
    </div>`;
  }

  function revealView(q) {
    const mine = room.results.find((r) => r.userId === room.me);
    const choices = q.type === 'qcm'
      ? choicesHtml(q, { interactive: false, selected: room.myAnswer?.value, correct: q.answerIndex })
      : q.type === 'vraifaux' ? choicesHtml(q, { interactive: false, selected: room.myAnswer?.value, correct: q.answer === 'Vrai' }) : '';
    return `${choices}
      <div class="answer-reveal"><span class="muted small">La bonne réponse</span><br><span class="big">${esc(q.answer)}</span>
        ${q.explanation ? `<p class="small" style="margin:6px 0 0">💡 ${esc(q.explanation)}</p>` : ''}</div>
      ${mine ? `<div class="verdict-me ${mine.correct ? 'good' : 'bad'}">${mine.correct ? '🎉 +1 point !' : mine.answer ? '😬 Raté !' : '⌛ Pas de réponse'}</div>` : ''}
      <div class="row">${room.results.map((r) => `<span class="chip ${r.correct ? 'good' : 'bad'}">${esc(r.username)} : ${esc(r.answer ?? '—')} ${r.correct ? '✓' : '✗'}</span>`).join('')}</div>
      ${room.isHost ? `<button class="btn accent big block" data-action="next">${room.isLast ? '🏁 Voir le classement final' : '➡️ Question suivante'}</button>`
        : '<p class="center muted small">L’admin passe bientôt à la suite…</p>'}`;
  }

  function scoreboard(players, showAnswered = false) {
    if (!players.length) return '<p class="muted">Aucun joueur.</p>';
    return `<ul class="list scoreboard">${players.map((p) => `
      <li class="${p.id === me?.id ? 'me' : ''}">
        <span class="pos">${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`}</span>
        <span class="name">${esc(p.username)}${p.connected === false ? ' <span class="muted small">(déco)</span>' : ''}${showAnswered && p.answered ? ' <span class="chip good">✓</span>' : ''}</span>
        <span class="pts">${p.score} pt${p.score > 1 ? 's' : ''}</span>
      </li>`).join('')}</ul>`;
  }

  function renderFinished() {
    const top = room.players.slice(0, 3);
    const step = (p, cls) => p ? `<div class="step ${cls}"><div class="who">${esc(p.username)}</div><div class="muted small">${p.score} pt${p.score > 1 ? 's' : ''}</div><div class="block">${cls.slice(1)}</div></div>` : '';
    render(`
      <div class="card stack center">
        <h1 style="margin:0">🏁 Partie terminée !</h1>
        <p class="muted">${esc(room.theme ? `${room.theme.emoji} ${room.theme.name}` : '')}</p>
        ${top.length ? `<div class="podium">${step(top[1], 'p2')}${step(top[0], 'p1')}${step(top[2], 'p3')}</div>` : ''}
      </div>
      <div class="card stack" style="margin-top:16px">
        <h3>Classement final</h3>
        ${scoreboard(room.players)}
        <div class="row">
          ${room.gameId ? `<a class="btn" href="#/history/${room.gameId}">📜 Voir le détail des réponses</a>` : ''}
          <a class="btn ghost" href="#/">🏠 Accueil</a>
          ${room.isHost ? '<button class="btn accent" data-action="create-room">🔁 Nouvelle room</button>' : ''}
        </div>
      </div>`);
  }

  // countdown, driven locally from the server deadline
  function tick() {
    if (!room?.deadline || room.phase !== 'question') return;
    const left = Math.max(0, room.deadline - (Date.now() + clockOffset));
    const total = room.settings.timeLimit * 1000;
    const bar = document.getElementById('timer-bar');
    const text = document.getElementById('timer-text');
    if (bar) bar.style.width = `${Math.min(100, (left / total) * 100)}%`;
    if (text) text.textContent = `⏱ ${Math.ceil(left / 1000)} s`;
  }
  setInterval(tick, 250);

  // ---- events --------------------------------------------------------------

  const actions = {
    'auth-tab': (el) => { ui.authTab = el.dataset.tab; renderAuth(); },
    async logout() {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
      me = null;
      if (socket) { socket.disconnect(); socket = null; }
      leaveRoom();
      go('#/login');
    },
    async 'create-room'() {
      try {
        const { code } = await api('/api/rooms', { method: 'POST' });
        go(`#/room/${code}`);
      } catch (err) { toast(err.message, true); }
    },
    async copy(el) {
      try {
        await navigator.clipboard.writeText(el.dataset.text);
        toast('Copié !');
      } catch {
        prompt('Copie ce texte :', el.dataset.text);
      }
    },
    'set-theme': (el) => send('room:settings', { themeId: el.dataset.id }),
    kick: (el) => send('room:kick', { userId: Number(el.dataset.user) }),
    'remove-cq': (el) => send('room:removeQuestion', { index: Number(el.dataset.index) }),
    start: () => send('game:start'),
    answer: (el) => {
      const raw = el.dataset.value;
      const value = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
      send('game:answer', { value });
    },
    close: () => send('game:close'),
    verdict: (el) => send('game:verdict', { userId: Number(el.dataset.user), correct: el.dataset.correct === 'true' }),
    validate: () => send('game:validate'),
    next: () => send('game:next'),
    end: () => { if (confirm('Terminer la partie maintenant ? Les questions déjà jouées seront enregistrées.')) send('game:end'); },
  };

  const forms = {
    async auth(form) {
      const data = Object.fromEntries(new FormData(form));
      const $err = document.getElementById('auth-error');
      try {
        const res = await api(ui.authTab === 'login' ? '/api/login' : '/api/register', { method: 'POST', body: data });
        me = res.user;
        go(sessionStorageTake('qzk_after_login') || '#/');
      } catch (err) {
        if ($err) $err.textContent = err.message;
      }
    },
    async join() {
      const code = (drafts['join-code'] || '').trim().toUpperCase();
      if (!code) return;
      try {
        await api(`/api/rooms/${encodeURIComponent(code)}`);
        delete drafts['join-code'];
        go(`#/room/${code}`);
      } catch (err) { toast(err.message, true); }
    },
    async answer() {
      const id = `ans-${room.index}`;
      const value = (drafts[id] || '').trim();
      if (!value) return;
      await send('game:answer', { value });
    },
    async 'custom-question'() {
      const d = (k) => (drafts[k] || '').trim();
      const type = drafts['cq-type'] || 'qcm';
      const question = { type, prompt: d('cq-prompt'), media: { emoji: d('cq-emoji'), imageUrl: d('cq-image') } };
      if (type === 'qcm') {
        const choices = [0, 1, 2, 3].map((i) => d(`cq-choice-${i}`));
        const correct = Number(drafts['cq-correct'] || 0);
        // Drop empty choices while keeping track of which one is correct.
        const kept = choices.map((c, i) => ({ c, i })).filter((x) => x.c);
        question.choices = kept.map((x) => x.c);
        question.answer = kept.findIndex((x) => x.i === correct);
      } else if (type === 'vraifaux') {
        question.answer = (drafts['cq-vf'] || 'true') === 'true';
      } else if (type === 'estimation') {
        question.answer = Number(d('cq-answer').replace(',', '.'));
        question.unit = d('cq-unit');
      } else {
        question.answer = d('cq-answer');
        question.accept = d('cq-accept').split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (await send('room:addQuestion', { question })) {
        for (const k of Object.keys(drafts)) if (k.startsWith('cq-') && k !== 'cq-type') delete drafts[k];
        toast('Question ajoutée !');
        renderRoom();
      }
    },
  };

  $app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) { e.preventDefault(); actions[el.dataset.action](el); }
  });
  $userbox.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });
  $app.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (form && forms[form.dataset.form]) { e.preventDefault(); forms[form.dataset.form](form); }
  });
  $app.addEventListener('input', (e) => {
    if (e.target.matches('[data-draft]')) drafts[e.target.id] = e.target.value;
  });
  $app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-draft]')) drafts[el.id] = el.value;
    if (el.matches('[data-rerender]')) renderRoom();
    if (el.dataset.setting) send('room:settings', { [el.dataset.setting]: Number(el.value) });
    if (el.dataset.type) {
      const types = [...$app.querySelectorAll('input[data-type]:checked')].map((x) => x.dataset.type);
      send('room:settings', { types }).then((ok) => { if (!ok) renderRoom(); });
    }
  });
  $app.addEventListener('toggle', (e) => {
    if (e.target.id === 'cq-panel') ui.cqOpen = e.target.open;
  }, true);

  window.addEventListener('hashchange', route);
  route();
})();
