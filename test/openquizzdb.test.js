const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseOpenQuizzDb, loadOpenQuizzDbDir } = require('../src/importers/openquizzdb');
const { createThemeStore } = require('../src/themes');
const { Room } = require('../src/room');
const { sanitizeQuestion } = require('../src/questionTypes');

const FIXTURE = path.join(__dirname, 'fixtures', 'openquizzdb-sample.json');

test('OpenQuizzDB file → theme with levels mapped and attribution on every question', () => {
  const { theme, skipped } = parseOpenQuizzDb(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')), 'sample.json');
  assert.equal(skipped, 1, 'answer not among the choices is skipped');
  assert.equal(theme.id, 'oqdb-fixture-systeme-solaire');
  assert.equal(theme.name, 'Fixture système solaire');
  assert.equal(theme.authorName, 'OpenQuizzDB');
  assert.deepEqual(theme.keywords, ['astronomie', 'openquizzdb']);
  assert.equal(theme.emoji, '🔭', 'emoji picked from the category');
  assert.deepEqual(theme.questions.map((q) => q.difficulty), ['facile', 'facile', 'moyen', 'difficile']);
  const q = theme.questions[0];
  assert.equal(q.type, 'qcm');
  assert.equal(q.choices[q.answer], 'Mars');
  assert.equal(q.explanation, 'Sa couleur vient de l\'oxyde de fer.');
  assert.deepEqual(q.source, { name: 'OpenQuizzDB', url: 'https://www.openquizzdb.org', license: 'CC BY-SA', author: 'Rédacteur de test' });
  assert.ok(theme.questions.every((x) => x.source?.name === 'OpenQuizzDB'));
});

test('imported quizzes are playable and show their source to players and in the history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oqdb-'));
  fs.copyFileSync(FIXTURE, path.join(dir, 'sample.json'));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
  const warnings = [];
  assert.equal(loadOpenQuizzDbDir(dir, { warn: (m) => warnings.push(m) }).length, 1);
  assert.ok(warnings.some((w) => w.includes('broken.json')));

  const store = createThemeStore(null, { importDirs: { openquizzdb: dir } });
  const t = store.get('oqdb-fixture-systeme-solaire');
  assert.ok(t && t.builtin);
  assert.equal(t.source.name, 'OpenQuizzDB');

  const finished = [];
  const room = new Room({ code: 'OQDBX', host: { id: 1, username: 'h' }, themes: store, timers: { setTimeout: () => 0, clearTimeout() {} }, onFinish: (_, s) => finished.push(s) });
  room.join({ id: 1, username: 'h' });
  room.join({ id: 2, username: 'p' });
  room.updateSettings(1, { themeId: t.key, questionCount: 4, timeLimit: 0 });
  room.start(1);
  assert.equal(room.stateFor(2).question.source.license, 'CC BY-SA', 'players see the attribution during the question');
  room.submit(2, room.question.answer);
  room.end(1);
  assert.equal(finished[0].questions[0].source.name, 'OpenQuizzDB', 'the history keeps the attribution');
});

test('free-form source on custom questions', () => {
  const base = { type: 'libre', prompt: 'Q ?', answer: 'R' };
  assert.deepEqual(sanitizeQuestion({ ...base, source: 'Wikipédia' }).source, { name: 'Wikipédia' });
  assert.deepEqual(sanitizeQuestion({ ...base, source: 'https://fr.wikipedia.org/wiki/Mars' }).source, { name: 'fr.wikipedia.org', url: 'https://fr.wikipedia.org/wiki/Mars' });
  assert.equal(sanitizeQuestion({ ...base, source: { name: 'X', url: 'javascript:alert(1)' } }).source.url, undefined);
  assert.equal(sanitizeQuestion({ ...base, source: '' }).source, undefined);
});
