const { isCloseMatch } = require('./matching');

/**
 * Question types.
 *  - grading "auto":    the server knows the right answer (QCM, vrai/faux).
 *  - grading "manual":  free text; the server suggests a verdict, the session admin validates.
 *  - grading "closest": numeric estimation; whoever is closest scores the point.
 */
const TYPES = {
  qcm: { label: 'QCM', grading: 'auto' },
  vraifaux: { label: 'Vrai ou faux', grading: 'auto' },
  libre: { label: 'Réponse libre', grading: 'manual' },
  rebus: { label: 'Rébus', grading: 'manual' },
  image: { label: 'Devine l’image', grading: 'manual' },
  estimation: { label: 'Estimation', grading: 'closest' },
};

const DIFFICULTIES = {
  facile: { label: 'Facile', emoji: '🟢' },
  moyen: { label: 'Moyen', emoji: '🟠' },
  difficile: { label: 'Difficile', emoji: '🔴' },
};

const MAX_TEXT = 300;
const IMAGE_URL_RE = /^https?:\/\/\S+$/i;

function cleanText(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Where a question comes from, shown to players (attribution for licensed content
 * such as OpenQuizzDB). Accepts a plain string ("Wikipédia") or
 * { name, url, license, author }. Returns null when empty.
 */
function sanitizeSource(input) {
  if (!input) return null;
  const raw = typeof input === 'string' ? { name: input } : input;
  let name = cleanText(raw.name, 80);
  let url = cleanText(raw.url, 300);
  // A bare URL typed as the source name becomes the link.
  if (!url && IMAGE_URL_RE.test(name)) { url = name; name = ''; }
  if (url && !IMAGE_URL_RE.test(url)) url = '';
  if (!name && url) {
    try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { url = ''; }
  }
  if (!name) return null;
  const source = { name };
  if (url) source.url = url;
  const license = cleanText(raw.license, 40);
  if (license) source.license = license;
  const author = cleanText(raw.author, 60);
  if (author) source.author = author;
  return source;
}

/**
 * Validates a question written by a session admin and returns a normalized copy.
 * Throws an Error with a user-facing message when the question is invalid.
 */
function sanitizeQuestion(input) {
  const q = input || {};
  const type = q.type;
  if (!TYPES[type]) throw new Error('Type de question inconnu.');
  const prompt = cleanText(q.prompt);
  const out = { type, prompt };

  const emoji = cleanText(q.media?.emoji, 60);
  const imageUrl = cleanText(q.media?.imageUrl, 1000);
  if (imageUrl && !IMAGE_URL_RE.test(imageUrl)) throw new Error('L’URL de l’image doit commencer par http(s)://');
  if (emoji || imageUrl) out.media = { ...(emoji && { emoji }), ...(imageUrl && { imageUrl }) };

  switch (type) {
    case 'qcm': {
      const choices = (Array.isArray(q.choices) ? q.choices : []).map((c) => cleanText(c, 120)).filter(Boolean);
      if (choices.length < 2 || choices.length > 6) throw new Error('Un QCM doit avoir entre 2 et 6 choix.');
      const answer = Number(q.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= choices.length) throw new Error('Indique la bonne réponse du QCM.');
      Object.assign(out, { choices, answer });
      break;
    }
    case 'vraifaux':
      if (typeof q.answer !== 'boolean') throw new Error('Indique si l’affirmation est vraie ou fausse.');
      out.answer = q.answer;
      break;
    case 'estimation': {
      const answer = Number(q.answer);
      if (!Number.isFinite(answer)) throw new Error('La réponse d’une estimation doit être un nombre.');
      out.answer = answer;
      const unit = cleanText(q.unit, 30);
      if (unit) out.unit = unit;
      break;
    }
    default: {
      const answer = cleanText(q.answer, 120);
      if (!answer) throw new Error('Indique la réponse attendue.');
      out.answer = answer;
      const accept = (Array.isArray(q.accept) ? q.accept : []).map((a) => cleanText(a, 120)).filter(Boolean).slice(0, 10);
      if (accept.length) out.accept = accept;
    }
  }

  if (!out.prompt) out.prompt = defaultPrompt(type);
  if ((type === 'rebus' || type === 'image') && !out.media) throw new Error('Ajoute des emojis ou une image.');
  if (q.difficulty !== undefined && q.difficulty !== null && q.difficulty !== '') {
    if (!DIFFICULTIES[q.difficulty]) throw new Error('Difficulté inconnue.');
    out.difficulty = q.difficulty;
  }
  const explanation = cleanText(q.explanation);
  if (explanation) out.explanation = explanation;
  const source = sanitizeSource(q.source);
  if (source) out.source = source;
  return out;
}

function defaultPrompt(type) {
  switch (type) {
    case 'rebus': return 'Résous ce rébus !';
    case 'image': return 'De quel film s’agit-il ?';
    default: return 'Question';
  }
}

/** The question as sent to players while it is open: no answer, no accepted variants. */
function publicQuestion(q) {
  const out = { type: q.type, typeLabel: TYPES[q.type].label, prompt: q.prompt };
  if (q.choices) out.choices = q.choices;
  if (q.media) out.media = q.media;
  if (q.unit) out.unit = q.unit;
  if (q.difficulty) out.difficulty = q.difficulty;
  if (q.source) out.source = q.source;
  return out;
}

function answerText(q) {
  switch (q.type) {
    case 'qcm': return q.choices[q.answer];
    case 'vraifaux': return q.answer ? 'Vrai' : 'Faux';
    case 'estimation': return `${q.answer.toLocaleString('fr-FR')}${q.unit ? ` ${q.unit}` : ''}`;
    default: return q.answer;
  }
}

/** Coerces a raw player submission into the stored shape, or null if it is unusable. */
function parseSubmission(q, raw) {
  switch (q.type) {
    case 'qcm': {
      const i = Number(raw);
      return Number.isInteger(i) && i >= 0 && i < q.choices.length ? i : null;
    }
    case 'vraifaux':
      return typeof raw === 'boolean' ? raw : null;
    case 'estimation': {
      const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
      return String(raw).trim() !== '' && Number.isFinite(n) ? n : null;
    }
    default: {
      const text = cleanText(raw, 200);
      return text || null;
    }
  }
}

function submissionText(q, value) {
  if (value === null || value === undefined) return '—';
  switch (q.type) {
    case 'qcm': return q.choices[value] ?? '—';
    case 'vraifaux': return value ? 'Vrai' : 'Faux';
    case 'estimation': return value.toLocaleString('fr-FR');
    default: return String(value);
  }
}

/**
 * Computes the initial verdict for every answer: final for auto/closest questions,
 * a suggestion for manual ones. `answers` is a Map(userId -> value).
 */
function gradeAnswers(q, answers) {
  const verdicts = new Map();
  if (q.type === 'estimation') {
    let best = Infinity;
    for (const v of answers.values()) best = Math.min(best, Math.abs(v - q.answer));
    for (const [uid, v] of answers) verdicts.set(uid, Math.abs(v - q.answer) === best);
    return verdicts;
  }
  for (const [uid, v] of answers) {
    if (q.type === 'qcm' || q.type === 'vraifaux') verdicts.set(uid, v === q.answer);
    else verdicts.set(uid, isCloseMatch(v, [q.answer, ...(q.accept || [])]));
  }
  return verdicts;
}

module.exports = {
  TYPES,
  DIFFICULTIES,
  sanitizeQuestion,
  sanitizeSource,
  publicQuestion,
  answerText,
  parseSubmission,
  submissionText,
  gradeAnswers,
};
