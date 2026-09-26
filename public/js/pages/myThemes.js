import {
  state, actions, forms, render, show, api, go, toast, esc, fmtDate, plural, difficultyBadge, keywordChips, levelsHtml,
  draft, clearDrafts, answerText, TYPE_LABELS, title, sourceHtml, uploadImage, answerFromFileName,
} from '../core.js';
import {
  questionFormHtml, readQuestionForm, resetQuestionForm, loadQuestionIntoForm,
} from '../questionForm.js';

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
      <div class="row">
        <label class="btn ghost" for="quiz-import-file" style="margin:0">⬆️ Importer un quiz</label>
        <input id="quiz-import-file" type="file" accept=".json,.csv,.txt,application/json,text/csv" class="visually-hidden">
        <a class="btn accent" href="#/my-themes/new">➕ Créer un quiz</a>
      </div>
    </div>
    <p class="muted">Crée un quiz avec un nom, des mots-clés et une difficulté. ${state.me.role === 'superadmin'
    ? 'En tant que SuperAdmin, tes quiz sont publiés directement.'
    : 'Il sera soumis au SuperAdmin, puis ajouté à la liste des quiz une fois validé (toute modification repasse en validation).'}</p>
    <p class="muted small">⬆️ Import : fichier <strong>.neutron.json</strong> (export Neutron), <strong>CSV</strong> (<a href="/api/quiz-template.csv" download>📄 télécharger le modèle CSV</a>, ouvrable dans Excel) ou JSON OpenQuizzDB. Le quiz s’ouvre dans l’éditeur pour vérification avant l’envoi.</p>
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
          <a class="btn ghost sm" href="/api/my-themes/${t.id}/export" download title="Exporter en JSON (réimportable)">⬇️ JSON</a>
          <a class="btn ghost sm" href="/api/my-themes/${t.id}/export?format=csv" download title="Exporter en CSV (Excel)">⬇️ CSV</a>
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
  editing = null;
  if (id) {
    try {
      const { theme } = await api(`/api/my-themes/${id}`);
      editor = { id: theme.id, questions: theme.questions, status: theme.status };
      Object.assign(state.drafts, {
        'te-name': theme.name, 'te-emoji': theme.emoji, 'te-description': theme.description,
        'te-keywords': theme.keywords.join(', '),
        'te-music-url': theme.music?.url || '', 'te-music-name': theme.music?.name || '',
      });
      // Older quizzes had a single level: pre-fill each question with it.
      editor.questions = editor.questions.map((q) => ({ difficulty: theme.difficulty || 'moyen', ...q }));
    } catch (err) {
      return render(`<div class="card">${esc(err.message)} <a href="#/my-themes">← Retour</a></div>`);
    }
  } else if (state.ui.importedQuiz) {
    // A file just imported from "Mes quiz": the editor opens pre-filled, nothing is saved yet.
    const { quiz, warnings } = state.ui.importedQuiz;
    state.ui.importedQuiz = null;
    editor.questions = quiz.questions;
    Object.assign(state.drafts, {
      'te-name': quiz.name || '', 'te-emoji': quiz.emoji || '', 'te-description': quiz.description || '',
      'te-keywords': (quiz.keywords || []).join(', '),
      'te-music-url': quiz.music?.url || '', 'te-music-name': quiz.music?.name || '',
    });
    editor.importWarnings = warnings || [];
  }
  show(renderEditor);
}

const bulkPrompt = () => draft('te-bulk-prompt') || 'De quel film s’agit-il ?';
let editing = null; // index of the question taken back into the form, to put it back in place

