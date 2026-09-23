// SuperAdmin: every question of a quiz, with its answer.
import {
  state, render, show, api, esc, plural, title, difficultyBadge, levelsHtml, keywordChips, sourceHtml, mediaHtml,
  answerText, TYPE_LABELS, LETTERS, anecdoteHtml,
} from '../core.js';
import { statusBadge } from './myThemes.js';

function questionHtml(q, i) {
  let detail = '';
  if (q.type === 'qcm') {
    detail = `<ul class="qv-choices">${q.choices.map((c, k) => `<li class="${k === q.answer ? 'good' : ''}">${LETTERS[k]}. ${esc(c)}${k === q.answer ? ' ✅' : ''}</li>`).join('')}</ul>`;
  } else if (q.type === 'ordre') {
    detail = `<ol class="ord-list solution">${q.items.map((it, pos) => `<li class="ord-item"><span class="ord-num">${pos + 1}</span>
      ${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="">` : ''}${it.text ? `<span class="ord-text">${esc(it.text)}</span>` : ''}</li>`).join('')}</ol>`;
  } else {
    detail = `<div>✅ <strong>${esc(answerText(q))}</strong>${q.accept?.length ? ` <span class="muted small">· aussi acceptées : ${q.accept.map(esc).join(', ')}</span>` : ''}</div>`;
  }
  return `<li class="card stack qv-item">
    <div class="row">${difficultyBadge(q.difficulty)}<span class="chip">${esc(TYPE_LABELS[q.type] || q.type)}</span>${q.timeLimit ? `<span class="badge">⏱ ${q.timeLimit} s</span>` : ''}<span class="muted small" style="margin-left:auto">#${i + 1}</span></div>
    <strong class="qv-prompt">${esc(q.prompt)}</strong>
    ${q.media ? mediaHtml(q.media, true) : ''}
    ${detail}
    ${anecdoteHtml(q.explanation)}
    ${sourceHtml(q.source)}
  </li>`;
}

export async function quizViewPage(key) {
  if (state.me.role !== 'superadmin') return render('<div class="card">Réservé au SuperAdmin.</div>');
  render('<p class="muted">Chargement…</p>');
  let quiz;
  try {
    ({ quiz } = await api(`/api/admin/quiz/${encodeURIComponent(key)}`));
  } catch (err) {
    return render(`<div class="card">${esc(err.message)} <a href="#/admin">← Admin</a></div>`);
  }
  const editable = /^c\d+$/.test(key);
  show(() => render(`
    <p><a href="#/admin">← Espace SuperAdmin</a> · <a href="#/themes">📚 Les quiz</a></p>
    <div class="card stack">
      <div class="spread">
        <h1 style="margin:0">${title(quiz.emoji, quiz.name)}</h1>
        ${editable ? statusBadge(quiz.status) : '<span class="badge">📦 Intégré</span>'}
      </div>
      <div class="muted">par <strong>${esc(quiz.authorName || 'compte supprimé')}</strong></div>
      <div class="row"><span class="badge">❓ ${plural(quiz.questions.length, 'question')}</span>${levelsHtml(quiz.levels)}</div>
      ${quiz.description ? `<p class="muted" style="margin:0">${esc(quiz.description)}</p>` : ''}
      <div class="kws">${keywordChips(quiz.keywords)}</div>
      ${sourceHtml(quiz.source, { label: 'Questions' })}
      ${editable ? `<a class="btn ghost" href="#/my-themes/${quiz.id}">✏️ Modifier ce quiz</a>` : ''}
    </div>
    <ol class="qv-list">${quiz.questions.map(questionHtml).join('')}</ol>`));
}
