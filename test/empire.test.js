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
  assert.ok(Math.abs(e.res.metal - (E.START_RES.metal + 10 * p.metal)) < 1e-6);
  e.planets[0].buildings.mineMetal = 10;
  assert.ok(E.energy(e, 0).ratio < 1, 'mines without power run slow');
  e.planets[0].buildings.power = 12;
  assert.equal(E.energy(e, 0).ratio, 1);
  E.advance(e, 10000 * H);
  assert.equal(e.res.metal, E.storageCap(e), 'capped by the storage');
});

test('empire: head start, production ×3 for the first hours (split exactly when it ends)', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 5);
  const boosted = E.production(e).metal;
  assert.equal(E.startBoostEnd(e), E.START_BOOST.for);
  const later = E.newEmpire(0, 5);
  later.lastTick = E.START_BOOST.for;
  assert.equal(E.startBoostEnd(later), 0, 'over');
  const normal = E.production(later).metal;
  assert.ok(Math.abs(boosted - normal * E.START_BOOST.factor) < 1e-6);
  E.advance(e, E.START_BOOST.for + 10 * H); // offline across the end
  const expected = E.START_RES.metal + boosted * E.START_BOOST.for / H + normal * 10;
  assert.ok(Math.abs(e.res.metal - Math.min(expected, E.storageCap(e))) < 1e-6);
});

test('empire: up to 3 stacked jobs per line, run one after the other; cancelling moves the rest up', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 9);
  e.res = { metal: 1e7, crystal: 1e7, plasma: 1e7 };
  E.startBuilding(e, 0, 'mineMetal', 0);
  E.startBuilding(e, 0, 'mineMetal', 0);
  E.startBuilding(e, 0, 'mineCrystal', 0); // unlocked by the queued mine level 2
  assert.deepEqual(e.queue.map((q) => [q.key, q.level]), [['mineMetal', 1], ['mineMetal', 2], ['mineCrystal', 1]]);
  assert.equal(e.queue[1].startsAt, e.queue[0].endsAt, 'one after the other');
  assert.equal(e.queue[2].startsAt, e.queue[1].endsAt);
  assert.throws(() => E.startBuilding(e, 0, 'power', 0), /File pleine/);
  const res = { ...e.res };
  // Cancelling the running job: its level 2 and the crystal mine it unlocked are refunded too.
  assert.ok(E.cancel(e, 'building', 0, e.queue[0].endsAt, 0));
  assert.equal(e.queue.length, 0);
  const back = (k) => E.buildingCost(k, 1).metal + (k === 'mineMetal' ? E.buildingCost(k, 2).metal : 0);
  assert.equal(e.res.metal, res.metal + back('mineMetal') + back('mineCrystal'));
  // Cancelling a waiting job moves the next one up.
  E.startBuilding(e, 0, 'mineMetal', 0);
  E.startBuilding(e, 0, 'power', 0);
  E.startBuilding(e, 0, 'power', 0);
  const [a, b] = e.queue;
  E.cancel(e, 'building', 0, a.endsAt, 1000);
  assert.deepEqual(e.queue.map((q) => [q.key, q.level]), [['power', 1], ['power', 2]]);
  assert.equal(e.queue[0].startsAt, 1000, 'starts now');
  assert.equal(e.queue[0].endsAt - e.queue[0].startsAt, b.endsAt - b.startsAt, 'same length');
  assert.equal(e.queue[1].startsAt, e.queue[0].endsAt);
  E.advance(e, e.queue[1].endsAt);
  assert.equal(e.planets[0].buildings.power, 2, 'both done in order');
});

test('empire: step-by-step unlocks, queue per planet, cancel, and up to 3 colonies', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 9);
  e.res = { metal: 1e7, crystal: 1e7, plasma: 1e7 };
  const open = Object.keys(E.BUILDINGS).filter((k) => E.unlocked(e, 'building', k, 0));
  assert.deepEqual(open.sort(), ['mineMetal', 'power'], 'only two at first');
  E.startBuilding(e, 0, 'mineMetal', 0);
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

