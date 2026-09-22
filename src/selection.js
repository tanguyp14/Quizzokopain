const { TYPES } = require('./questionTypes');
const { createThemeStore } = require('./themes');

const SPECIAL_THEMES = {
  random: { key: 'random', name: 'Thème surprise', emoji: '🎲', special: true },
  mix: { key: 'mix', name: 'Grand mix', emoji: '🌀', special: true },
  custom: { key: 'custom', name: 'Mes questions', emoji: '✍️', special: true },
};

// Built lazily: only used when no store is passed (unit tests, scripts).
let fallbackStore = null;
const defaultStore = {
  all: () => (fallbackStore ??= createThemeStore()).all(),
  get: (key) => (fallbackStore ??= createThemeStore()).get(key),
};

function questionTypes() {
  return Object.entries(TYPES).map(([id, t]) => ({ id, label: t.label, grading: t.grading }));
}

function isValidThemeId(id, store = defaultStore) {
  return Boolean(SPECIAL_THEMES[id] || store.get(id));
}

/** Name/emoji/author of the theme selected in a lobby, for display. */
function describeTheme(id, store = defaultStore) {
  if (SPECIAL_THEMES[id]) return { ...SPECIAL_THEMES[id] };
  const t = store.get(id);
  return t ? {
    key: t.key, name: t.name, emoji: t.emoji, authorName: t.authorName, difficulty: t.difficulty, levels: t.levels, keywords: t.keywords, source: t.source || null,
  } : null;
}

function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Resolves the room settings into the concrete theme and question list of a game.
 * Custom questions written by the admin are always included; the theme fills up
 * the remaining slots.
 */
function buildGame({ themeId, questionCount, types, difficulty = 'all' }, customQuestions = [], random = Math.random, store = defaultStore) {
  const allowed = new Set(types && types.length ? types : Object.keys(TYPES));
  // Difficulty is per question: a chosen level only keeps questions of that level,
  // whatever the theme (and "random" only picks themes that have some).
  const keep = (q) => allowed.has(q.type) && (difficulty === 'all' || (q.difficulty || 'moyen') === difficulty);
  const usable = (t) => t.questions.some(keep);
  let theme;
  let pool;
  if (themeId === 'random') {
    const candidates = store.all().filter(usable);
    if (!candidates.length) throw new Error('Aucun thème ne correspond à ces réglages (types / difficulté).');
    const t = candidates[Math.floor(random() * candidates.length)];
    theme = { key: t.key, name: t.name, emoji: t.emoji, authorName: t.authorName, source: t.source || null };
    pool = t.questions;
  } else if (themeId === 'mix') {
    theme = { ...SPECIAL_THEMES.mix };
    pool = store.all().flatMap((t) => t.questions);
  } else if (themeId === 'custom') {
    theme = { ...SPECIAL_THEMES.custom };
    pool = [];
  } else {
    const t = store.get(themeId);
    if (!t) throw new Error('Ce thème n’existe plus.');
    theme = { key: t.key, name: t.name, emoji: t.emoji, authorName: t.authorName, source: t.source || null };
    pool = t.questions;
  }

  const fromBank = shuffle(pool.filter(keep), random)
    .slice(0, Math.max(0, questionCount - customQuestions.length));
  const questions = shuffle([...customQuestions, ...fromBank], random).map((q) => structuredClone(q));
  return { theme, questions };
}

module.exports = { questionTypes, isValidThemeId, describeTheme, buildGame, shuffle, SPECIAL_THEMES };
