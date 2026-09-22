import {
  state, actions, forms, render, show, go, toast, esc, plural, avatar, api, difficultyBadge, levelsHtml, DIFFICULTIES, LETTERS, draft,
  mediaHtml, loadCatalog, wave, sourceHtml,
} from '../core.js';
import { questionFormHtml, readQuestionForm, resetQuestionForm } from '../questionForm.js';
import { normalize } from './themes.js';

const TIME_OPTIONS = [0, 10, 15, 20, 30, 45, 60, 90];
state.ui.cqOpen = false;

// ---- socket plumbing (the socket itself is opened by main.js) ----------------

export function onRoomState(roomState) {
  if (roomState.code !== state.roomCode) return;
  const prev = state.room;
  state.room = roomState;
  state.clockOffset = roomState.serverNow - Date.now();
  if (prev && (prev.index !== roomState.index || prev.phase !== roomState.phase)) {
    for (const k of Object.keys(state.drafts)) if (k.startsWith('ans-')) delete state.drafts[k];
  }
  // "Jouer ce quiz" / "Jouer en solo": apply the preset once we're the admin of the new room.
  const { preset } = state.ui;
  if (preset && preset.code === roomState.code && roomState.isHost && roomState.phase === 'lobby') {
    state.ui.preset = null;
    send('room:settings', preset.settings);
  }
  if (location.hash.toUpperCase().startsWith(`#/ROOM/${roomState.code}`)) show(renderRoom);
}

function joinRoom() {
  state.socket.emit('room:join', { code: state.roomCode }, (res) => {
    if (!res.ok) {
      toast(res.error, true);
      state.roomCode = null;
      go('#/');
    }
  });
}

export function roomPage(code) {
  if (state.roomCode === code && state.room) return show(renderRoom);
  state.roomCode = code;
  state.room = null;
  render('<p class="muted center">Connexion à la room…</p>');
  if (state.socket.connected) joinRoom();
}

export function rejoinAfterReconnect() {
  if (state.roomCode) joinRoom();
}

export function leaveRoom() {
  if (state.socket?.connected && state.roomCode) state.socket.emit('room:leave');
  state.roomCode = null;
  state.room = null;
}

export function send(event, payload = {}) {
  return new Promise((resolve) => {
    state.socket.emit(event, payload, (res) => {
      if (!res?.ok) toast(res?.error || 'Erreur', true);
      resolve(res?.ok ? res : null);
    });
  });
}

// ---- views --------------------------------------------------------------------

function renderRoom() {
  const { room } = state;
  if (!room) return;
  if (room.phase === 'lobby') return renderLobby();
  if (room.phase === 'finished') return renderFinished();
  return renderGame();
}

function playersList(withKick) {
  const { room } = state;
  if (!room.players.length) return '<p class="muted">Personne pour l’instant… invite tes amis !</p>';
  return `<ul class="list">${room.players.map((p) => `
    <li><span class="row">${avatar(p, 34)}<span class="dot ${p.connected ? '' : 'off'}"></span><strong>${esc(p.username)}</strong>${p.id === room.me ? ' <span class="muted small">(toi)</span>' : ''}</span>
    ${withKick && p.id !== room.me ? `<button class="btn ghost sm" data-action="kick" data-user="${p.id}" title="Retirer" aria-label="Retirer ${esc(p.username)}">✕</button>` : ''}</li>`).join('')}</ul>`;
}

function themeChoiceHtml(choice) {
  if (!choice) return '<p class="muted">Thème introuvable.</p>';
  return `<div class="choice-card">
    <span class="tc-emoji">${esc(choice.emoji)}</span>
    <div><strong>${esc(choice.name)}</strong>${choice.authorName ? `<div class="muted small">par ${esc(choice.authorName)}</div>` : ''}
    ${choice.levels ? `<div class="row" style="margin-top:4px">${levelsHtml(choice.levels)}</div>` : ''}
    ${sourceHtml(choice.source, { label: 'Questions' })}</div>
  </div>`;
}

