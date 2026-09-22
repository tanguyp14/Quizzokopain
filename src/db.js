const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  avatar BLOB,
  avatar_type TEXT,
  avatar_v INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  theme TEXT NOT NULL,
  theme_key TEXT,
  host_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  host_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  questions_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  answers_json TEXT NOT NULL,
  PRIMARY KEY (game_id, username)
);

-- Themes proposed by players; they only become playable once a superadmin approves them.
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'moyen',
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT NOT NULL DEFAULT '',
  questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, theme_key)
);

CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_games_host ON games(host_id);
CREATE INDEX IF NOT EXISTS idx_themes_status ON themes(status);
CREATE INDEX IF NOT EXISTS idx_themes_author ON themes(author_id);
`;
const POST_MIGRATION = 'CREATE INDEX IF NOT EXISTS idx_games_theme ON games(theme_key);';

/** Adds columns introduced after the first release to existing databases. */
function migrate(db) {
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!cols.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  if (!cols.has('banned')) db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('avatar')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar BLOB; ALTER TABLE users ADD COLUMN avatar_type TEXT; ALTER TABLE users ADD COLUMN avatar_v INTEGER;');
  }
  const gameCols = new Set(db.prepare('PRAGMA table_info(games)').all().map((c) => c.name));
  if (!gameCols.has('theme_key')) db.exec('ALTER TABLE games ADD COLUMN theme_key TEXT');
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  db.exec(POST_MIGRATION);
  return createRepo(db);
}

/** Public URL of a user's avatar, versioned so browsers can cache it forever. */
const avatarUrl = (id, v) => (v ? `/api/avatars/${id}?v=${v}` : null);

const likePattern = (q) => `%${String(q || '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Questions per difficulty; questions saved without one inherit the quiz level. */
function countLevels(questions, fallback = 'moyen') {
  const levels = { facile: 0, moyen: 0, difficile: 0 };
  for (const q of questions) levels[levels[q.difficulty] === undefined ? fallback : q.difficulty] += 1;
  return levels;
}

function themeRow(row, { withQuestions = false } = {}) {
  if (!row) return null;
  const questions = JSON.parse(row.questions_json);
  return {
    id: row.id,
    key: `c${row.id}`,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    keywords: JSON.parse(row.keywords_json),
    difficulty: row.difficulty,
    authorId: row.author_id,
    authorName: row.author_name,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    questionCount: questions.length,
    levels: countLevels(questions, row.difficulty),
    ...(withQuestions && { questions }),
  };
}

function createRepo(db) {
  const q = {
    insertUser: db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username, role, banned, created_at, avatar_v FROM users WHERE id = ?'),
    setAvatar: db.prepare('UPDATE users SET avatar = ?, avatar_type = ?, avatar_v = ? WHERE id = ?'),
    avatar: db.prepare('SELECT avatar, avatar_type, avatar_v FROM users WHERE id = ? AND avatar IS NOT NULL'),
    setRoleByName: db.prepare('UPDATE users SET role = ? WHERE username = ?'),
    setBanned: db.prepare('UPDATE users SET banned = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    listUsers: db.prepare(`
      SELECT u.id, u.username, u.role, u.banned, u.created_at, u.avatar_v,
             (SELECT COUNT(*) FROM game_players p WHERE p.user_id = u.id) AS games_played,
             (SELECT COUNT(*) FROM themes t WHERE t.author_id = u.id) AS themes_count
      FROM users u WHERE u.username LIKE ? ESCAPE '\\'
      ORDER BY u.created_at DESC LIMIT ?`),
    searchUsernames: db.prepare(`SELECT username FROM users WHERE banned = 0 AND username LIKE ? ESCAPE '\\'
                                 ORDER BY username LIMIT ?`),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),

    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare(`SELECT u.id, u.username, u.role, u.avatar_v FROM sessions s JOIN users u ON u.id = s.user_id
                             WHERE s.token = ? AND s.expires_at > ? AND u.banned = 0`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),

    insertGame: db.prepare(`INSERT INTO games (room_code, theme, theme_key, host_id, host_name, started_at, ended_at, questions_json)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    playCounts: db.prepare('SELECT theme_key, COUNT(*) AS n FROM games WHERE theme_key IS NOT NULL GROUP BY theme_key'),
    userStats: db.prepare(`
      SELECT COUNT(*) AS played,
             COALESCE(SUM(CASE WHEN p.rank = 1 THEN 1 ELSE 0 END), 0) AS wins,
             COALESCE(SUM(p.score), 0) AS points,
             COALESCE(SUM(json_array_length(g.questions_json)), 0) AS questions
      FROM game_players p JOIN games g ON g.id = p.game_id WHERE p.user_id = ?`),
    hostedCount: db.prepare('SELECT COUNT(*) AS n FROM games WHERE host_id = ?'),
    favoriteThemes: db.prepare(`SELECT g.theme_key, g.theme, COUNT(*) AS n FROM game_players p JOIN games g ON g.id = p.game_id
                                WHERE p.user_id = ? AND g.theme_key IS NOT NULL GROUP BY g.theme_key ORDER BY n DESC LIMIT 1`),
    insertPlayer: db.prepare(`INSERT INTO game_players (game_id, user_id, username, score, rank, answers_json)
                              VALUES (?, ?, ?, ?, ?, ?)`),
    historyForUser: db.prepare(`
      SELECT g.id, g.room_code, g.theme, g.host_name, g.host_id, g.started_at, g.ended_at,
             json_array_length(g.questions_json) AS question_count,
             (SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) AS player_count,
             (SELECT p.username FROM game_players p WHERE p.game_id = g.id AND p.rank = 1 ORDER BY p.username LIMIT 1) AS winner,
             me.score AS my_score, me.rank AS my_rank
      FROM games g
      LEFT JOIN game_players me ON me.game_id = g.id AND me.user_id = ?
      WHERE g.host_id = ? OR me.user_id IS NOT NULL
      ORDER BY g.ended_at DESC
      LIMIT ?`),
    game: db.prepare('SELECT * FROM games WHERE id = ?'),
    gamePlayers: db.prepare('SELECT user_id, username, score, rank, answers_json FROM game_players WHERE game_id = ? ORDER BY rank, username'),

    insertTheme: db.prepare(`INSERT INTO themes (name, emoji, description, keywords_json, difficulty, author_id, author_name, status,
                             questions_json, created_at, updated_at, reviewed_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateTheme: db.prepare(`UPDATE themes SET name = ?, emoji = ?, description = ?, keywords_json = ?, difficulty = ?, questions_json = ?, status = ?,
                             review_note = '', updated_at = ?, reviewed_at = ? WHERE id = ?`),
    theme: db.prepare('SELECT * FROM themes WHERE id = ?'),
    themesByAuthor: db.prepare('SELECT * FROM themes WHERE author_id = ? ORDER BY updated_at DESC'),
    themesByStatus: db.prepare('SELECT * FROM themes WHERE status = ? ORDER BY updated_at ASC'),
    allThemes: db.prepare('SELECT * FROM themes ORDER BY updated_at DESC'),
    setThemeStatus: db.prepare('UPDATE themes SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?'),
    deleteTheme: db.prepare('DELETE FROM themes WHERE id = ?'),
    countPending: db.prepare("SELECT COUNT(*) AS n FROM themes WHERE author_id = ? AND status = 'pending'"),

    addFavorite: db.prepare('INSERT OR IGNORE INTO favorites (user_id, theme_key, created_at) VALUES (?, ?, ?)'),
    removeFavorite: db.prepare('DELETE FROM favorites WHERE user_id = ? AND theme_key = ?'),
    favorites: db.prepare('SELECT theme_key FROM favorites WHERE user_id = ? ORDER BY created_at'),
    deleteFavoritesForTheme: db.prepare('DELETE FROM favorites WHERE theme_key = ?'),
    favoriteCounts: db.prepare('SELECT theme_key, COUNT(*) AS n FROM favorites GROUP BY theme_key'),
  };

  return {
    raw: db,

    // ---- users ----
    createUser(username, passwordHash) {
      const r = q.insertUser.run(username, passwordHash, Date.now());
      return { id: Number(r.lastInsertRowid), username, role: 'user' };
    },
    findUserByName: (username) => q.userByName.get(username),
    findUserById: (id) => q.userById.get(id),
    setRoleByName: (username, role) => q.setRoleByName.run(role, username).changes > 0,
    setBanned(id, banned) {
      q.setBanned.run(banned ? 1 : 0, id);
      if (banned) q.deleteUserSessions.run(id);
    },
    setPassword(id, hash) {
      q.setPassword.run(hash, id);
      q.deleteUserSessions.run(id);
    },
    deleteUser: (id) => q.deleteUser.run(id).changes > 0,
    setAvatar(id, bytes, type) {
      const v = bytes ? Date.now() : null;
      q.setAvatar.run(bytes, bytes ? type : null, v, id);
      return avatarUrl(id, v);
    },
    getAvatar(id) {
      const r = q.avatar.get(id);
      return r ? { bytes: Buffer.from(r.avatar), type: r.avatar_type } : null;
    },
    listUsers(search = '', limit = 100) {
      return q.listUsers.all(likePattern(search), limit).map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        banned: Boolean(u.banned),
        avatar: avatarUrl(u.id, u.avatar_v),
        createdAt: u.created_at,
        gamesPlayed: u.games_played,
        themesCount: u.themes_count,
      }));
    },
    searchUsernames: (search, limit = 8) => q.searchUsernames.all(likePattern(search), limit).map((r) => r.username),

    // ---- sessions ----
    createSession(token, userId, ttlMs) {
      q.insertSession.run(token, userId, Date.now() + ttlMs);
    },
    userForSession(token) {
      const u = q.sessionUser.get(token, Date.now());
      return u ? { id: u.id, username: u.username, role: u.role, avatar: avatarUrl(u.id, u.avatar_v) } : undefined;
    },
    deleteSession: (token) => q.deleteSession.run(token),
    purgeExpiredSessions: () => q.purgeSessions.run(Date.now()),

    // ---- games / history ----
    /**
     * Persists a finished game. `players` is [{ userId, username, score, rank, answers }].
     */
    saveGame({ roomCode, theme, themeKey = null, hostId, hostName, startedAt, endedAt, questions, players }) {
      db.exec('BEGIN');
      try {
        const r = q.insertGame.run(roomCode, theme, themeKey, hostId, hostName, startedAt, endedAt, JSON.stringify(questions));
        const gameId = Number(r.lastInsertRowid);
        for (const p of players) {
          q.insertPlayer.run(gameId, p.userId, p.username, p.score, p.rank, JSON.stringify(p.answers));
        }
        db.exec('COMMIT');
        return gameId;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    historyForUser(userId, limit = 20) {
      return q.historyForUser.all(userId, userId, limit).map((row) => ({
        id: row.id,
        roomCode: row.room_code,
        theme: row.theme,
        hostName: row.host_name,
        wasHost: row.host_id === userId,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        questionCount: row.question_count,
        playerCount: row.player_count,
        winner: row.winner,
        myScore: row.my_score,
        myRank: row.my_rank,
      }));
    },

    /** Returns the full game, or null if it doesn't exist or `userId` took no part in it. */
    gameDetail(gameId, userId) {
      const g = q.game.get(gameId);
      if (!g) return null;
      const players = q.gamePlayers.all(gameId).map((p) => ({
        userId: p.user_id,
        username: p.username,
        score: p.score,
        rank: p.rank,
        answers: JSON.parse(p.answers_json),
      }));
      if (g.host_id !== userId && !players.some((p) => p.userId === userId)) return null;
      return {
        id: g.id,
        roomCode: g.room_code,
        theme: g.theme,
        hostName: g.host_name,
        startedAt: g.started_at,
        endedAt: g.ended_at,
        questions: JSON.parse(g.questions_json),
        players,
      };
    },

    /** Number of finished games per theme key. */
    playCounts: () => new Map(q.playCounts.all().map((r) => [r.theme_key, r.n])),

    userStats(userId) {
      const s = q.userStats.get(userId);
      const top = q.favoriteThemes.get(userId);
      return {
        played: s.played,
        wins: s.wins,
        points: s.points,
        questionsSeen: s.questions,
        successRate: s.questions ? Math.round((s.points / s.questions) * 100) : 0,
        hosted: q.hostedCount.get(userId).n,
        mostPlayedTheme: top ? { key: top.theme_key, label: top.theme, count: top.n } : null,
      };
    },

    // ---- community themes ----
    createTheme({ name, emoji, description, keywords, difficulty, questions, author, status }) {
      const now = Date.now();
      const r = q.insertTheme.run(name, emoji, description, JSON.stringify(keywords), difficulty, author.id, author.username, status,
        JSON.stringify(questions), now, now, status === 'approved' ? now : null);
      return Number(r.lastInsertRowid);
    },
    updateTheme(id, { name, emoji, description, keywords, difficulty, questions, status }) {
      const now = Date.now();
      q.updateTheme.run(name, emoji, description, JSON.stringify(keywords), difficulty, JSON.stringify(questions), status, now, status === 'approved' ? now : null, id);
    },
    getTheme: (id, opts) => themeRow(q.theme.get(id), opts),
    themesByAuthor: (authorId) => q.themesByAuthor.all(authorId).map((r) => themeRow(r)),
    themesByStatus: (status, opts) => q.themesByStatus.all(status).map((r) => themeRow(r, opts)),
    allThemes: () => q.allThemes.all().map((r) => themeRow(r)),
    setThemeStatus(id, status, note = '') {
      return q.setThemeStatus.run(status, note, Date.now(), id).changes > 0;
    },
    deleteTheme(id) {
      q.deleteFavoritesForTheme.run(`c${id}`);
      return q.deleteTheme.run(id).changes > 0;
    },
    countPendingThemes: (authorId) => q.countPending.get(authorId).n,

    // ---- favorites ----
    addFavorite: (userId, key) => q.addFavorite.run(userId, key, Date.now()),
    removeFavorite: (userId, key) => q.removeFavorite.run(userId, key),
    favoritesOf: (userId) => q.favorites.all(userId).map((r) => r.theme_key),
    favoriteCounts: () => new Map(q.favoriteCounts.all().map((r) => [r.theme_key, r.n])),
  };
}

module.exports = { openDb };
