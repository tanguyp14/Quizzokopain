// Quiz export / import.
//  - JSON "neutron-quiz": complete (every field), for backups and sharing between instances.
//  - CSV: one question per row, to write or edit quizzes in a spreadsheet.
//  - OpenQuizzDB JSON files are accepted on import too.
// Imports only produce a draft: the editor shows it, the author checks it and
// submits it through the usual validation.

const { sanitizeQuestion, TYPES } = require('./questionTypes');
const { parseOpenQuizzDb } = require('./importers/openquizzdb');

const FORMAT = 'neutron-quiz';
const VERSION = 1;
const MAX_QUESTIONS = 100;
const LETTERS = 'ABCDEF';

// ---- media links -----------------------------------------------------------------
// Files stored by this instance are referenced as "/api/images/<id>". In an export
// they become absolute so the file stays reachable; importing on the same instance
// turns them back into local links.
const absolutize = (url, origin) => (typeof url === 'string' && url.startsWith('/api/images/') ? `${origin}${url}` : url);
const localize = (url, origin) => (typeof url === 'string' && origin && url.startsWith(`${origin}/api/images/`) ? url.slice(origin.length) : url);

function mapMedia(q, fn) {
  const out = { ...q };
  if (q.media?.imageUrl) out.media = { ...q.media, imageUrl: fn(q.media.imageUrl) };
  if (q.items) out.items = q.items.map((it) => (it.imageUrl ? { ...it, imageUrl: fn(it.imageUrl) } : it));
  return out;
}

// ---- export ---------------------------------------------------------------------------

function toNeutronJson(quiz, origin) {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    quiz: {
      name: quiz.name,
      emoji: quiz.emoji,
      description: quiz.description || '',
      keywords: quiz.keywords || [],
      ...(quiz.authorName && { author: quiz.authorName }),
      ...(quiz.music && { music: { ...quiz.music, url: absolutize(quiz.music.url, origin) } }),
      ...(quiz.source && { source: quiz.source }),
      questions: quiz.questions.map((q) => mapMedia(q, (u) => absolutize(u, origin))),
    },
  };
}

const CSV_COLUMNS = [
  'type', 'question', 'reponse', 'choix1', 'choix2', 'choix3', 'choix4', 'choix5', 'choix6',
  'elements', 'accepte', 'unite', 'difficulte', 'delai', 'emoji', 'image', 'anecdote', 'source',
];

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per question, ";"-separated (what French spreadsheets expect), UTF-8 with BOM. */
function toCsv(quiz, origin) {
  const rows = quiz.questions.map((raw) => {
    const q = mapMedia(raw, (u) => absolutize(u, origin));
    const row = {
      type: q.type,
      question: q.prompt,
      difficulte: q.difficulty || '',
      delai: q.timeLimit || '',
      emoji: q.media?.emoji || '',
      image: q.media?.imageUrl || '',
      anecdote: q.explanation || '',
      source: q.source?.url || q.source?.name || '',
    };
    if (q.type === 'qcm') {
      q.choices.forEach((c, i) => { row[`choix${i + 1}`] = c; });
      row.reponse = q.choices[q.answer];
    } else if (q.type === 'vraifaux') {
      row.reponse = q.answer ? 'vrai' : 'faux';
    } else if (q.type === 'ordre') {
      // Items in the right order; an item with a picture is written "text {url}".
      row.elements = q.items.map((it) => [it.text, it.imageUrl && `{${it.imageUrl}}`].filter(Boolean).join(' ')).join(' | ');
    } else {
      row.reponse = q.answer;
      if (q.accept?.length) row.accepte = q.accept.join(' | ');
      if (q.unit) row.unite = q.unit;
    }
    return CSV_COLUMNS.map((c) => csvCell(row[c])).join(';');
  });
  return `﻿${[CSV_COLUMNS.join(';'), ...rows].join('\r\n')}\r\n`;
}

