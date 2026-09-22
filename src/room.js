const {
  TYPES, DIFFICULTIES, sanitizeQuestion, publicQuestion, answerText, parseSubmission, submissionText, gradeAnswers,
} = require('./questionTypes');
const { buildGame, isValidThemeId, describeTheme } = require('./selection');
const { createThemeStore } = require('./themes');

const MAX_PLAYERS = 30;
const MAX_CUSTOM_QUESTIONS = 50;
const TIME_LIMITS = [0, 15, 20, 30, 45, 60, 90];

class GameError extends Error {}

/**
 * One private quiz room. Pure game logic: no sockets, no database. The owner
 * wires `onChange` (broadcast state) and `onFinish` (persist the game).
 *
 * Phases: lobby → question → [correction] → reveal → question … → finished.
 * "correction" only happens for free-text questions, where the admin validates answers.
 */
class Room {
  constructor({
    code, host, themes = createThemeStore(), onChange = () => {}, onFinish = () => {}, now = Date.now, timers = globalThis, random = Math.random,
  }) {
    this.themes = themes;
    this.code = code;
    this.host = { id: host.id, username: host.username, avatar: host.avatar || null, connected: false };
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.now = now;
    this.timers = timers;
    this.random = random;

    this.phase = 'lobby';
    this.createdAt = now();
    this.lastActivity = this.createdAt;
    this.players = new Map(); // userId -> { id, username, score, connected, answers: [] }
    this.settings = { themeId: 'random', questionCount: 10, timeLimit: 30, types: Object.keys(TYPES), difficulty: 'all' };
    this.customQuestions = [];

    this.theme = null;
    this.questions = [];
    this.index = -1;
    this.answers = new Map(); // userId -> parsed value, for the current question
    this.verdicts = new Map(); // userId -> boolean, for the current question
    this.deadline = null;
    this.timer = null;
    this.startedAt = null;
    this.endedAt = null;
    this.gameId = null;
  }

  // ---- helpers -----------------------------------------------------------

  isHost(userId) {
    return userId === this.host.id;
  }

  assertHost(userId) {
    if (!this.isHost(userId)) throw new GameError('Seul l’admin de la room peut faire ça.');
  }

  assertPhase(...phases) {
    if (!phases.includes(this.phase)) throw new GameError('Action impossible à ce moment de la partie.');
  }

  get question() {
    return this.questions[this.index] || null;
  }

  changed() {
    this.lastActivity = this.now();
    this.onChange(this);
  }

