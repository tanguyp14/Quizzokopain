// Jimmy Bomber: arenas of 2 to 4 aliens (bots fill the empty seats), played live over Socket.IO.
// The server runs the bombs, the flames and the bots; each player moves its own alien and sends
// its position, which the server checks (speed, walls) before taking it.
const crypto = require('node:crypto');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const IDLE_MS = 30 * 60 * 1000;
const ROUND_PAUSE_MS = 3000; // between the end of a round and the next one
const COUNTDOWN_MS = 3000; // « 3, 2, 1 » before a round
const BOT_NAMES = ['Robo-Butch', 'Zorglub', 'Bip-Bop', 'Kraak'];

class BomberError extends Error {}

function createBomber({ io, repo }) {
  const rulesReady = import('../public/js/games/bomber/logic.js');
  let L = null;
  rulesReady.then((m) => { L = m; });
  const arenas = new Map(); // code -> arena
  const room = (code) => `bomber:${code}`;

  function newCode() {
    for (;;) {
      const code = [...crypto.randomBytes(5)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!arenas.has(code)) return code;
    }
  }

  // ---- what the players see -------------------------------------------------------

  function publicState(a) {
    return {
      code: a.code,
      host: a.host,
      phase: a.phase, // lobby | play | over
      target: a.target,
      round: a.round,
      seats: a.seats.map((s) => s && {
        id: s.id, name: s.name, avatar: s.avatar || null, frame: s.frame || null, bot: Boolean(s.bot),
        color: s.color, wins: s.wins, kills: s.kills, connected: s.bot || s.connected,
      }),
      result: a.result || null,
    };
  }
  const emitState = (a) => io.to(room(a.code)).emit('bomber:state', publicState(a));

  /** The full arena at the start of a round (grid included). */
  function roundPayload(a) {
    const s = a.game;
    return { round: a.round, grid: s.grid, startsAt: a.startsAt, players: s.players.map(playerView), bonuses: bonusList(s), now: Date.now() };
  }
  const playerView = (p) => ({
    id: p.id, x: round2(p.x), y: round2(p.y), dir: p.dir, alive: p.alive, bombs: p.bombs, range: p.range, speed: p.speed, slot: p.slot,
  });
  const round2 = (v) => Math.round(v * 100) / 100;
  const bonusList = (s) => Object.entries(s.bonuses).map(([k, b]) => [Number(k) % L.W, Math.floor(Number(k) / L.W), b]);

  // ---- arena life -------------------------------------------------------------------

  function create(user) {
    const a = {
      code: newCode(),
      host: user.id,
      phase: 'lobby',
      target: 2,
      round: 0,
      seats: [null, null, null, null],
      game: null,
      timer: null,
      lastActivity: Date.now(),
      result: null,
    };
    arenas.set(a.code, a);
    return a;
  }

  function seatOf(a, id) { return a.seats.find((s) => s && s.id === id); }

  function sit(a, user) {
    const mine = seatOf(a, user.id);
    if (mine) { mine.connected = true; return mine; }
    if (a.phase !== 'lobby') throw new BomberError('La partie a déjà commencé : attends la prochaine.');
    let i = a.seats.findIndex((s) => !s);
    if (i < 0) i = a.seats.findIndex((s) => s && s.bot); // a human takes a bot's seat
    if (i < 0) throw new BomberError('L’arène est pleine (4 joueurs).');
    a.seats[i] = {
      id: user.id, name: user.username, avatar: user.avatar, frame: user.frame, bot: false,
      color: L.COLORS[i], wins: 0, kills: 0, connected: true,
    };
    return a.seats[i];
  }

  function addBot(a) {
    const i = a.seats.findIndex((s) => !s);
    if (i < 0) throw new BomberError('Plus de place pour un bot.');
    const used = new Set(a.seats.filter((s) => s?.bot).map((s) => s.name));
    a.seats[i] = { id: -(i + 1) - Math.floor(Math.random() * 1e6) * 10, name: BOT_NAMES.find((n) => !used.has(n)) || 'Bot', bot: true, color: L.COLORS[i], wins: 0, kills: 0 };
  }

  function leaveSeat(a, userId) {
    const i = a.seats.findIndex((s) => s && s.id === userId);
    if (i < 0) return;
    if (a.phase === 'lobby') a.seats[i] = null;
    else a.seats[i].connected = false; // its alien stays in the round
    const humans = a.seats.filter((s) => s && !s.bot && s.connected);
    if (!humans.length) { dispose(a); return; }
    if (a.host === userId) a.host = humans[0].id;
    emitState(a);
  }

  function dispose(a) {
    clearInterval(a.timer);
    clearTimeout(a.pause);
    arenas.delete(a.code);
    io.to(room(a.code)).emit('bomber:closed');
  }

  function start(a, userId) {
    if (a.host !== userId) throw new BomberError('Seul l’hôte lance la partie.');
    if (a.phase === 'play') throw new BomberError('La partie est déjà lancée.');
    const players = a.seats.filter(Boolean);
    if (players.length < 2) throw new BomberError('Il faut au moins 2 aliens : invite un pote ou ajoute un bot 🤖');
    for (const s of a.seats) if (s) { s.wins = 0; s.kills = 0; }
    a.round = 0;
    a.result = null;
    a.phase = 'play';
    nextRound(a);
  }

  function nextRound(a) {
    a.round += 1;
    const order = a.seats.map((s, i) => s && { id: s.id, bot: s.bot, slot: i }).filter(Boolean);
    a.game = L.newRound(order.map((o) => ({ id: o.id, bot: o.bot })), crypto.randomInt(2 ** 31));
    // Each alien keeps its seat's corner and colour.
    a.game.players.forEach((p, i) => {
      const slot = order[i].slot;
      p.slot = slot;
      p.x = L.SPAWNS[slot][0] + 0.5;
      p.y = L.SPAWNS[slot][1] + 0.5;
      p.lastMove = Date.now();
    });
    a.startsAt = Date.now() + COUNTDOWN_MS;
    a.roundOver = false;
    emitState(a);
    io.to(room(a.code)).emit('bomber:round', roundPayload(a));
    clearInterval(a.timer);
    a.timer = setInterval(() => tick(a), L.TICK_MS);
  }

  function tick(a) {
    const s = a.game;
    if (!s || Date.now() < a.startsAt) return;
    const dt = L.TICK_MS / 1000;
    for (const p of s.players) if (p.alive && p.bot) L.botMove(s, p, dt);
    const events = L.step(s, dt);
    const changed = [];
    for (const e of events) {
      if (e.type === 'crate') changed.push([e.x, e.y, L.EMPTY]);
      if (e.type === 'wall') changed.push([e.x, e.y, L.WALL]);
      if (e.type === 'death') {
        const killer = e.by != null && e.by !== e.id && seatOf(a, e.by);
        if (killer) killer.kills += 1;
      }
    }
    io.to(room(a.code)).volatile.emit('bomber:tick', {
      t: Math.round(s.t * 100) / 100,
      p: s.players.map((p) => [p.id, round2(p.x), round2(p.y), p.alive ? 1 : 0, p.dir[0], p.bombs, p.range, p.speed]),
      b: s.bombs.map((b) => [b.id, b.x, b.y, Math.round(b.left * 100) / 100]),
      f: s.flames.map((f) => [f.x, f.y]),
      u: bonusList(s),
    });
    // Events that must not be lost (volatile ticks may be): blasts, deaths, bonuses.
    const loud = events.filter((e) => e.type !== 'crate' && e.type !== 'wall');
    if (changed.length) io.to(room(a.code)).emit('bomber:grid', changed);
    if (loud.length) io.to(room(a.code)).emit('bomber:events', loud);
    const left = L.alive(s);
    if (!a.roundOver && left.length <= 1) endRound(a, left[0] || null);
  }

  function endRound(a, winner) {
    a.roundOver = true;
    clearInterval(a.timer);
    const seat = winner && seatOf(a, winner.id);
    if (seat) seat.wins += 1;
    const champion = a.seats.find((s) => s && s.wins >= a.target);
    io.to(room(a.code)).emit('bomber:roundEnd', { winner: seat ? seat.id : null, round: a.round });
    emitState(a);
    a.pause = setTimeout(() => {
      if (!arenas.has(a.code)) return;
      if (champion) finish(a, champion);
      else nextRound(a);
    }, ROUND_PAUSE_MS);
  }

  function finish(a, champion) {
    a.phase = 'over';
    a.game = null;
    const humans = a.seats.filter((s) => s && !s.bot);
    const versus = humans.length >= 2;
    a.result = { champion: champion.id, versus };
    for (const s of humans) {
      // Only games against other humans count for the wins (no farming against bots).
      repo.bomberRecord(s.id, { win: versus && s.id === champion.id, kills: s.kills, versus });
    }
    emitState(a);
  }

  function backToLobby(a, userId) {
    if (a.host !== userId) throw new BomberError('Seul l’hôte relance.');
    if (a.phase !== 'over') return;
    a.phase = 'lobby';
    a.result = null;
    // The players gone meanwhile free their seats.
    a.seats = a.seats.map((s) => (s && (s.bot || s.connected) ? s : null));
    emitState(a);
  }

  // ---- sockets ----------------------------------------------------------------------

  function attach(socket) {
    const user = socket.data.user;
    const on = (event, handler) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          if (!L) await rulesReady;
          const a = arenas.get(socket.data.bomber);
          const out = handler(a, payload || {});
          if (a) a.lastActivity = Date.now();
          reply({ ok: true, ...(out || {}) });
        } catch (err) {
          if (!(err instanceof BomberError)) console.error(err);
          reply({ ok: false, error: err instanceof BomberError ? err.message : 'Erreur serveur.' });
        }
      });
    };
    const need = (a) => { if (!a) throw new BomberError('Tu n’es dans aucune arène.'); return a; };
    const enter = (a) => {
      if (socket.data.bomber && socket.data.bomber !== a.code) leave();
      sit(a, user);
      socket.data.bomber = a.code;
      socket.join(room(a.code));
      emitState(a);
      if (a.phase === 'play' && a.game) socket.emit('bomber:round', roundPayload(a));
      return { code: a.code };
    };
    const leave = () => {
      const a = arenas.get(socket.data.bomber);
      socket.leave(room(socket.data.bomber));
      socket.data.bomber = null;
      if (!a) return;
      // Another tab of the same account still in the arena: keep the seat.
      const stillHere = [...(io.sockets.adapter.rooms.get(room(a.code)) || [])].some((id) => io.sockets.sockets.get(id)?.data.user.id === user.id);
      if (!stillHere) leaveSeat(a, user.id);
    };

    on('bomber:create', () => enter(create(user)));
    on('bomber:join', (_, { code }) => {
      const a = arenas.get(String(code || '').trim().toUpperCase());
      if (!a) throw new BomberError('Arène introuvable. Vérifie le code.');
      return enter(a);
    });
    on('bomber:leave', () => leave());
    on('bomber:bot', (a, { add }) => {
      need(a);
      if (a.host !== user.id) throw new BomberError('Seul l’hôte gère les bots.');
      if (a.phase !== 'lobby') throw new BomberError('Pas pendant la partie.');
      if (add) addBot(a);
      else {
        const i = a.seats.map((s) => s?.bot).lastIndexOf(true);
        if (i >= 0) a.seats[i] = null;
      }
      emitState(a);
    });
    on('bomber:target', (a, { target }) => {
      need(a);
      if (a.host !== user.id || a.phase !== 'lobby') throw new BomberError('Seul l’hôte règle la partie.');
      if (!L.WIN_TARGETS.includes(Number(target))) throw new BomberError('Nombre de manches invalide.');
      a.target = Number(target);
      emitState(a);
    });
    on('bomber:start', (a) => start(need(a), user.id));
    on('bomber:lobby', (a) => backToLobby(need(a), user.id));
    // The player's own alien: its position (checked) and its bombs.
    socket.on('bomber:move', (m) => {
      const a = arenas.get(socket.data.bomber);
      const p = a?.game?.players.find((o) => o.id === user.id);
      if (!p || !p.alive || a.roundOver || Date.now() < a.startsAt || !Array.isArray(m)) return;
      const [x, y, d] = m;
      const now = Date.now();
      if (L.plausibleMove(a.game, p, Number(x), Number(y), (now - p.lastMove) / 1000)) {
        p.x = Number(x);
        p.y = Number(y);
        if (L.DIRS[d]) p.dir = d;
      } else {
        socket.emit('bomber:you', [round2(p.x), round2(p.y)]); // put back where the server has it
      }
      p.lastMove = now;
    });
    socket.on('bomber:bomb', () => {
      const a = arenas.get(socket.data.bomber);
      const p = a?.game?.players.find((o) => o.id === user.id);
      if (!p || a.roundOver || Date.now() < a.startsAt) return;
      const b = L.dropBomb(a.game, p);
      if (b) io.to(room(a.code)).emit('bomber:events', [{ type: 'drop', x: b.x, y: b.y, owner: p.id }]);
    });
    socket.on('disconnect', leave);
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const a of arenas.values()) if (now - a.lastActivity > IDLE_MS && a.phase !== 'play') dispose(a);
  }, 60 * 1000);
  sweeper.unref();

  return { attach, arenas, close: () => { clearInterval(sweeper); for (const a of [...arenas.values()]) dispose(a); } };
}

module.exports = { createBomber, BomberError };
