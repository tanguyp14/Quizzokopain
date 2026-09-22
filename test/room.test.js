const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, GameError } = require('../src/room');
const { THEMES } = require('../src/questionBank');
const { sanitizeQuestion } = require('../src/questionTypes');

const HOST = { id: 1, username: 'admin' };
const ALICE = { id: 2, username: 'alice' };
const BOB = { id: 3, username: 'bob' };

function fakeTimers() {
  const pending = new Map();
  let n = 0;
  return {
    setTimeout(fn) { pending.set(++n, fn); return n; },
    clearTimeout(id) { pending.delete(id); },
    fireAll() { for (const [id, fn] of [...pending]) { pending.delete(id); fn(); } },
    get size() { return pending.size; },
  };
}

function makeRoom(extra = {}) {
  const finished = [];
  const room = new Room({ code: 'ABCDE', host: HOST, timers: fakeTimers(), onFinish: (r, s) => finished.push(s), ...extra });
  room.join(HOST);
  room.join(ALICE);
  room.join(BOB);
  return { room, finished };
}

test('every bank question passes validation', () => {
  for (const theme of THEMES) {
    for (const q of theme.questions) {
      assert.doesNotThrow(() => sanitizeQuestion(q), `${theme.id}: ${q.prompt}`);
    }
    assert.ok(theme.questions.length >= 10, `${theme.id} has enough questions`);
  }
});

test('only the host can change settings and start', () => {
  const { room } = makeRoom();
  assert.throws(() => room.updateSettings(ALICE.id, { themeId: 'cinema' }), GameError);
  assert.throws(() => room.start(ALICE.id), GameError);
  room.updateSettings(HOST.id, { themeId: 'cinema', questionCount: 5, timeLimit: 0 });
  assert.equal(room.settings.themeId, 'cinema');
  assert.throws(() => room.updateSettings(HOST.id, { themeId: 'nope' }), /Thème inconnu/);
  assert.throws(() => room.updateSettings(HOST.id, { types: [] }), GameError);
});

test('host is not a player', () => {
  const { room } = makeRoom();
  assert.deepEqual([...room.players.keys()], [ALICE.id, BOB.id]);
});

test('auto-graded question: 1 point per correct answer, closes when all answered', () => {
  const { room } = makeRoom();
  room.addCustomQuestion(HOST.id, { type: 'qcm', prompt: '2+2 ?', choices: ['3', '4'], answer: 1 });
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0 });
  room.start(HOST.id);
  assert.equal(room.phase, 'question');

  // players never see the answer while the question is open
  assert.equal(room.stateFor(ALICE.id).question.answer, undefined);
  assert.equal(room.stateFor(HOST.id).question.answer, '4');

  room.submit(ALICE.id, 1);
  assert.equal(room.phase, 'question');
  room.submit(BOB.id, 0);
  assert.equal(room.phase, 'reveal', 'QCM skips the correction step');
  assert.equal(room.players.get(ALICE.id).score, 1);
  assert.equal(room.players.get(BOB.id).score, 0);
});

test('free-text question goes through admin correction, which can override the suggestion', () => {
  const { room } = makeRoom();
  room.addCustomQuestion(HOST.id, { type: 'image', media: { emoji: '🚢🧊' }, answer: 'Titanic' });
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0 });
  room.start(HOST.id);
  room.submit(ALICE.id, 'titanik');
  room.submit(BOB.id, 'Le bateau qui coule');
  assert.equal(room.phase, 'correction');

  const correction = room.stateFor(HOST.id).correction;
  assert.deepEqual(correction.map((c) => c.correct), [true, false]);
  assert.equal(room.stateFor(ALICE.id).correction, undefined, 'players do not see the correction');

  assert.throws(() => room.setVerdict(ALICE.id, BOB.id, true), GameError);
  room.setVerdict(HOST.id, BOB.id, true); // generous admin
  room.validate(HOST.id);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.players.get(ALICE.id).score, 1);
  assert.equal(room.players.get(BOB.id).score, 1);
});

test('numeric answers must be exact: you have it or you don’t', () => {
  const { room } = makeRoom();
  room.addCustomQuestion(HOST.id, { type: 'estimation', prompt: 'Touches de piano ?', answer: 88 });
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0 });
  room.start(HOST.id);
  room.submit(ALICE.id, '88');
  room.submit(BOB.id, '87');
  assert.equal(room.phase, 'reveal', 'graded automatically, no correction step');
  assert.equal(room.players.get(ALICE.id).score, 1);
  assert.equal(room.players.get(BOB.id).score, 0, 'close is not enough');
});

