const express = require('express');
const { sanitizeQuestion } = require('./questionTypes');
const { hashPassword } = require('./auth');
const { TERRITOIRE_RULES } = require('./db');
const {
  summarize, matchesSearch, sanitizeTheme, MAX_PENDING_PER_USER, DIFFICULTIES,
} = require('./themes');
const { questionTypes, SPECIAL_THEMES } = require('./selection');
const {
  toNeutronJson, toCsv, csvTemplate, parseImport,
} = require('./quizFormat');

/** Public origin of the request (Railway terminates HTTPS in front of the app). */
const originOf = (req) => `${String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]}://${req.get('host')}`;

/** Sends a quiz as a downloadable JSON or CSV file. */
function sendQuizFile(req, res, quiz) {
  const base = (quiz.name || 'quiz').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'quiz';
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`${base}.csv`);
    return res.send(toCsv(quiz, originOf(req)));
  }
  res.attachment(`${base}.neutron.json`);
  res.type('application/json');
  res.send(JSON.stringify(toNeutronJson(quiz, originOf(req)), null, 2));
}

const THEME_STATUSES = ['pending', 'approved', 'rejected'];
const AVATAR_MAX_BYTES = 150 * 1024;
const IMAGE_MAX_BYTES = 700 * 1024;
const IMAGE_QUOTA_BYTES = 200 * 1024 * 1024; // per account (images + music)
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'video/mp4', 'audio/ogg', 'audio/wav'];