/** A small example file to start from. */
function csvTemplate() {
  return toCsv({
    questions: [
      { type: 'qcm', prompt: 'Quelle est la capitale de l’Australie ?', choices: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], answer: 1, difficulty: 'moyen', explanation: 'Canberra a été construite pour départager Sydney et Melbourne.' },
      { type: 'vraifaux', prompt: 'Les pieuvres ont trois cœurs.', answer: true, difficulty: 'facile', timeLimit: 15 },
      { type: 'libre', prompt: 'Qui a peint « La Joconde » ?', answer: 'Léonard de Vinci', accept: ['De Vinci', 'Leonard de Vinci'], difficulty: 'facile' },
      { type: 'estimation', prompt: 'Combien de touches compte un piano standard ?', answer: 88, unit: 'touches', difficulty: 'difficile' },
      { type: 'image', prompt: 'Quel film se cache derrière ces emojis ?', media: { emoji: '🦁👑' }, answer: 'Le Roi Lion', difficulty: 'facile' },
      { type: 'ordre', prompt: 'Du plus petit au plus grand', items: [{ text: 'Souris' }, { text: 'Chat' }, { text: 'Cheval' }, { text: 'Éléphant' }], difficulty: 'facile' },
    ],
  }, '');
}

// ---- import ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const TYPE_ALIASES = {
  qcm: 'qcm', 'choix multiple': 'qcm', 'choix multiples': 'qcm',
  vraifaux: 'vraifaux', 'vrai/faux': 'vraifaux', 'vrai ou faux': 'vraifaux', 'vrai-faux': 'vraifaux',
  libre: 'libre', 'reponse libre': 'libre', texte: 'libre',
  rebus: 'rebus',
  image: 'image', 'devine l’image': 'image', "devine l'image": 'image', film: 'image',
  estimation: 'estimation', chiffre: 'estimation', nombre: 'estimation', 'reponse chiffree': 'estimation',
  ordre: 'ordre', classement: 'ordre', 'classer dans l’ordre': 'ordre', "classer dans l'ordre": 'ordre',
};

/** RFC 4180-ish CSV reader; the separator (";", "," or tab) is guessed from the header line. */
function readCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const splitList = (s) => String(s || '').split('|').map((x) => x.trim()).filter(Boolean);

function questionFromRow(r) {
  const type = TYPE_ALIASES[norm(r.type)] || (r.type ? null : 'qcm');
  if (!type) throw new Error(`type « ${r.type} » inconnu`);
  const q = {
    type,
    prompt: r.question,
    difficulty: norm(r.difficulte) || undefined,
    timeLimit: r.delai ? Number(String(r.delai).replace(/\D/g, '')) : undefined,
    media: { emoji: r.emoji, imageUrl: r.image },
    explanation: r.anecdote,
    source: r.source,
  };
  if (type === 'qcm') {
    const choices = [1, 2, 3, 4, 5, 6].map((i) => (r[`choix${i}`] || '').trim()).filter(Boolean);
    const alt = splitList(r.propositions);
    q.choices = choices.length ? choices : alt;
    const ans = String(r.reponse || '').trim();
    let index = q.choices.findIndex((c) => norm(c) === norm(ans));
    if (index < 0 && /^[a-f]$/i.test(ans)) index = LETTERS.indexOf(ans.toUpperCase());
    if (index < 0 && /^[1-6]$/.test(ans)) index = Number(ans) - 1;
    if (index < 0) throw new Error('la réponse ne correspond à aucun choix');
    q.answer = index;
  } else if (type === 'vraifaux') {
    const a = norm(r.reponse);
    if (['vrai', 'v', 'oui', 'true', '1'].includes(a)) q.answer = true;
    else if (['faux', 'f', 'non', 'false', '0'].includes(a)) q.answer = false;
    else throw new Error('réponse attendue : vrai ou faux');
  } else if (type === 'ordre') {
    q.items = splitList(r.elements || r.reponse).map((it) => {
      const m = /^(.*?)\s*\{(https?:\/\/[^}]+|\/api\/images\/\d+)\}\s*$/.exec(it);
      return m ? { text: m[1], imageUrl: m[2] } : { text: it };
    });
  } else if (type === 'estimation') {
    q.answer = Number(String(r.reponse).replace(/\s/g, '').replace(',', '.'));
    q.unit = r.unite;
  } else {
    q.answer = r.reponse;
    q.accept = splitList(r.accepte);
  }
  return q;
}

