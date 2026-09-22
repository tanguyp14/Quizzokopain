// Loads quizzes downloaded from OpenQuizzDB (https://www.openquizzdb.org), which
// publishes them under Creative Commons BY-SA. Each file becomes a built-in theme
// and every question keeps its attribution (provider, licence, writer).
//
// Expected shape of a downloaded JSON file (keys are matched without accents/case):
//   {
//     "fournisseur": "OpenQuizzDB - Fournisseur de contenu libre (https://www.openquizzdb.org)",
//     "licence": "CC BY-SA", "rédacteur": "…",
//     "catégorie-nom-slogan": { "fr": { "catégorie": "…", "nom": "…", "slogan": "…" } },
//     "quizz": { "fr": { "débutant": [Q…], "confirmé": [Q…], "expert": [Q…] } }
//   }
//   Q = { "question": "…", "propositions": ["…", "…", "…", "…"], "réponse": "…", "anecdote": "…" }

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeQuestion } = require('../questionTypes');
const { normalize } = require('../matching');

const PROVIDER = { name: 'OpenQuizzDB', url: 'https://www.openquizzdb.org' };
const DEFAULT_LICENSE = 'CC BY-SA';
const LEVELS = { debutant: 'facile', confirme: 'moyen', expert: 'difficile' };

const CATEGORY_EMOJI = [
  ['cinema', '🎬'], ['film', '🎬'], ['musique', '🎵'], ['chanson', '🎤'], ['geographie', '🌍'], ['pays', '🗺️'],
  ['histoire', '🏛️'], ['science', '🔬'], ['sport', '⚽'], ['football', '⚽'], ['jeux video', '🎮'], ['jeu', '🎲'],
  ['animaux', '🦊'], ['nature', '🌿'], ['cuisine', '🍳'], ['gastronomie', '🍷'], ['litterature', '📚'], ['livre', '📚'],
  ['art', '🎨'], ['peinture', '🎨'], ['television', '📺'], ['serie', '📺'], ['bd', '💬'], ['manga', '💬'],
  ['mythologie', '⚡'], ['religion', '⛪'], ['langue', '🔤'], ['politique', '🏛️'], ['informatique', '💻'], ['espace', '🚀'], ['astronom', '🔭'],
];

/** Looks up a key ignoring accents and case ("rédacteur" == "redacteur"). */
function pick(obj, ...names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const wanted = names.map(normalizeKey);
  const key = Object.keys(obj).find((k) => wanted.includes(normalizeKey(k)));
  return key === undefined ? undefined : obj[key];
}
const normalizeKey = (k) => String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** The French block when the file is per-language, the object itself otherwise. */
const french = (obj) => pick(obj, 'fr') ?? obj;

function slug(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function emojiFor(category, name) {
  const hay = `${normalize(category)} ${normalize(name)}`;
  return CATEGORY_EMOJI.find(([k]) => hay.includes(k))?.[1] || '📘';
}

/**
 * Converts one OpenQuizzDB file into a theme. Returns { theme, skipped } where
 * `skipped` counts questions that could not be used (answer not among the choices…).
 */
function parseOpenQuizzDb(json, fileName = 'quiz') {
  const meta = french(pick(json, 'categorie-nom-slogan', 'categorienomslogan')) || {};
  const category = text(pick(meta, 'categorie'));
  const name = (text(pick(meta, 'nom')) || category || path.basename(fileName, '.json')).slice(0, 40);
  const author = text(pick(json, 'redacteur', 'auteur'));
  const license = text(pick(json, 'licence', 'license')) || DEFAULT_LICENSE;
  const source = { ...PROVIDER, license, ...(author && { author }) };

  const levels = french(pick(json, 'quizz', 'quiz'));
  if (!levels || typeof levels !== 'object') throw new Error(`${fileName} : pas de bloc "quizz"`);

  const questions = [];
  let skipped = 0;
  for (const [levelKey, list] of Object.entries(levels)) {
    const difficulty = LEVELS[normalizeKey(levelKey)];
    if (!difficulty || !Array.isArray(list)) continue;
    for (const item of list) {
      const choices = (pick(item, 'propositions') || []).map(text).filter(Boolean);
      const answer = text(pick(item, 'reponse'));
      const index = choices.findIndex((c) => normalize(c) === normalize(answer));
      try {
        if (index < 0) throw new Error('réponse absente des propositions');
        questions.push(sanitizeQuestion({
          type: 'qcm',
          prompt: text(pick(item, 'question')),
          choices,
          answer: index,
          difficulty,
          explanation: text(pick(item, 'anecdote')),
          source,
        }));
      } catch {
        skipped += 1;
      }
    }
  }
  if (!questions.length) throw new Error(`${fileName} : aucune question exploitable`);

  const keywords = [...new Set([category, 'openquizzdb'].map((k) => k.toLowerCase().slice(0, 24)).filter(Boolean))];
  const theme = {
    id: `oqdb-${slug(name) || slug(fileName)}`,
    name,
    emoji: emojiFor(category, name),
    description: text(pick(meta, 'slogan')).slice(0, 200),
    keywords,
    authorName: 'OpenQuizzDB',
    source,
    questions,
  };
  return { theme, skipped };
}

/** Reads every *.json file of `dir`; bad files are reported and ignored. */
function loadOpenQuizzDbDir(dir, log = console) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).sort();
  } catch {
    return [];
  }
  const themes = [];
  const ids = new Set();
  for (const file of files) {
    try {
      const { theme, skipped } = parseOpenQuizzDb(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), file);
      while (ids.has(theme.id)) theme.id += '-2';
      ids.add(theme.id);
      themes.push(theme);
      if (skipped) log.warn?.(`OpenQuizzDB ${file} : ${skipped} question(s) ignorée(s)`);
    } catch (err) {
      log.warn?.(`OpenQuizzDB ${file} ignoré : ${err.message}`);
    }
  }
  return themes;
}

module.exports = { parseOpenQuizzDb, loadOpenQuizzDbDir, PROVIDER };