test('timer closes the question, then the game finishes with a ranking', () => {
  const timers = fakeTimers();
  const { room, finished } = makeRoom({ timers });
  room.addCustomQuestion(HOST.id, { type: 'vraifaux', prompt: 'Le ciel est bleu', answer: true });
  room.addCustomQuestion(HOST.id, { type: 'vraifaux', prompt: 'La neige est noire', answer: false });
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 20 });
  room.start(HOST.id);
  assert.ok(room.deadline);
  const first = room.question;
  room.submit(ALICE.id, first.answer);
  timers.fireAll();
  assert.equal(room.phase, 'reveal');
  room.next(HOST.id);
  room.submit(ALICE.id, room.question.answer);
  room.submit(BOB.id, room.question.answer);
  room.next(HOST.id);
  assert.equal(room.phase, 'finished');

  assert.equal(finished.length, 1);
  const summary = finished[0];
  assert.equal(summary.questions.length, 2);
  assert.deepEqual(summary.players.map((p) => [p.username, p.score, p.rank]), [['alice', 2, 1], ['bob', 1, 2]]);
  assert.equal(summary.players[1].answers[0].given, null);
});

test('a disconnected player does not block the question', () => {
  const { room } = makeRoom();
  room.addCustomQuestion(HOST.id, { type: 'qcm', prompt: '?', choices: ['a', 'b'], answer: 0 });
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0 });
  room.start(HOST.id);
  room.submit(ALICE.id, 0);
  room.setConnected(BOB.id, false);
  assert.equal(room.phase, 'reveal');
});

test('ending early keeps only fully played questions', () => {
  const { room, finished } = makeRoom();
  room.updateSettings(HOST.id, { themeId: 'mix', questionCount: 5, timeLimit: 0, types: ['qcm'] });
  room.start(HOST.id);
  assert.equal(room.questions.length, 5);
  room.closeQuestion(HOST.id);
  room.next(HOST.id);
  room.end(HOST.id);
  assert.equal(room.phase, 'finished');
  assert.equal(finished[0].questions.length, 1);
  assert.ok(finished[0].players.every((p) => p.answers.length === 1));
});

test('random theme picks a real theme and respects the question count', () => {
  const { room } = makeRoom();
  room.updateSettings(HOST.id, { themeId: 'random', questionCount: 5 });
  room.start(HOST.id);
  assert.ok(THEMES.some((t) => t.id === room.theme.key));
  assert.equal(room.questions.length, 5);
});

test('invalid custom questions are rejected with a readable message', () => {
  const { room } = makeRoom();
  assert.throws(() => room.addCustomQuestion(HOST.id, { type: 'qcm', prompt: 'x', choices: ['a'], answer: 0 }), /entre 2 et 6/);
  assert.throws(() => room.addCustomQuestion(HOST.id, { type: 'rebus', answer: 'x' }), /emojis ou une image/);
  assert.throws(() => room.addCustomQuestion(HOST.id, { type: 'image', media: { imageUrl: 'javascript:alert(1)' }, answer: 'x' }), /http/);
});

test('difficulty filter only draws questions of that level, from any theme', () => {
  for (const level of ['facile', 'moyen', 'difficile']) {
    const { room } = makeRoom();
    room.updateSettings(HOST.id, { themeId: 'mix', questionCount: 10, difficulty: level });
    room.start(HOST.id);
    assert.equal(room.questions.length, 10);
    assert.ok(room.questions.every((q) => q.difficulty === level), level);
    assert.ok(new Set(room.questions.map((q) => q.difficulty)).size === 1);
  }
  const { room } = makeRoom();
  room.updateSettings(HOST.id, { themeId: 'random', difficulty: 'difficile', questionCount: 5 });
  room.start(HOST.id);
  assert.ok(room.questions.length > 0 && room.questions.every((q) => q.difficulty === 'difficile'));
  assert.equal(room.stateFor(ALICE.id).question.difficulty, 'difficile', 'players see the level of the question');
  assert.throws(() => makeRoom().room.updateSettings(HOST.id, { difficulty: 'impossible' }), GameError);
});

test('every bank question has a difficulty', () => {
  for (const t of THEMES) for (const q of t.questions) assert.ok(['facile', 'moyen', 'difficile'].includes(q.difficulty), q.prompt);
});

