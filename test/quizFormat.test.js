const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  toNeutronJson, toCsv, csvTemplate, parseImport,
} = require('../src/quizFormat');
const { startServer, register, http } = require('./helpers');

const ORIGIN = 'https://neutron.example';
const quiz = {
  name: 'Tout type',
  emoji: '🧪',
  description: 'Un de chaque',
  keywords: ['test', 'mix'],
  music: { url: '/api/images/9', name: 'boucle.mp3' },
  questions: [
    { type: 'qcm', prompt: 'Capitale ?', choices: ['Lyon', 'Paris; la belle', 'Nice'], answer: 1, difficulty: 'facile', explanation: 'Évidemment, "Paris".' },
    { type: 'vraifaux', prompt: 'Le ciel est bleu', answer: true, difficulty: 'moyen', timeLimit: 10 },
    { type: 'libre', prompt: 'Auteur ?', answer: 'Victor Hugo', accept: ['Hugo'], difficulty: 'difficile', source: { name: 'Wikipédia' } },
    { type: 'estimation', prompt: 'Touches ?', answer: 88, unit: 'touches', difficulty: 'moyen' },
    { type: 'image', prompt: 'Film ?', media: { emoji: '🦁👑', imageUrl: '/api/images/3' }, answer: 'Le Roi Lion', difficulty: 'facile' },
    { type: 'ordre', prompt: 'Taille', items: [{ text: 'Souris' }, { text: 'Chat', imageUrl: '/api/images/4' }, { text: 'Éléphant' }], difficulty: 'facile' },
  ],
};

test('JSON export → import keeps every question identical and localises media links', () => {
  const json = toNeutronJson(quiz, ORIGIN);
  assert.equal(json.format, 'neutron-quiz');
  assert.equal(json.quiz.questions[4].media.imageUrl, `${ORIGIN}/api/images/3`, 'links become absolute in the file');
  const back = parseImport(JSON.stringify(json), 'x.neutron.json', ORIGIN);
  assert.equal(back.format, 'neutron');
  assert.deepEqual(back.warnings, []);
  assert.equal(back.quiz.questions[4].media.imageUrl, '/api/images/3', 'same instance: local link again');
  assert.equal(back.quiz.music.url, '/api/images/9');
  assert.deepEqual(back.quiz.questions.map((q) => q.type), quiz.questions.map((q) => q.type));
  assert.deepEqual(back.quiz.questions[0].choices, quiz.questions[0].choices);
  assert.equal(back.quiz.questions[1].timeLimit, 10);
  assert.deepEqual(back.quiz.questions[5].items, quiz.questions[5].items);
  // Another instance keeps absolute links.
  assert.equal(parseImport(JSON.stringify(json), 'x.json', 'https://ailleurs.fr').quiz.questions[4].media.imageUrl, `${ORIGIN}/api/images/3`);
});

test('CSV export → import round-trips all question types (quotes, semicolons, accents)', () => {
  const csv = toCsv(quiz, ORIGIN);
  assert.ok(csv.startsWith('﻿type;question;reponse'), 'UTF-8 BOM + ; separator for spreadsheets');
  const back = parseImport(csv, 'mon-super_quiz.csv', ORIGIN);
  assert.equal(back.format, 'csv');
  assert.deepEqual(back.warnings, []);
  assert.equal(back.quiz.name, 'mon super quiz');
  const [qcm, vf, libre, num, img, ordre] = back.quiz.questions;
  assert.deepEqual(qcm.choices, ['Lyon', 'Paris; la belle', 'Nice']);
  assert.equal(qcm.answer, 1);
  assert.equal(qcm.explanation, 'Évidemment, "Paris".');
  assert.equal(vf.answer, true);
  assert.equal(vf.timeLimit, 10);
  assert.deepEqual(libre.accept, ['Hugo']);
  assert.equal(libre.difficulty, 'difficile');
  assert.equal(num.answer, 88);
  assert.equal(img.media.imageUrl, '/api/images/3');
  assert.deepEqual(ordre.items, quiz.questions[5].items);
});

