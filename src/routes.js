const express = require('express');
const { sanitizeQuestion } = require('./questionTypes');
const { hashPassword } = require('./auth');
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

  // ---- L'Empire de Jimmy (secret: SuperAdmin only for now) ---------------------------------
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
  const settlePortal = (E, now = Date.now()) => {
    const portal = repo.getPortal();
    const players = Math.max(1, repo.allEmpires().length);
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
      const players = Math.max(1, repo.allEmpires().length);
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
  router.get('/empire', requireSuperadmin, withEmpire(() => ({})));
  router.post('/empire/start', requireSuperadmin, withEmpire((E, e, req) => {
    if (e) throw new Error('Tu as déjà une planète.');
    return { empire: E.newEmpire() };
  }));
  router.post('/empire/build', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    E.startBuilding(e, Math.floor(Number(req.body?.planet) || 0), String(req.body?.key || ''));
    return { empire: e };
  }));
  router.post('/empire/pause', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    E.toggleMine(e, Math.floor(Number(req.body?.planet) || 0), String(req.body?.key || ''));
    return { empire: e };
  }));
  router.post('/empire/research', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    E.startResearch(e, String(req.body?.key || ''));
    return { empire: e };
  }));
  router.post('/empire/cancel', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    if (!E.cancel(e, req.body?.kind === 'research' ? 'research' : 'building', Math.floor(Number(req.body?.planet) || 0))) throw new Error('Rien à annuler.');
    return { empire: e };
  }));
  router.post('/empire/butch', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    E.butchBuy(e, req.body?.amount);
    return { empire: e };
  }));
  router.post('/empire/ships', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    E.startShips(e, Math.floor(Number(req.body?.planet) || 0), String(req.body?.key || ''), req.body?.count);
    return { empire: e };
  }));

  // Galaxy: every empire, where it is and what its planets produce (to know who to trade with).
  router.get('/empire/galaxy', requireSuperadmin, async (req, res) => {
    const E = await empireRules;
    const empires = repo.allEmpires().map((r) => {
      const e = E.normalizeEmpire(r.data);
      if (!e) return null;
      return {
        username: r.username, avatar: r.avatar, frame: r.frame, me: r.userId === req.user.id, coords: e.coords, points: E.empirePoints(e),
        planets: e.planets.map((p) => ({ name: p.name, look: p.look, rates: p.rates })),
      };
    }).filter(Boolean);
    res.json({ empires });
  });

  // Sending resources to another player with cargos (flight there, then the cargos come back).
  router.post('/empire/send', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    const dest = repo.findUserByName(String(req.body?.to || ''));
    if (!dest || dest.id === req.user.id) throw new Error('Destinataire inconnu.');
    const other = E.normalizeEmpire(repo.getEmpire(dest.id));
    if (!other) throw new Error('Ce joueur n’a pas encore d’empire.');
    const { load, cargos } = E.prepareShipment(e, req.body?.load);
    const now = Date.now();
    const flight = E.flightTime(e, other.coords);
    repo.addFleet({ ownerId: req.user.id, destId: dest.id, load, cargos, departsAt: now, arrivesAt: now + flight, returnsAt: now + 2 * flight });
    return { empire: e, extra: { flight } };
  }));
  router.get('/empire/fleets', requireSuperadmin, (req, res) => res.json({ fleets: repo.myFleets(req.user.id), now: Date.now() }));

  // Market: offers « X of a resource for Y of another »; the offered part is held until taken or cancelled.
  router.get('/empire/market', requireSuperadmin, async (req, res) => {
    const E = await empireRules;
    const coords = new Map(repo.allEmpires().map((r) => [r.userId, E.normalizeEmpire(r.data)?.coords]));
    res.json({ offers: repo.openOffers().map((o) => ({ ...o, mine: o.sellerId === req.user.id, coords: coords.get(o.sellerId) || null })), trades: repo.recentTrades() });
  });
  router.post('/empire/market', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    if (repo.countOpenOffers(req.user.id) >= E.MARKET.maxOffers) throw new Error(`Au plus ${E.MARKET.maxOffers} offres à la fois.`);
    const o = E.prepareOffer(e, req.body?.give, req.body?.giveAmount, req.body?.want, req.body?.wantAmount);
    repo.addOffer({ sellerId: req.user.id, ...o });
    return { empire: e };
  }));
  router.post('/empire/market/:id/accept', requireSuperadmin, withEmpire((E, e, req) => {
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
  router.post('/empire/market/:id/cancel', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    const o = repo.offer(Number(req.params.id));
    if (!o || o.closed_at || o.seller_id !== req.user.id) throw new Error('Offre introuvable.');
    e.res[o.give] += o.give_amount;
    repo.closeOffer(o.id, null, true);
    return { empire: e };
  }));

  // The Portail de Jimmy: state, top contributors, and contributions sent by cargo to the centre.
  router.get('/empire/portal', requireSuperadmin, async (req, res) => {
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
  router.post('/empire/portal/contribute', requireSuperadmin, withEmpire((E, e, req) => {
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
  router.get('/empire/swarm', requireSuperadmin, async (req, res) => {
    const E = await empireRules;
    const now = Date.now();
    const { swarm, season } = repo.transaction(() => settleSwarm(E, now));
    const players = Math.max(1, repo.allEmpires().length);
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
  router.post('/empire/swarm/engage', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    const count = E.prepareGuards(e, req.body?.count);
    const now = Date.now();
    const flight = E.flightTime(e, E.PORTAL.coords);
    repo.addFleet({ ownerId: req.user.id, destId: req.user.id, load: {}, cargos: count, departsAt: now, arrivesAt: now + flight, returnsAt: now + flight, kind: 'guard' });
    return { empire: e, extra: { flight } };
  }));
  // Test only (while the Empire is SuperAdmin-only): the next wave hits now.
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
  router.post('/empire/expedition', requireSuperadmin, withEmpire((E, e, req) => {
    needEmpire(e);
    const trip = E.prepareExpedition(e, req.body?.explorers, req.body?.guards, req.body?.hours, repo.activeExpeditions(req.user.id));
    trip.outcome = E.expeditionOutcome(Math.random, { ...trip, astro: e.research.astrophysics }, e);
    const now = Date.now();
    const back = now + trip.hours * 3600e3 + trip.outcome.delay;
    repo.addFleet({ ownerId: req.user.id, destId: req.user.id, load: {}, cargos: trip.explorers, departsAt: now, arrivesAt: back, returnsAt: back, kind: 'expedition', meta: trip });
    return { empire: e, extra: { back } };
  }));

  router.post('/empire/colonize', requireSuperadmin, withEmpire((E, e) => {
    needEmpire(e);
    const planet = E.colonize(e);
    return { empire: e, extra: { planet } };
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
  const arcadeGame = (req, res) => {
    if (ARCADE_GAMES.includes(req.params.game)) return req.params.game;
    fail(res, 404, 'Jeu inconnu.');
    return null;
  };

  router.get('/arcade/:game/save', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (game) res.json({ save: repo.getArcadeSave(req.user.id, game) });
  });

  router.put('/arcade/:game/save', requireUser, (req, res) => {
    const game = arcadeGame(req, res);
    if (!game) return;
    const { data } = req.body || {};
    const score = Number(req.body?.score);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'Sauvegarde invalide.');
    if (JSON.stringify(data).length > ARCADE_SAVE_MAX) return fail(res, 413, 'Sauvegarde trop lourde.');
    if (!Number.isFinite(score) || score < 0) return fail(res, 400, 'Score invalide.');
    const device = typeof req.body.device === 'string' ? req.body.device.slice(0, 40) : null;
    const basedOn = Number.isFinite(Number(req.body.basedOn)) && req.body.basedOn !== null ? Number(req.body.basedOn) : undefined;
    const result = repo.putArcadeSave(req.user.id, game, data, score, { device, basedOn });
    if (result.conflict) return res.status(409).json({ error: 'La partie a avancé sur un autre appareil.', save: result.conflict });
    res.json(result);
  });

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

  // ---- misc ---------------------------------------------------------------------

  router.get('/users/search', requireUser, (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ users: [] });
    res.json({ users: repo.searchUsernames(q, 8).filter((u) => u.toLowerCase() !== req.user.username.toLowerCase()) });
  });

  return router;
}

module.exports = { themeAndAdminRoutes };