  clearTimer() {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  // ---- membership --------------------------------------------------------

  join(user) {
    if (this.isHost(user.id)) {
      this.host.connected = true;
      this.host.avatar = user.avatar || null;
      return this.changed();
    }
    let player = this.players.get(user.id);
    if (!player) {
      if (this.phase === 'finished') throw new GameError('Cette partie est terminée.');
      if (this.players.size >= MAX_PLAYERS) throw new GameError('La room est pleine.');
      // Late joiners start at 0 with no answer for the questions already played.
      player = { id: user.id, username: user.username, score: 0, connected: true, answers: [] };
      this.players.set(user.id, player);
    }
    player.avatar = user.avatar || null;
    player.connected = true;
    this.changed();
  }

  /** A member changed their profile picture. */
  setAvatar(userId, avatar) {
    if (this.isHost(userId)) this.host.avatar = avatar;
    else if (this.players.has(userId)) this.players.get(userId).avatar = avatar;
    else return;
    this.changed();
  }

  setConnected(userId, connected) {
    if (this.isHost(userId)) this.host.connected = connected;
    else if (this.players.has(userId)) this.players.get(userId).connected = connected;
    else return;
    this.changed();
    if (!connected) this.maybeCloseEarly();
  }

  leave(userId) {
    if (this.isHost(userId)) return this.setConnected(userId, false);
    if (!this.players.has(userId)) return;
    if (this.phase === 'lobby') {
      this.players.delete(userId);
      this.changed();
    } else {
      this.setConnected(userId, false);
    }
  }

  kick(actorId, userId) {
    this.assertHost(actorId);
    if (!this.players.delete(userId)) throw new GameError('Joueur introuvable.');
    this.answers.delete(userId);
    this.verdicts.delete(userId);
    this.changed();
    this.maybeCloseEarly();
  }

  // ---- lobby -------------------------------------------------------------

  updateSettings(actorId, patch = {}) {
    this.assertHost(actorId);
    this.assertPhase('lobby');
    const s = { ...this.settings };
    if (patch.themeId !== undefined) {
      if (!isValidThemeId(patch.themeId, this.themes)) throw new GameError('Thème inconnu.');
      s.themeId = patch.themeId;
    }
    if (patch.difficulty !== undefined) {
      if (!['all', ...Object.keys(DIFFICULTIES)].includes(patch.difficulty)) throw new GameError('Difficulté inconnue.');
      s.difficulty = patch.difficulty;
    }
    if (patch.questionCount !== undefined) {
      const n = Number(patch.questionCount);
      if (!Number.isInteger(n) || n < 1 || n > 50) throw new GameError('Entre 1 et 50 questions.');
      s.questionCount = n;
    }
    if (patch.timeLimit !== undefined) {
      const t = Number(patch.timeLimit);
      if (!TIME_LIMITS.includes(t)) throw new GameError('Durée invalide.');
      s.timeLimit = t;
    }
    if (patch.types !== undefined) {
      const types = Array.isArray(patch.types) ? [...new Set(patch.types)].filter((t) => TYPES[t]) : [];
      if (!types.length) throw new GameError('Garde au moins un type de question.');
      s.types = types;
    }
    this.settings = s;
    this.changed();
  }

  addCustomQuestion(actorId, input) {
    this.assertHost(actorId);
    this.assertPhase('lobby');
    if (this.customQuestions.length >= MAX_CUSTOM_QUESTIONS) throw new GameError('Trop de questions perso.');
    let q;
    try {
      q = sanitizeQuestion(input);
    } catch (err) {
      throw new GameError(err.message);
    }
    this.customQuestions.push({ ...q, custom: true });
    this.changed();
  }

  removeCustomQuestion(actorId, index) {
    this.assertHost(actorId);
    this.assertPhase('lobby');
    if (!this.customQuestions[index]) throw new GameError('Question introuvable.');
    this.customQuestions.splice(index, 1);
    this.changed();
  }

  start(actorId) {
    this.assertHost(actorId);
    this.assertPhase('lobby');
    if (this.players.size === 0) throw new GameError('Il faut au moins un joueur pour lancer la partie.');
    let built;
    try {
      built = buildGame(this.settings, this.customQuestions, this.random, this.themes);
    } catch (err) {
      throw new GameError(err.message);
    }
    const { theme, questions } = built;
    if (!questions.length) {
      throw new GameError(this.settings.themeId === 'custom'
        ? 'Ajoute au moins une question perso.'
        : 'Aucune question ne correspond à ces réglages.');
    }
    this.theme = theme;
    this.questions = questions;
    this.startedAt = this.now();
    this.openQuestion(0);
  }

  // ---- game loop ---------------------------------------------------------

  openQuestion(index) {
    this.index = index;
    this.phase = 'question';
    this.answers = new Map();
    this.verdicts = new Map();
    this.clearTimer();
    const { timeLimit } = this.settings;
    if (timeLimit > 0) {
      this.deadline = this.now() + timeLimit * 1000;
      this.timer = this.timers.setTimeout(() => {
        this.timer = null;
        if (this.phase === 'question' && this.index === index) this.close();
      }, timeLimit * 1000);
    } else {
      this.deadline = null;
    }
    this.changed();
  }

  submit(userId, raw) {
    this.assertPhase('question');
    const player = this.players.get(userId);
    if (!player) throw new GameError('Tu ne fais pas partie de cette partie.');
    const value = parseSubmission(this.question, raw);
    if (value === null) throw new GameError('Réponse invalide.');
    this.answers.set(userId, value); // players may change their mind until the question closes
    this.changed();
    this.maybeCloseEarly();
  }

  /** Closes the question as soon as every connected player has answered. */
  maybeCloseEarly() {
    if (this.phase !== 'question') return;
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length && active.every((p) => this.answers.has(p.id))) this.close();
  }

  closeQuestion(actorId) {
    this.assertHost(actorId);
    this.assertPhase('question');
    this.close();
  }

  close() {
    this.clearTimer();
    this.deadline = null;
    this.verdicts = gradeAnswers(this.question, this.answers);
    if (TYPES[this.question.type].grading === 'manual' && this.answers.size > 0) {
      this.phase = 'correction';
      this.changed();
    } else {
      this.reveal();
    }
  }

  setVerdict(actorId, userId, correct) {
    this.assertHost(actorId);
    this.assertPhase('correction');
    if (!this.answers.has(userId)) throw new GameError('Ce joueur n’a pas répondu.');
    this.verdicts.set(userId, Boolean(correct));
    this.changed();
  }

  validate(actorId) {
    this.assertHost(actorId);
    this.assertPhase('correction');
    this.reveal();
  }