function renderEditor() {
  const n = editor.questions.length;
  const superadmin = state.me.role === 'superadmin';
  render(`
    <p><a href="#/my-themes">← Mes quiz</a></p>
    <h1>${editor.id ? title('✏️', 'Modifier le quiz') : title('✍️', 'Nouveau quiz')}</h1>
    ${editor.importWarnings ? `<div class="card stack import-note">
      <strong>⬆️ Quiz importé — ${plural(n, 'question')} chargée${n > 1 ? 's' : ''}.</strong>
      <span class="muted small">Vérifie les infos et les questions, puis ${superadmin ? 'publie' : 'soumets'} le quiz en bas de page.</span>
      ${editor.importWarnings.length ? `<details><summary>⚠️ ${plural(editor.importWarnings.length, 'avertissement')}</summary>
        <ul class="small">${editor.importWarnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    </div>` : ''}
    <div class="card stack">
      <h3>1. Infos du quiz</h3>
      <div class="grid-name-emoji">
        <div class="field"><label for="te-name">Nom du quiz *</label><input id="te-name" type="text" maxlength="40" data-draft placeholder="Ex : Harry Potter"></div>
        <div class="field"><label for="te-emoji">Emoji *</label><input id="te-emoji" type="text" maxlength="16" data-draft placeholder="⚡"></div>
      </div>
      <div class="field"><label for="te-keywords">Mots-clés * <span class="muted small">(séparés par des virgules)</span></label>
        <input id="te-keywords" type="text" data-draft placeholder="magie, livres, films"></div>
      <div class="field"><label for="te-description">Description</label><input id="te-description" type="text" maxlength="200" data-draft placeholder="En une phrase, de quoi parle ton quiz ?"></div>
      <div class="field">
        <label>🎵 Musique d’ambiance <span class="muted small">(optionnel — MP3, MP4, M4A, OGG, 15 Mo max, jouée en boucle pendant la partie)</span></label>
        ${draft('te-music-url') ? `<div class="music-preview"><audio controls preload="none" src="${esc(draft('te-music-url'))}"></audio>
          <span class="small">${esc(draft('te-music-name') || 'Musique du quiz')}</span>
          <button type="button" class="btn ghost sm" data-action="remove-music">✕ Retirer</button></div>` : ''}
        <label class="btn ghost sm" for="te-music-file" style="margin:6px 0 0">${draft('te-music-url') ? '🔁 Changer la musique' : '🎵 Ajouter une musique'}</label>
        <input id="te-music-file" type="file" accept="audio/*,video/mp4,.mp3,.mp4,.m4a,.ogg,.wav" class="visually-hidden">
        <p class="muted small" style="margin:4px 0 0">Sans musique, une ambiance générée joue. Utilise une musique dont tu as les droits.</p>
      </div>
      <p class="muted small">Créé par <strong>${esc(state.me.username)}</strong> — ton pseudo sera affiché sous le nom du quiz.</p>
    </div>

    <div class="card stack" style="margin-top:16px">
      <div class="spread"><h3 style="margin:0">2. Questions (${n})</h3><span class="muted small">minimum 5 · chaque question a sa difficulté</span></div>
      ${n ? `<p class="small" style="margin:0">Répartition : ${levelsHtml(levelCount(editor.questions))}</p>` : ''}
      ${n ? `<ol class="q-list">${editor.questions.map((q, i) => `
        <li><div>${difficultyBadge(q.difficulty)} <span class="chip">${esc(TYPE_LABELS[q.type])}</span>${q.timeLimit ? ` <span class="badge">⏱ ${q.timeLimit} s</span>` : ''} <strong>${esc(q.prompt)}</strong> ${q.media?.emoji ? esc(q.media.emoji) : ''}${q.media?.imageUrl ? ' 🖼️' : ''}
          ${q.media?.imageUrl ? `<img class="q-thumb" src="${esc(q.media.imageUrl)}" alt="" loading="lazy">` : ''}
          <div class="muted small">→ ${esc(answerText(q))}${q.choices ? ` <span class="muted">(${q.choices.map(esc).join(' / ')})</span>` : ''}</div>${sourceHtml(q.source)}</div>
          <span class="row"><button class="btn ghost sm" data-action="edit-q" data-i="${i}" aria-label="Modifier">✏️</button>
          <button class="btn ghost sm" data-action="move-q" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button class="btn ghost sm" data-action="move-q" data-i="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
          <button class="btn ghost sm" data-action="remove-q" data-i="${i}" aria-label="Supprimer">✕</button></span></li>`).join('')}</ol>`
    : '<p class="muted">Aucune question pour l’instant.</p>'}
      <div class="bulk card-inset stack">
        <strong>🖼️ Quiz d’images en un clic</strong>
        <p class="muted small" style="margin:0">Sélectionne plusieurs images : chacune devient une question « ${esc(bulkPrompt())} »
          dont la réponse est le nom du fichier (<code>pulp-fiction.jpg</code> → « Pulp fiction »). Tu peux ensuite corriger chaque question avec ✏️.
          Difficulté et délai : ceux choisis dans le formulaire ci-dessous.</p>
        <div class="field"><label for="te-bulk-prompt">Question posée pour chaque image</label>
          <input id="te-bulk-prompt" type="text" data-draft placeholder="De quel film s’agit-il ?"></div>
        <label class="btn" for="bulk-images" style="margin:0">📷 Choisir des images…</label>
        <input id="bulk-images" type="file" accept="image/*" multiple class="visually-hidden">
      </div>
      <details class="add-q" id="add-q" open><summary>➕ Ajouter une question</summary>${questionFormHtml('qe', editing !== null ? '💾 Enregistrer la question' : '➕ Ajouter la question')}</details>
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
    if (editing !== null) editor.questions.splice(Math.min(editing, editor.questions.length), 0, question);
    else editor.questions.push(question);
    resetQuestionForm('qe');
    toast(editing !== null ? 'Question modifiée !' : 'Question ajoutée !');
    editing = null;
    renderEditor();
  } catch (err) { toast(err.message, true); }
};

