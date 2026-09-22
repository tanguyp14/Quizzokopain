// Question builder shared by the lobby (custom questions) and the quiz editor.
import {
  esc, draft, state, LETTERS, TYPE_LABELS, DIFFICULTIES, clearDrafts,
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
    specific = `<div class="grid-2">${field('answer', 'Valeur exacte *', 'inputmode="decimal"')}${field('unit', 'Unité (optionnel)')}</div>`;
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
    ${withMedia ? `<div class="grid-2">${field('emoji', 'Emojis / texte à deviner')}${field('image', 'ou URL d’une image', 'inputmode="url" placeholder="https://…"')}</div>`
      : '<p class="muted small">Astuce : choisis « Devine l’image » ou « Rébus » pour ajouter des emojis ou une image.</p>'}
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
