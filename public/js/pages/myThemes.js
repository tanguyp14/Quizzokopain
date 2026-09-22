import {
  state, actions, forms, render, show, api, go, toast, esc, fmtDate, plural, difficultyBadge, keywordChips, levelsHtml,
  draft, clearDrafts, answerText, TYPE_LABELS, title,
} from '../core.js';
import { questionFormHtml, readQuestionForm, resetQuestionForm } from '../questionForm.js';

const STATUS = {
  pending: '<span class="badge st-pending">⏳ En attente de validation</span>',
  approved: '<span class="badge st-approved">✅ Validé</span>',
  rejected: '<span class="badge st-rejected">❌ Refusé</span>',
};
export const statusBadge = (s) => STATUS[s] || '';

export async function myThemesPage() {
  let themes;
  try {
    ({ themes } = await api('/api/my-themes'));
  } catch (err) {
    return render(`<div class="card">${esc(err.message)}</div>`);
  }
  show(() => render(`
    <div class="spread" style="margin-bottom:16px">
      <h1 style="margin:0">${title('✍️', 'Mes quiz')}</h1>
      <a class="btn accent" href="#/my-themes/new">➕ Créer un quiz</a>
    </div>
    <p class="muted">Crée un quiz avec un nom, des mots-clés et une difficulté. ${state.me.role === 'superadmin'
    ? 'En tant que SuperAdmin, tes quiz sont publiés directement.'
    : 'Il sera soumis au SuperAdmin, puis ajouté à la liste des quiz une fois validé (toute modification repasse en validation).'}</p>
    ${themes.length ? `<div class="stack">${themes.map((t) => `
      <div class="card my-theme">
        <div class="spread">
          <div class="row"><span class="tc-emoji" style="font-size:2rem">${esc(t.emoji)}</span>
            <div><h3 style="margin:0">${esc(t.name)}</h3><span class="muted small">modifié le ${fmtDate(t.updatedAt)}</span></div></div>
          ${statusBadge(t.status)}
        </div>
        <div class="row" style="margin-top:10px">${levelsHtml(t.levels)}<span class="badge">❓ ${plural(t.questionCount, 'question')}</span>
          <span class="badge">🎮 joué ${t.playCount} fois</span><span class="badge">⭐ ${t.favoriteCount}</span></div>
        <div class="kws" style="margin-top:8px">${keywordChips(t.keywords)}</div>
        ${t.status === 'rejected' && t.reviewNote ? `<p class="review-note">💬 Motif du refus : ${esc(t.reviewNote)}</p>` : ''}
        <div class="row" style="margin-top:12px">
          <a class="btn ghost sm" href="#/my-themes/${t.id}">✏️ Modifier</a>
          <button class="btn bad sm" data-action="delete-theme" data-id="${t.id}" data-name="${esc(t.name)}">🗑 Supprimer</button>
        </div>
      </div>`).join('')}</div>`
    : '<div class="card center stack"><p style="font-size:3rem;margin:0">📝</p><p class="muted">Tu n’as encore créé aucun quiz.</p></div>'}`));
}

function levelCount(questions) {
  const levels = { facile: 0, moyen: 0, difficile: 0 };
  for (const q of questions) levels[q.difficulty || 'moyen'] += 1;
  return levels;
}

// ---- editor -------------------------------------------------------------------

let editor = null; // { id, questions: [] }

export async function editorPage(id) {
  clearDrafts('te-');
  resetQuestionForm('qe');
  editor = { id: null, questions: [], status: null };
  if (id) {
    try {
      const { theme } = await api(`/api/my-themes/${id}`);
      editor = { id: theme.id, questions: theme.questions, status: theme.status };
      Object.assign(state.drafts, {
        'te-name': theme.name, 'te-emoji': theme.emoji, 'te-description': theme.description,
        'te-keywords': theme.keywords.join(', '),
      });
      // Older quizzes had a single level: pre-fill each question with it.
      editor.questions = editor.questions.map((q) => ({ difficulty: theme.difficulty || 'moyen', ...q }));
    } catch (err) {
      return render(`<div class="card">${esc(err.message)} <a href="#/my-themes">← Retour</a></div>`);
    }
  }
  show(renderEditor);
}

