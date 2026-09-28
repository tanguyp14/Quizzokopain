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
  music_json TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT NOT NULL DEFAULT '',
  questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

-- Images uploaded for questions (quiz editor, custom questions).
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  bytes BLOB NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, theme_key)
);

-- Arcade games: one save per account and game (the game state is opaque JSON).
CREATE TABLE IF NOT EXISTS arcade_saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  data TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);

-- Arcade rewards earned elsewhere (quiz games), claimed from the game.
CREATE TABLE IF NOT EXISTS arcade_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  kind TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  boost INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_arcade_rewards_user ON arcade_rewards(user_id, game);

-- L'Empire de Jimmy (secret for now: SuperAdmin only): one empire per account, the server is the authority.
CREATE TABLE IF NOT EXISTS empires (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Empire trade: cargos in flight between two empires, and market offers.
CREATE TABLE IF NOT EXISTS empire_fleets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dest_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  load TEXT NOT NULL,
  cargos INTEGER NOT NULL,
  departs_at INTEGER NOT NULL,
  arrives_at INTEGER NOT NULL,
  returns_at INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  returned INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'send',
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_empire_fleets_dest ON empire_fleets(dest_id, delivered);
CREATE INDEX IF NOT EXISTS idx_empire_fleets_owner ON empire_fleets(owner_id, returned);
CREATE TABLE IF NOT EXISTS empire_market (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  give TEXT NOT NULL,
  give_amount INTEGER NOT NULL,
  want TEXT NOT NULL,
  want_amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  buyer_id INTEGER,
  closed_at INTEGER,
  cancelled INTEGER NOT NULL DEFAULT 0
);

-- The Portail de Jimmy (one for the whole server, per season) and who gave what.
CREATE TABLE IF NOT EXISTS empire_portal (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  season INTEGER NOT NULL DEFAULT 1,
  phase INTEGER NOT NULL DEFAULT 0,
  progress TEXT NOT NULL DEFAULT '{}',
  opened_at INTEGER
);
CREATE TABLE IF NOT EXISTS empire_contrib (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  metal INTEGER NOT NULL DEFAULT 0,
  crystal INTEGER NOT NULL DEFAULT 0,
  plasma INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, season)
);

-- La Nuée: one wave schedule for the whole server, and the guards each player engaged.
CREATE TABLE IF NOT EXISTS empire_swarm (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  wave INTEGER NOT NULL DEFAULT 1,
  next_at INTEGER NOT NULL,
  last TEXT,
  malus_from INTEGER,
  malus_until INTEGER
);
CREATE TABLE IF NOT EXISTS empire_guard (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  alive INTEGER NOT NULL DEFAULT 0,
  engaged INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  waves INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, season)
);