actions['edit-q'] = (el) => {
  const i = Number(el.dataset.i);
  const [q] = editor.questions.splice(i, 1);
  loadQuestionIntoForm('qe', q);
  editing = i;
  renderEditor();
  document.getElementById('add-q')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Modifie la question puis enregistre-la ✏️');
};

// Bulk: one "guess the picture" question per selected image.
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'bulk-images' || !editor) return;
  const files = [...e.target.files];
  if (!files.length) return;
  const difficulty = state.drafts['qe-difficulty'] || 'moyen';
  const time = state.drafts['qe-time'];
  let done = 0;
  for (const file of files) {
    toast(`⏳ Image ${done + 1} / ${files.length}…`);
    try {
      const imageUrl = await uploadImage(file);
      const { question } = await api('/api/questions/validate', {
        method: 'POST',
        body: {
          question: {
            type: 'image', prompt: bulkPrompt(), media: { imageUrl }, answer: answerFromFileName(file.name) || '?',
            difficulty, timeLimit: time ? Number(time) : undefined,
          },
        },
      });
      editor.questions.push(question);
      done += 1;
    } catch (err) {
      toast(`${file.name} : ${err.message}`, true);
    }
  }
  toast(`${done} question${done > 1 ? 's' : ''} créée${done > 1 ? 's' : ''} 🎬`);
  renderEditor();
});

// Quiz music: uploaded as the raw file (too big for JSON).
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'te-music-file' || !e.target.files?.[0]) return;
  const file = e.target.files[0];
  if (file.size > 15 * 1024 * 1024) return toast('Fichier trop lourd (15 Mo max).', true);
  toast('⏳ Envoi de la musique…');
  try {
    const res = await fetch('/api/audio', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Envoi impossible.');
    state.drafts['te-music-url'] = data.url;
    state.drafts['te-music-name'] = file.name;
    toast('Musique ajoutée 🎵');
    renderEditor();
  } catch (err) {
    toast(err.message, true);
  }
});
// Import: the file is read here, parsed by the server, then opened in the editor.
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'quiz-import-file' || !e.target.files?.[0]) return;
  const file = e.target.files[0];
  e.target.value = '';
  if (file.size > 900 * 1024) return toast('Fichier trop lourd (900 Ko max).', true);
  toast('⏳ Lecture du fichier…');
  try {
    const content = await file.text();
    state.ui.importedQuiz = await api('/api/quiz-import', { method: 'POST', body: { fileName: file.name, content } });
    go('#/my-themes/new');
  } catch (err) {
    toast(err.message || 'Fichier illisible.', true);
  }
});

actions['remove-music'] = () => {
  delete state.drafts['te-music-url'];
  delete state.drafts['te-music-name'];
  renderEditor();
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
    music: draft('te-music-url') ? { url: draft('te-music-url'), name: draft('te-music-name') } : null,
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