function themePicker(s) {
  const catalog = state.catalog;
  const needle = normalize(draft('lobby-tq'));
  const match = (t) => !needle || [t.name, t.authorName, t.description, ...(t.keywords || [])].some((x) => normalize(x).includes(needle));
  const btn = (t) => `<button class="theme-btn ${s.themeId === t.key ? 'active' : ''}" data-action="set-theme" data-id="${esc(t.key)}">
    <span class="e">${esc(t.emoji)}</span><span class="tb-name">${esc(t.name)}</span>
    ${t.authorName ? `<span class="tb-author">par ${esc(t.authorName)}</span>` : ''}
    ${t.levels ? `<span class="tb-diff">${levelsHtml(t.levels)}</span>` : ''}
  </button>`;
  const themes = catalog.themes.filter(match);
  const favs = themes.filter((t) => t.favorite);
  const others = themes.filter((t) => !t.favorite);
  return `
    <input id="lobby-tq" type="search" data-draft data-live placeholder="🔎 Chercher un quiz, un mot-clé, un pseudo…" autocomplete="off">
    ${needle ? '' : `<div class="themes">${catalog.special.map(btn).join('')}</div>`}
    ${favs.length ? `<div class="picker-title">⭐ Tes favoris</div><div class="themes">${favs.map(btn).join('')}</div>` : ''}
    ${others.length ? `<div class="picker-title">📚 Tous les quiz</div><div class="themes picker-scroll">${others.map(btn).join('')}</div>` : ''}
    ${!themes.length && needle ? '<p class="muted small">Aucun quiz trouvé.</p>' : ''}`;
}

