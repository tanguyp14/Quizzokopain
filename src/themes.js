const path = require('node:path');
const { THEMES } = require('./questionBank');
const { loadOpenQuizzDbDir } = require('./importers/openquizzdb');

const OPENQUIZZDB_DIR = path.join(__dirname, '..', 'quiz-sources', 'openquizzdb');
const { sanitizeQuestion, DIFFICULTIES } = require('./questionTypes');

const BUILTIN_AUTHOR = 'Neutron';
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 100;
const MAX_PENDING_PER_USER = 10;

/**
 * Difficulty now lives on each question. A quiz gets the breakdown per level and
 * an overall label: the most common level (ties resolve towards "moyen").
 */
function levelStats(questions) {
  const levels = { facile: 0, moyen: 0, difficile: 0 };
  for (const q of questions) levels[q.difficulty || 'moyen'] += 1;
  const difficulty = ['moyen', 'facile', 'difficile'].reduce((best, k) => (levels[k] > levels[best] ? k : best), 'moyen');
  return { levels, difficulty };
}

function fromRow(t) {
  // Questions stored before per-question difficulty inherit the quiz level.
  const questions = t.questions.map((q) => (q.difficulty ? q : { ...q, difficulty: t.difficulty || 'moyen' }));
  return {
    key: t.key, name: t.name, emoji: t.emoji, description: t.description, keywords: t.keywords, music: t.music || null,
    authorName: t.authorName, builtin: false, questions, ...levelStats(questions),
  };
}

/**
 * Every playable theme: the built-in bank plus community themes approved by a
 * superadmin. Keys are the built-in ids ("cinema") or "c<id>" for community themes.
 */
function createThemeStore(repo = null, { importDirs = { openquizzdb: OPENQUIZZDB_DIR } } = {}) {
  // Built-in themes: our own bank plus quizzes imported from open sources (with attribution).
  const imported = importDirs.openquizzdb ? loadOpenQuizzDbDir(importDirs.openquizzdb) : [];
  const builtin = [...THEMES, ...imported].map((t) => ({
    key: t.id, name: t.name, emoji: t.emoji, description: t.description || '', keywords: t.keywords || [],
    authorName: t.authorName || BUILTIN_AUTHOR, source: t.source || null, builtin: true, questions: t.questions, ...levelStats(t.questions),
  }));

  function community() {
    if (!repo) return [];
    return repo.themesByStatus('approved', { withQuestions: true }).map(fromRow);
  }

  return {
    /** All playable themes, questions included. */
    all: () => [...builtin, ...community()],

    get(key) {
      const b = builtin.find((t) => t.key === key);
      if (b) return b;
      const m = /^c(\d+)$/.exec(String(key));
      if (!m || !repo) return null;
      const t = repo.getTheme(Number(m[1]), { withQuestions: true });
      if (!t || t.status !== 'approved') return null;
      return fromRow(t);
    },
  };
}

/** Public summary of a theme (no questions, so no answers). */
function summarize(theme, favorites = new Set(), favoriteCounts = new Map(), playCounts = new Map()) {
  return {
    key: theme.key,
    name: theme.name,
    emoji: theme.emoji,
    description: theme.description,
    keywords: theme.keywords,
    difficulty: theme.difficulty,
    levels: theme.levels,
    authorName: theme.authorName,
    source: theme.source || null,
    hasMusic: Boolean(theme.music),
    builtin: theme.builtin,
    count: theme.questions.length,
    favorite: favorites.has(theme.key),
    favoriteCount: favoriteCounts.get(theme.key) || 0,
    playCount: playCounts.get(theme.key) || 0,
  };
}

function matchesSearch(theme, search) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const needle = norm(search).trim();
  if (!needle) return true;
  return [theme.name, theme.authorName, theme.description, ...(theme.keywords || [])].some((f) => norm(f).includes(needle));
}

/**
 * Validates a theme submission. Returns a clean { name, emoji, description, questions }
 * or throws an Error with a user-facing message.
 */
function sanitizeTheme(input) {
  const t = input || {};
  const name = typeof t.name === 'string' ? t.name.trim() : '';
  if (name.length < 2 || name.length > 40) throw new Error('Le nom du thème doit faire entre 2 et 40 caractères.');
  const emoji = typeof t.emoji === 'string' ? t.emoji.trim() : '';
  if (!emoji || [...emoji].length > 8) throw new Error('Choisis un emoji pour le thème.');
  const description = typeof t.description === 'string' ? t.description.trim().slice(0, 200) : '';
  const rawKeywords = Array.isArray(t.keywords) ? t.keywords : String(t.keywords || '').split(',');
  const keywords = [...new Set(rawKeywords
    .map((k) => String(k).trim().toLowerCase().replace(/^#/, '').slice(0, 24))
    .filter(Boolean))].slice(0, 8);
  if (!keywords.length) throw new Error('Ajoute au moins un mot-clé.');
  const list = Array.isArray(t.questions) ? t.questions : [];
  if (list.length < MIN_QUESTIONS) throw new Error(`Un thème doit contenir au moins ${MIN_QUESTIONS} questions.`);
  if (list.length > MAX_QUESTIONS) throw new Error(`Un thème ne peut pas dépasser ${MAX_QUESTIONS} questions.`);
  const questions = list.map((q, i) => {
    try {
      return { difficulty: 'moyen', ...sanitizeQuestion(q) };
    } catch (err) {
      throw new Error(`Question ${i + 1} : ${err.message}`);
    }
  });
  return { name, emoji, description, keywords, music: sanitizeMusic(t.music), questions, ...levelStats(questions) };
}

/** Background music of a quiz: an uploaded file (/api/images/<id>) or an http(s) URL. */
function sanitizeMusic(m) {
  if (!m || typeof m !== 'object' || typeof m.url !== 'string' || !m.url.trim()) return null;
  const url = m.url.trim().slice(0, 1000);
  if (!/^\/api\/images\/\d+$/.test(url) && !/^https?:\/\/\S+$/i.test(url)) throw new Error('Lien de musique invalide.');
  const name = typeof m.name === 'string' ? m.name.trim().slice(0, 80) : '';
  return { url, ...(name && { name }) };
}

module.exports = {
  createThemeStore, summarize, levelStats, DIFFICULTIES, matchesSearch, sanitizeTheme, BUILTIN_AUTHOR, MIN_QUESTIONS, MAX_PENDING_PER_USER,
};
