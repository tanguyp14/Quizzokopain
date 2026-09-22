const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { Server } = require('socket.io');

const { openDb } = require('./db');
const { createAuth } = require('./auth');
const { Room, GameError } = require('./room');
const { themeCatalog } = require('./selection');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;

function createApp({ dbFile = path.join(__dirname, '..', 'data', 'quizzokopain.db'), secureCookies = false } = {}) {
  const repo = openDb(dbFile);
  const auth = createAuth(repo, { secureCookies });
  const rooms = new Map(); // code -> Room

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ---- REST API ------------------------------------------------------------

  app.post('/api/register', auth.register);
  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);
  app.get('/api/me', auth.requireUser, (req, res) => res.json({ user: req.user }));
  app.get('/api/catalog', auth.requireUser, (req, res) => res.json(themeCatalog()));

  app.post('/api/rooms', auth.requireUser, (req, res) => {
    const code = newRoomCode();
    rooms.set(code, new Room({ code, host: req.user, onChange: broadcast, onFinish: persist }));
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

    // Every client -> server event goes through this wrapper: it resolves the
    // socket's room, runs the action and reports GameErrors back to the caller.
    const on = (event, handler) => {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          const room = rooms.get(socket.data.roomCode);
          if (!room && event !== 'room:join') throw new GameError('Tu n’es dans aucune room.');
          handler(room, payload || {});
          reply({ ok: true });
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
    on('game:start', (room) => room.start(user.id));
    on('game:answer', (room, { value }) => room.submit(user.id, value));
    on('game:close', (room) => room.closeQuestion(user.id));
    on('game:verdict', (room, { userId, correct }) => room.setVerdict(user.id, userId, correct));
    on('game:validate', (room) => room.validate(user.id));
    on('game:next', (room) => room.next(user.id));
    on('game:end', (room) => room.end(user.id));

    socket.on('disconnect', () => leaveCurrentRoom(socket));
  });

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
  });
  server.listen(port, () => console.log(`Quizzokopain prêt sur http://localhost:${port}`));
}

module.exports = { createApp };