function renderLobby() {
  const { room } = state;
  const host = room.isHost;
  if (host && !state.catalog) {
    loadCatalog().then(() => show(renderRoom)).catch((err) => toast(err.message, true));
    return render('<p class="muted center">Chargement…</p>');
  }
  const s = room.settings;
  const invite = `${location.origin}/r/${room.code}`;
  const solo = s.hostPlays && room.players.length === 1;
  const disabled = host ? '' : 'disabled';

  render(`
    <div class="card center stack">
      <div class="muted">Code de la room</div>
      <div class="room-code">${wave(room.code)}</div>
      <div class="row" style="justify-content:center">
        <button class="btn ghost sm" data-action="copy" data-text="${esc(invite)}">🔗 Copier le lien d’invitation</button>
        ${navigator.share ? `<button class="btn ghost sm" data-action="share" data-text="${esc(invite)}">📤 Partager</button>` : ''}
        <button class="btn ghost sm" data-action="copy" data-text="${esc(room.code)}">📋 Copier le code</button>
      </div>
      <div class="row" style="justify-content:center">${avatar(room.host, 26)}<span class="muted small">Admin : <strong>${esc(room.host.username)}</strong>${host ? ' (toi)' : ''}</span></div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card stack">
        <h3>👥 Joueurs (${room.players.length})${solo ? ' <span class="badge st-approved">🎯 Solo</span>' : ''}</h3>
        ${host ? `<label class="check host-plays"><input type="checkbox" id="host-plays" ${s.hostPlays ? 'checked' : ''}> 🙋 Je joue aussi <span class="muted small">(partie solo possible)</span></label>` : ''}
        ${playersList(host)}
        <form data-form="invite" class="stack invite-form">
          <label for="invite-name">📨 Inviter directement un joueur</label>
          <div class="answer-box">
            <input id="invite-name" type="text" list="invite-suggestions" data-draft data-user-search placeholder="Pseudo…" autocomplete="off">
            <button class="btn" type="submit">Inviter</button>
          </div>
          <datalist id="invite-suggestions"></datalist>
          <p class="muted small" style="margin:0">Il reçoit une notification et rejoint la partie en un clic, même si elle a déjà commencé.</p>
        </form>
        ${host ? '' : '<p class="muted small">⏳ En attente du lancement par l’admin…</p>'}
      </div>

      <div class="card stack ${host ? 'host-panel' : ''}">
        <h3>⚙️ Réglages ${host ? '<span class="host-badge small">· admin</span>' : ''}</h3>
        <div>
          <label>Quiz</label>
          ${host ? `${themeChoiceHtml(room.themeChoice)}<details class="picker" ${state.ui.pickerOpen ? 'open' : ''} id="picker"><summary>Changer de quiz</summary>${themePicker(s)}</details>`
    : themeChoiceHtml(room.themeChoice)}
        </div>
        <div class="grid-2">
          <div><label for="set-count">Nombre de questions</label>
            <select id="set-count" data-setting="questionCount" ${disabled}>
              ${[5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${s.questionCount === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select></div>
          <div><label for="set-time">Temps par question <span class="muted small">(par défaut)</span></label>
            <select id="set-time" data-setting="timeLimit" ${disabled}>
              ${TIME_OPTIONS.map((t) => `<option value="${t}" ${s.timeLimit === t ? 'selected' : ''}>${t ? `${t} s` : 'Illimité'}</option>`).join('')}
            </select></div>
        </div>
        <div><label for="set-diff">Difficulté des questions</label>
          <select id="set-diff" data-setting-str="difficulty" ${disabled}>
            <option value="all" ${s.difficulty === 'all' ? 'selected' : ''}>🎚️ Toutes (mélange)</option>
            ${Object.entries(DIFFICULTIES).map(([k, d]) => `<option value="${k}" ${s.difficulty === k ? 'selected' : ''}>${d.emoji} ${d.label} uniquement</option>`).join('')}
          </select>
          <p class="muted small" style="margin:6px 0 0">Avec « Thème surprise » ou « Grand mix », seules les questions de ce niveau sont piochées, dans tous les quiz.</p></div>
        <div>
          <label>Types de questions</label>
          <div class="checks">${Object.entries({
    qcm: 'QCM', vraifaux: 'Vrai ou faux', libre: 'Réponse libre', rebus: 'Rébus', image: 'Devine l’image', estimation: 'Estimation',
  }).map(([id, label]) => `<label class="check"><input type="checkbox" data-type="${id}" ${s.types.includes(id) ? 'checked' : ''} ${disabled}> ${label}</label>`).join('')}</div>
          <p class="muted small">Réponses libres, rébus et images : validées par l’admin. Estimation : le plus proche marque le point.</p>
        </div>
        ${room.customQuestionCount ? `<p class="chip accent">✍️ ${plural(room.customQuestionCount, 'question perso')}</p>` : ''}
        ${host ? `<button class="btn accent big block" data-action="start" ${room.players.length ? '' : 'disabled'}>${solo ? '🎯 Lancer ma partie solo' : '🚀 Lancer la partie'}</button>
          ${room.players.length ? '' : '<p class="muted small center" style="margin:0">Invite des joueurs ou coche « Je joue aussi » pour jouer en solo.</p>'}` : ''}
      </div>
    </div>

    ${host ? customQuestionsPanel() : ''}
    <p class="center" style="margin-top:20px"><a href="#/">← Quitter la room</a></p>`);
}

function customQuestionsPanel() {
  const { room } = state;
  return `
    <details class="card" id="cq-panel" style="margin-top:16px" ${state.ui.cqOpen ? 'open' : ''}>
      <summary style="cursor:pointer;font-weight:800">✍️ Ajouter des questions perso pour cette partie (${room.customQuestionCount})</summary>
      <div class="stack" style="margin-top:14px">
        ${room.customQuestions?.length ? `<ul class="list">${room.customQuestions.map((q, i) => `
          <li><span><span class="chip">${esc(q.typeLabel)}</span>${q.timeLimit ? ` <span class="badge">⏱ ${q.timeLimit} s</span>` : ''} ${esc(q.prompt)} ${q.media?.emoji ? esc(q.media.emoji) : ''} <span class="muted small">→ ${esc(q.answer)}</span></span>
          <button class="btn ghost sm" data-action="remove-cq" data-index="${i}">✕</button></li>`).join('')}</ul>` : ''}
        ${questionFormHtml('cq')}
        <p class="muted small">Elles sont mélangées au quiz choisi (ou jouées seules avec « Mes questions »). Pour un quiz réutilisable, <a href="#/my-themes/new">crée un quiz</a>.</p>
      </div>
    </details>`;
}