test('solo: the admin plays alone, never sees the answer before closing, and validates their own free answers', () => {
  const finished = [];
  const room = new Room({ code: 'SOLO1', host: HOST, timers: fakeTimers(), onFinish: (r, s) => finished.push(s) });
  room.join(HOST);
  // No "Je joue aussi" needed: starting an empty room seats the admin.
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0 });
  room.addCustomQuestion(HOST.id, { type: 'qcm', prompt: '1+1 ?', choices: ['2', '3'], answer: 0 });
  room.addCustomQuestion(HOST.id, { type: 'libre', prompt: 'Capitale de l’Italie ?', answer: 'Rome' });
  room.start(HOST.id);

  for (let i = 0; i < 2; i++) {
    const s = room.stateFor(HOST.id);
    assert.equal(s.question.answer, undefined, 'a playing admin does not see the answer while the question is open');
    if (room.question.type === 'qcm') {
      room.submit(HOST.id, 0);
      assert.equal(room.phase, 'reveal', 'closes as soon as the only player answered');
    } else {
      room.submit(HOST.id, 'rome');
      assert.equal(room.phase, 'correction');
      assert.equal(room.stateFor(HOST.id).correction[0].userId, HOST.id);
      room.validate(HOST.id);
    }
    room.next(HOST.id);
  }
  assert.equal(room.phase, 'finished');
  assert.deepEqual(finished[0].players.map((p) => [p.username, p.score, p.rank]), [['admin', 2, 1]]);
  assert.throws(() => room.kick(HOST.id, HOST.id), GameError);
});

test('the admin can stop playing before the game starts', () => {
  const { room } = makeRoom();
  room.updateSettings(HOST.id, { hostPlays: true });
  assert.equal(room.players.size, 3);
  room.updateSettings(HOST.id, { hostPlays: false });
  assert.deepEqual([...room.players.keys()], [ALICE.id, BOB.id]);
});

test('a question can set its own answer delay, overriding the room default', () => {
  const timers = fakeTimers();
  const { room } = makeRoom({ timers });
  room.addCustomQuestion(HOST.id, { type: 'vraifaux', prompt: 'Rapide', answer: true, timeLimit: 10 });
  room.addCustomQuestion(HOST.id, { type: 'vraifaux', prompt: 'Normale', answer: true });
  assert.throws(() => room.addCustomQuestion(HOST.id, { type: 'vraifaux', prompt: 'x', answer: true, timeLimit: 12 }), /10, 15, 20 ou 30/);
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0 });
  room.start(HOST.id);
  const expected = { Rapide: 10, Normale: 0 };
  for (let i = 0; i < 2; i++) {
    const s = room.stateFor(ALICE.id);
    assert.equal(s.timeLimit, expected[s.question.prompt], s.question.prompt);
    assert.equal(Boolean(s.deadline), expected[s.question.prompt] > 0);
    if (s.deadline) {
      timers.fireAll();
      assert.equal(room.phase, 'reveal', 'the question delay closes it');
    } else {
      room.closeQuestion(HOST.id);
    }
    if (i === 0) room.next(HOST.id);
  }
});

test('a lone player far off scores nothing on a numeric question (12 for 193)', () => {
  const { gradeAnswers } = require('../src/questionTypes');
  const q = { type: 'estimation', answer: 193 };
  assert.deepEqual([...gradeAnswers(q, new Map([[1, 12]])).values()], [false]);
  assert.deepEqual([...gradeAnswers(q, new Map([[1, 193]])).values()], [true]);
  assert.deepEqual([...gradeAnswers(q, new Map([[1, 190], [2, 193]])).values()], [false, true]);
});

test('reviewAll: the admin validates every type of question, starting from the automatic verdict', () => {
  const { room } = makeRoom();
  room.addCustomQuestion(HOST.id, { type: 'qcm', prompt: '2+2 ?', choices: ['3', '4'], answer: 1 });
  room.updateSettings(HOST.id, { themeId: 'custom', timeLimit: 0, reviewAll: true });
  room.start(HOST.id);
  room.submit(ALICE.id, 1);
  room.submit(BOB.id, 0);
  assert.equal(room.phase, 'correction', 'even a QCM goes through the correction step');
  assert.deepEqual(room.stateFor(HOST.id).correction.map((c) => c.correct), [true, false]);
  room.setVerdict(HOST.id, BOB.id, true);
  room.validate(HOST.id);
  assert.equal(room.players.get(BOB.id).score, 1);
});