test('hand-written CSV: comma separator, letter answers, aliases, bad lines reported', () => {
  const csv = [
    'Type,Question,Réponse,Choix1,Choix2,Choix3,Difficulté',
    'QCM,2+2 ?,B,3,4,5,facile',
    'vrai/faux,La Terre est plate,faux,,,,',
    'classement,Du plus petit,Souris | Chat | Chien,,,,moyen',
    'chiffre,Côtés d\'un hexagone,6,,,,',
    'qcm,Question cassée,Z,a,b,,',
    'inconnu,??,x,,,,',
  ].join('\n');
  const { quiz: q, warnings } = parseImport(csv, 'maison.csv');
  assert.deepEqual(q.questions.map((x) => x.type), ['qcm', 'vraifaux', 'ordre', 'estimation']);
  assert.equal(q.questions[0].answer, 1);
  assert.equal(q.questions[1].answer, false);
  assert.equal(q.questions[2].items.length, 3);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /^Ligne 6 ignorée/);
});

test('the CSV template imports cleanly', () => {
  const { quiz: q, warnings } = parseImport(csvTemplate(), 'modele.csv');
  assert.deepEqual(warnings, []);
  assert.equal(q.questions.length, 6);
});

test('OpenQuizzDB files and garbage are handled', () => {
  const oq = fs.readFileSync(path.join(__dirname, 'fixtures', 'openquizzdb-sample.json'), 'utf8');
  const r = parseImport(oq, 'oq.json');
  assert.equal(r.format, 'openquizzdb');
  assert.equal(r.quiz.questions.length, 4);
  assert.throws(() => parseImport('{"hello": 1}', 'x.json'), /non reconnu/);
  assert.throws(() => parseImport('{broken', 'x.json'), /JSON invalide/);
  assert.throws(() => parseImport('', 'x.csv'), /vide/);
});

test('API: export own quiz (JSON/CSV), import, template; others cannot export it', async () => {
  const srv = await startServer({ superadmins: ['Tanguy'] });
  try {
    const aliceCookie = await register(srv.base, 'alice');
    const alice = http(srv.base, aliceCookie);
    const bob = http(srv.base, await register(srv.base, 'bob'));
    const boss = http(srv.base, await register(srv.base, 'Tanguy'));
    const questions = [...quiz.questions.slice(0, 4), { type: 'vraifaux', prompt: 'Encore ?', answer: false }];
    const { theme } = (await alice('POST', '/api/my-themes', { name: 'Export', emoji: '📤', keywords: 'x', questions })).body;

    const json = await fetch(`${srv.base}/api/my-themes/${theme.id}/export`, { headers: { cookie: aliceCookie } });
    assert.match(json.headers.get('content-disposition'), /attachment; filename="export\.neutron\.json"/);
    const file = await json.text();
    const csv = await fetch(`${srv.base}/api/my-themes/${theme.id}/export?format=csv`, { headers: { cookie: aliceCookie } });
    assert.match(csv.headers.get('content-type'), /text\/csv/);

    assert.equal((await bob('GET', `/api/my-themes/${theme.id}/export`)).status, 404, 'not your quiz');
    assert.equal((await boss('GET', `/api/admin/quiz/cinema/export`)).status, 200, 'superadmin exports built-in quizzes');

    const imported = await bob('POST', '/api/quiz-import', { fileName: 'export.neutron.json', content: file });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.quiz.questions.length, 5);
    assert.equal((await bob('POST', '/api/quiz-import', { fileName: 'x.csv', content: 'n,importe\n1,2' })).status, 400);
    assert.equal((await fetch(`${srv.base}/api/quiz-template.csv`, { headers: { cookie: aliceCookie } })).status, 200);
  } finally {
    await srv.stop();
  }
});
