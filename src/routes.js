const express = require('express');
const { sanitizeQuestion } = require('./questionTypes');
const { hashPassword } = require('./auth');
const {
  summarize, matchesSearch, sanitizeTheme, MAX_PENDING_PER_USER, DIFFICULTIES,
} = require('./themes');
const { questionTypes, SPECIAL_THEMES } = require('./selection');

const THEME_STATUSES = ['pending', 'approved', 'rejected'];
const AVATAR_MAX_BYTES = 150 * 1024;
const IMAGE_MAX_BYTES = 700 * 1024;
const IMAGE_QUOTA_BYTES = 200 * 1024 * 1024; // per account
const AVATAR_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Checks the magic bytes so only real images get stored. */
function looksLikeImage(buf, type) {
  if (type === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
}

/**
 * Theme catalog, favorites, theme submissions and the superadmin back-office.
 * `hooks` lets the realtime layer react to account changes (kick banned users…).
 */
function themeAndAdminRoutes({ repo, auth, store, hooks, imageStore }) {
  const router = express.Router();
  const { requireUser, requireSuperadmin } = auth;

  const idParam = (req) => Number.parseInt(req.params.id, 10);
  const fail = (res, status, error) => res.status(status).json({ error });

  function catalogFor(user, search = '') {
    const favorites = new Set(repo.favoritesOf(user.id));
    const counts = repo.favoriteCounts();
    const plays = repo.playCounts();
    const themes = store.all()
      .filter((t) => matchesSearch(t, search))
      .map((t) => summarize(t, favorites, counts, plays))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite)
        || Number(b.builtin) - Number(a.builtin)
        || a.name.localeCompare(b.name, 'fr'));
    return { themes, favorites: [...favorites] };
  }

  // ---- catalog & favorites --------------------------------------------------

  router.get('/catalog', requireUser, (req, res) => {
    res.json({
      special: Object.values(SPECIAL_THEMES), types: questionTypes(), difficulties: DIFFICULTIES, ...catalogFor(req.user),
    });
  });

  router.get('/themes', requireUser, (req, res) => {
    let { themes } = catalogFor(req.user, String(req.query.q || ''));
    if (req.query.favorites === '1') themes = themes.filter((t) => t.favorite);
    if (DIFFICULTIES[req.query.difficulty]) themes = themes.filter((t) => t.difficulty === req.query.difficulty);
    res.json({ themes });
  });

  router.put('/favorites/:key', requireUser, (req, res) => {
    if (!store.get(req.params.key)) return fail(res, 404, 'Thème introuvable.');
    repo.addFavorite(req.user.id, req.params.key);
    res.json({ ok: true });
  });

  router.delete('/favorites/:key', requireUser, (req, res) => {
    repo.removeFavorite(req.user.id, req.params.key);
    res.json({ ok: true });
  });

  // ---- submissions ----------------------------------------------------------

  router.post('/questions/validate', requireUser, (req, res) => {
    try {
      res.json({ question: sanitizeQuestion(req.body?.question) });
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  /** A theme row enriched with how often it was played and favorited. */
  function withUsage(themes) {
    const plays = repo.playCounts();
    const favs = repo.favoriteCounts();
    return themes.map((t) => ({ ...t, playCount: plays.get(t.key) || 0, favoriteCount: favs.get(t.key) || 0 }));
  }

  router.get('/my-themes', requireUser, (req, res) => {
    res.json({ themes: withUsage(repo.themesByAuthor(req.user.id)) });
  });

  router.get('/stats', requireUser, (req, res) => {
    const mine = withUsage(repo.themesByAuthor(req.user.id));
    res.json({
      stats: repo.userStats(req.user.id),
      favorites: repo.favoritesOf(req.user.id).length,
      quizzes: {
        created: mine.length,
        approved: mine.filter((t) => t.status === 'approved').length,
        pending: mine.filter((t) => t.status === 'pending').length,
        totalPlays: mine.reduce((n, t) => n + t.playCount, 0),
        totalFavorites: mine.reduce((n, t) => n + t.favoriteCount, 0),
        list: mine,
      },
    });
  });

  const canEdit = (user, theme) => theme && (theme.authorId === user.id || user.role === 'superadmin');

  router.get('/my-themes/:id', requireUser, (req, res) => {
    const theme = repo.getTheme(idParam(req), { withQuestions: true });
    if (!canEdit(req.user, theme)) return fail(res, 404, 'Thème introuvable.');
    res.json({ theme });
  });

  router.post('/my-themes', requireUser, (req, res) => {
    let clean;
    try {
      clean = sanitizeTheme(req.body);
    } catch (err) {
      return fail(res, 400, err.message);
    }
    const isSuper = req.user.role === 'superadmin';
    if (!isSuper && repo.countPendingThemes(req.user.id) >= MAX_PENDING_PER_USER) {
      return fail(res, 429, `Tu as déjà ${MAX_PENDING_PER_USER} thèmes en attente de validation.`);
    }
    // The superadmin's own themes don't need a review.
    const id = repo.createTheme({ ...clean, author: req.user, status: isSuper ? 'approved' : 'pending' });
    hooks.themesChanged();
    res.status(201).json({ theme: repo.getTheme(id) });
  });

  router.put('/my-themes/:id', requireUser, (req, res) => {
    const theme = repo.getTheme(idParam(req));
    if (!canEdit(req.user, theme)) return fail(res, 404, 'Thème introuvable.');
    let clean;
    try {
      clean = sanitizeTheme(req.body);
    } catch (err) {
      return fail(res, 400, err.message);
    }
    // Any edit by a regular author goes back through validation.
    const status = req.user.role === 'superadmin' ? theme.status : 'pending';
    repo.updateTheme(theme.id, { ...clean, status });
    hooks.themesChanged();
    res.json({ theme: repo.getTheme(theme.id) });
  });

  router.delete('/my-themes/:id', requireUser, (req, res) => {
    const theme = repo.getTheme(idParam(req));
    if (!canEdit(req.user, theme)) return fail(res, 404, 'Thème introuvable.');
    repo.deleteTheme(theme.id);
    hooks.themesChanged();
    res.json({ ok: true });
  });

  // ---- superadmin: themes -----------------------------------------------------

  router.get('/admin/overview', requireSuperadmin, (req, res) => {
    res.json({
      pendingThemes: repo.themesByStatus('pending').length,
      users: repo.listUsers('', 100000).length,
      rooms: hooks.listRooms(),
    });
  });

  router.get('/admin/themes', requireSuperadmin, (req, res) => {
    const status = String(req.query.status || 'pending');
    const themes = THEME_STATUSES.includes(status) ? repo.themesByStatus(status) : repo.allThemes();
    res.json({ themes: withUsage(themes.filter((t) => matchesSearch(t, String(req.query.q || '')))) });
  });

  /** Any quiz with its questions and answers: built-in, imported or community (any status). */
  router.get('/admin/quiz/:key', requireSuperadmin, (req, res) => {
    const key = String(req.params.key);
    const m = /^c(\d+)$/.exec(key);
    if (m) {
      const t = repo.getTheme(Number(m[1]), { withQuestions: true });
      if (!t) return fail(res, 404, 'Quiz introuvable.');
      return res.json({ quiz: { ...t, builtin: false } });
    }
    const t = store.get(key);
    if (!t) return fail(res, 404, 'Quiz introuvable.');
    const { questions, ...rest } = t;
    res.json({ quiz: { ...summarize(t), ...rest, questions, status: 'approved' } });
  });

  router.post('/admin/themes/:id/approve', requireSuperadmin, (req, res) => {
    if (!repo.setThemeStatus(idParam(req), 'approved')) return fail(res, 404, 'Thème introuvable.');
    hooks.themesChanged();
    res.json({ theme: repo.getTheme(idParam(req)) });
  });

  router.post('/admin/themes/:id/reject', requireSuperadmin, (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    if (!repo.setThemeStatus(idParam(req), 'rejected', note)) return fail(res, 404, 'Thème introuvable.');
    hooks.themesChanged();
    res.json({ theme: repo.getTheme(idParam(req)) });
  });

  // ---- superadmin: accounts ---------------------------------------------------

  router.get('/admin/users', requireSuperadmin, (req, res) => {
    res.json({ users: repo.listUsers(String(req.query.q || ''), 200) });
  });

  /** Loads the target account and refuses to act on superadmins (including yourself). */
  function targetUser(req, res) {
    const user = repo.findUserById(idParam(req));
    if (!user) {
      fail(res, 404, 'Compte introuvable.');
      return null;
    }
    if (user.role === 'superadmin') {
      fail(res, 403, 'Impossible de modifier un compte SuperAdmin.');
      return null;
    }
    return user;
  }

  router.post('/admin/users/:id/ban', requireSuperadmin, (req, res) => {
    const user = targetUser(req, res);
    if (!user) return;
    const banned = req.body?.banned !== false;
    repo.setBanned(user.id, banned);
    if (banned) hooks.userRemoved(user.id);
    res.json({ ok: true, banned });
  });

  router.post('/admin/users/:id/password', requireSuperadmin, (req, res) => {
    const user = targetUser(req, res);
    if (!user) return;
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 6) return fail(res, 400, 'Le mot de passe doit faire au moins 6 caractères.');
    repo.setPassword(user.id, hashPassword(password));
    hooks.userRemoved(user.id);
    res.json({ ok: true });
  });

  router.delete('/admin/users/:id', requireSuperadmin, (req, res) => {
    const user = targetUser(req, res);
    if (!user) return;
    hooks.userRemoved(user.id);
    repo.deleteUser(user.id);
    hooks.themesChanged();
    res.json({ ok: true });
  });

  router.delete('/admin/rooms/:code', requireSuperadmin, (req, res) => {
    if (!hooks.closeRoom(String(req.params.code).toUpperCase())) return fail(res, 404, 'Room introuvable.');
    res.json({ ok: true });
  });

  // ---- avatars ------------------------------------------------------------------

  router.put('/me/avatar', requireUser, (req, res) => {
    const m = AVATAR_RE.exec(String(req.body?.dataUrl || ''));
    if (!m) return fail(res, 400, 'Image invalide (PNG, JPEG ou WebP).');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > AVATAR_MAX_BYTES) return fail(res, 413, 'Image trop lourde.');
    if (!looksLikeImage(bytes, m[1])) return fail(res, 400, 'Image invalide (PNG, JPEG ou WebP).');
    const avatar = repo.setAvatar(req.user.id, bytes, m[1]);
    hooks.avatarChanged(req.user.id, avatar);
    res.json({ avatar });
  });

  router.delete('/me/avatar', requireUser, (req, res) => {
    repo.setAvatar(req.user.id, null);
    hooks.avatarChanged(req.user.id, null);
    res.json({ avatar: null });
  });

  // Question images: resized in the browser, checked here, stored in the database.
  router.post('/images', requireUser, async (req, res) => {
    const m = AVATAR_RE.exec(String(req.body?.dataUrl || ''));
    if (!m) return fail(res, 400, 'Image invalide (PNG, JPEG ou WebP).');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > IMAGE_MAX_BYTES) return fail(res, 413, 'Image trop lourde.');
    if (!looksLikeImage(bytes, m[1])) return fail(res, 400, 'Image invalide (PNG, JPEG ou WebP).');
    if (imageStore.kind === 'database' && repo.imageUsage(req.user.id).total + bytes.length > IMAGE_QUOTA_BYTES) {
      return fail(res, 413, 'Quota d’images atteint.');
    }
    try {
      res.status(201).json({ url: await imageStore.save(req.user.id, bytes, m[1]) });
    } catch (err) {
      fail(res, 502, err.message);
    }
  });

  router.get('/images/:id', requireUser, (req, res) => {
    const img = repo.getImage(idParam(req));
    if (!img) return fail(res, 404, 'Image introuvable.');
    res.set({
      'Content-Type': img.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(img.bytes);
  });

  router.get('/avatars/:id', requireUser, (req, res) => {
    const img = repo.getAvatar(idParam(req));
    if (!img) return fail(res, 404, 'Pas de photo.');
    res.set({
      'Content-Type': img.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(img.bytes);
  });

  router.delete('/admin/users/:id/avatar', requireSuperadmin, (req, res) => {
    const user = repo.findUserById(idParam(req));
    if (!user) return fail(res, 404, 'Compte introuvable.');
    repo.setAvatar(user.id, null);
    hooks.avatarChanged(user.id, null);
    res.json({ ok: true });
  });

  // ---- misc ---------------------------------------------------------------------

  router.get('/users/search', requireUser, (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ users: [] });
    res.json({ users: repo.searchUsernames(q, 8).filter((u) => u.toLowerCase() !== req.user.username.toLowerCase()) });
  });

  return router;
}

module.exports = { themeAndAdminRoutes };
