const crypto = require('node:crypto');

const SESSION_COOKIE = 'qzk_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [algo, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return 'Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, _ . -).';
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    return 'Le mot de passe doit faire au moins 6 caractères.';
  }
  return null;
}

function createAuth(repo, { secureCookies = false } = {}) {
  function cookieFor(token, maxAgeMs) {
    const parts = [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ];
    if (secureCookies) parts.push('Secure');
    return parts.join('; ');
  }

  function openSession(res, user) {
    const token = crypto.randomBytes(32).toString('base64url');
    repo.createSession(token, user.id, SESSION_TTL_MS);
    res.setHeader('Set-Cookie', cookieFor(token, SESSION_TTL_MS));
  }

  function userFromCookieHeader(header) {
    const token = parseCookies(header)[SESSION_COOKIE];
    return token ? repo.userForSession(token) || null : null;
  }

  return {
    userFromCookieHeader,

    register(req, res) {
      const { username, password } = req.body || {};
      const error = validateCredentials(username, password);
      if (error) return res.status(400).json({ error });
      if (repo.findUserByName(username)) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
      const user = repo.createUser(username, hashPassword(password));
      openSession(res, user);
      res.status(201).json({ user });
    },

    login(req, res) {
      const { username, password } = req.body || {};
      const row = typeof username === 'string' ? repo.findUserByName(username) : null;
      if (!row || typeof password !== 'string' || !verifyPassword(password, row.password_hash)) {
        return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
      }
      const user = { id: row.id, username: row.username };
      openSession(res, user);
      res.json({ user });
    },

    logout(req, res) {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) repo.deleteSession(token);
      res.setHeader('Set-Cookie', cookieFor('', 0));
      res.json({ ok: true });
    },

    requireUser(req, res, next) {
      const user = userFromCookieHeader(req.headers.cookie);
      if (!user) return res.status(401).json({ error: 'Connexion requise.' });
      req.user = user;
      next();
    },
  };
}

module.exports = { createAuth, hashPassword, verifyPassword, parseCookies, validateCredentials };