function parseCsv(text, fileName, origin) {
  const rows = readCsv(text);
  if (rows.length < 2) throw new Error('Le fichier CSV est vide (il faut une ligne d’en-tête et au moins une question).');
  const header = rows[0].map((h) => norm(h).replace(/[^a-z0-9]/g, ''));
  const known = new Set(CSV_COLUMNS.concat('propositions'));
  if (!header.includes('question') && !header.includes('reponse')) {
    throw new Error('En-tête CSV non reconnue : il faut au moins les colonnes « question » et « reponse » (télécharge le modèle).');
  }
  const questions = [];
  const warnings = [];
  rows.slice(1).forEach((cells, i) => {
    const r = {};
    header.forEach((h, k) => { if (known.has(h)) r[h] = (cells[k] ?? '').trim(); });
    try {
      questions.push(sanitizeQuestion(mapMedia(questionFromRow(r), (u) => localize(u, origin))));
    } catch (err) {
      warnings.push(`Ligne ${i + 2} ignorée : ${err.message}`);
    }
  });
  const base = String(fileName || 'Quiz importé').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  return { quiz: { name: base.slice(0, 40), emoji: '📥', description: '', keywords: [], questions }, warnings };
}

function parseNeutronJson(data, origin) {
  const src = data.quiz || data;
  const warnings = [];
  const questions = [];
  (Array.isArray(src.questions) ? src.questions : []).forEach((q, i) => {
    try {
      questions.push(sanitizeQuestion(mapMedia(q, (u) => localize(u, origin))));
    } catch (err) {
      warnings.push(`Question ${i + 1} ignorée : ${err.message}`);
    }
  });
  const music = src.music?.url ? { ...src.music, url: localize(src.music.url, origin) } : null;
  return {
    quiz: {
      name: String(src.name || 'Quiz importé').slice(0, 40),
      emoji: String(src.emoji || '📥'),
      description: String(src.description || '').slice(0, 200),
      keywords: Array.isArray(src.keywords) ? src.keywords.map(String) : [],
      music,
      questions,
    },
    warnings,
  };
}

/**
 * Reads an uploaded file (text) and returns { quiz, warnings, format }.
 * Throws with a user-facing message when nothing usable is found.
 */
function parseImport(content, fileName = '', origin = '') {
  const text = String(content || '');
  if (!text.trim()) throw new Error('Fichier vide.');
  let data = null;
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { data = JSON.parse(trimmed); } catch { throw new Error('JSON invalide : le fichier est peut-être abîmé.'); }
  }
  let result;
  let format;
  if (data && (data.format === FORMAT || Array.isArray(data.quiz?.questions) || Array.isArray(data.questions))) {
    result = parseNeutronJson(data, origin);
    format = 'neutron';
  } else if (data && Object.keys(data).some((k) => norm(k).replace(/[^a-z]/g, '') === 'quizz')) {
    const { theme, skipped } = parseOpenQuizzDb(data, fileName);
    result = {
      quiz: { name: theme.name, emoji: theme.emoji, description: theme.description, keywords: theme.keywords, questions: theme.questions },
      warnings: skipped ? [`${skipped} question(s) OpenQuizzDB ignorée(s)`] : [],
    };
    format = 'openquizzdb';
  } else if (data) {
    throw new Error('Format JSON non reconnu (attendu : export Neutron ou fichier OpenQuizzDB).');
  } else {
    result = parseCsv(text, fileName, origin);
    format = 'csv';
  }
  if (!result.quiz.questions.length) {
    throw new Error(`Aucune question utilisable dans ce fichier.${result.warnings.length ? ` ${result.warnings.slice(0, 3).join(' · ')}` : ''}`);
  }
  if (result.quiz.questions.length > MAX_QUESTIONS) {
    result.warnings.push(`Seules les ${MAX_QUESTIONS} premières questions sont gardées.`);
    result.quiz.questions = result.quiz.questions.slice(0, MAX_QUESTIONS);
  }
  return { ...result, format };
}

module.exports = {
  toNeutronJson, toCsv, csvTemplate, parseImport, readCsv, FORMAT, TYPES,
};