-- Profile frames: earned (e.g. at the end of an Empire season), one shown around the avatar everywhere.
CREATE TABLE IF NOT EXISTS user_frames (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frame TEXT NOT NULL,
  season INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  awarded_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, frame, season)
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
  const themeCols = new Set(db.prepare('PRAGMA table_info(themes)').all().map((c) => c.name));
  if (themeCols.size && !themeCols.has('music_json')) db.exec('ALTER TABLE themes ADD COLUMN music_json TEXT');
  const gameCols = new Set(db.prepare('PRAGMA table_info(games)').all().map((c) => c.name));
  if (!gameCols.has('theme_key')) db.exec('ALTER TABLE games ADD COLUMN theme_key TEXT');
  if (!cols.has('frame')) db.exec('ALTER TABLE users ADD COLUMN frame TEXT');
  const fleetCols = new Set(db.prepare('PRAGMA table_info(empire_fleets)').all().map((c) => c.name));
  if (fleetCols.size && !fleetCols.has('kind')) db.exec("ALTER TABLE empire_fleets ADD COLUMN kind TEXT NOT NULL DEFAULT 'send'");
  if (fleetCols.size && !fleetCols.has('meta')) db.exec('ALTER TABLE empire_fleets ADD COLUMN meta TEXT');
  const saveCols = new Set(db.prepare('PRAGMA table_info(arcade_saves)').all().map((c) => c.name));
  if (saveCols.size && !saveCols.has('device')) db.exec('ALTER TABLE arcade_saves ADD COLUMN device TEXT');
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
    music: row.music_json ? JSON.parse(row.music_json) : null,
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
    sessionUser: db.prepare(`SELECT u.id, u.username, u.role, u.avatar_v, u.frame FROM sessions s JOIN users u ON u.id = s.user_id
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

    insertTheme: db.prepare(`INSERT INTO themes (name, emoji, description, keywords_json, difficulty, music_json, author_id, author_name, status,
                             questions_json, created_at, updated_at, reviewed_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateTheme: db.prepare(`UPDATE themes SET name = ?, emoji = ?, description = ?, keywords_json = ?, difficulty = ?, music_json = ?, questions_json = ?, status = ?,
                             review_note = '', updated_at = ?, reviewed_at = ? WHERE id = ?`),
    theme: db.prepare('SELECT * FROM themes WHERE id = ?'),
    themesByAuthor: db.prepare('SELECT * FROM themes WHERE author_id = ? ORDER BY updated_at DESC'),
    themesByStatus: db.prepare('SELECT * FROM themes WHERE status = ? ORDER BY updated_at ASC'),
    allThemes: db.prepare('SELECT * FROM themes ORDER BY updated_at DESC'),
    setThemeStatus: db.prepare('UPDATE themes SET status = ?, review_note = ?, reviewed_at = ? WHERE id = ?'),
    deleteTheme: db.prepare('DELETE FROM themes WHERE id = ?'),
    countPending: db.prepare("SELECT COUNT(*) AS n FROM themes WHERE author_id = ? AND status = 'pending'"),

    insertImage: db.prepare('INSERT INTO images (owner_id, bytes, type, size, created_at) VALUES (?, ?, ?, ?, ?)'),
    image: db.prepare('SELECT bytes, type FROM images WHERE id = ?'),
    imageUsage: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS total FROM images WHERE owner_id = ?'),

    addFavorite: db.prepare('INSERT OR IGNORE INTO favorites (user_id, theme_key, created_at) VALUES (?, ?, ?)'),
    removeFavorite: db.prepare('DELETE FROM favorites WHERE user_id = ? AND theme_key = ?'),
    favorites: db.prepare('SELECT theme_key FROM favorites WHERE user_id = ? ORDER BY created_at'),
    deleteFavoritesForTheme: db.prepare('DELETE FROM favorites WHERE theme_key = ?'),
    favoriteCounts: db.prepare('SELECT theme_key, COUNT(*) AS n FROM favorites GROUP BY theme_key'),

    arcadeSave: db.prepare('SELECT data, score, updated_at, device FROM arcade_saves WHERE user_id = ? AND game = ?'),
    putArcadeSave: db.prepare(`INSERT INTO arcade_saves (user_id, game, data, score, updated_at, device) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, game) DO UPDATE SET data = excluded.data, score = excluded.score, updated_at = excluded.updated_at, device = excluded.device`),
    insertReward: db.prepare('INSERT INTO arcade_rewards (user_id, game, kind, minutes, boost, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    rewardsSince: db.prepare('SELECT COUNT(*) AS n FROM arcade_rewards WHERE user_id = ? AND game = ? AND created_at > ?'),
    openRewards: db.prepare('SELECT id, kind, minutes, boost, reason, created_at FROM arcade_rewards WHERE user_id = ? AND game = ? AND claimed_at IS NULL ORDER BY id'),
    claimRewards: db.prepare('UPDATE arcade_rewards SET claimed_at = ? WHERE user_id = ? AND game = ? AND claimed_at IS NULL'),
    getEmpire: db.prepare('SELECT data FROM empires WHERE user_id = ?'),
    allEmpires: db.prepare(`SELECT e.user_id, e.data, u.username, u.avatar_v, u.frame FROM empires e JOIN users u ON u.id = e.user_id WHERE u.banned = 0`),
    insertFleet: db.prepare('INSERT INTO empire_fleets (owner_id, dest_id, load, cargos, departs_at, arrives_at, returns_at, kind, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    activeExpeditions: db.prepare("SELECT COUNT(*) AS n FROM empire_fleets WHERE owner_id = ? AND kind = 'expedition' AND returned = 0"),
    fleetsToDeliver: db.prepare("SELECT * FROM empire_fleets WHERE dest_id = ? AND delivered = 0 AND arrives_at <= ? AND kind NOT IN ('portal', 'guard', 'expedition')"),
    portalArrivals: db.prepare("SELECT * FROM empire_fleets WHERE kind = 'portal' AND delivered = 0 AND arrives_at <= ? ORDER BY arrives_at"),
    portalInFlight: db.prepare("SELECT load FROM empire_fleets WHERE kind = 'portal' AND delivered = 0"),
    getPortal: db.prepare('SELECT * FROM empire_portal WHERE id = 1'),
    initPortal: db.prepare("INSERT OR IGNORE INTO empire_portal (id, season, phase, progress) VALUES (1, 1, 0, '{}')"),
    savePortal: db.prepare('UPDATE empire_portal SET season = ?, phase = ?, progress = ?, opened_at = ? WHERE id = 1'),
    addContrib: db.prepare(`INSERT INTO empire_contrib (user_id, season, points, metal, crystal, plasma) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, season) DO UPDATE SET points = points + excluded.points, metal = metal + excluded.metal, crystal = crystal + excluded.crystal, plasma = plasma + excluded.plasma`),
    topContrib: db.prepare(`SELECT c.*, u.username, u.avatar_v, u.frame FROM empire_contrib c JOIN users u ON u.id = c.user_id
      WHERE c.season = ? ORDER BY c.points DESC LIMIT ?`),
    fleetsBack: db.prepare("SELECT * FROM empire_fleets WHERE owner_id = ? AND returned = 0 AND returns_at <= ? AND kind != 'guard'"),
    guardArrivals: db.prepare("SELECT * FROM empire_fleets WHERE kind = 'guard' AND delivered = 0 AND arrives_at <= ? ORDER BY arrives_at"),
    guardsInFlight: db.prepare("SELECT COALESCE(SUM(cargos), 0) AS n FROM empire_fleets WHERE kind = 'guard' AND delivered = 0 AND owner_id = ?"),
    getSwarm: db.prepare('SELECT * FROM empire_swarm WHERE id = 1'),
    initSwarm: db.prepare('INSERT OR IGNORE INTO empire_swarm (id, wave, next_at) VALUES (1, 1, ?)'),
    saveSwarm: db.prepare('UPDATE empire_swarm SET wave = ?, next_at = ?, last = ?, malus_from = ?, malus_until = ? WHERE id = 1'),
    addGuards: db.prepare(`INSERT INTO empire_guard (user_id, season, alive, engaged) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, season) DO UPDATE SET alive = alive + excluded.alive, engaged = engaged + excluded.engaged`),
    loseGuards: db.prepare('UPDATE empire_guard SET alive = alive - ?, lost = lost + ?, waves = waves + 1 WHERE user_id = ? AND season = ?'),
    aliveGuards: db.prepare('SELECT user_id, alive FROM empire_guard WHERE season = ? AND alive > 0'),
    topGuards: db.prepare(`SELECT g.*, u.username, u.avatar_v, u.frame FROM empire_guard g JOIN users u ON u.id = g.user_id
      WHERE g.season = ? ORDER BY g.waves DESC, g.engaged DESC LIMIT ?`),
    markDelivered: db.prepare('UPDATE empire_fleets SET delivered = 1 WHERE id = ?'),
    markReturned: db.prepare('UPDATE empire_fleets SET returned = 1 WHERE id = ?'),
    myFleets: db.prepare(`SELECT f.*, o.username AS owner_name, d.username AS dest_name FROM empire_fleets f
      JOIN users o ON o.id = f.owner_id JOIN users d ON d.id = f.dest_id
      WHERE (f.owner_id = ? AND f.returned = 0) OR (f.dest_id = ? AND f.delivered = 0) ORDER BY f.arrives_at`),
    insertOffer: db.prepare('INSERT INTO empire_market (seller_id, give, give_amount, want, want_amount, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    openOffers: db.prepare(`SELECT m.*, u.username AS seller_name, u.avatar_v, u.frame FROM empire_market m JOIN users u ON u.id = m.seller_id
      WHERE m.closed_at IS NULL ORDER BY m.created_at DESC LIMIT 200`),
    offer: db.prepare('SELECT * FROM empire_market WHERE id = ?'),
    closeOffer: db.prepare('UPDATE empire_market SET closed_at = ?, buyer_id = ?, cancelled = ? WHERE id = ? AND closed_at IS NULL'),
    countOpenOffers: db.prepare('SELECT COUNT(*) AS n FROM empire_market WHERE seller_id = ? AND closed_at IS NULL'),
    recentTrades: db.prepare(`SELECT give, give_amount, want, want_amount, closed_at FROM empire_market
      WHERE closed_at IS NOT NULL AND cancelled = 0 ORDER BY closed_at DESC LIMIT 50`),
    putEmpire: db.prepare(`INSERT INTO empires (user_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
    userFrames: db.prepare('SELECT frame, season, label, awarded_at FROM user_frames WHERE user_id = ? ORDER BY awarded_at DESC'),
    awardFrame: db.prepare('INSERT OR IGNORE INTO user_frames (user_id, frame, season, label, awarded_at) VALUES (?, ?, ?, ?, ?)'),
    ownsFrame: db.prepare('SELECT 1 FROM user_frames WHERE user_id = ? AND frame = ?'),
    setFrame: db.prepare('UPDATE users SET frame = ? WHERE id = ?'),
    deleteArcadeSave: db.prepare('DELETE FROM arcade_saves WHERE user_id = ? AND game = ?'),
    // Ranked by prestiges first, then by best stage (both read from the save).
    arcadeLeaderboard: db.prepare(`SELECT u.id, u.username, u.avatar_v, u.frame, s.score,
        COALESCE(CAST(json_extract(s.data, '$.prestige') AS INTEGER), 0) AS prestige,
        COALESCE(CAST(json_extract(s.data, '$.achPoints') AS INTEGER), 0) AS ach
      FROM arcade_saves s JOIN users u ON u.id = s.user_id
      WHERE s.game = ? AND u.banned = 0 AND s.score > 0 ORDER BY prestige DESC, s.score DESC LIMIT ?`),
    // Same players, ranked by best stage first.
    arcadeLeaderboardBySector: db.prepare(`SELECT u.id, u.username, u.avatar_v, u.frame, s.score,
        COALESCE(CAST(json_extract(s.data, '$.prestige') AS INTEGER), 0) AS prestige,
        COALESCE(CAST(json_extract(s.data, '$.achPoints') AS INTEGER), 0) AS ach
      FROM arcade_saves s JOIN users u ON u.id = s.user_id
      WHERE s.game = ? AND u.banned = 0 AND s.score > 0 ORDER BY s.score DESC, prestige DESC LIMIT ?`),
    // Ranked by achievement points (« Plan d'attaque »), then best stage.
    arcadeLeaderboardByAch: db.prepare(`SELECT u.id, u.username, u.avatar_v, u.frame, s.score,
        COALESCE(CAST(json_extract(s.data, '$.prestige') AS INTEGER), 0) AS prestige,
        COALESCE(CAST(json_extract(s.data, '$.achPoints') AS INTEGER), 0) AS ach
      FROM arcade_saves s JOIN users u ON u.id = s.user_id
      WHERE s.game = ? AND u.banned = 0 AND s.score > 0 ORDER BY ach DESC, s.score DESC LIMIT ?`),
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
      return u ? { id: u.id, username: u.username, role: u.role, avatar: avatarUrl(u.id, u.avatar_v), frame: u.frame || null } : undefined;
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
    createTheme({ name, emoji, description, keywords, difficulty, music = null, questions, author, status }) {
      const now = Date.now();
      const r = q.insertTheme.run(name, emoji, description, JSON.stringify(keywords), difficulty, music ? JSON.stringify(music) : null, author.id, author.username, status,
        JSON.stringify(questions), now, now, status === 'approved' ? now : null);
      return Number(r.lastInsertRowid);
    },
    updateTheme(id, { name, emoji, description, keywords, difficulty, music = null, questions, status }) {
      const now = Date.now();
      q.updateTheme.run(name, emoji, description, JSON.stringify(keywords), difficulty, music ? JSON.stringify(music) : null, JSON.stringify(questions), status, now, status === 'approved' ? now : null, id);
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

    // ---- uploaded images ----
    saveImage(ownerId, bytes, type) {
      return Number(q.insertImage.run(ownerId, bytes, type, bytes.length, Date.now()).lastInsertRowid);
    },
    getImage(id) {
      const r = q.image.get(id);
      return r ? { bytes: Buffer.from(r.bytes), type: r.type } : null;
    },
    imageUsage: (ownerId) => q.imageUsage.get(ownerId),

    // ---- favorites ----
    addFavorite: (userId, key) => q.addFavorite.run(userId, key, Date.now()),
    removeFavorite: (userId, key) => q.removeFavorite.run(userId, key),
    favoritesOf: (userId) => q.favorites.all(userId).map((r) => r.theme_key),
    favoriteCounts: () => new Map(q.favoriteCounts.all().map((r) => [r.theme_key, r.n])),

    // ---- arcade games ----
    getArcadeSave(userId, game) {
      const r = q.arcadeSave.get(userId, game);
      return r ? { data: JSON.parse(r.data), score: r.score, updatedAt: r.updated_at, device: r.device || null } : null;
    },
    /**
     * Saves a game. With `basedOn` (the version the device last read or wrote), a save that
     * another device has changed since is refused: { conflict: current save } instead of overwriting.
     * Prestiges come first: a save from an older run (fewer prestiges) never overwrites a newer one,
     * whatever the device, and a save from a newer run always goes through.
     */
    putArcadeSave(userId, game, data, score, { device = null, basedOn } = {}) {
      const cur = this.getArcadeSave(userId, game);
      const run = (d) => Math.max(0, Math.floor(Number(d?.prestige)) || 0);
      if (cur && run(cur.data) > run(data)) return { conflict: cur };
      const newerRun = cur && run(data) > run(cur.data);
      if (basedOn !== undefined && !newerRun && cur && cur.updatedAt > basedOn && cur.device !== device) return { conflict: cur };
      const updatedAt = Math.max(Date.now(), (basedOn || 0) + 1);
      q.putArcadeSave.run(userId, game, JSON.stringify(data), score, updatedAt, device);
      return { updatedAt };
    },
    deleteArcadeSave: (userId, game) => q.deleteArcadeSave.run(userId, game),
    /** Adds a reward unless the account already got `dailyCap` of them in the last 24 h. */
    addArcadeReward(userId, game, { kind, minutes, boost = false, reason }, dailyCap = 10) {
      const now = Date.now();
      if (q.rewardsSince.get(userId, game, now - 24 * 3600 * 1000).n >= dailyCap) return false;
      q.insertReward.run(userId, game, kind, minutes, boost ? 1 : 0, reason, now);
      return true;
    },
    openArcadeRewards: (userId, game) => q.openRewards.all(userId, game).map((r) => ({
      id: r.id, kind: r.kind, minutes: r.minutes, boost: Boolean(r.boost), reason: r.reason, createdAt: r.created_at,
    })),
    claimArcadeRewards(userId, game) {
      const open = this.openArcadeRewards(userId, game);
      q.claimRewards.run(Date.now(), userId, game);
      return open;
    },
    // ---- empire ----
    getEmpire(userId) {
      const r = q.getEmpire.get(userId);
      return r ? JSON.parse(r.data) : null;
    },
    putEmpire: (userId, data) => q.putEmpire.run(userId, JSON.stringify(data), Date.now()),
    allEmpires: () => q.allEmpires.all().map((r) => ({ userId: r.user_id, username: r.username, avatar: avatarUrl(r.user_id, r.avatar_v), frame: r.frame || null, data: JSON.parse(r.data) })),
    /** Runs fn inside a transaction (all or nothing). */
    transaction(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    addFleet: (f) => Number(q.insertFleet.run(f.ownerId, f.destId, JSON.stringify(f.load), f.cargos, f.departsAt, f.arrivesAt, f.returnsAt, f.kind || 'send', f.meta ? JSON.stringify(f.meta) : null).lastInsertRowid),
    activeExpeditions: (userId) => q.activeExpeditions.get(userId).n,
    fleetsToDeliver: (userId, now) => q.fleetsToDeliver.all(userId, now).map((f) => ({ ...f, load: JSON.parse(f.load) })),
    fleetsBack: (userId, now) => q.fleetsBack.all(userId, now).map((f) => ({ ...f, meta: f.meta ? JSON.parse(f.meta) : null })),
    markDelivered: (id) => q.markDelivered.run(id),
    portalArrivals: (now) => q.portalArrivals.all(now).map((f) => ({ ...f, load: JSON.parse(f.load) })),
    portalInFlight: () => q.portalInFlight.all().map((f) => JSON.parse(f.load)),
    getPortal() {
      q.initPortal.run();
      const p = q.getPortal.get();
      return { season: p.season, phase: p.phase, progress: JSON.parse(p.progress), openedAt: p.opened_at };
    },
    savePortal: (p) => q.savePortal.run(p.season, p.phase, JSON.stringify(p.progress), p.openedAt || null),
    addContrib: (userId, season, load, points) => q.addContrib.run(userId, season, points, load.metal || 0, load.crystal || 0, load.plasma || 0),
    topContrib: (season, limit = 20) => q.topContrib.all(season, limit).map((c) => ({
      userId: c.user_id, username: c.username, avatar: avatarUrl(c.user_id, c.avatar_v), frame: c.frame || null,
      points: c.points, metal: c.metal, crystal: c.crystal, plasma: c.plasma,
    })),
    markReturned: (id) => q.markReturned.run(id),
    guardArrivals: (until) => q.guardArrivals.all(until),
    guardsInFlight: (userId) => q.guardsInFlight.get(userId).n,
    getSwarm(firstAt) {
      q.initSwarm.run(firstAt);
      const s = q.getSwarm.get();
      return { wave: s.wave, nextAt: s.next_at, last: s.last ? JSON.parse(s.last) : null, malusFrom: s.malus_from, malusUntil: s.malus_until };
    },
    saveSwarm: (s) => q.saveSwarm.run(s.wave, s.nextAt, s.last ? JSON.stringify(s.last) : null, s.malusFrom ?? null, s.malusUntil ?? null),
    addGuards: (userId, season, count) => q.addGuards.run(userId, season, count, count),
    loseGuards: (userId, season, lost) => q.loseGuards.run(lost, lost, userId, season),
    aliveGuards: (season) => Object.fromEntries(q.aliveGuards.all(season).map((g) => [g.user_id, g.alive])),
    topGuards: (season, limit = 20) => q.topGuards.all(season, limit).map((g) => ({
      userId: g.user_id, username: g.username, avatar: avatarUrl(g.user_id, g.avatar_v), frame: g.frame || null,
      alive: g.alive, engaged: g.engaged, lost: g.lost, waves: g.waves,
    })),
    myFleets: (userId) => q.myFleets.all(userId, userId).map((f) => ({
      id: f.id, owner: f.owner_name, dest: f.dest_name, mine: f.owner_id === userId, load: JSON.parse(f.load), cargos: f.cargos,
      departsAt: f.departs_at, arrivesAt: f.arrives_at, returnsAt: f.returns_at, delivered: Boolean(f.delivered), kind: f.kind,
      // An expedition's fate stays secret until it is back.
      ...(f.meta && { trip: (({ outcome, ...trip }) => trip)(JSON.parse(f.meta)) }),
    })),
    addOffer: (o) => Number(q.insertOffer.run(o.sellerId, o.give, o.giveAmount, o.want, o.wantAmount, Date.now()).lastInsertRowid),
    openOffers: () => q.openOffers.all().map((m) => ({
      id: m.id, sellerId: m.seller_id, seller: m.seller_name, avatar: avatarUrl(m.seller_id, m.avatar_v), frame: m.frame || null,
      give: m.give, giveAmount: m.give_amount, want: m.want, wantAmount: m.want_amount, createdAt: m.created_at,
    })),
    offer: (id) => q.offer.get(id),
    closeOffer: (id, buyerId, cancelled) => q.closeOffer.run(Date.now(), buyerId, cancelled ? 1 : 0, id).changes > 0,
    countOpenOffers: (userId) => q.countOpenOffers.get(userId).n,
    recentTrades: () => q.recentTrades.all().map((t) => ({ give: t.give, giveAmount: t.give_amount, want: t.want, wantAmount: t.want_amount, at: t.closed_at })),

    // ---- profile frames ----
    userFrames: (userId) => q.userFrames.all(userId).map((r) => ({ frame: r.frame, season: r.season, label: r.label, awardedAt: r.awarded_at })),
    awardFrame: (userId, frame, season = 0, label = '') => q.awardFrame.run(userId, frame, season, label, Date.now()),
    /** Shows one of the user's frames (or none with null). Returns false if the user does not own it. */
    setFrame(userId, frame) {
      if (frame && !q.ownsFrame.get(userId, frame)) return false;
      q.setFrame.run(frame || null, userId);
      return true;
    },
    arcadeLeaderboard: (game, limit = 20, by = 'prestige') => q[{ sector: 'arcadeLeaderboardBySector', ach: 'arcadeLeaderboardByAch' }[by] || 'arcadeLeaderboard'].all(game, limit)
      .map((r) => ({ username: r.username, avatar: avatarUrl(r.id, r.avatar_v), frame: r.frame || null, score: r.score, prestige: Math.max(0, r.prestige || 0), ach: Math.max(0, r.ach || 0) })),
  };
}

module.exports = { openDb };