test('empire: API is open to players and the server is the authority', async () => {
  const srv = await startServer({ superadmins: ['boss'] });
  try {
    const user = http(srv.base, await register(srv.base, 'alice'));
    assert.equal((await user('GET', '/api/empire')).body.empire, null, 'open to every player');
    assert.equal((await user('POST', '/api/empire/swarm/now')).status, 403, 'test wave: SuperAdmin only');
    const boss = http(srv.base, await register(srv.base, 'boss'));
    assert.equal((await boss('GET', '/api/empire')).body.empire, null);
    const start = await boss('POST', '/api/empire/start');
    assert.equal(start.body.empire.planets.length, 1);
    assert.equal((await boss('POST', '/api/empire/start')).status, 400, 'one empire');
    assert.equal((await boss('POST', '/api/empire/build', { planet: 0, key: 'mineCrystal' })).status, 400, 'locked at first');
    const b = await boss('POST', '/api/empire/build', { planet: 0, key: 'mineMetal' });
    assert.equal(b.status, 200);
    assert.equal(b.body.empire.queue.length, 1);
    assert.equal((await boss('POST', '/api/empire/build', { planet: 0, key: 'power' })).status, 200, 'stacked');
    const third = await boss('POST', '/api/empire/build', { planet: 0, key: 'mineMetal' });
    assert.equal(third.body.empire.queue.at(-1).level, 2, 'after the queued level 1');
    assert.match((await boss('POST', '/api/empire/build', { planet: 0, key: 'power' })).body.error, /File pleine/, '3 at most');
    assert.equal((await boss('POST', '/api/empire/build', { planet: 1, key: 'power' })).status, 400, 'no such planet');
    assert.equal((await boss('POST', '/api/empire/colonize')).status, 400, 'needs Colonisation');
    const first = third.body.empire.queue.find((q) => q.key === 'mineMetal' && q.level === 1);
    const c = await boss('POST', '/api/empire/cancel', { kind: 'building', planet: 0, at: first.endsAt });
    assert.deepEqual(c.body.empire.queue.map((q) => q.key), ['power'], 'its level 2 goes too, the plant moves up');
    assert.equal((await boss('POST', '/api/empire/cancel', { kind: 'building', planet: 0 })).body.empire.queue.length, 0);
    assert.ok((await boss('GET', '/api/empire')).body.empire.res.metal >= start.body.empire.res.metal, 'all refunded');
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

test('empire: trade between players: cargos (flight, delivery, return) and the market', async () => {
  const srv = await startServer({ superadmins: ['ana', 'bob'] });
  try {
    const ana = http(srv.base, await register(srv.base, 'ana'));
    const bob = http(srv.base, await register(srv.base, 'bob'));
    await ana('POST', '/api/empire/start');
    await bob('POST', '/api/empire/start');
    const id = (name) => srv.repo.findUserByName(name).id;
    // Test data: Ana is rich and has cargos.
    const a = srv.repo.getEmpire(id('ana'));
    a.res = { metal: 50000, crystal: 20000, plasma: 5000 };
    a.ships = { cargo: 2 };
    srv.repo.putEmpire(id('ana'), a);
    // Galaxy lists both.
    const galaxy = (await ana('GET', '/api/empire/galaxy')).body.empires;
    assert.deepEqual(galaxy.map((g) => g.username).sort(), ['ana', 'bob']);
    // Send 8 000 metal: 2 cargos.
    assert.equal((await ana('POST', '/api/empire/send', { to: 'bob', load: { metal: 12000 } })).status, 400, 'not enough cargos');
    const sent = await ana('POST', '/api/empire/send', { to: 'bob', load: { metal: 8000 } });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.empire.ships.cargo, 0);
    assert.equal((await ana('POST', '/api/empire/send', { to: 'nobody', load: { metal: 1 } })).status, 400);
    const fleets = (await bob('GET', '/api/empire/fleets')).body.fleets;
    assert.equal(fleets.length, 1);
    assert.equal(fleets[0].mine, false);
    // Time passes: the fleet lands at Bob's, then the cargos come back to Ana.
    srv.repo.raw.exec('UPDATE empire_fleets SET arrives_at = 0');
    const bobNow = (await bob('GET', '/api/empire')).body.empire;
    assert.ok(bobNow.res.metal >= 8000, 'delivered');
    assert.equal((await ana('GET', '/api/empire')).body.empire.ships.cargo, 0, 'still flying back');
    srv.repo.raw.exec('UPDATE empire_fleets SET returns_at = 0');
    assert.equal((await ana('GET', '/api/empire')).body.empire.ships.cargo, 2, 'back home');
    // Market: Ana offers 1 000 crystal for 3 000 metal; Bob takes it.
    const before = (await ana('GET', '/api/empire')).body.empire.res.crystal;
    assert.equal((await ana('POST', '/api/empire/market', { give: 'crystal', giveAmount: 1000, want: 'metal', wantAmount: 3000 })).status, 200);
    assert.equal((await ana('GET', '/api/empire')).body.empire.res.crystal <= before - 1000 + 1, true, 'held');
    const offer = (await bob('GET', '/api/empire/market')).body.offers[0];
    assert.equal(offer.seller, 'ana');
    assert.equal((await ana('POST', `/api/empire/market/${offer.id}/accept`)).status, 400, 'not your own offer');
    const bobBefore = (await bob('GET', '/api/empire')).body.empire.res;
    const took = await bob('POST', `/api/empire/market/${offer.id}/accept`);
    assert.equal(took.status, 200);
    assert.ok(took.body.empire.res.crystal < bobBefore.crystal + 1000 - 1, 'not there yet: the goods travel');
    assert.ok(took.body.empire.res.metal <= bobBefore.metal - 3000 + 1, 'paid');
    assert.equal((await bob('POST', `/api/empire/market/${offer.id}/accept`)).status, 400, 'taken once');
    assert.equal((await bob('GET', '/api/empire/fleets')).body.fleets.filter((f) => f.kind === 'market').length, 2, 'both parts on their way');
    srv.repo.raw.exec("UPDATE empire_fleets SET arrives_at = 0, returns_at = 0 WHERE kind = 'market'");
    assert.ok((await bob('GET', '/api/empire')).body.empire.res.crystal >= bobBefore.crystal + 1000 - 1, 'arrived');
    const anaAfter = (await ana('GET', '/api/empire')).body.empire.res;
    assert.ok(anaAfter.metal >= 50000 - 8000 + 3000, 'the seller got paid on arrival');
    assert.equal((await bob('GET', '/api/empire/market')).body.trades.length, 1);
  } finally {
    await srv.stop();
  }
});

test('empire: activity, active, absent, then gone (sooner for an empire barely started)', async () => {
  const E = await logic();
  const D = 24 * H;
  const e = E.newEmpire(0, 3);
  assert.equal(E.activity(e, 1 * D), 'active');
  assert.equal(E.activity(e, 2 * D), 'gone', 'barely started and away for 2 days');
  e.planets[0].buildings.mineMetal = 4;
  assert.equal(E.activity(e, 2 * D), 'active', 'a real start stays');
  assert.equal(E.activity(e, 4 * D), 'idle');
  assert.equal(E.activity(e, 8 * D), 'gone');
  e.seenAt = 7 * D;
  assert.equal(E.activity(e, 8 * D), 'active', 'seenAt, when known, counts');
  assert.equal(E.normalizeEmpire(JSON.parse(JSON.stringify(e))).seenAt, 7 * D, 'kept when saved');
});

test('empire: players who left no longer count, leave the map, and their market offers are refunded', async () => {
  const srv = await startServer();
  try {
    const ana = http(srv.base, await register(srv.base, 'ana'));
    const bob = http(srv.base, await register(srv.base, 'bob'));
    await ana('POST', '/api/empire/start');
    await bob('POST', '/api/empire/start');
    assert.equal((await ana('GET', '/api/empire/portal')).body.players, 2);
    assert.equal((await bob('POST', '/api/empire/market', { give: 'metal', giveAmount: 500, want: 'crystal', wantAmount: 500 })).status, 200);
    const metal = (await bob('GET', '/api/empire')).body.empire.res.metal;
    // Bob started and never came back.
    const id = srv.repo.findUserByName('bob').id;
    const b = srv.repo.getEmpire(id);
    b.seenAt = b.lastTick = Date.now() - 3 * 24 * 3600e3;
    srv.repo.putEmpire(id, b);
    assert.equal((await ana('GET', '/api/empire/portal')).body.players, 1, 'the Portail is for those who play');
    assert.equal((await ana('GET', '/api/empire/swarm')).body.players, 1);
    assert.deepEqual((await ana('GET', '/api/empire/galaxy')).body.empires.map((g) => g.username), ['ana'], 'off the map');
    assert.equal((await ana('GET', '/api/empire/market')).body.offers.length, 0, 'offer withdrawn');
    assert.match((await ana('POST', '/api/empire/send', { to: 'bob', load: { metal: 100 } })).body.error, /ne joue plus/);
    // Bob comes back: his deposit is there, and he counts again.
    const back = (await bob('GET', '/api/empire')).body.empire;
    assert.ok(back.res.metal >= metal + 500, 'refunded');
    assert.equal((await ana('GET', '/api/empire/portal')).body.players, 2);
    const galaxy = (await ana('GET', '/api/empire/galaxy')).body.empires;
    assert.equal(galaxy.find((g) => g.username === 'bob').status, 'active');
  } finally { await srv.stop(); }
});

test('empire: the Portail de Jimmy, built together, phase by phase', async () => {
  const E = await logic();
  assert.ok(E.portalNeeds(1, 1).metal > 2 * E.portalNeeds(0, 1).metal, 'each phase far dearer');
  assert.ok(E.portalNeeds(0, 5).metal > E.portalNeeds(0, 1).metal, 'more players, more needs');
  const e = E.newEmpire(0, 3);
  const p0 = E.production(e).metal;
  e.portal = 1;
  assert.ok(Math.abs(E.production(e).metal - p0 * 1.1) < 1e-6, 'phase 1: +10 % production for all');
  const srv = await startServer({ superadmins: ['ana'] });
  try {
    const ana = http(srv.base, await register(srv.base, 'ana'));
    await ana('POST', '/api/empire/start');
    const id = srv.repo.findUserByName('ana').id;
    const d = srv.repo.getEmpire(id);
    const needs = E.portalNeeds(0, 1);
    d.res = { metal: needs.metal + 5000, crystal: needs.crystal, plasma: needs.plasma };
    d.ships = { cargo: 50 };
    srv.repo.putEmpire(id, d);
    let portal = (await ana('GET', '/api/empire/portal')).body;
    assert.deepEqual([portal.phase, portal.season], [0, 1]);
    const sent = await ana('POST', '/api/empire/portal/contribute', { load: { ...needs, metal: needs.metal + 5000 } });
    assert.equal(sent.status, 200);
    portal = (await ana('GET', '/api/empire/portal')).body;
    assert.equal(portal.phase, 0, 'still travelling');
    assert.equal(portal.inFlight.metal, needs.metal + 5000);
    srv.repo.raw.exec("UPDATE empire_fleets SET arrives_at = 0 WHERE kind = 'portal'");
    portal = (await ana('GET', '/api/empire/portal')).body;
    assert.equal(portal.phase, 1, 'phase 1 done');
    assert.equal(portal.progress.metal, 5000, 'the surplus goes to the next phase');
    assert.equal(portal.top[0].username, 'ana');
    assert.equal(portal.mine.points, E.contributionPoints({ ...needs, metal: needs.metal + 5000 }));
    assert.equal((await ana('GET', '/api/empire')).body.empire.portal, 1, 'the bonus reaches the empires');
    assert.equal((await ana('GET', '/api/empire')).body.empire.res.metal < 100, true, 'nothing added back to the sender');
  } finally {
    await srv.stop();
  }
});

test('empire: la Nuée, weekly waves against the guards of the whole galaxy', async () => {
  const E = await logic();
  assert.ok(E.swarmStrength(2, 1) > E.swarmStrength(1, 1) && E.swarmStrength(1, 4) > E.swarmStrength(1, 1), 'stronger each wave and with more players');
  const held = E.resolveWave(1, 1, { 7: 20 });
  assert.equal(held.won, true);
  assert.equal(held.losses[7], 2, '10 % lost');
  assert.deepEqual(held.rewards[7], E.swarmReward(1, 20));
  const broken = E.resolveWave(1, 1, { 7: 3 });
  assert.equal(broken.won, false);
  assert.equal(broken.losses[7], 2, 'half lost (rounded up)');
  assert.deepEqual(broken.rewards, {});
  const e = E.newEmpire(0, 3);
  const p0 = E.production(e).metal;
  e.swarmMalus = true;
  assert.ok(Math.abs(E.production(e).metal - p0 * E.SWARM.malus) < 1e-6, 'malus while the Shield is broken');

  const srv = await startServer({ superadmins: ['ana'] });
  try {
    const ana = http(srv.base, await register(srv.base, 'ana'));
    await ana('POST', '/api/empire/start');
    const id = srv.repo.findUserByName('ana').id;
    const d = srv.repo.getEmpire(id);
    d.ships = { cargo: 0, guard: 30 };
    srv.repo.putEmpire(id, d);
    let S = (await ana('GET', '/api/empire/swarm')).body;
    assert.equal(S.wave, 1);
    assert.ok(S.nextAt > Date.now() + 6 * 24 * 3600e3, 'first wave in a week');
    assert.equal((await ana('POST', '/api/empire/swarm/engage', { count: 40 })).status, 400, 'not that many');
    assert.equal((await ana('POST', '/api/empire/swarm/engage', { count: 25 })).status, 200);
    S = (await ana('GET', '/api/empire/swarm')).body;
    assert.deepEqual([S.mine.alive, S.mine.inFlight, S.defense], [0, 25, 0], 'still flying');
    srv.repo.raw.exec("UPDATE empire_fleets SET arrives_at = 0 WHERE kind = 'guard'");
    S = (await ana('GET', '/api/empire/swarm')).body;
    assert.deepEqual([S.mine.alive, S.mine.inFlight, S.defense], [25, 0, 25]);
    // The wave hits: 25 guards against 10, held.
    const before = (await ana('GET', '/api/empire')).body.empire;
    const hit = (await ana('POST', '/api/empire/swarm/now')).body;
    assert.equal(hit.last.won, true);
    const after = (await ana('GET', '/api/empire')).body.empire;
    const reward = E.swarmReward(1, 25);
    assert.ok(after.res.plasma - before.res.plasma >= reward.plasma - 1 || after.res.plasma >= E.storageCap(E.normalizeEmpire(after)) - 1, 'reward delivered');
    assert.equal(after.ships.guard, 5, 'engaged guards never come back to the port');
    S = (await ana('GET', '/api/empire/swarm')).body;
    assert.deepEqual([S.wave, S.mine.alive, S.mine.lost, S.mine.waves], [2, 22, 3, 1], "10 % lost (2.5 rounded)");
    assert.equal(S.malusUntil, null);
    // Next waves until the Shield breaks: malus for everybody.
    let last;
    for (let k = 0; k < 10 && (!last || last.won); k++) last = (await ana('POST', '/api/empire/swarm/now')).body.last;
    assert.equal(last.won, false);
    S = (await ana('GET', '/api/empire/swarm')).body;
    assert.ok(S.malusUntil > Date.now());
    assert.equal((await ana('GET', '/api/empire')).body.empire.swarmMalus, true);
  } finally {
    await srv.stop();
  }
});

test('empire: expeditions into the unknown (fate drawn at launch, told at return), relics', async () => {
  const E = await logic();
  // A fixed sequence of random numbers: the first one picks the event.
  const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
  const trip = { explorers: 2, guards: 0, hours: 2, astro: 1 };
  assert.equal(E.expeditionOutcome(seq(0), trip).kind, 'resources');
  const hole = E.expeditionOutcome(seq(0.9999), trip);
  assert.equal(hole.kind, 'blackhole');
  assert.deepEqual(hole.lost, { explorer: 2, guard: 0 });
  const kinds = new Set();
  for (let k = 0; k < 3000; k++) kinds.add(E.expeditionOutcome(Math.random, trip).kind);
  for (const k of ['resources', 'deposit', 'nothing', 'pirates', 'wreck', 'relic', 'storm', 'butch', 'blackhole']) assert.ok(kinds.has(k), k);
  // Relics: permanent bonuses, 10 max each.
  const e = E.newEmpire(0, 3);
  const p0 = E.production(e).metal;
  e.relics.drill = 2;
  assert.ok(Math.abs(E.production(e).metal - p0 * 1.06) < 1e-6);
  assert.equal(E.normalizeEmpire({ ...e, relics: { drill: 50 } }).relics.drill, E.RELIC_MAX);
  // Locked without the research, and the explorer needs it too.
  assert.throws(() => E.prepareExpedition(e, 1, 0, 2, 0), /Astrophysique/);
  e.planets[0].buildings.shipyard = 3;
  assert.match(E.shipBlocker(e, 0, 'explorer', 1), /astrophysique/);

  const srv = await startServer({ superadmins: ['ana'] });
  try {
    const ana = http(srv.base, await register(srv.base, 'ana'));
    await ana('POST', '/api/empire/start');
    const id = srv.repo.findUserByName('ana').id;
    const d = srv.repo.getEmpire(id);
    d.research.astrophysics = 1;
    d.ships = { cargo: 0, guard: 4, explorer: 3 };
    srv.repo.putEmpire(id, d);
    assert.equal((await ana('POST', '/api/empire/expedition', { explorers: 5, guards: 0, hours: 2 })).status, 400, 'not that many');
    assert.equal((await ana('POST', '/api/empire/expedition', { explorers: 2, guards: 1, hours: 3 })).status, 400, 'bad duration');
    const go = await ana('POST', '/api/empire/expedition', { explorers: 2, guards: 1, hours: 2 });
    assert.equal(go.status, 200);
    assert.deepEqual([go.body.empire.ships.explorer, go.body.empire.ships.guard], [1, 3]);
    assert.equal((await ana('POST', '/api/empire/expedition', { explorers: 1, hours: 1 })).status, 400, 'one at a time with Astrophysique 1');
    const fleets = (await ana('GET', '/api/empire/fleets')).body.fleets;
    assert.equal(fleets[0].kind, 'expedition');
    assert.equal(fleets[0].trip.outcome, undefined, 'the fate stays secret');
    // Back: ships, loot and report.
    const fate = JSON.parse(srv.repo.raw.prepare("SELECT meta FROM empire_fleets WHERE kind = 'expedition'").get().meta).outcome;
    srv.repo.raw.exec("UPDATE empire_fleets SET arrives_at = 0, returns_at = 0 WHERE kind = 'expedition'");
    const back = (await ana('GET', '/api/empire')).body.empire;
    assert.equal(back.log.length, 1);
    assert.equal(back.log[0].kind, fate.kind);
    assert.equal(back.ships.explorer, 1 + 2 - fate.lost.explorer + (fate.found.explorer || 0));
    assert.equal(back.ships.guard, 3 + 1 - fate.lost.guard + (fate.found.guard || 0));
    if (fate.relic) assert.equal(back.relics[fate.relic], 1);
    assert.equal((await ana('GET', '/api/empire')).body.empire.log.length, 1, 'counted once');
    assert.equal((await ana('POST', '/api/empire/expedition', { explorers: 1, hours: 1 })).status, back.ships.explorer ? 200 : 400);
  } finally {
    await srv.stop();
  }
});

test('empire: a paused mine produces nothing and leaves its energy to the others', async () => {
  const E = await logic();
  const e = E.newEmpire(0, 3);
  Object.assign(e.planets[0].buildings, { mineMetal: 4, mineCrystal: 3, power: 3 });
  const before = E.energy(e, 0);
  assert.ok(before.ratio < 1, 'not enough energy for both');
  assert.equal(E.toggleMine(e, 0, 'mineCrystal'), true);
  assert.equal(E.energy(e, 0).used, before.used - E.mineEnergy('mineCrystal', 3));
  const p = E.planetProduction(e, 0);
  assert.ok(p.crystal < 20, 'only the little home production is left');
  assert.equal(E.normalizeEmpire(JSON.parse(JSON.stringify(e))).planets[0].off.mineCrystal, true, 'kept when saved');
  assert.equal(E.toggleMine(e, 0, 'mineCrystal'), false);
  assert.throws(() => E.toggleMine(e, 0, 'power'), /mines/);
  const srv = await startServer({ superadmins: ['ana'] });
  try {
    const ana = http(srv.base, await register(srv.base, 'ana'));
    await ana('POST', '/api/empire/start');
    const r = await ana('POST', '/api/empire/pause', { planet: 0, key: 'mineMetal' });
    assert.equal(r.status, 200);
    assert.equal(r.body.empire.planets[0].off.mineMetal, true);
  } finally {
    await srv.stop();
  }
});