/** Recognises the audio container from its first bytes (the declared type is not trusted). */
function sniffAudio(buf) {
  const ascii = (a, b) => buf.subarray(a, b).toString('latin1');
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4'; // MP4 / M4A (audio track played)
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  return null;
}
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

  router.get('/my-themes/:id/export', requireUser, (req, res) => {
    const theme = repo.getTheme(idParam(req), { withQuestions: true });
    if (!canEdit(req.user, theme)) return fail(res, 404, 'Thème introuvable.');
    sendQuizFile(req, res, theme);
  });

  // Import: parse a JSON / CSV / OpenQuizzDB file into a draft for the editor (nothing is saved here).
  router.post('/quiz-import', requireUser, (req, res) => {
    try {
      res.json(parseImport(req.body?.content, String(req.body?.fileName || ''), originOf(req)));
    } catch (err) {
      fail(res, 400, err.message);
    }
  });

  router.get('/quiz-template.csv', requireUser, (req, res) => {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('modele-quiz-neutron.csv');
    res.send(csvTemplate());
  });

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

  router.get('/admin/quiz/:key/export', requireSuperadmin, (req, res) => {
    const key = String(req.params.key);
    const m = /^c(\d+)$/.exec(key);
    const quiz = m ? repo.getTheme(Number(m[1]), { withQuestions: true }) : store.get(key);
    if (!quiz) return fail(res, 404, 'Quiz introuvable.');
    sendQuizFile(req, res, quiz);
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

  // ---- L'Empire de Jimmy (open to every player) ---------------------------------
  // The rules live in public/js/games/empire/logic.js (shared with the page); the server applies
  // them and keeps the only real copy of each empire.
  const empireRules = import('../public/js/games/empire/logic.js');
  /**
   * Loads an empire up to now: production, finished jobs, cargos arrived for it (their load
   * is added) and its own cargos back home.
   */
  /**
   * The Portail: contributions that arrived at the centre of the galaxy are added (points to their
   * sender), and every phase whose needs are met is finished (the surplus goes to the next one).
   */
  /** Empires that count for the Portail and the Nuée: the ones still played (not gone). */
  const playingEmpires = (E, now = Date.now()) => Math.max(1, repo.allEmpires()
    .filter((r) => { const e = E.normalizeEmpire(r.data); return e && E.activity(e, now) !== 'gone'; }).length);
  const settlePortal = (E, now = Date.now()) => {
    const portal = repo.getPortal();
    const players = playingEmpires(E, now);
    let changed = false;
    for (const f of repo.portalArrivals(now)) {
      for (const r of E.RES_KEYS) portal.progress[r] = (portal.progress[r] || 0) + (f.load[r] || 0);
      repo.addContrib(f.owner_id, portal.season, f.load, E.contributionPoints(f.load));
      repo.markDelivered(f.id);
      changed = true;
    }
    while (portal.phase < E.PORTAL.phases.length) {
      const needs = E.portalNeeds(portal.phase, players);
      if (!E.RES_KEYS.every((r) => (portal.progress[r] || 0) >= needs[r])) break;
      for (const r of E.RES_KEYS) portal.progress[r] -= needs[r];
      portal.phase += 1;
      if (portal.phase === E.PORTAL.phases.length) portal.openedAt = now;
      changed = true;
    }
    if (changed) repo.savePortal(portal);
    return { portal, players };
  };
  /**
   * La Nuée: guards that reached the Galactic Shield join it, then every wave due is resolved in
   * order (held: rewards delivered to each defender, a few guards lost; broken: production malus for
   * everybody, half the guards lost).
   */
  const settleSwarm = (E, now = Date.now()) => {
    const swarm = repo.getSwarm(now + E.SWARM.every);
    const season = repo.getPortal().season;
    let changed = false;
    const arrive = (until) => {
      for (const f of repo.guardArrivals(until)) {
        repo.addGuards(f.owner_id, season, f.cargos);
        repo.markDelivered(f.id);
        repo.markReturned(f.id);
      }
    };
    while (swarm.nextAt <= now) {
      arrive(swarm.nextAt);
      const at = swarm.nextAt;
      const players = playingEmpires(E, at);
      const r = E.resolveWave(swarm.wave, players, repo.aliveGuards(season));
      for (const [id, lost] of Object.entries(r.losses)) repo.loseGuards(Number(id), season, lost);
      for (const [id, load] of Object.entries(r.rewards)) {
        repo.addFleet({ ownerId: Number(id), destId: Number(id), load, cargos: 0, departsAt: at, arrivesAt: at, returnsAt: at, kind: 'reward' });
      }
      if (!r.won) { swarm.malusFrom = at; swarm.malusUntil = at + E.SWARM.malusFor; }
      swarm.last = { wave: r.wave, strength: r.strength, defense: r.defense, won: r.won, at, defenders: Object.keys(r.losses).length };
      swarm.wave += 1;
      swarm.nextAt += E.SWARM.every;
      changed = true;
    }
    arrive(now);
    if (changed) repo.saveSwarm(swarm);
    return { swarm, season };
  };
  const loadEmpire = (E, userId, now = Date.now()) => {
    const e = E.normalizeEmpire(repo.getEmpire(userId));
    if (!e) return null;
    e.portal = settlePortal(E, now).portal.phase;
    const { swarm } = settleSwarm(E, now);
    // Production is cut while the malus of a lost wave lasts (only for that stretch of time).
    const done = [];
    if (swarm.malusUntil && swarm.malusUntil > e.lastTick && swarm.malusFrom < now) {
      e.swarmMalus = false;
      if (swarm.malusFrom > e.lastTick) done.push(...E.advance(e, swarm.malusFrom));
      e.swarmMalus = true;
      done.push(...E.advance(e, Math.min(now, swarm.malusUntil)));
    }
    e.swarmMalus = Boolean(swarm.malusUntil && swarm.malusFrom <= now && now < swarm.malusUntil);
    done.push(...E.advance(e, now));
    for (const f of repo.fleetsToDeliver(userId, now)) {
      for (const r of E.RES_KEYS) e.res[r] += f.load[r] || 0;
      repo.markDelivered(f.id);
    }
    for (const f of repo.fleetsBack(userId, now)) {
      if (f.kind === 'expedition') { E.expeditionBack(e, f.meta, f.returns_at); repo.markDelivered(f.id); } else e.ships.cargo += f.cargos;
      repo.markReturned(f.id);
    }
    e.done = done;
    return e;
  };
  const saveEmpire = (userId, e) => { const { done, ...data } = e; repo.putEmpire(userId, data); };
  // Every empire request runs in a transaction: it loads the player's empire (settling what
  // happened since), lets the handler act, and saves it.
  const withEmpire = (handler) => async (req, res) => {
    const E = await empireRules;
    try {
      const out = repo.transaction(() => {
        const e = loadEmpire(E, req.user.id);
        if (e) e.seenAt = Date.now(); // the player is here (see E.activity)
        const result = handler(E, e, req) || {};
        const final = result.empire === undefined ? e : result.empire;
        if (final) saveEmpire(req.user.id, final);
        return { empire: final, done: e?.done || [], extra: result.extra };
      });
      const { done, ...empire } = out.empire || {};
      res.json({ empire: out.empire ? empire : null, now: Date.now(), done: out.done, ...out.extra });
    } catch (err) {
      fail(res, 400, err.message);
    }
  };
  const needEmpire = (e) => { if (!e) throw new Error('Pas encore de planète.'); };
  router.get('/empire', requireUser, withEmpire(() => ({})));
  router.post('/empire/start', requireUser, withEmpire((E, e, req) => {
    if (e) throw new Error('Tu as déjà une planète.');
    return { empire: E.newEmpire() };
  }));
  router.post('/empire/build', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    E.startBuilding(e, Math.floor(Number(req.body?.planet) || 0), String(req.body?.key || ''));
    return { empire: e };
  }));
  router.post('/empire/pause', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    E.toggleMine(e, Math.floor(Number(req.body?.planet) || 0), String(req.body?.key || ''));
    return { empire: e };
  }));
  router.post('/empire/research', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    E.startResearch(e, String(req.body?.key || ''));
    return { empire: e };
  }));
  router.post('/empire/cancel', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const kind = ['research', 'ship'].includes(req.body?.kind) ? req.body.kind : 'building';
    const at = Number(req.body?.at);
    if (!E.cancel(e, kind, Math.floor(Number(req.body?.planet) || 0), Number.isFinite(at) && at > 0 ? at : null)) throw new Error('Rien à annuler.');
    return { empire: e };
  }));
  router.post('/empire/butch', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    E.butchBuy(e, req.body?.amount);
    return { empire: e };
  }));
  router.post('/empire/ships', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    E.startShips(e, Math.floor(Number(req.body?.planet) || 0), String(req.body?.key || ''), req.body?.count);
    return { empire: e };
  }));

  // Galaxy: every empire, where it is and what its planets produce (to know who to trade with).
  router.get('/empire/galaxy', requireUser, async (req, res) => {
    const E = await empireRules;
    const now = Date.now();
    const empires = repo.allEmpires().map((r) => {
      const e = E.normalizeEmpire(r.data);
      const me = r.userId === req.user.id;
      if (!e) return null;
      const status = E.activity(e, now);
      if (status === 'gone' && !me) return null; // started but doesn't play: off the map
      return {
        username: r.username, avatar: r.avatar, frame: r.frame, me, coords: e.coords, points: E.empirePoints(e),
        status, seenAt: E.seenAt(e),
        planets: e.planets.map((p) => ({ name: p.name, look: p.look, rates: p.rates })),
      };
    }).filter(Boolean);
    res.json({ empires });
  });

  // Sending resources to another player with cargos (flight there, then the cargos come back).
  router.post('/empire/send', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const dest = repo.findUserByName(String(req.body?.to || ''));
    if (!dest || dest.id === req.user.id) throw new Error('Destinataire inconnu.');
    const other = E.normalizeEmpire(repo.getEmpire(dest.id));
    if (!other) throw new Error('Ce joueur n’a pas encore d’empire.');
    if (E.activity(other) === 'gone') throw new Error('Ce joueur ne joue plus depuis longtemps.');
    const { load, cargos } = E.prepareShipment(e, req.body?.load);
    const now = Date.now();
    const flight = E.flightTime(e, other.coords);
    repo.addFleet({ ownerId: req.user.id, destId: dest.id, load, cargos, departsAt: now, arrivesAt: now + flight, returnsAt: now + 2 * flight });
    return { empire: e, extra: { flight } };
  }));
  router.get('/empire/fleets', requireUser, (req, res) => res.json({ fleets: repo.myFleets(req.user.id), now: Date.now() }));

  // Market: offers « X of a resource for Y of another »; the offered part is held until taken or cancelled.
  router.get('/empire/market', requireUser, async (req, res) => {
    const E = await empireRules;
    const now = Date.now();
    const all = new Map(repo.allEmpires().map((r) => [r.userId, E.normalizeEmpire(r.data)]));
    // Offers of players who left are withdrawn: their deposit waits for them in their fleets.
    repo.transaction(() => {
      for (const o of repo.openOffers()) {
        const seller = all.get(o.sellerId);
        if (seller && E.activity(seller, now) !== 'gone') continue;
        if (!repo.closeOffer(o.id, null, true)) continue;
        repo.addFleet({ ownerId: o.sellerId, destId: o.sellerId, load: { [o.give]: o.giveAmount }, cargos: 0, departsAt: now, arrivesAt: now, returnsAt: now, kind: 'refund' });
      }
    });
    const coords = new Map([...all].map(([id, e]) => [id, e?.coords]));
    res.json({ offers: repo.openOffers().map((o) => ({ ...o, mine: o.sellerId === req.user.id, coords: coords.get(o.sellerId) || null })), trades: repo.recentTrades() });
  });
  router.post('/empire/market', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    if (repo.countOpenOffers(req.user.id) >= E.MARKET.maxOffers) throw new Error(`Au plus ${E.MARKET.maxOffers} offres à la fois.`);
    const o = E.prepareOffer(e, req.body?.give, req.body?.giveAmount, req.body?.want, req.body?.wantAmount);
    repo.addOffer({ sellerId: req.user.id, ...o });
    return { empire: e };
  }));
  router.post('/empire/market/:id/accept', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const o = repo.offer(Number(req.params.id));
    if (!o || o.closed_at) throw new Error('Cette offre n’est plus disponible.');
    if (o.seller_id === req.user.id) throw new Error('C’est ta propre offre.');
    if (e.res[o.want] < o.want_amount) throw new Error(`Il te faut ${o.want_amount} ${E.RESOURCES[o.want].name.toLowerCase()}.`);
    const seller = E.normalizeEmpire(repo.getEmpire(o.seller_id));
    if (!seller) throw new Error('Le vendeur n’a plus d’empire.');
    // The goods travel: each side receives the other's part after the flight between the two empires.
    e.res[o.want] -= o.want_amount;
    const now = Date.now();
    const flight = E.flightTime(e, seller.coords);
    const trip = { departsAt: now, arrivesAt: now + flight, returnsAt: now + flight, cargos: 0, kind: 'market' };
    repo.addFleet({ ...trip, ownerId: o.seller_id, destId: req.user.id, load: { [o.give]: o.give_amount } });
    repo.addFleet({ ...trip, ownerId: req.user.id, destId: o.seller_id, load: { [o.want]: o.want_amount } });
    repo.closeOffer(o.id, req.user.id, false);
    return { empire: e, extra: { flight } };
  }));
  router.post('/empire/market/:id/cancel', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const o = repo.offer(Number(req.params.id));
    if (!o || o.closed_at || o.seller_id !== req.user.id) throw new Error('Offre introuvable.');
    e.res[o.give] += o.give_amount;
    repo.closeOffer(o.id, null, true);
    return { empire: e };
  }));

  // The Portail de Jimmy: state, top contributors, and contributions sent by cargo to the centre.
  router.get('/empire/portal', requireUser, async (req, res) => {
    const E = await empireRules;
    const out = repo.transaction(() => settlePortal(E));
    const { portal, players } = out;
    const inFlight = Object.fromEntries(E.RES_KEYS.map((r) => [r, 0]));
    for (const load of repo.portalInFlight()) for (const r of E.RES_KEYS) inFlight[r] += load[r] || 0;
    const top = repo.topContrib(portal.season, 20);
    res.json({
      ...portal, players, inFlight, top,
      needs: portal.phase < E.PORTAL.phases.length ? E.portalNeeds(portal.phase, players) : null,
      mine: top.find((c) => c.userId === req.user.id) || null,
    });
  });
  router.post('/empire/portal/contribute', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const { portal } = settlePortal(E);
    if (portal.phase >= E.PORTAL.phases.length) throw new Error('Le Portail est déjà ouvert !');
    const { load, cargos } = E.prepareShipment(e, req.body?.load);
    const now = Date.now();
    const flight = E.flightTime(e, E.PORTAL.coords);
    repo.addFleet({ ownerId: req.user.id, destId: req.user.id, load, cargos, departsAt: now, arrivesAt: now + flight, returnsAt: now + 2 * flight, kind: 'portal' });
    return { empire: e, extra: { flight } };
  }));

  // La Nuée: next wave, the Galactic Shield, defenders; guards engaged by flying to the centre.
  router.get('/empire/swarm', requireUser, async (req, res) => {
    const E = await empireRules;
    const now = Date.now();
    const { swarm, season } = repo.transaction(() => settleSwarm(E, now));
    const players = playingEmpires(E, now);
    const guards = repo.aliveGuards(season);
    const top = repo.topGuards(season, 20);
    res.json({
      wave: swarm.wave, nextAt: swarm.nextAt, last: swarm.last, season, players, now,
      strength: E.swarmStrength(swarm.wave, players),
      defense: Object.values(guards).reduce((a, b) => a + b, 0),
      reward: E.swarmReward(swarm.wave, 1),
      malusUntil: swarm.malusUntil && swarm.malusUntil > now ? swarm.malusUntil : null,
      mine: { alive: guards[req.user.id] || 0, inFlight: repo.guardsInFlight(req.user.id), ...(top.find((g) => g.userId === req.user.id) || {}) },
      top,
    });
  });
  router.post('/empire/swarm/engage', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const count = E.prepareGuards(e, req.body?.count);
    const now = Date.now();
    const flight = E.flightTime(e, E.PORTAL.coords);
    repo.addFleet({ ownerId: req.user.id, destId: req.user.id, load: {}, cargos: count, departsAt: now, arrivesAt: now + flight, returnsAt: now + flight, kind: 'guard' });
    return { empire: e, extra: { flight } };
  }));
  // SuperAdmin only (tests): the next wave hits now.
  router.post('/empire/swarm/now', requireSuperadmin, async (req, res) => {
    const E = await empireRules;
    const now = Date.now();
    const { swarm } = repo.transaction(() => {
      repo.saveSwarm({ ...repo.getSwarm(now), nextAt: now });
      return settleSwarm(E, now);
    });
    res.json({ last: swarm.last });
  });

  // Expeditions: explorers (and an escort) leave; their fate is drawn now and told when they are back.
  router.post('/empire/expedition', requireUser, withEmpire((E, e, req) => {
    needEmpire(e);
    const trip = E.prepareExpedition(e, req.body?.explorers, req.body?.guards, req.body?.hours, repo.activeExpeditions(req.user.id));
    trip.outcome = E.expeditionOutcome(Math.random, { ...trip, astro: e.research.astrophysics }, e);
    const now = Date.now();
    const back = now + trip.hours * 3600e3 + trip.outcome.delay;
    repo.addFleet({ ownerId: req.user.id, destId: req.user.id, load: {}, cargos: trip.explorers, departsAt: now, arrivesAt: back, returnsAt: back, kind: 'expedition', meta: trip });
    return { empire: e, extra: { back } };
  }));

  router.post('/empire/colonize', requireUser, withEmpire((E, e) => {
    needEmpire(e);
    const planet = E.colonize(e);
    return { empire: e, extra: { planet } };
  }));

  // ---- Le Poker de Butch (the server deals: the player only chooses) ----
  const pokerRules = import('../public/js/games/poker/logic.js');
  const pokerPlayer = (P, userId) => repo.getCasino('poker', userId) || { coins: P.START_COINS, best: 0, hands: 0, wins: 0, busts: 0, runs: 0, left: P.RUN_HANDS, state: null };
  /** What the page may see: its cards, and Butch's only once the hand is over. */
  const pokerView = (p, extra = {}) => {
    const s = p.state;
    return {
      coins: p.coins, best: p.best, hands: p.hands, wins: p.wins, runs: p.runs, left: p.left, over: p.left < 1 || (p.coins < 1 && s?.phase !== 'draw'),
      hand: s && { player: s.player, bet: s.bet, phase: s.phase, ...(s.phase === 'done' ? { dealer: s.dealer, dealerHold: s.dealerHold, result: s.result, won: s.won } : {}) },
      ...extra,
    };
  };
  const withPoker = (handler) => async (req, res) => {
    const P = await pokerRules;
    try {
      const out = repo.transaction(() => {
        const p = pokerPlayer(P, req.user.id);
        const extra = handler(P, p, req) || {};
        repo.putCasino('poker', req.user.id, p);
        return pokerView(p, extra);
      });
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  };
  router.get('/poker', requireUser, withPoker(() => ({})));
  router.get('/poker/top', requireUser, (req, res) => res.json({ players: repo.casinoTop('poker', 20) }));
  // A new hand: 1 coin to play.
  router.post('/poker/deal', requireUser, withPoker((P, p) => {
    if (p.state?.phase === 'draw') throw new Error('Une main est déjà en cours.');
    if (p.left < 1 || p.coins < 1) throw new Error('Partie terminée : recommence une partie.');
    const deck = P.newDeck();
    p.coins -= 1;
    p.state = { phase: 'draw', bet: 1, deck, player: deck.splice(0, P.HAND_SIZE), dealer: deck.splice(0, P.HAND_SIZE) };
  }));
  // Raise the bet after seeing the cards (up to 5 coins in all).
  router.post('/poker/raise', requireUser, withPoker((P, p) => {
    if (p.state?.phase !== 'draw') throw new Error('Pas de main en cours.');
    if (p.state.bet >= P.MAX_BET) throw new Error(`Mise maximum : ${P.MAX_BET}.`);
    if (p.coins < 1) throw new Error('Plus de pièces à miser.');
    p.coins -= 1;
    p.state.bet += 1;
  }));
  // Swap the cards not held; Butch swaps his; the best hand wins.
  router.post('/poker/draw', requireUser, withPoker((P, p, req) => {
    const s = p.state;
    if (s?.phase !== 'draw') throw new Error('Pas de main en cours.');
    const hold = Array.from({ length: P.HAND_SIZE }, (_, i) => Boolean(req.body?.hold?.[i]));
    s.player = P.swap(s.player, hold, s.deck);
    s.dealerHold = P.dealerHold(s.dealer);
    s.dealer = P.swap(s.dealer, s.dealerHold, s.deck);
    const result = P.compare(s.player, s.dealer);
    const mine = P.evaluate(s.player);
    const back = P.payout(s.bet, result, mine);
    p.coins += back;
    p.hands += 1;
    p.left -= 1;
    if (result > 0) p.wins += 1;
    // End of the game (last hand, or no coin left): its score counts for the Top.
    if (p.left < 1 || p.coins < 1) {
      p.runs += 1;
      if (p.coins < 1) p.busts += 1;
      p.best = Math.max(p.best, p.coins);
      s.final = true;
    }
    s.won = back - s.bet; // net gain of the hand
    s.result = { outcome: result > 0 ? 'win' : result < 0 ? 'lose' : 'draw', mine: mine.key, his: P.evaluate(s.dealer).key };
    s.phase = 'done';
    delete s.deck;
  }));
  // A new game: 10 coins, 30 hands (the record stays).
  router.post('/poker/restart', requireUser, withPoker((P, p) => {
    if (p.state?.phase === 'draw') throw new Error('Une main est en cours.');
    if (p.left > 0 && p.coins > 0 && p.left < P.RUN_HANDS) {
      // Giving up a game in progress: it counts as played (so a bad start can't just be thrown away for free).
      p.runs += 1;
      p.best = Math.max(p.best, p.coins);
    }
    p.coins = P.START_COINS;
    p.left = P.RUN_HANDS;
    p.state = null;
  }));

  // ---- Blackjack du Casino Spatial (the server deals; Butch's hidden card stays on the server) ----
  const blackjackRules = import('../public/js/games/blackjack/logic.js');
  const bjPlayer = (B, userId) => repo.getCasino('blackjack', userId) || { coins: B.START_COINS, best: 0, hands: 0, wins: 0, busts: 0, runs: 0, left: B.RUN_HANDS, state: null };
  const bjView = (B, p) => {
    const s = p.state;
    const done = s?.phase === 'done';
    return {
      coins: p.coins, best: p.best, hands: p.hands, wins: p.wins, runs: p.runs, left: p.left, over: p.left < 1 || (p.coins < B.BETS[0] && s?.phase !== 'play'),
      hand: s && {
        phase: s.phase, bet: s.bet, player: s.player, doubled: Boolean(s.doubled),
        dealer: done ? s.dealer : [s.dealer[0]], // the hole card only once the hand is over
        ...(done ? { outcome: s.outcome, won: s.won } : {}),
      },
    };
  };
  /** Butch plays (unless the player is bust), then the hand is settled and the game may end. */
  const bjFinish = (B, p) => {
    const s = p.state;
    if (!B.isBust(s.player) && !B.isBlackjack(s.player)) B.dealerPlay(s.dealer, s.shoe);
    const { outcome, back } = B.settle(s.player, s.dealer, s.bet);
    p.coins += back;
    p.hands += 1;
    p.left -= 1;
    if (back > s.bet) p.wins += 1;
    s.outcome = outcome;
    s.won = back - s.bet;
    s.phase = 'done';
    delete s.shoe;
    if (p.left < 1 || p.coins < B.BETS[0]) {
      p.runs += 1;
      if (p.coins < B.BETS[0]) p.busts += 1;
      p.best = Math.max(p.best, p.coins);
    }
  };
  const withBlackjack = (handler) => async (req, res) => {
    const B = await blackjackRules;
    try {
      const out = repo.transaction(() => {
        const p = bjPlayer(B, req.user.id);
        handler(B, p, req);
        repo.putCasino('blackjack', req.user.id, p);
        return bjView(B, p);
      });
      res.json(out);
    } catch (err) {
      fail(res, 400, err.message);
    }
  };
  const bjPlaying = (p) => { if (p.state?.phase !== 'play') throw new Error('Pas de main en cours.'); };
  router.get('/blackjack', requireUser, withBlackjack(() => {}));
  router.get('/blackjack/top', requireUser, (req, res) => res.json({ players: repo.casinoTop('blackjack', 20) }));
  router.post('/blackjack/deal', requireUser, withBlackjack((B, p, req) => {
    if (p.state?.phase === 'play') throw new Error('Une main est déjà en cours.');
    if (p.left < 1 || p.coins < B.BETS[0]) throw new Error('Partie terminée : recommence une partie.');
    const bet = Number(req.body?.bet);
    if (!B.BETS.includes(bet)) throw new Error('Mise invalide.');
    if (p.coins < bet) throw new Error('Pas assez de pièces pour cette mise.');
    const shoe = B.newShoe();
    p.coins -= bet;
    p.state = { phase: 'play', bet, shoe, player: [shoe.shift(), shoe.shift()], dealer: [shoe.shift(), shoe.shift()] };
    // A blackjack (either side) ends the hand at once.
    if (B.isBlackjack(p.state.player) || B.isBlackjack(p.state.dealer)) bjFinish(B, p);
  }));
  router.post('/blackjack/hit', requireUser, withBlackjack((B, p) => {
    bjPlaying(p);
    p.state.player.push(p.state.shoe.shift());
    if (B.handValue(p.state.player).total >= 21) bjFinish(B, p);
  }));
  router.post('/blackjack/stand', requireUser, withBlackjack((B, p) => {
    bjPlaying(p);
    bjFinish(B, p);
  }));
  // Double: only on the first two cards; the bet ×2, one card, then Butch plays.
  router.post('/blackjack/double', requireUser, withBlackjack((B, p) => {
    bjPlaying(p);
    if (p.state.player.length !== 2) throw new Error('On ne double que sur les deux premières cartes.');
    if (p.coins < p.state.bet) throw new Error('Pas assez de pièces pour doubler.');
    p.coins -= p.state.bet;
    p.state.bet *= 2;
    p.state.doubled = true;
    p.state.player.push(p.state.shoe.shift());
    bjFinish(B, p);
  }));
  router.post('/blackjack/restart', requireUser, withBlackjack((B, p) => {
    if (p.state?.phase === 'play') throw new Error('Une main est en cours.');
    if (p.left > 0 && p.coins >= B.BETS[0] && p.left < B.RUN_HANDS) {
      p.runs += 1; // giving up counts, with the coins of the moment
      p.best = Math.max(p.best, p.coins);
    }
    p.coins = B.START_COINS;
    p.left = B.RUN_HANDS;
    p.state = null;
  }));

  // ---- profile frames ----
  router.get('/me/frames', requireUser, (req, res) => {
    res.json({ frames: repo.userFrames(req.user.id), selected: req.user.frame || null });
  });
  router.put('/me/frame', requireUser, (req, res) => {
    const frame = req.body?.frame ? String(req.body.frame).slice(0, 40) : null;
    if (!repo.setFrame(req.user.id, frame)) return fail(res, 403, 'Tu n’as pas ce cadre.');
    hooks.frameChanged?.(req.user.id, frame);
    res.json({ frame });
  });
  // SuperAdmin: award a frame (end of a season).
  router.post('/admin/users/:id/frames', requireSuperadmin, (req, res) => {
    const frame = String(req.body?.frame || '').slice(0, 40);
    if (!/^[a-z0-9-]+$/.test(frame)) return fail(res, 400, 'Cadre invalide.');
    repo.awardFrame(Number(req.params.id), frame, Math.max(0, Math.floor(Number(req.body?.season) || 0)), String(req.body?.label || '').slice(0, 80));
    res.json({ ok: true });
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

  // Quiz music: sent as the raw file body (too big for JSON), up to 15 MB.
  router.post('/audio', requireUser, express.raw({ type: () => true, limit: AUDIO_MAX_BYTES }), async (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!bytes.length) return fail(res, 400, 'Fichier vide.');
    const type = sniffAudio(bytes);
    if (!type || !AUDIO_TYPES.includes(type)) return fail(res, 400, 'Format audio non reconnu (MP3, MP4/M4A, OGG ou WAV).');
    if (imageStore.kind === 'database' && repo.imageUsage(req.user.id).total + bytes.length > IMAGE_QUOTA_BYTES) {
      return fail(res, 413, 'Quota de fichiers atteint.');
    }
    try {
      res.status(201).json({ url: await imageStore.save(req.user.id, bytes, type) });
    } catch (err) {
      fail(res, 502, err.message);
    }
  });

  // Stored files (images and music). Supports byte ranges: Safari needs them to play audio.
  router.get('/images/:id', requireUser, (req, res) => {
    const file = repo.getImage(idParam(req));
    if (!file) return fail(res, 404, 'Fichier introuvable.');
    res.set({
      'Content-Type': file.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Accept-Ranges': 'bytes',
    });
    const total = file.bytes.length;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (!m || (!m[1] && !m[2])) return res.send(file.bytes);
    let start = m[1] ? Number(m[1]) : total - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end || start >= total) {
      res.set('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${total}`);
    res.send(file.bytes.subarray(start, end + 1));
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

  // SuperAdmin: repair a cheated arcade save (prestige put back to a value).
  router.post('/admin/users/:id/arcade/:game/prestige', requireSuperadmin, (req, res) => {
    const user = targetUser(req, res);
    if (!user) return;
    const game = arcadeGame(req, res);
    if (!game) return;
    const prestige = Math.floor(Number(req.body?.prestige));
    if (!(prestige >= 0 && prestige <= 100000)) return fail(res, 400, 'Prestige invalide.');
    const extra = {};
    for (const k of ['stars', 'pp']) {
      if (req.body?.[k] === undefined || req.body[k] === '') continue;
      const v = Math.floor(Number(req.body[k]));
      if (!(v >= 0)) return fail(res, 400, 'Valeur invalide.');
      extra[k] = v;
    }
    if (!repo.setArcadePrestige(user.id, game, prestige, extra)) return fail(res, 404, 'Pas de sauvegarde.');
    res.json({ ok: true });
  });
  // SuperAdmin: every arcade game of a player (to spot and repair a cheat), and resetting one.
  router.get('/admin/users/:id/arcade', requireSuperadmin, (req, res) => {
    const id = idParam(req);
    const games = {};
    for (const game of ARCADE_GAMES) {
      const s = repo.getArcadeSave(id, game);
      games[game] = s && {
        score: s.score, updatedAt: s.updatedAt,
        ...(game === 'blast' ? { prestige: s.data.prestige || 0, stars: Math.floor(s.data.stars || 0), pp: Math.floor(s.data.pp || 0), maxStage: s.data.maxStage || 0,
          achPoints: Math.floor(s.data.achPoints || 0), playTime: s.data.stats?.playTime || 0, planets: s.data.stats?.bosses || 0, starsFound: s.data.stats?.starsFound || 0 } : {}),
        ...(game === 'territoire' ? { best: s.data.best || 0, bestLevel: s.data.bestLevel || 0, games: s.data.games || 0 } : {}),
      };
    }
    res.json({ games });
  });
  router.delete('/admin/users/:id/arcade/:game', requireSuperadmin, (req, res) => {
    const user = targetUser(req, res);
    if (!user) return;
    const game = arcadeGame(req, res);
    if (!game) return;
    repo.deleteArcadeSave(user.id, game);
    res.json({ ok: true });
  });
  router.get('/admin/users/:id/arcade/:game', requireSuperadmin, (req, res) => {
    const game = arcadeGame(req, res);
    if (!game) return;
    const save = repo.getArcadeSave(idParam(req), game);
    res.json({ prestige: save?.data?.prestige ?? null, stars: save?.data?.stars ?? null, maxStage: save?.data?.maxStage ?? null });
  });
  // SuperAdmin: objectives of a cheated save wiped (points back to 0; the real ones come back at the capped pace).
  router.post('/admin/users/:id/arcade/:game/ach-reset', requireSuperadmin, (req, res) => {
    const user = targetUser(req, res);
    if (!user) return;
    const game = arcadeGame(req, res);
    if (!game) return;
    if (!repo.resetArcadeAch(user.id, game)) return fail(res, 404, 'Pas de sauvegarde.');
    res.json({ ok: true });
  });

  router.delete('/admin/users/:id/avatar', requireSuperadmin, (req, res) => {
    const user = repo.findUserById(idParam(req));
    if (!user) return fail(res, 404, 'Compte introuvable.');
    repo.setAvatar(user.id, null);
    hooks.avatarChanged(user.id, null);
    res.json({ ok: true });
  });

  // ---- arcade games -----------------------------------------------------------------
  // Games run in the browser; the server only keeps each account's save and a leaderboard.

  const ARCADE_GAMES = ['blast', 'territoire'];
  const ARCADE_SAVE_MAX = 64 * 1024;
  /** A save as the page sees it: without the server's reserves. */
  const publicSave = (save) => {
    if (!save) return save;
    const { margins, ...rest } = save;
    return rest;
  };
  const BLAST_PRESTIGE_GAP = 20 * 1000; // a run takes at least that long
  const TERRITOIRE_SECS_PER_PLANET = 8; // a planet can't be conquered faster
  const arcadeGame = (req, res) => {
    if (ARCADE_GAMES.includes(req.params.game)) return req.params.game;
    fail(res, 404, 'Jeu inconnu.');
    return null;
  };

  router.get('/arcade/:game/save', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (game) res.json({ save: publicSave(repo.getArcadeSave(req.user.id, game)) });
  });

  router.put('/arcade/:game/save', requireUser, async (req, res) => {
    const game = arcadeGame(req, res);
    if (!game) return;
    const { data } = req.body || {};
    const score = Number(req.body?.score);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'Sauvegarde invalide.');
    if (JSON.stringify(data).length > ARCADE_SAVE_MAX) return fail(res, 413, 'Sauvegarde trop lourde.');
    if (!Number.isFinite(score) || score < 0) return fail(res, 400, 'Score invalide.');
    const device = typeof req.body.device === 'string' ? req.body.device.slice(0, 40) : null;
    const basedOn = Number.isFinite(Number(req.body.basedOn)) && req.body.basedOn !== null ? Number(req.body.basedOn) : undefined;
    if (game === 'territoire') data.v = TERRITOIRE_RULES; // rules the record was made with
    const L = game === 'blast' ? await blastLogic : null;
    const reserves = {}; // filled by the check, kept by the store when the save goes through
    const check = SAVE_CHECKS[game] && ((cur, d, sc) => SAVE_CHECKS[game](cur, d, sc, L, reserves));
    const result = repo.putArcadeSave(req.user.id, game, data, score, { device, basedOn, check, margins: () => (Object.keys(reserves).length ? reserves : null) });
    if (result.conflict) result.conflict = publicSave(result.conflict);
    if (result.rejected) {
      console.warn(`[arcade] save refused for ${req.user.username} (${game}): ${result.rejected}`);
      return res.status(409).json({ error: 'Sauvegarde refusée : elle ne correspond pas à ta partie.', rejected: result.rejected, save: result.conflict });
    }
    if (result.conflict) return res.status(409).json({ error: 'La partie a avancé sur un autre appareil.', save: result.conflict });
    res.json(result);
  });

  /**
   * What a save may gain since the last one the server kept. The game runs in the browser, so
   * the server can't replay it, but it refuses what is impossible: more than one prestige at a
   * time, two prestiges too close together, or a record / stars / prestige points out of reach.
   */
  // Blast rules shared with the browser (ES module): the server recomputes the objectives with them.
  const blastLogic = import('../public/js/games/blast/logic.js');
  // Objectives that hold only for a moment (a ship owned, ascensions of the current run): taken as sent.
  const BLAST_MOMENT_ACH = new Set(['cuirasse', 'neutron', 'armada', 'asc1', 'asc10']);
  // Lifetime stats that grow with play time: base + per second since the last save kept.
  const BLAST_STAT_LIMITS = { playTime: [600, 1.05], starsFound: [100, 5], bosses: [50, 0.5], sectors: [500, 2], boosts: [50, 1] };
  const BLAST_ACH_RATE = 0.25; // objective points a save may gain per second (1 legendary / 400 s)
  // The margins of a save grow with the real time since the last one, not with the number of saves:
  // the fixed part is reached after this many seconds, so ten saves in a second get together what one
  // save gets after a second (sending many small steps in a row no longer adds up).
  const BLAST_BUDGET_WINDOW = 120;

  let territoireRules = null; // loaded once (ES module), used by the Territoire check
  import('../public/js/games/territoire/logic.js').then((m) => { territoireRules = m; });
  const SAVE_CHECKS = {
    /**
     * Territoire: every game starts at planet 1 and a planet takes time, so a new record needs
     * the time since the last save; and a score can't be more than all the planets reached,
     * each with every cell and every asteroid at the best.
     */
    territoire(cur, data, score) {
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      if (score <= num(cur?.score)) return null;
      const level = Math.floor(num(data.bestLevel));
      if (num(data.best) !== score) return 'record et score différents';
      if (level < 1 || level > 500) return `planète ${level}`;
      const secs = cur ? (Date.now() - cur.updatedAt) / 1000 : Infinity;
      if (level * TERRITOIRE_SECS_PER_PLANET > secs || (!cur && level > 15)) return `planète ${level} trop vite`;
      if (territoireRules) {
        let max = 0;
        for (let l = 1; l <= level; l++) max += territoireRules.maxPlanetScore(l);
        if (score > max) return `score ${score} pour ${level} planète(s)`;
      }
      return null;
    },
    blast(cur, data, score, L, reserves = {}) {
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const prev = cur?.data || {};
      const p0 = Math.floor(num(prev.prestige));
      const p = Math.floor(num(data.prestige));
      const now = Date.now();
      const secs = cur ? Math.max(0, (now - cur.updatedAt) / 1000) : 0;
      /**
       * Reserves: what a value may gain at once is a reserve kept by the server. It refills with the
       * real time (full after the window) and each save spends what it gained beyond a steady income
       * (`perSec`). A player's bursts (goals claimed together, a big run) go through; sending many small
       * steps in a row only empties it, then gets the refill of the time spent, whatever their number.
       */
      const level = (key, cap) => (cur ? Math.min(cap, (cur.margins?.[key] ?? cap) + (cap / BLAST_BUDGET_WINDOW) * secs) : cap);
      const room = (key, cap, perSec) => level(key, cap) + perSec * secs;
      const spend = (key, cap, perSec, gained) => {
        const extra = Math.max(0, gained - perSec * secs);
        reserves[key] = Math.max(0, level(key, cap) - extra);
        return extra <= level(key, cap);
      };
      // Big Bang: a new universe (prestiges back to 0) once sector 500 is reached; an older universe is
      // left to the store, which keeps the newer one.
      const b0 = Math.floor(num(prev.bigBangs));
      const b = Math.floor(num(data.bigBangs));
      if (b < b0) return null;
      if (b > b0 + 1) return `big bang ${b0} → ${b}`;
      const bang = b === b0 + 1;
      if (bang) {
        if (L.universeBest(L.normalizeSave(prev)) + room('stage', 150, 2) < L.bigBangSector(b0)) return `big bang avant le secteur ${L.bigBangSector(b0)}`;
        if (p > 1) return `prestige ${p} après un big bang`;
        if (cur && now - (cur.prestigeAt || 0) < BLAST_PRESTIGE_GAP) return 'big bang trop rapproché';
      } else {
        if (p > p0 + 1) return `prestige ${p0} → ${p}`;
        if (cur && p === p0 + 1 && now - (cur.prestigeAt || 0) < BLAST_PRESTIGE_GAP) return `prestiges trop rapprochés (${p})`;
        // A prestige needs its sector: the run of the last save must have been able to get there since.
        if (cur && p === p0 + 1) {
          const before = L.normalizeSave(prev);
          if (before.runBest + room('stage', 150, 2) < L.prestigeSector(before)) return `prestige avant le secteur ${L.prestigeSector(before)} (partie au ${before.runBest})`;
        }
        // The rising prestige sector only goes back down with a new record of the universe.
        if (num(data.stall) < num(prev.stall) && num(data.universeBest) <= num(prev.universeBest)) return `barre de prestige ${num(prev.stall)} → ${num(data.stall)}`;
      }
      const stage = Math.max(num(score), num(data.maxStage));
      if (!spend('stage', 150, 2, stage - Math.max(num(cur?.score), num(prev.maxStage)))) return `record ${num(prev.maxStage)} → ${stage}`;
      // Second-degree stars: the one-time catch-up for the past prestiges comes on top.
      const catchUp = data.starsV2 && !prev.starsV2 ? L.retroStars(L.normalizeSave({ ...data, starsV2: true })) : 0;
      // A prestige pays its stars and points at once (prestiges are limited on their own: the gap, the sector).
      const prestiged = !bang && p === p0 + 1;
      if (!spend('stars', 3000 + 300 * p, 5, num(data.stars) - num(prev.stars) - catchUp - (prestiged ? 3000 + 300 * p : 0))) return `étoiles ${num(prev.stars)} → ${num(data.stars)}`;
      if (!spend('pp', 1000 + 100 * p, 1, num(data.pp) - num(prev.pp) - (prestiged ? 1000 + 100 * p : 0))) return `points de prestige ${num(prev.pp)} → ${num(data.pp)}`;
      const stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
      for (const [k, [base, perSec]] of Object.entries(BLAST_STAT_LIMITS)) {
        if (!spend(`stat:${k}`, base, perSec, num(stats[k]) - num(prev.stats?.[k]))) return `${k} ${num(prev.stats?.[k])} → ${num(stats[k])}`;
      }
      const s = L.normalizeSave(data);
      // Dark matter: 1 per Big Bang, spent or not.
      if (L.dmSpent(s.dmShop) + s.dm > s.bigBangs) return `matière noire ${s.dm} (${s.bigBangs} big bang)`;
      // Lifetime counters of the previous universes: they only grow at a Big Bang, by what that universe did.
      const most = bang ? L.legacyAfter(L.normalizeSave(prev)) : null;
      for (const [k, v] of Object.entries(s.legacy)) {
        if (v > (bang ? most[k] * 1.2 + 20 : num(prev.legacy?.[k]))) return `héritage ${k} ${num(prev.legacy?.[k])} → ${v}`;
      }
      // Objectives (« Plan d'attaque », the Top): the browser's list and points are not trusted. Only the
      // goals the save itself reaches are kept, the points are recomputed, and they rise at a capped pace.
      const ach = {};
      for (const [id, v] of Object.entries(s.ach)) {
        const a = L.achDef(id);
        // Ascensions fall back at each prestige, but a tier never ascends past its Forge alloy (counted over every universe).
        const ascOk = a && id.startsWith('inf:asc:') && a.target <= L.lifetime(s, 'alloy');
        if (a && (BLAST_MOMENT_ACH.has(id) || ascOk || a.value(s) >= a.target)) ach[id] = v;
      }
      data.ach = ach;
      data.achPoints = Math.min(L.achievementPoints({ ach }), Math.max(0, num(prev.achPoints)) + BLAST_ACH_RATE * secs);
      data.achPoints = Math.floor(data.achPoints);
      return null;
    },
  };

  router.delete('/arcade/:game/save', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (!game) return;
    repo.deleteArcadeSave(req.user.id, game);
    res.json({ ok: true });
  });

  // Rewards earned in the quiz, claimed from the game (the client turns them into credits).
  router.get('/arcade/:game/rewards', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (game) res.json({ rewards: repo.openArcadeRewards(req.user.id, game) });
  });

  router.post('/arcade/:game/rewards/claim', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (game) res.json({ rewards: repo.claimArcadeRewards(req.user.id, game) });
  });

  router.get('/arcade/:game/leaderboard', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (game) res.json({ players: repo.arcadeLeaderboard(game, 20), bySector: repo.arcadeLeaderboard(game, 20, 'sector'), byAch: repo.arcadeLeaderboard(game, 20, 'ach') });
  });

  // The stats page, every game: my numbers and my place in each ranking (read only: no Empire
  // activity is recorded, nothing is settled).
  router.get('/stats/games', requireUser, async (req, res) => {
    const me = req.user.username;
    const place = (list) => { const i = list.findIndex((p) => p.username === me); return { rank: i < 0 ? null : i + 1, of: list.length }; };
    const casinoOf = (game) => {
      const p = repo.getCasino(game, req.user.id);
      return p && { best: p.best, runs: p.runs, hands: p.hands, wins: p.wins, coins: p.coins, ...place(repo.casinoTop(game, 100000)) };
    };
    let empire = null;
    const E = await empireRules;
    const e = E.normalizeEmpire(repo.getEmpire(req.user.id));
    if (e) {
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      empire = {
        points: E.empirePoints(e),
        planets: e.planets.length,
        buildings: e.planets.reduce((n, p) => n + sum(p.buildings), 0),
        research: sum(e.research),
        ships: e.ships,
        relics: sum(e.relics),
        production: E.production(e),
        createdAt: e.createdAt,
      };
    }
    res.json({
      blast: {
        prestige: place(repo.arcadeLeaderboard('blast', 100000)),
        sector: place(repo.arcadeLeaderboard('blast', 100000, 'sector')),
        ach: place(repo.arcadeLeaderboard('blast', 100000, 'ach')),
      },
      territoire: place(repo.arcadeLeaderboard('territoire', 100000)),
      poker: casinoOf('poker'),
      blackjack: casinoOf('blackjack'),
      empire,
    });
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