function renderEditor() {
  const n = editor.questions.length;
  const superadmin = state.me.role === 'superadmin';
  render(`
    <p><a href="#/my-themes">← Mes quiz</a></p>
    <h1>${editor.id ? title('✏️', 'Modifier le quiz') : title('✍️', 'Nouveau quiz')}</h1>
    <div class="card stack">
      <h3>1. Infos du quiz</h3>
      <div class="grid-2">
        <div class="field"><label for="te-name">Nom du quiz *</label><input id="te-name" type="text" maxlength="40" data-draft placeholder="Ex : Harry Potter"></div>
        <div class="field"><label for="te-emoji">Emoji *</label><input id="te-emoji" type="text" maxlength="16" data-draft placeholder="⚡"></div>
      </div>
      <div class="field"><label for="te-keywords">Mots-clés * <span class="muted small">(séparés par des virgules)</span></label>
        <input id="te-keywords" type="text" data-draft placeholder="magie, livres, films"></div>
      <div class="field"><label for="te-description">Description</label><input id="te-description" type="text" maxlength="200" data-draft placeholder="En une phrase, de quoi parle ton quiz ?"></div>
      <p class="muted small">Créé par <strong>${esc(state.me.username)}</strong> — ton pseudo sera affiché sous le nom du quiz.</p>
    </div>

    <div class="card stack" style="margin-top:16px">
      <div class="spread"><h3 style="margin:0">2. Questions (${n})</h3><span class="muted small">minimum 5 · chaque question a sa difficulté</span></div>
      ${n ? `<p class="small" style="margin:0">Répartition : ${levelsHtml(levelCount(editor.questions))}</p>` : ''}
      ${n ? `<ol class="q-list">${editor.questions.map((q, i) => `
        <li><div>${difficultyBadge(q.difficulty)} <span class="chip">${esc(TYPE_LABELS[q.type])}</span> <strong>${esc(q.prompt)}</strong> ${q.media?.emoji ? esc(q.media.emoji) : ''}${q.media?.imageUrl ? ' 🖼️' : ''}
          <div class="muted small">→ ${esc(answerText(q))}${q.choices ? ` <span class="muted">(${q.choices.map(esc).join(' / ')})</span>` : ''}</div></div>
          <span class="row"><button class="btn ghost sm" data-action="move-q" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button class="btn ghost sm" data-action="move-q" data-i="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
          <button class="btn ghost sm" data-action="remove-q" data-i="${i}" aria-label="Supprimer">✕</button></span></li>`).join('')}</ol>`
    : '<p class="muted">Aucune question pour l’instant.</p>'}
      <details class="add-q" open><summary>➕ Ajouter une question</summary>${questionFormHtml('qe')}</details>
    </div>

    <div class="card stack" style="margin-top:16px">
      <p class="error" id="te-error"></p>
      <button class="btn accent big block" data-action="save-theme" ${n < 5 ? 'disabled' : ''}>
        ${superadmin ? '🚀 Publier le quiz' : editor.id ? '📨 Enregistrer et renvoyer en validation' : '📨 Soumettre au SuperAdmin'}</button>
      ${n < 5 ? `<p class="muted small center">Encore ${5 - n} question${5 - n > 1 ? 's' : ''} avant de pouvoir soumettre.</p>` : ''}
    </div>`);
}

forms['question:qe'] = async () => {
  try {
    const { question } = await api('/api/questions/validate', { method: 'POST', body: { question: readQuestionForm('qe') } });
    editor.questions.push(question);
    resetQuestionForm('qe');
    toast('Question ajoutée !');
    renderEditor();
  } catch (err) { toast(err.message, true); }
};

actions['remove-q'] = (el) => { editor.questions.splice(Number(el.dataset.i), 1); renderEditor(); };
actions['move-q'] = (el) => {
  const i = Number(el.dataset.i);
  const j = i + Number(el.dataset.dir);
  [editor.questions[i], editor.questions[j]] = [editor.questions[j], editor.questions[i]];
  renderEditor();
};

actions['save-theme'] = async (el) => {
  const body = {
    name: draft('te-name'),
    emoji: draft('te-emoji'),
    description: draft('te-description'),
    keywords: draft('te-keywords'),
    questions: editor.questions,
  };
  el.disabled = true;
  try {
    const { theme } = await api(editor.id ? `/api/my-themes/${editor.id}` : '/api/my-themes', { method: editor.id ? 'PUT' : 'POST', body });
    toast(theme.status === 'approved' ? 'Quiz publié 🎉' : 'Quiz envoyé au SuperAdmin 📨');
    clearDrafts('te-');
    go('#/my-themes');
  } catch (err) {
    el.disabled = false;
    const $e = document.getElementById('te-error');
    if ($e) $e.textContent = err.message;
  }
};

actions['delete-theme'] = async (el) => {
  if (!confirm(`Supprimer définitivement « ${el.dataset.name} » ?`)) return;
  try {
    await api(`/api/my-themes/${el.dataset.id}`, { method: 'DELETE' });
    toast('Quiz supprimé');
    if (state.ui.onThemeChange) state.ui.onThemeChange(); else myThemesPage();
  } catch (err) { toast(err.message, true); }
};
