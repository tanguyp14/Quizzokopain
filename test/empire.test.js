const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http } = require('./helpers');

const logic = () => import('../public/js/games/empire/logic.js');
const H = 3600 * 1000;

test('empire: production over time (even offline), specialty, energy and storage', async () => {
  const E = await logic();
  const e = E.newEmpire('rocky', 0, 1);
  const p = E.production(e);
  assert.ok(p.metal > p.crystal, 'a rocky planet is best at metal');
  E.advance(e, 10 * H);
  assert.ok(Math.abs(e.res.metal - (500 + 10 * p.metal)) < 1e-6);
  e.buildings.mineMetal = 10;
  assert.ok(E.energy(e).ratio < 1, 'mines without power run slow');
  e.buildings.power = 12;
  assert.equal(E.energy(e).ratio, 1);
  E.advance(e, 10000 * H);
  assert.equal(e.res.metal, E.storageCap(e), 'capped by the storage');
});

test('empire: buildings and research go through the queue, in order, and can be cancelled', async () => {
  const E = await logic();
  const e = E.newEmpire('volcanic', 0, 2);
  e.res = { metal: 1e6, crystal: 1e6, plasma: 1e6 };
  E.startBuilding(e, 'mineMetal', 0);
  assert.throws(() => E.startBuilding(e, 'power', 0), /déjà en cours/);
  assert.throws(() => E.startResearch(e, 'energy', 0), /débloqué/);
  const end = e.queue[0].endsAt;
  E.advance(e, end - 1);
  assert.equal(e.buildings.mineMetal, 0);
  const done = E.advance(e, end);
  assert.equal(e.buildings.mineMetal, 1);
  assert.equal(done.length, 1);
  e.buildings.lab = 1;
  const before = { ...e.res };
  E.startResearch(e, 'energy', end);
  assert.ok(e.res.crystal < before.crystal);
  assert.ok(E.cancel(e, 'research'));
  assert.equal(e.res.crystal, before.crystal, 'refunded');
  assert.ok(E.buildTime(e, 'mineMetal', 10) > E.buildTime(e, 'mineMetal', 2));
  e.buildings.robotics = 3;
  assert.ok(E.buildTime(e, 'mineMetal', 10) < E.buildTime({ ...e, buildings: { ...e.buildings, robotics: 0 } }, 'mineMetal', 10), 'robots build faster');
  const back = E.normalizeEmpire(JSON.parse(JSON.stringify(e)));
  assert.deepEqual(back.buildings, e.buildings);
});

test('empire: API is SuperAdmin only and the server is the authority', async () => {
  const srv = await startServer({ superadmins: ['boss'] });
  try {
    const user = http(srv.base, await register(srv.base, 'alice'));
    assert.equal((await user('GET', '/api/empire')).status, 403, 'secret for now');
    const boss = http(srv.base, await register(srv.base, 'boss'));
    assert.equal((await boss('GET', '/api/empire')).body.empire, null);
    assert.equal((await boss('POST', '/api/empire/start', { type: 'nope' })).status, 400);
    const start = await boss('POST', '/api/empire/start', { type: 'icy' });
    assert.equal(start.body.empire.planet.type, 'icy');
    assert.equal((await boss('POST', '/api/empire/start', { type: 'icy' })).status, 400, 'one planet');
    assert.equal((await boss('POST', '/api/empire/build', { key: 'mineCrystal' })).status, 400, 'locked at first');
    const b = await boss('POST', '/api/empire/build', { key: 'mineMetal' });
    assert.equal(b.status, 200);
    assert.equal(b.body.empire.queue.length, 1);
    assert.equal((await boss('POST', '/api/empire/build', { key: 'power' })).status, 400, 'one job at a time');
    assert.equal((await boss('POST', '/api/empire/cancel', { kind: 'building' })).body.empire.queue.length, 0);
    // Frames: none yet, can't pick one you don't own.
    assert.deepEqual((await user('GET', '/api/me/frames')).body, { frames: [], selected: null });
    assert.equal((await user('PUT', '/api/me/frame', { frame: 'portal' })).status, 403);
    const me = (await user('GET', '/api/me')).body.user;
    assert.equal((await boss('POST', `/api/admin/users/${me.id}/frames`, { frame: 'portal', season: 1, label: 'Saison 1' })).status, 200);
    assert.equal((await user('PUT', '/api/me/frame', { frame: 'portal' })).status, 200);
    assert.equal((await user('GET', '/api/me')).body.user.frame, 'portal');
    assert.equal((await user('GET', '/api/me/frames')).body.frames[0].season, 1);
  } finally {
    await srv.stop();
  }
});

test('empire: buildings and research unlock step by step', async () => {
  const E = await logic();
  const e = E.newEmpire('rocky', 0, 3);
  const open = (kind, defs) => Object.keys(defs).filter((k) => E.unlocked(e, kind, k));
  assert.deepEqual(open('building', E.BUILDINGS).sort(), ['mineMetal', 'power'], 'only two at first');
  assert.deepEqual(open('research', E.RESEARCH), []);
  e.buildings.mineMetal = 2;
  assert.ok(E.unlocked(e, 'building', 'mineCrystal'));
  assert.deepEqual(E.missing(e, 'building', 'lab').map((m) => m.name), ['Mine de cristal', 'Usine de robots']);
  Object.assign(e.buildings, { mineCrystal: 4, power: 4, mineMetal: 5, robotics: 1, lab: 2 });
  assert.ok(E.unlocked(e, 'building', 'lab'));
  assert.ok(E.unlocked(e, 'research', 'energy'));
  assert.equal(E.unlocked(e, 'research', 'extraction'), false, 'needs energy 2 first');
  e.research.energy = 2;
  assert.ok(E.unlocked(e, 'research', 'extraction'));
});
