const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http } = require('./helpers');

const logic = () => import('../public/js/games/empire/logic.js');
const H = 3600 * 1000;

test('empire: random planets: home planet has all three resources, colonies can lack some', async () => {
  const E = await logic();
  let missingSeen = 0;
  const names = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const home = E.randomPlanet(seed, { home: true });
    assert.ok(E.RES_KEYS.every((r) => home.rates[r] > 0), 'nobody is stuck at the start');
    assert.ok(Math.max(...Object.values(home.rates)) >= 1.4 && Math.min(...Object.values(home.rates)) <= 0.8, 'a strong and a weak point');
    const colony = E.randomPlanet(seed * 7919, {});
    const absent = E.RES_KEYS.filter((r) => colony.rates[r] === 0).length;
    assert.ok(absent < 3, 'never all three missing');
    missingSeen += absent > 0;
    names.add(home.name);
  }
  assert.ok(missingSeen > 100, 'colonies often lack a resource');
  assert.ok(names.size > 150, 'varied names');
  assert.deepEqual(E.randomPlanet(42), E.randomPlanet(42), 'same seed, same planet');
});

test('empire: production over time (even offline), rates, energy and storage', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 5);
  const p = E.production(e);
  E.advance(e, 10 * H);
  assert.ok(Math.abs(e.res.metal - (500 + 10 * p.metal)) < 1e-6);
  e.planets[0].buildings.mineMetal = 10;
  assert.ok(E.energy(e, 0).ratio < 1, 'mines without power run slow');
  e.planets[0].buildings.power = 12;
  assert.equal(E.energy(e, 0).ratio, 1);
  E.advance(e, 10000 * H);
  assert.equal(e.res.metal, E.storageCap(e), 'capped by the storage');
});

test('empire: step-by-step unlocks, queue per planet, cancel, and up to 3 colonies', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 9);
  e.res = { metal: 1e7, crystal: 1e7, plasma: 1e7 };
  const open = Object.keys(E.BUILDINGS).filter((k) => E.unlocked(e, 'building', k, 0));
  assert.deepEqual(open.sort(), ['mineMetal', 'power'], 'only two at first');
  E.startBuilding(e, 0, 'mineMetal', 0);
  assert.throws(() => E.startBuilding(e, 0, 'power', 0), /déjà en cours/);
  assert.throws(() => E.startResearch(e, 'energy', 0), /débloqué/);
  E.advance(e, e.queue[0].endsAt);
  assert.equal(e.planets[0].buildings.mineMetal, 1);
  Object.assign(e.planets[0].buildings, { mineMetal: 5, power: 4, mineCrystal: 4, robotics: 1, lab: 3 });
  assert.ok(E.unlocked(e, 'research', 'energy'));
  const before = e.res.crystal;
  E.startResearch(e, 'energy', 0);
  assert.ok(E.cancel(e, 'research'));
  assert.equal(e.res.crystal, before, 'refunded');
  // Colonies.
  assert.match(E.colonyBlocker(e), /Colonisation niveau 1/);
  Object.assign(e.research, { energy: 3, extraction: 2, colonization: 2 });
  const i = E.colonize(e, 123);
  assert.equal(i, 1);
  E.colonize(e, 456);
  assert.equal(e.planets.length, 3);
  assert.match(E.colonyBlocker(e), /maximum/);
  // A colony builds on its own, and a missing resource has no mine.
  const lacking = [...Array(200).keys()].map((s) => E.randomPlanet(s * 31)).find((p) => p.rates.metal === 0);
  e.planets[2] = lacking;
  e.planets[2].buildings.mineMetal = 0;
  assert.match(E.buildBlocker(e, 2, 'mineMetal'), /Pas de métal/);
  E.startBuilding(e, 1, 'mineMetal', 0);
  E.startBuilding(e, 2, 'power', 0);
  assert.equal(e.queue.filter((q) => q.kind === 'building').length, 2, 'one job per planet');
  const back = E.normalizeEmpire(JSON.parse(JSON.stringify(e)));
  assert.equal(back.planets.length, 3);
  assert.deepEqual(back.planets[1].rates, e.planets[1].rates);
});

test('empire: API is SuperAdmin only and the server is the authority', async () => {
  const srv = await startServer({ superadmins: ['boss'] });
  try {
    const user = http(srv.base, await register(srv.base, 'alice'));
    assert.equal((await user('GET', '/api/empire')).status, 403, 'secret for now');
    const boss = http(srv.base, await register(srv.base, 'boss'));
    assert.equal((await boss('GET', '/api/empire')).body.empire, null);
    const start = await boss('POST', '/api/empire/start');
    assert.equal(start.body.empire.planets.length, 1);
    assert.equal((await boss('POST', '/api/empire/start')).status, 400, 'one empire');
    assert.equal((await boss('POST', '/api/empire/build', { planet: 0, key: 'mineCrystal' })).status, 400, 'locked at first');
    const b = await boss('POST', '/api/empire/build', { planet: 0, key: 'mineMetal' });
    assert.equal(b.status, 200);
    assert.equal(b.body.empire.queue.length, 1);
    assert.equal((await boss('POST', '/api/empire/build', { planet: 0, key: 'power' })).status, 400, 'one job at a time');
    assert.equal((await boss('POST', '/api/empire/build', { planet: 1, key: 'power' })).status, 400, 'no such planet');
    assert.equal((await boss('POST', '/api/empire/colonize')).status, 400, 'needs Colonisation');
    assert.equal((await boss('POST', '/api/empire/cancel', { kind: 'building', planet: 0 })).body.empire.queue.length, 0);
    // Frames: none yet, can't pick one you don't own.
    assert.deepEqual((await user('GET', '/api/me/frames')).body, { frames: [], selected: null });
    assert.equal((await user('PUT', '/api/me/frame', { frame: 'portal' })).status, 403);
    const me = (await user('GET', '/api/me')).body.user;
    assert.equal((await boss('POST', `/api/admin/users/${me.id}/frames`, { frame: 'portal', season: 1, label: 'Saison 1' })).status, 200);
    assert.equal((await user('PUT', '/api/me/frame', { frame: 'portal' })).status, 200);
    assert.equal((await user('GET', '/api/me')).body.user.frame, 'portal');
  } finally {
    await srv.stop();
  }
});

test('empire: Butch Pakovski comes by every 4 hours with one fixed deal and a stock', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 11);
  e.res = { metal: 1e6, crystal: 1e6, plasma: 1e6 };
  const now = 10 * E.BUTCH.every + 1000;
  const o = E.butchOffer(e, now);
  assert.notEqual(o.sells, o.wants);
  assert.ok(o.price >= 3 && o.price <= 6 && o.stock >= 1500);
  assert.deepEqual(E.butchOffer(e, now + 60000), o, 'same deal during the visit');
  const before = e.res[o.wants];
  E.butchBuy(e, 1000, now);
  assert.equal(e.res[o.wants], before - 1000 * o.price);
  assert.equal(E.butchOffer(e, now).left, o.stock - 1000);
  assert.throws(() => E.butchBuy(e, o.stock, now), /n’a plus que/);
  const next = E.butchOffer(e, now + E.BUTCH.every);
  assert.equal(next.left, next.stock, 'a new visit, a new stock');
});
