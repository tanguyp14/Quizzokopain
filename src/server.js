const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { Server } = require('socket.io');

const { openDb } = require('./db');
const { createAuth } = require('./auth');
const { Room, GameError } = require('./room');
const { createThemeStore } = require('./themes');
const { themeAndAdminRoutes } = require('./routes');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;
const INVITE_TTL_MS = 2 * 60 * 60 * 1000;

function createApp({
  dbFile = path.join(__dirname, '..', 'data', 'quizzokopain.db'), secureCookies = false, superadmins = [],
} = {}) {
  const repo = openDb(dbFile);
  const auth = createAuth(repo, { secureCookies, superadmins });
  const store = createThemeStore(repo);
  const rooms = new Map(); // code -> Room
  const invites = new Map(); // userId -> Map(code -> { code, from, at })

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '300kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Short invitation link: /r/ABCDE opens the room straight away (after login if needed).
  app.get('/r/:code', (req, res) => {
    res.redirect(`/#/room/${encodeURIComponent(String(req.params.code).toUpperCase().replace(/[^A-Z0-9]/g, ''))}`);
  });

  // ---- REST API ------------------------------------------------------------

  app.post('/api/register', auth.register);
  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);
  app.get('/api/me', auth.requireUser, (req, res) => {
    const pendingThemes = req.user.role === 'superadmin' ? repo.themesByStatus('pending').length : undefined;
    res.json({ user: req.user, pendingThemes });
  });

  app.post('/api/rooms', auth.requireUser, (req, res) => {
    const code = newRoomCode();
    rooms.set(code, new Room({ code, host: req.user, themes: store, onChange: broadcast, onFinish: persist }));
    res.status(201).json({ code });
  });

  app.get('/api/rooms/:code', auth.requireUser, (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room introuvable. Vérifie le code.' });
    res.json({ code: room.code, phase: room.phase, host: room.host.username });
  });

  app.get('/api/history', auth.requireUser, (req, res) => {
    res.json({ games: repo.historyForUser(req.user.id, 30) });
  });

  app.get('/api/history/:id', auth.requireUser, (req, res) => {
    const game = repo.gameDetail(Number(req.params.id), req.user.id);
    if (!game) return res.status(404).json({ error: 'Partie introuvable.' });
    res.json({ game });
  });

  app.get('/api/invitations', auth.requireUser, (req, res) => {
    res.json({ invitations: pendingInvites(req.user.id) });
  });

  app.delete('/api/invitations/:code', auth.requireUser, (req, res) => {
    invites.get(req.user.id)?.delete(String(req.params.code).toUpperCase());
    res.json({ ok: true });
  });

  const hooks = {
    themesChanged() {
      // Lobbies show the theme catalog: let them refresh it.
      io.emit('themes:changed');
    },
    avatarChanged(userId, avatar) {
      for (const s of io.sockets.sockets.values()) if (s.data.user.id === userId) s.data.user.avatar = avatar;
      for (const room of rooms.values()) room.setAvatar(userId, avatar);
      io.to(`user:${userId}`).emit('me:avatar', avatar);
    },
    userRemoved(userId) {
      io.in(`user:${userId}`).disconnectSockets(true);
      invites.delete(userId);
    },
    listRooms() {
      return [...rooms.values()].map((r) => ({
        code: r.code,
        host: r.host.username,
        phase: r.phase,
        players: r.players.size,
        theme: r.theme ? `${r.theme.emoji} ${r.theme.name}` : null,
        createdAt: r.createdAt,
      }));
    },
    closeRoom(code) {
      const room = rooms.get(code);
      if (!room) return false;
      io.to(code).emit('room:closed');
      io.in(code).socketsLeave(code);
      for (const s of io.sockets.sockets.values()) if (s.data.roomCode === code) s.data.roomCode = null;
      room.dispose();
      rooms.delete(code);
      return true;
    },
  };

  app.use('/api', themeAndAdminRoutes({ repo, auth, store, hooks }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  // ---- realtime ------------------------------------------------------------

  const server = http.createServer(app);
  const io = new Server(server);

  io.use((socket, next) => {
    const user = auth.userFromCookieHeader(socket.handshake.headers.cookie);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    // Personal channel, used for direct invitations and account moderation.
    socket.join(`user:${user.id}`);

    // Every client -> server event goes through this wrapper: it resolves the
    // socket's room, runs the action and reports GameErrors back to the caller.
    const on = (event, handler) => {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          const room = rooms.get(socket.data.roomCode);
          if (!room && event !== 'room:join') throw new GameError('Tu n’es dans aucune room.');
          const result = handler(room, payload || {});
          reply({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
        } catch (err) {
          if (!(err instanceof GameError)) console.error(err);
          reply({ ok: false, error: err instanceof GameError ? err.message : 'Erreur serveur.' });
        }
      });
    };

    on('room:join', (_, { code }) => {
      const room = rooms.get(String(code || '').toUpperCase());
      if (!room) throw new GameError('Room introuvable. Vérifie le code.');
      if (socket.data.roomCode !== room.code) leaveCurrentRoom(socket);
      room.join(user);
      socket.data.roomCode = room.code;
      socket.join(room.code);
      invites.get(user.id)?.delete(room.code);
      socket.emit('room:state', room.stateFor(user.id));
    });
    on('room:leave', () => leaveCurrentRoom(socket, { explicit: true }));
    on('room:settings', (room, patch) => room.updateSettings(user.id, patch));
    on('room:addQuestion', (room, { question }) => room.addCustomQuestion(user.id, question));
    on('room:removeQuestion', (room, { index }) => room.removeCustomQuestion(user.id, index));
    on('room:kick', (room, { userId }) => {
      room.kick(user.id, userId);
      for (const s of io.sockets.adapter.rooms.get(room.code) || []) {
        const other = io.sockets.sockets.get(s);
        if (other?.data.user.id === userId) {
          other.leave(room.code);
          other.data.roomCode = null;
          other.emit('room:kicked');
        }
      }
    });
    on('room:invite', (room, { username }) => {
      if (room.phase === 'finished') throw new GameError('La partie est terminée.');
      const target = typeof username === 'string' ? repo.findUserByName(username.trim()) : null;
      if (!target || target.banned) throw new GameError('Aucun joueur avec ce pseudo.');
      if (target.id === user.id) throw new GameError('Tu es déjà dans la room 😉');
      if (room.players.has(target.id) || room.isHost(target.id)) throw new GameError(`${target.username} est déjà dans la room.`);
      const invite = { code: room.code, from: user.username, at: Date.now(), theme: room.theme ? `${room.theme.emoji} ${room.theme.name}` : null };
      if (!invites.has(target.id)) invites.set(target.id, new Map());
      invites.get(target.id).set(room.code, invite);
      io.to(`user:${target.id}`).emit('invite:new', invite);
      return { invited: target.username };
    });
    on('game:start', (room) => room.start(user.id));
    on('game:answer', (room, { value }) => room.submit(user.id, value));
    on('game:close', (room) => room.closeQuestion(user.id));
    on('game:verdict', (room, { userId, correct }) => room.setVerdict(user.id, userId, correct));
    on('game:validate', (room) => room.validate(user.id));
    on('game:next', (room) => room.next(user.id));
    on('game:end', (room) => room.end(user.id));

    socket.on('disconnect', () => leaveCurrentRoom(socket));
  });

  function pendingInvites(userId) {
    const mine = invites.get(userId);
    if (!mine) return [];
    const now = Date.now();
    for (const [code, inv] of mine) {
      const room = rooms.get(code);
      if (!room || room.phase === 'finished' || now - inv.at > INVITE_TTL_MS) mine.delete(code);
    }
    return [...mine.values()].sort((a, b) => b.at - a.at);
  }

  function leaveCurrentRoom(socket, { explicit = false } = {}) {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    socket.data.roomCode = null;
    if (!room) return;
    socket.leave(code);
    const userId = socket.data.user.id;
    // The same account may have several tabs open: only mark it gone when the last one leaves.
    const stillHere = [...(io.sockets.adapter.rooms.get(code) || [])]
      .some((id) => io.sockets.sockets.get(id)?.data.user.id === userId);
    if (stillHere) return;
    if (explicit) room.leave(userId);
    else room.setConnected(userId, false);
  }

  function broadcast(room) {
    for (const id of io.sockets.adapter.rooms.get(room.code) || []) {
      const s = io.sockets.sockets.get(id);
      if (s) s.emit('room:state', room.stateFor(s.data.user.id));
    }
  }

  function persist(room, summary) {
    try {
      room.gameId = repo.saveGame(summary);
      broadcast(room);
    } catch (err) {
      console.error('Impossible d’enregistrer la partie', err);
    }
  }

  function newRoomCode() {
    for (;;) {
      const bytes = crypto.randomBytes(5);
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!rooms.has(code)) return code;
    }
  }

  // Housekeeping: drop idle rooms and expired sessions.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const empty = !(io.sockets.adapter.rooms.get(code)?.size);
      if (now - room.lastActivity > ROOM_IDLE_MS || (room.phase === 'finished' && empty)) {
        room.dispose();
        rooms.delete(code);
      }
    }
    repo.purgeExpiredSessions();
  }, 60 * 1000);
  sweeper.unref();

  return { app, server, io, repo, rooms, close: () => { clearInterval(sweeper); io.close(); } };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp({
    dbFile: process.env.DB_FILE || undefined,
    secureCookies: process.env.SECURE_COOKIES === '1',
    superadmins: (process.env.SUPERADMIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  });
  server.listen(port, () => console.log(`Quizzokopain prêt sur http://localhost:${port}`));
}

module.exports = { createApp };