function renderGame() {
  const { room } = state;
  const q = room.question;
  const host = room.isHost;
  const answered = room.players.filter((p) => p.answered).length;
  const header = `
    <div class="q-head">
      <span class="chip">${esc(room.theme ? `${room.theme.emoji} ${room.theme.name}` : '')}${room.theme?.authorName ? ` · par ${esc(room.theme.authorName)}` : ''}</span>
      <span class="chip accent">Question ${room.index + 1} / ${room.total}</span>
      <span class="chip">${esc(q.typeLabel)}</span>
      ${q.difficulty ? difficultyBadge(q.difficulty) : ''}
      <span class="chip" id="timer-text">${room.deadline ? '' : '∞'}</span>
    </div>
    ${room.deadline ? '<div class="timer"><div id="timer-bar" style="width:100%"></div></div>' : ''}
    <h2 class="q-prompt">${esc(q.prompt)}</h2>
    ${mediaHtml(q.media)}`;
  const credit = sourceHtml(q.source);

  let body = '';
  const playing = room.players.some((p) => p.id === room.me);
  if (room.phase === 'question') {
    body = host && !playing ? hostQuestionView(q, answered)
      : playerQuestionView(q) + (host ? `<button class="btn ghost block" data-action="close">⏭ Clore la question (${plural(answered, 'réponse')})</button>` : '');
  }
  else if (room.phase === 'correction') body = host ? correctionView() : `<p class="center muted">⏳ L’admin corrige les réponses…</p>${myAnswerLine()}`;
  else if (room.phase === 'reveal') body = revealView(q);

  render(`
    <div class="card stack">${header}${body}${credit}</div>
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
  return state.room.myAnswer ? `<p class="center">Ta réponse : <strong>${esc(state.room.myAnswer.text)}</strong></p>` : '';
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
  const { room } = state;
  const mine = room.myAnswer;
  if (q.type === 'qcm' || q.type === 'vraifaux') {
    return `${choicesHtml(q, { interactive: true, selected: mine?.value })}
      <p class="center muted small">${mine ? '✅ Réponse enregistrée — tu peux encore changer d’avis.' : 'Choisis ta réponse !'}</p>`;
  }
  const id = `ans-${room.index}`;
  const numeric = q.type === 'estimation';
  const placeholder = numeric ? `Ton estimation${q.unit ? ` (${q.unit})` : ''}` : 'Ta réponse';
  return `<form data-form="answer" class="stack">
      <div class="answer-box">
        <input id="${id}" type="text" data-draft ${numeric ? 'inputmode="decimal"' : ''} placeholder="${esc(placeholder)}" autocomplete="off" maxlength="200" data-autofocus>
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
    <div class="row">${state.room.players.map((p) => `<span class="chip ${p.answered ? 'good' : ''}">${avatar(p, 20)} ${p.answered ? '✓' : '…'} ${esc(p.username)}</span>`).join('')}</div>
    <button class="btn accent big block" data-action="close">⏭ Clore la question (${plural(answered, 'réponse')})</button>`;
}

function correctionView() {
  const { room } = state;
  return `<div class="stack">
    <div class="answer-reveal"><span class="muted small">Réponse attendue</span><br><span class="big">${esc(room.question.answer)}</span></div>
    <p class="muted small">${room.players.length === 1 && room.correction[0]?.userId === room.me
    ? 'Mode solo : sois honnête 😇 — confirme ou corrige la pré-correction automatique, puis valide.'
    : 'Pré-correction automatique : ajuste si besoin puis valide.'}</p>
    <ul class="list">${room.correction.map((c) => `
      <li><span class="row">${avatar(c, 30)}<span><strong>${esc(c.username)}</strong> : ${esc(c.answer)}</span></span>
      <span class="toggle">
        <button data-action="verdict" data-user="${c.userId}" data-correct="true" class="${c.correct ? 'on-good' : ''}" aria-label="Juste">✓</button>
        <button data-action="verdict" data-user="${c.userId}" data-correct="false" class="${c.correct ? '' : 'on-bad'}" aria-label="Faux">✗</button>
      </span></li>`).join('')}</ul>
    <button class="btn accent big block" data-action="validate">✅ Valider la correction</button>
  </div>`;
}

function revealView(q) {
  const { room } = state;
  const mine = room.results.find((r) => r.userId === room.me);
  const choices = q.type === 'qcm'
    ? choicesHtml(q, { interactive: false, selected: room.myAnswer?.value, correct: q.answerIndex })
    : q.type === 'vraifaux' ? choicesHtml(q, { interactive: false, selected: room.myAnswer?.value, correct: q.answer === 'Vrai' }) : '';
  return `${choices}
    <div class="answer-reveal"><span class="muted small">La bonne réponse</span><br><span class="big pop">${esc(q.answer)}</span>
      ${q.explanation ? `<p class="small" style="margin:6px 0 0">💡 ${esc(q.explanation)}</p>` : ''}</div>
    ${mine ? `<div class="verdict-me pop ${mine.correct ? 'good' : 'bad'}">${mine.correct ? '🎉 +1 point !' : mine.answer ? '😬 Raté !' : '⌛ Pas de réponse'}</div>` : ''}
    <div class="row">${room.results.map((r) => `<span class="chip ${r.correct ? 'good' : 'bad'}">${avatar(r, 20)} ${esc(r.username)} : ${esc(r.answer ?? '—')} ${r.correct ? '✓' : '✗'}</span>`).join('')}</div>
    ${room.isHost ? `<button class="btn accent big block" data-action="next">${room.isLast ? '🏁 Voir le classement final' : '➡️ Question suivante'}</button>`
    : '<p class="center muted small">L’admin passe bientôt à la suite…</p>'}`;
}

function scoreboard(players, showAnswered = false) {
  if (!players.length) return '<p class="muted">Aucun joueur.</p>';
  return `<ul class="list scoreboard">${players.map((p) => `
    <li class="${p.id === state.me?.id ? 'me' : ''}">
      <span class="pos">${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`}</span>
      ${avatar(p, 32)}
      <span class="name">${esc(p.username)}${p.connected === false ? ' <span class="muted small">(déco)</span>' : ''}${showAnswered && p.answered ? ' <span class="chip good">✓</span>' : ''}</span>
      <span class="pts">${plural(p.score, 'pt')}</span>
    </li>`).join('')}</ul>`;
}

function renderFinished() {
  const { room } = state;
  const top = room.players.slice(0, 3);
  const step = (p, cls) => (p ? `<div class="step ${cls}">${avatar(p, cls === 'p1' ? 72 : 56)}<div class="who">${esc(p.username)}</div><div class="muted small">${plural(p.score, 'pt')}</div><div class="block breathe">${cls.slice(1)}</div></div>` : '');
  render(`
    <div class="card stack center">
      <h1 style="margin:0">🏁 ${wave('Partie terminée !')}</h1>
      <p class="muted">${esc(room.theme ? `${room.theme.emoji} ${room.theme.name}` : '')}</p>
      ${sourceHtml(room.theme?.source, { label: 'Questions' })}
      ${top.length ? `<div class="podium">${step(top[1], 'p2')}${step(top[0], 'p1')}${step(top[2], 'p3')}</div>` : ''}
    </div>
    <div class="card stack" style="margin-top:16px">
      <h3>Classement final</h3>
      ${scoreboard(room.players)}
      <div class="row">
        ${room.gameId ? `<a class="btn" href="#/history/${room.gameId}">📜 Voir le détail des réponses</a>` : ''}
        ${room.theme?.key && !['mix', 'custom'].includes(room.theme.key) ? `<button class="btn ghost" data-action="toggle-fav-from-game" data-key="${esc(room.theme.key)}">⭐ Ajouter ce quiz aux favoris</button>` : ''}
        <a class="btn ghost" href="#/">🏠 Accueil</a>
        ${room.isHost ? '<button class="btn accent" data-action="create-room">🔁 Nouvelle room</button>' : ''}
      </div>
    </div>`);
}

// countdown, driven locally from the server deadline
export function tick() {
  const { room } = state;
  if (!room?.deadline || room.phase !== 'question') return;
  const left = Math.max(0, room.deadline - (Date.now() + state.clockOffset));
  const total = (room.timeLimit || room.settings.timeLimit) * 1000;
  const bar = document.getElementById('timer-bar');
  const text = document.getElementById('timer-text');
  if (bar) bar.style.width = `${Math.min(100, (left / total) * 100)}%`;
  if (text) {
    text.textContent = `⏱ ${Math.ceil(left / 1000)} s`;
    text.classList.toggle('urgent', left > 0 && left <= 5000);
  }
}
setInterval(tick, 250);
document.addEventListener('rendered', tick);

// ---- actions ------------------------------------------------------------------

actions['set-theme'] = (el) => { state.ui.pickerOpen = false; send('room:settings', { themeId: el.dataset.id }); };
actions.kick = (el) => send('room:kick', { userId: Number(el.dataset.user) });
actions['remove-cq'] = (el) => send('room:removeQuestion', { index: Number(el.dataset.index) });
actions.start = () => send('game:start');
actions.answer = (el) => {
  const raw = el.dataset.value;
  send('game:answer', { value: raw === 'true' ? true : raw === 'false' ? false : Number(raw) });
};
actions.close = () => send('game:close');
actions.verdict = (el) => send('game:verdict', { userId: Number(el.dataset.user), correct: el.dataset.correct === 'true' });
actions.validate = () => send('game:validate');
actions.next = () => send('game:next');
actions.end = () => { if (confirm('Terminer la partie maintenant ? Les questions déjà jouées seront enregistrées.')) send('game:end'); };
actions.share = async (el) => {
  try { await navigator.share({ title: 'Quizzokopain', text: 'Rejoins ma partie de quiz !', url: el.dataset.text }); } catch { /* cancelled */ }
};
actions['toggle-fav-from-game'] = async (el) => {
  try {
    await api(`/api/favorites/${encodeURIComponent(el.dataset.key)}`, { method: 'PUT' });
    if (state.catalog) state.catalog = null;
    toast('Ajouté aux favoris ⭐');
    el.disabled = true;
  } catch (err) { toast(err.message, true); }
};

forms.answer = async () => {
  const value = draft(`ans-${state.room.index}`);
  if (value) await send('game:answer', { value });
};

forms['question:cq'] = async () => {
  if (await send('room:addQuestion', { question: readQuestionForm('cq') })) {
    resetQuestionForm('cq');
    toast('Question ajoutée !');
    show(renderRoom);
  }
};

forms.invite = async () => {
  const username = draft('invite-name');
  if (!username) return;
  const res = await send('room:invite', { username });
  if (res) {
    toast(`Invitation envoyée à ${res.invited} 📨`);
    delete state.drafts['invite-name'];
    show(renderRoom);
  }
};

// Remember which panels are open at click time: the "toggle" event fires later,
// and a room update re-rendering in between would otherwise close them again.
const PANELS = { 'cq-panel': 'cqOpen', picker: 'pickerOpen' };
document.addEventListener('click', (e) => {
  const summary = e.target.closest('summary');
  const key = summary && PANELS[summary.parentElement?.id];
  if (key) state.ui[key] = !summary.parentElement.open;
}, true);

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!state.room || state.room.phase !== 'lobby') return;
  if (el.id === 'host-plays') send('room:settings', { hostPlays: el.checked });
  if (el.dataset.setting) send('room:settings', { [el.dataset.setting]: Number(el.value) });
  if (el.dataset.settingStr) send('room:settings', { [el.dataset.settingStr]: el.value });
  if (el.dataset.type) {
    const types = [...document.querySelectorAll('input[data-type]:checked')].map((x) => x.dataset.type);
    send('room:settings', { types }).then((ok) => { if (!ok) show(renderRoom); });
  }
});

// Pseudo autocomplete for direct invitations.
let userSearchTimer;
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-user-search]')) return;
  clearTimeout(userSearchTimer);
  const q = e.target.value.trim();
  userSearchTimer = setTimeout(async () => {
    if (!q) return;
    try {
      const { users } = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
      const list = document.getElementById('invite-suggestions');
      if (list) list.innerHTML = users.map((u) => `<option value="${esc(u)}">`).join('');
    } catch { /* ignore */ }
  }, 200);
});