  reveal() {
    const q = this.question;
    for (const player of this.players.values()) {
      const has = this.answers.has(player.id);
      const correct = has && this.verdicts.get(player.id) === true;
      if (correct) player.score += 1;
      player.answers[this.index] = { given: has ? submissionText(q, this.answers.get(player.id)) : null, correct };
    }
    this.phase = 'reveal';
    this.changed();
  }

  next(actorId) {
    this.assertHost(actorId);
    this.assertPhase('reveal');
    if (this.index + 1 < this.questions.length) this.openQuestion(this.index + 1);
    else this.finish();
  }

  /** Lets the admin end the game early; played questions still count. */
  end(actorId) {
    this.assertHost(actorId);
    this.assertPhase('question', 'correction', 'reveal');
    if (this.phase !== 'reveal') {
      // Drop the unfinished question from the record.
      this.questions = this.questions.slice(0, this.index);
      for (const p of this.players.values()) p.answers.length = this.index;
    } else {
      this.questions = this.questions.slice(0, this.index + 1);
    }
    this.finish();
  }

  finish() {
    this.clearTimer();
    this.deadline = null;
    this.phase = 'finished';
    this.endedAt = this.now();
    this.changed();
    if (this.questions.length) this.onFinish(this, this.summary());
  }

  ranking() {
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
    let rank = 0;
    return sorted.map((p, i) => {
      if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
      return { id: p.id, username: p.username, avatar: p.avatar || null, score: p.score, rank, connected: p.connected };
    });
  }

  /** What gets stored in the history once the game is over. */
  summary() {
    return {
      roomCode: this.code,
      theme: `${this.theme.emoji} ${this.theme.name}`,
      themeKey: this.theme.key,
      hostId: this.host.id,
      hostName: this.host.username,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      questions: this.questions.map((q) => ({
        ...publicQuestion(q),
        answer: answerText(q),
        ...(q.explanation && { explanation: q.explanation }),
      })),
      players: this.ranking().map((r) => {
        const p = this.players.get(r.id);
        return {
          userId: p.id,
          username: p.username,
          score: p.score,
          rank: r.rank,
          answers: this.questions.map((_, i) => p.answers[i] || { given: null, correct: false }),
        };
      }),
    };
  }

  // ---- views -------------------------------------------------------------

  stateFor(userId) {
    const isHost = this.isHost(userId);
    const q = this.question;
    const state = {
      code: this.code,
      phase: this.phase,
      isHost,
      me: userId,
      host: { ...this.host },
      settings: this.settings,
      themeChoice: this.phase === 'lobby' ? describeTheme(this.settings.themeId, this.themes) : null,
      theme: this.theme,
      serverNow: this.now(),
      players: this.ranking().map((p) => ({
        ...p,
        answered: this.phase === 'question' ? this.answers.has(p.id) : undefined,
      })),
      customQuestionCount: this.customQuestions.length,
      gameId: this.gameId,
    };

    if (isHost && this.phase === 'lobby') {
      state.customQuestions = this.customQuestions.map((cq) => ({ ...publicQuestion(cq), answer: answerText(cq) }));
    }

    if (q && ['question', 'correction', 'reveal'].includes(this.phase)) {
      state.index = this.index;
      state.total = this.questions.length;
      state.deadline = this.deadline;
      state.question = publicQuestion(q);
      const mine = this.answers.get(userId);
      state.myAnswer = mine === undefined ? null : { value: mine, text: submissionText(q, mine) };
      state.answeredCount = this.answers.size;

      if (isHost && this.phase !== 'reveal') {
        // The admin sees the expected answer to be able to judge.
        state.question.answer = answerText(q);
        if (q.accept) state.question.accept = q.accept;
      }
      if (isHost && this.phase === 'correction') {
        state.correction = [...this.answers].map(([uid, v]) => ({
          userId: uid,
          username: this.players.get(uid)?.username ?? '?',
          avatar: this.players.get(uid)?.avatar ?? null,
          answer: submissionText(q, v),
          correct: this.verdicts.get(uid) === true,
        }));
      }
      if (this.phase === 'reveal') {
        state.question.answer = answerText(q);
        if (q.explanation) state.question.explanation = q.explanation;
        if (q.type === 'qcm') state.question.answerIndex = q.answer;
        state.results = [...this.players.values()].map((p) => ({
          userId: p.id,
          username: p.username,
          avatar: p.avatar || null,
          answer: p.answers[this.index]?.given ?? null,
          correct: Boolean(p.answers[this.index]?.correct),
        }));
        state.isLast = this.index + 1 >= this.questions.length;
      }
    }
    return state;
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = { Room, GameError, TIME_LIMITS };
