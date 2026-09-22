// Question builder shared by the lobby (custom questions) and the quiz editor.
import {
  esc, draft, state, actions, LETTERS, TYPE_LABELS, DIFFICULTIES, clearDrafts, uploadImage, toast, rerender,
} from './core.js';

export function questionFormHtml(prefix, submitLabel = '➕ Ajouter la question') {
  const type = state.drafts[`${prefix}-type`] || 'qcm';
  if (!state.drafts[`${prefix}-difficulty`]) state.drafts[`${prefix}-difficulty`] = 'moyen';
  const field = (id, label, attrs = '') => `<div class="field"><label for="${prefix}-${id}">${label}</label><input id="${prefix}-${id}" type="text" data-draft ${attrs}></div>`;
  let specific;
  if (type === 'qcm') {
    specific = `<div class="grid-2">${[0, 1, 2, 3].map((i) => field(`choice-${i}`, `Choix ${LETTERS[i]}${i < 2 ? ' *' : ''}`)).join('')}</div>
      <div class="field"><label for="${prefix}-correct">Bonne réponse</label>
        <select id="${prefix}-correct" data-draft>${[0, 1, 2, 3].map((i) => `<option value="${i}">Choix ${LETTERS[i]}</option>`).join('')}</select></div>`;
  } else if (type === 'vraifaux') {
    specific = `<div class="field"><label for="${prefix}-vf">Réponse</label>
      <select id="${prefix}-vf" data-draft><option value="true">Vrai</option><option value="false">Faux</option></select></div>`;
  } else if (type === 'estimation') {
    specific = `<div class="grid-2">${field('answer', 'Nombre exact attendu *', 'inputmode="decimal"')}${field('unit', 'Unité (optionnel)')}</div>`;
  } else {
    specific = `${field('answer', 'Réponse attendue *')}${field('accept', 'Autres réponses acceptées (séparées par des virgules)')}`;
  }
  const withMedia = type === 'rebus' || type === 'image' || draft(`${prefix}-emoji`) || draft(`${prefix}-image`);
  return `<form data-form="question" data-prefix="${prefix}" class="stack">
    <div class="grid-2">
      <div class="field"><label for="${prefix}-type">Type</label>
        <select id="${prefix}-type" data-draft data-rerender>${Object.entries(TYPE_LABELS).map(([id, label]) => `<option value="${id}" ${id === type ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
      <div class="field"><label for="${prefix}-difficulty">Difficulté</label>
        <select id="${prefix}-difficulty" data-draft>${Object.entries(DIFFICULTIES).map(([k, d]) => `<option value="${k}">${d.emoji} ${d.label}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="${prefix}-time">⏱ Délai pour répondre</label>
      <select id="${prefix}-time" data-draft>
        <option value="">Délai de la room</option>
        ${[10, 15, 20, 30].map((t) => `<option value="${t}">${t} secondes</option>`).join('')}
      </select></div>
    ${field('prompt', type === 'rebus' || type === 'image' ? 'Question (optionnel)' : 'Question *')}
    ${withMedia ? `<div class="stack media-fields">
        ${draft(`${prefix}-image`) ? `<div class="img-preview"><img src="${esc(draft(`${prefix}-image`))}" alt="Aperçu"><button type="button" class="btn ghost sm" data-action="clear-image" data-prefix="${prefix}">✕ Retirer l’image</button></div>` : ''}
        <div class="row">
          <label class="btn sm" for="${prefix}-file" style="margin:0">📷 ${draft(`${prefix}-image`) ? 'Changer d’image' : 'Importer une image'}</label>
          <input id="${prefix}-file" type="file" accept="image/*" class="visually-hidden" data-upload="${prefix}">
          <span class="muted small">ou</span>
        </div>
        <div class="grid-2">${field('image', 'URL d’une image', 'inputmode="url" placeholder="https://…"')}${field('emoji', 'Emojis / texte à deviner')}</div>
      </div>`
      : `<div class="row"><label class="btn ghost sm" for="${prefix}-file" style="margin:0">🖼️ Ajouter une image à cette question</label>
        <input id="${prefix}-file" type="file" accept="image/*" class="visually-hidden" data-upload="${prefix}"></div>`}
    ${specific}
    ${field('explanation', 'Explication / anecdote affichée après la réponse (optionnel)')}
    ${field('source', 'Source (optionnel) : nom ou lien', 'placeholder="Ex : Wikipédia, https://…"')}
    <button class="btn" type="submit">${submitLabel}</button>
  </form>`;
}

/** Builds the question object from the form drafts (the server validates it). */
export function readQuestionForm(prefix) {
  const d = (k) => draft(`${prefix}-${k}`);
  const type = state.drafts[`${prefix}-type`] || 'qcm';
  const q = {
    type, prompt: d('prompt'), media: { emoji: d('emoji'), imageUrl: d('image') }, explanation: d('explanation'), difficulty: d('difficulty') || 'moyen', source: d('source'),
    timeLimit: d('time') ? Number(d('time')) : undefined,
  };
  if (type === 'qcm') {
    const correct = Number(state.drafts[`${prefix}-correct`] || 0);
    // Drop empty choices while keeping track of which one is correct.
    const kept = [0, 1, 2, 3].map((i) => ({ c: d(`choice-${i}`), i })).filter((x) => x.c);
    q.choices = kept.map((x) => x.c);
    q.answer = kept.findIndex((x) => x.i === correct);
  } else if (type === 'vraifaux') {
    q.answer = (state.drafts[`${prefix}-vf`] || 'true') === 'true';
  } else if (type === 'estimation') {
    q.answer = Number(d('answer').replace(',', '.'));
    q.unit = d('unit');
  } else {
    q.answer = d('answer');
    q.accept = d('accept').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return q;
}

export function resetQuestionForm(prefix) {
  // Keep type and difficulty: questions are often written in series.
  clearDrafts(`${prefix}-`, [`${prefix}-type`, `${prefix}-difficulty`, `${prefix}-time`]);
}

/** Fills the form back from an existing question (to edit it). */
export function loadQuestionIntoForm(prefix, q) {
  resetQuestionForm(prefix);
  const set = (k, v) => { if (v !== undefined && v !== null && v !== '') state.drafts[`${prefix}-${k}`] = String(v); };
  set('type', q.type);
  set('difficulty', q.difficulty);
  set('time', q.timeLimit);
  set('prompt', q.prompt);
  set('emoji', q.media?.emoji);
  set('image', q.media?.imageUrl);
  set('explanation', q.explanation);
  set('source', q.source?.url || q.source?.name);
  if (q.type === 'qcm') {
    q.choices.forEach((c, i) => set(`choice-${i}`, c));
    set('correct', q.answer);
  } else if (q.type === 'vraifaux') {
    set('vf', q.answer);
  } else {
    set('answer', q.answer);
    set('unit', q.unit);
    set('accept', (q.accept || []).join(', '));
  }
}

// Picture upload from any question form: store the URL in the form, then redraw.
document.addEventListener('change', async (e) => {
  const prefix = e.target.dataset?.upload;
  const file = e.target.files?.[0];
  if (!prefix || !file) return;
  toast('⏳ Envoi de l’image…');
  try {
    state.drafts[`${prefix}-image`] = await uploadImage(file);
    toast('Image ajoutée 🖼️');
    rerender();
  } catch (err) {
    toast(err.message || 'Impossible de lire cette image.', true);
  }
});

actions['clear-image'] = (el) => {
  delete state.drafts[`${el.dataset.prefix}-image`];
  rerender();
};
