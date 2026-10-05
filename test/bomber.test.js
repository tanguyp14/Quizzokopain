const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, client } = require('./helpers');

const rules = import('../public/js/games/bomber/logic.js');

test('arena: walls frame the grid, the spawns are free', async () => {
  const L = await rules;
  const s = L.newRound([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], 42);
  for (let x = 0; x < L.W; x++) assert.equal(s.grid[L.key(x, 0)], L.WALL);
  for (const [x, y] of L.SPAWNS) {
    assert.equal(s.grid[L.key(x, y)], L.EMPTY);
    assert.ok(L.free(s, x, y + (y === 1 ? 1 : -1)) || L.free(s, x + (x === 1 ? 1 : -1), y), 'a way out of the corner');
  }
  assert.equal(s.grid[L.key(2, 2)], L.WALL, 'pillars');
});

test('moving: along the lanes, stopped by walls, crates and bombs', async () => {
  const L = await rules;
  const s = L.newRound([{ id: 1 }, { id: 2 }], 1);
  s.grid.fill(L.EMPTY);
  const p = s.players[0];
  p.x = 1.5; p.y = 1.5;
  L.move(s, p, 'right', 0.1);
  assert.ok(p.x > 1.5 && p.y === 1.5);
  s.grid[L.key(3, 1)] = L.WALL;
  for (let i = 0; i < 20; i++) L.move(s, p, 'right', 0.1);
  assert.equal(p.x, 2.5, 'stops in the middle of the cell before the wall');
  // Bombs block, except the one under the alien's feet.
  L.dropBomb(s, p);
  L.move(s, p, 'left', 0.1);
  assert.ok(p.x < 2.5, 'walks off its own bomb');
  for (let i = 0; i < 20; i++) L.move(s, p, 'left', 0.1);
  for (let i = 0; i < 20; i++) L.move(s, p, 'right', 0.1);
  assert.ok(p.x <= 1.5 + 1e-9, 'cannot walk back onto the bomb');
});

test('blasts: chains, crates burnt (bonus revealed), deaths and kills', async () => {
  const L = await rules;
  const s = L.newRound([{ id: 1 }, { id: 2 }], 7);
  s.grid.fill(L.EMPTY);
  const [a, b] = s.players;
  a.x = 1.5; a.y = 1.5; b.x = 5.5; b.y = 1.5;
  s.grid[L.key(3, 3)] = L.CRATE;
  s.hidden[L.key(3, 3)] = 'fire';
  s.bombs.push({ id: 90, x: 3, y: 1, owner: 1, range: 2, left: 0.01 });
  s.bombs.push({ id: 91, x: 3, y: 2, owner: 1, range: 1, left: 9 }); // caught in the first blast
  const events = L.step(s, 0.05);
  assert.equal(events.filter((e) => e.type === 'boom').length, 2, 'chain reaction');
  assert.equal(s.grid[L.key(3, 3)], L.EMPTY, 'crate burnt');
  assert.equal(s.bonuses[L.key(3, 3)], 'fire', 'bonus revealed');
  assert.equal(b.alive, false, 'b in range dies');
  assert.equal(a.alive, false, 'a too (range 2 reaches x = 1)');
  assert.equal(a.kills, 1);
  // Picking a bonus up.
  const s2 = L.newRound([{ id: 1 }, { id: 2 }], 8);
  s2.bonuses[L.key(1, 1)] = 'bomb';
  L.step(s2, 0.05);
  assert.equal(s2.players[0].bombs, 2);
});

test('the arena closes in when time is up', async () => {
  const L = await rules;
  const s = L.newRound([{ id: 1 }, { id: 2 }], 3);
  s.t = L.ROUND_TIME;
  let deaths = 0;
  for (let i = 0; i < 2000 && L.alive(s).length; i++) deaths += L.step(s, 0.05).filter((e) => e.type === 'death').length;
  assert.equal(deaths, 2, 'nobody survives the closing');
});

test('bots: a round of four bots ends, and they do not only blow themselves up', async () => {
  const L = await rules;
  let suicides = 0;
  let deaths = 0;
  for (let r = 0; r < 6; r++) {
    const s = L.newRound([1, 2, 3, 4].map((id) => ({ id, bot: true })), 500 + r);
    for (let t = 0; t < 200 && L.alive(s).length > 1; t += 0.05) {
      for (const p of s.players) if (p.alive) L.botMove(s, p, 0.05);
      for (const e of L.step(s, 0.05)) if (e.type === 'death') { deaths++; if (e.by === e.id) suicides++; }
    }
    assert.ok(L.alive(s).length <= 1, 'the round ends');
  }
  assert.ok(suicides < deaths / 2, `${suicides} suicides of ${deaths} deaths`);
});

test('plausible moves only: no teleport, no walking in walls', async () => {
  const L = await rules;
  const s = L.newRound([{ id: 1 }, { id: 2 }], 5);
  const p = s.players[0];
  assert.ok(L.plausibleMove(s, p, 1.6, 1.5, 0.05));
  assert.ok(!L.plausibleMove(s, p, 9.5, 1.5, 0.05), 'too far');
  assert.ok(!L.plausibleMove(s, p, 0.5, 1.5, 0.5), 'in the frame wall');
});

test('sockets: create an arena, a friend joins, bots fill up, the round runs', async () => {
  const srv = await startServer();
  try {
    const host = client(srv.base, await register(srv.base, 'hote'));
    const friend = client(srv.base, await register(srv.base, 'pote'));
    const states = [];
    host.socket.on('bomber:state', (s) => states.push(s));
    const made = await host.emit('bomber:create');
    assert.ok(made.ok && made.code);
    const joined = await friend.emit('bomber:join', { code: made.code.toLowerCase() });
    assert.ok(joined.ok);
    assert.equal((await friend.emit('bomber:start')).ok, false, 'only the host starts');
    assert.ok((await host.emit('bomber:bot', { add: true })).ok);
    assert.ok((await host.emit('bomber:target', { target: 1 })).ok);
    await new Promise((r) => setTimeout(r, 50));
    const lobby = states.at(-1);
    assert.equal(lobby.seats.filter(Boolean).length, 3);
    assert.equal(lobby.target, 1);
    const ticks = [];
    friend.socket.on('bomber:tick', (t) => ticks.push(t));
    let round = null;
    friend.socket.on('bomber:round', (r) => { round = r; });
    assert.ok((await host.emit('bomber:start')).ok);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(round && round.grid.length === 15 * 13 && round.players.length === 3);
    assert.ok(!(await friend.emit('bomber:join', { code: 'ZZZZZ' })).ok);
    // Ticks start after the countdown.
    srv.bomber.arenas.get(made.code).startsAt = Date.now();
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(ticks.length >= 3);
    // A teleport is refused: the server puts the alien back.
    let back = null;
    friend.socket.on('bomber:you', (pos) => { back = pos; });
    friend.socket.emit('bomber:move', [7.5, 7.5, 'down']);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(back, 'position corrected');
    const events = [];
    friend.socket.on('bomber:events', (e) => events.push(...e));
    friend.socket.emit('bomber:bomb');
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(events.some((e) => e.type === 'drop'));
    host.socket.close();
    friend.socket.close();
  } finally {
    await srv.stop();
  }
});
