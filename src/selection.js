const { THEMES } = require('./questionBank');
const { TYPES } = require('./questionTypes');

const SPECIAL_THEMES = {
  random: { id: 'random', name: 'Thème surprise', emoji: '🎲' },
  mix: { id: 'mix', name: 'Grand mix', emoji: '🌀' },
  custom: { id: 'custom', name: 'Mes questions', emoji: '✍️' },
};

function themeCatalog() {
  return {
    special: Object.values(SPECIAL_THEMES),
    themes: THEMES.map(({ id, name, emoji, questions }) => ({ id, name, emoji, count: questions.length })),
    types: Object.entries(TYPES).map(([id, t]) => ({ id, label: t.label, grading: t.grading })),
  };
}

function isValidThemeId(id) {
  return Boolean(SPECIAL_THEMES[id] || THEMES.some((t) => t.id === id));
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
 * Custom questions written by the admin are always included; the bank fills up
 * the remaining slots.
 */
function buildGame({ themeId, questionCount, types }, customQuestions = [], random = Math.random) {
  let theme;
  let pool;
  if (themeId === 'random') {
    const t = THEMES[Math.floor(random() * THEMES.length)];
    theme = { id: t.id, name: t.name, emoji: t.emoji };
    pool = t.questions;
  } else if (themeId === 'mix') {
    theme = SPECIAL_THEMES.mix;
    pool = THEMES.flatMap((t) => t.questions);
  } else if (themeId === 'custom') {
    theme = SPECIAL_THEMES.custom;
    pool = [];
  } else {
    const t = THEMES.find((x) => x.id === themeId);
    if (!t) throw new Error('Thème inconnu.');
    theme = { id: t.id, name: t.name, emoji: t.emoji };
    pool = t.questions;
  }

  const allowed = new Set(types && types.length ? types : Object.keys(TYPES));
  const fromBank = shuffle(pool.filter((q) => allowed.has(q.type)), random)
    .slice(0, Math.max(0, questionCount - customQuestions.length));
  const questions = shuffle([...customQuestions, ...fromBank], random).map((q) => structuredClone(q));
  return { theme, questions };
}

module.exports = { themeCatalog, isValidThemeId, buildGame, shuffle, SPECIAL_THEMES };
