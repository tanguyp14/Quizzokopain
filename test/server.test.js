const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/server');

async function startServer() {
  const ctx = createApp({ dbFile: ':memory:' });
  await new Promise((resolve) => ctx.server.listen(0, resolve));
  const base = `http://127.0.0.1:${ctx.server.address().port}`;
  return { ...ctx, base, stop: () => new Promise((r) => { ctx.close(); ctx.server.close(r); }) };
}

async function register(base, username) {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'secret123' }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie').split(';')[0];
}

function client(base, cookie) {
  const socket = connect(base, { extraHeaders: { cookie }, transports: ['websocket'], forceNew: true });
  const states = [];
  socket.on('room:state', (s) => states.push(s));
  const emit = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
  const waitFor = async (pred) => {
    for (let i = 0; i < 200; i++) {
      const s = states.at(-1);
      if (s && pred(s)) return s;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('state never matched');
  };
  return { socket, emit, waitFor, last: () => states.at(-1) };
}

test('auth: register, login, me, duplicate and bad password', async () => {
  const srv = await startServer();
  try {
    const cookie = await register(srv.base, 'Zoé');
    const me = await fetch(`${srv.base}/api/me`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(me.user.username, 'Zoé');

    const dup = await fetch(`${srv.base}/api/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'zoé', password: 'secret123' }),
    });
    assert.equal(dup.status, 409);

    const bad = await fetch(`${srv.base}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Zoé', password: 'nope-nope' }),
    });
    assert.equal(bad.status, 401);
    assert.equal((await fetch(`${srv.base}/api/me`)).status, 401);
    assert.equal((await fetch(`${srv.base}/api/history`)).status, 401);
  } finally {
    await srv.stop();
  }
});

test('full game over websockets ends up in everyone’s history', async () => {
  const srv = await startServer();
  const clients = [];
  try {
    const hostCookie = await register(srv.base, 'admin');
    const aliceCookie = await register(srv.base, 'alice');
    const bobCookie = await register(srv.base, 'bob');

    const { code } = await fetch(`${srv.base}/api/rooms`, { method: 'POST', headers: { cookie: hostCookie } }).then((r) => r.json());
    assert.match(code, /^[A-Z0-9]{5}$/);

    const host = client(srv.base, hostCookie);
    const alice = client(srv.base, aliceCookie);
    const bob = client(srv.base, bobCookie);
    clients.push(host, alice, bob);

    assert.deepEqual(await host.emit('room:join', { code }), { ok: true });
    assert.deepEqual(await alice.emit('room:join', { code: code.toLowerCase() }), { ok: true });
    assert.deepEqual(await bob.emit('room:join', { code }), { ok: true });
    assert.equal((await alice.emit('room:join', { code: 'ZZZZZ' })).ok, false);
    await host.waitFor((s) => s.players.length === 2);

    // Non-admins cannot drive the game.
    assert.equal((await alice.emit('game:start')).ok, false);

    await host.emit('room:addQuestion', { question: { type: 'qcm', prompt: 'Capitale de la France ?', choices: ['Lyon', 'Paris'], answer: 1 } });
    await host.emit('room:addQuestion', { question: { type: 'libre', prompt: 'Auteur des Misérables ?', answer: 'Victor Hugo' } });
    assert.deepEqual(await host.emit('room:settings', { themeId: 'custom', timeLimit: 0 }), { ok: true });
    assert.deepEqual(await host.emit('game:start'), { ok: true });

    for (let i = 0; i < 2; i++) {
      const s = await alice.waitFor((st) => st.phase === 'question' && st.index === i);
      assert.equal(s.question.answer, undefined, 'answer hidden from players');
      if (s.question.type === 'qcm') {
        await alice.emit('game:answer', { value: 1 });
        await bob.emit('game:answer', { value: 0 });
      } else {
        await alice.emit('game:answer', { value: 'victor hugo' });
        await bob.emit('game:answer', { value: 'Zola' });
        const c = await host.waitFor((st) => st.phase === 'correction');
        assert.equal(c.correction.length, 2);
        await host.emit('game:validate');
      }
      await host.waitFor((st) => st.phase === 'reveal' && st.index === i);
      await host.emit('game:next');
    }

    const end = await alice.waitFor((s) => s.phase === 'finished' && s.gameId);
    assert.deepEqual(end.players.map((p) => [p.username, p.score]), [['alice', 2], ['bob', 0]]);

    const hist = await fetch(`${srv.base}/api/history`, { headers: { cookie: bobCookie } }).then((r) => r.json());
    assert.equal(hist.games.length, 1);
    assert.equal(hist.games[0].myRank, 2);
    assert.equal(hist.games[0].winner, 'alice');

    const hostHist = await fetch(`${srv.base}/api/history`, { headers: { cookie: hostCookie } }).then((r) => r.json());
    assert.equal(hostHist.games[0].wasHost, true);

    const detail = await fetch(`${srv.base}/api/history/${end.gameId}`, { headers: { cookie: aliceCookie } }).then((r) => r.json());
    assert.equal(detail.game.questions.length, 2);
    assert.ok(detail.game.questions.every((q) => q.answer));

    const stranger = await register(srv.base, 'curieux');
    assert.equal((await fetch(`${srv.base}/api/history/${end.gameId}`, { headers: { cookie: stranger } })).status, 404);
  } finally {
    for (const c of clients) c.socket.close();
    await srv.stop();
  }
});

test('sockets without a session are refused', async () => {
  const srv = await startServer();
  try {
    const socket = connect(srv.base, { transports: ['websocket'], forceNew: true });
    const err = await new Promise((resolve) => socket.on('connect_error', resolve));
    assert.equal(err.message, 'unauthorized');
    socket.close();
  } finally {
    await srv.stop();
  }
});
