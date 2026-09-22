const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_games_host ON games(host_id);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return createRepo(db);
}

function createRepo(db) {
  const q = {
    insertUser: db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username, created_at FROM users WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
                             WHERE s.token = ? AND s.expires_at > ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    insertGame: db.prepare(`INSERT INTO games (room_code, theme, host_id, host_name, started_at, ended_at, questions_json)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`),
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
  };

  return {
    raw: db,

    createUser(username, passwordHash) {
      const r = q.insertUser.run(username, passwordHash, Date.now());
      return { id: Number(r.lastInsertRowid), username };
    },
    findUserByName: (username) => q.userByName.get(username),
    findUserById: (id) => q.userById.get(id),

    createSession(token, userId, ttlMs) {
      q.insertSession.run(token, userId, Date.now() + ttlMs);
    },
    userForSession: (token) => q.sessionUser.get(token, Date.now()),
    deleteSession: (token) => q.deleteSession.run(token),
    purgeExpiredSessions: () => q.purgeSessions.run(Date.now()),

    /**
     * Persists a finished game. `players` is [{ userId, username, score, rank, answers }].
     */
    saveGame({ roomCode, theme, hostId, hostName, startedAt, endedAt, questions, players }) {
      db.exec('BEGIN');
      try {
        const r = q.insertGame.run(roomCode, theme, hostId, hostName, startedAt, endedAt, JSON.stringify(questions));
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
  };
}

module.exports = { openDb };
