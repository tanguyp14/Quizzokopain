const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http } = require('./helpers');

const logic = () => import('../public/js/games/blast/logic.js');

test('blast: buying, levelling and merging ships', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.equal(s.tiers[0].count, 1);
  assert.equal(L.buyShip(s), false, 'no money, no ship');
  s.money = 1e6;
  assert.ok(L.buyShip(s, 4));
  assert.equal(s.tiers[0].count, 5);
  assert.equal(s.bought, 4);
  // Five scouts merge into one fighter; the scout price drops again.
  assert.equal(s.stats.merges, 0);
  const before = L.shipCost(s);
  assert.ok(L.canMerge(s, 1));
  assert.ok(L.mergeShips(s, 1));
  assert.deepEqual([s.tiers[0].count, s.tiers[1].count], [0, 1]);
  assert.ok(L.shipCost(s) < before);
  assert.equal(L.mergeShips(s, 1), false);
  assert.equal(s.stats.merges, 1);
  // Levels: damage grows, several levels cost the geometric sum.
  const dmg = L.shipDamage(1, s.tiers[1].level);
  const cost3 = L.levelCost(1, 1, 3);
  assert.ok(Math.abs(cost3 - (L.levelCost(1, 1) + L.levelCost(1, 2) + L.levelCost(1, 3))) < 1e-6);
  const money = s.money;
  assert.ok(L.levelUp(s, 1, 3));
  assert.equal(s.tiers[1].level, 4);
  assert.ok(Math.abs(money - s.money - cost3) < 1e-6);
  assert.ok(L.shipDamage(1, 4) > dmg);
  assert.ok(L.shipDamage(1, 1) > L.shipDamage(0, 1) * L.MERGE_COST, 'a merge is worth more than its ships');
  // Upgrades stop at their max.
  s.money = 1e300;
  while (L.buyUpgrade(s, 'crit'));
  assert.equal(s.upgrades.crit, L.UPGRADES.crit.max);
});

test('blast: prestige resets the run for 10M (then ×3) and adds 10 % damage', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = L.prestigeCost(s) - 1;
  s.stage = 31;
  s.maxStage = 31;
  s.totalEarned = 5e7;
  s.tiers[2] = { count: 3, level: 40 };
  s.upgrades.gain = 10;
  assert.equal(L.doPrestige(s), false, 'needs 10M');
  s.money = L.prestigeCost(s);
  const dmg = L.fleetDamage(s, 0);
  assert.equal(L.doPrestige(s), true);
  assert.equal(s.prestige, 1);
  assert.deepEqual([s.money, s.stage, s.tiers[0].count, s.tiers[2].count, s.upgrades.gain], [0, 1, 1, 0, 0]);
  assert.deepEqual([s.maxStage, s.totalEarned], [31, 5e7], 'record and lifetime earnings kept');
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 1.1) < 1e-9);
  assert.equal(L.prestigeCost(s), 30_000_000, 'the price triples');
  s.money = 29_999_999;
  assert.equal(L.doPrestige(s), false);
  s.money = 30_000_000;
  L.doPrestige(s);
  assert.equal(L.prestigeCost(s), 90_000_000);
  assert.ok(Math.abs(L.prestigeFactor(s) - 1.21) < 1e-9, 'compounded');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).prestige, 2);
});

test('blast: star tree, stars from prestige and starting bonuses', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = L.prestigeCost(s);
  s.runBest = 34;
  assert.equal(L.starsFor(s), 4, '1 + 1 per 10 sectors');
  s.stars = 2;
  L.doPrestige(s);
  assert.equal(s.stars, 6);
  assert.equal(s.runBest, 1);
  assert.equal(L.buySkill(s, 'merge'), true, 'costs 6');
  assert.equal(s.stars, 0);
  assert.equal(L.mergeCost(s), 4);
  assert.equal(L.buySkill(s, 'power'), false, 'no stars left');
  s.stars = 10;
  L.buySkill(s, 'power');
  assert.ok(Math.abs(L.fleetDamage(s, 0) - L.shipDamage(0, 1) * 1.1 * 1.25) < 1e-9);
  L.buySkill(s, 'fleet');
  L.buySkill(s, 'bank');
  s.money = L.prestigeCost(s);
  L.doPrestige(s);
  assert.equal(s.tiers[0].count, 3, '1 + 2 scouts');
  assert.equal(s.money, 1000);
  assert.deepEqual([s.skills.merge, s.skills.power, s.skills.fleet], [1, 1, 1], 'skills are kept');
});

test('blast: daily missions are the same for everyone and pay a star when all done', async () => {
  const L = await logic();
  const a = L.newSave();
  const b = L.newSave();
  assert.deepEqual(L.dailyMissions(a, '2026-09-27'), L.dailyMissions(b, '2026-09-27'));
  assert.equal(a.daily.missions.length, 3);
  assert.equal(new Set(a.daily.missions.map((m) => m.kind)).size, 3);
  assert.ok(a.daily.missions.every((m) => m.kind !== 'bosses'), 'no boss mission before sector 10');
  assert.equal(L.claimMission(a, 0), null, 'not done yet');
  for (const m of a.daily.missions) L.track(a, m.kind, 1e6);
  assert.equal(a.daily.missions[0].progress, a.daily.missions[0].target, 'capped');
  const first = L.claimMission(a, 0);
  assert.ok(first.credits > 0);
  assert.equal(first.star, false);
  L.claimMission(a, 1);
  assert.equal(L.claimMission(a, 2).star, true);
  assert.equal(a.stars, 1);
  assert.equal(L.claimMission(a, 2), null, 'claimed once');
  // Next day: new missions, stats kept.
  const blocks = a.stats.blocks;
  L.dailyMissions(a, '2026-09-28');
  assert.equal(a.daily.date, '2026-09-28');
  assert.ok(a.daily.missions.every((m) => !m.claimed && m.progress === 0));
  assert.equal(a.stats.blocks, blocks);
});

test('blast: special blocks, planets and themes', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.ok(L.isBossStage(10) && L.isBossStage(20) && !L.isBossStage(11));
  assert.equal(L.bossTime(s), 30);
  s.skills.boss = 2;
  assert.equal(L.bossTime(s), 50);
  assert.equal(L.themeFor(1).name, L.themeFor(10).name, 'the boss ends a zone');
  assert.notEqual(L.themeFor(10).name, L.themeFor(11).name);
  assert.ok(L.goldChance(s) < L.goldChance({ ...s, skills: { ...s.skills, gold: 3 } }));
  // Planets: one per 10 sectors, named, the same for everyone.
  assert.equal(L.planetName(10), 'Zorgon');
  assert.equal(L.planetName(20), 'Krypta');
  assert.equal(L.planetName(10), L.planetName(1), 'sectors 1-10 lead to the same planet');
  assert.equal(L.planetName(210), 'Zorgon II', 'names come back with a numeral');
  assert.deepEqual([1, 10, 11, 20, 21].map(L.planetsConquered), [0, 0, 1, 1, 2]);
});

test('blast: offline earnings, save repair and number format', async () => {
  const L = await logic();
  const s = L.newSave();
  s.rate = 100;
  s.savedAt = Date.now() - 10 * 3600 * 1000; // 10 h away, capped at 2 h
  const off = L.offlineEarnings(s);
  assert.equal(off.seconds, 2 * 3600);
  assert.ok(Math.abs(off.amount - 100 * 7200 * 0.1) < 1);

  const fixed = L.normalizeSave({ money: -5, stage: 'x', tiers: [{ count: 999, level: 3 }], upgrades: { gain: 1e9 } });
  assert.equal(fixed.money, 0);
  assert.equal(fixed.stage, 1);
  assert.equal(fixed.tiers[0].count, L.MAX_SHIPS_PER_TIER);
  assert.equal(fixed.upgrades.gain, L.UPGRADES.gain.max);
  assert.equal(L.normalizeSave(null).tiers[0].count, 1);

  assert.equal(L.fmt(999), '999');
  assert.equal(L.fmt(1234), '1,23K');
  assert.equal(L.fmt(18_305_000), '18,3M');
  assert.equal(L.fmt(2.5), '2,5');
});

test('blast: saves and leaderboard API', async () => {
  const srv = await startServer();
  try {
    const alice = http(srv.base, await register(srv.base, 'alice'));
    const bob = http(srv.base, await register(srv.base, 'bob'));
    assert.deepEqual((await alice('GET', '/api/arcade/blast/save')).body, { save: null });
    assert.equal((await alice('GET', '/api/arcade/nope/save')).status, 404);
    assert.equal((await alice('PUT', '/api/arcade/blast/save', { data: [1], score: 1 })).status, 400);
    assert.equal((await alice('PUT', '/api/arcade/blast/save', { data: { money: 1 }, score: -1 })).status, 400);
    assert.equal((await alice('PUT', '/api/arcade/blast/save', { data: { big: 'x'.repeat(70000) }, score: 1 })).status, 413);
    assert.equal((await alice('PUT', '/api/arcade/blast/save', { data: { money: 42 }, score: 12 })).status, 200);
    assert.equal((await bob('PUT', '/api/arcade/blast/save', { data: { money: 1 }, score: 30 })).status, 200);
    const carol = http(srv.base, await register(srv.base, 'carol'));
    assert.equal((await carol('PUT', '/api/arcade/blast/save', { data: { prestige: 2 }, score: 8 })).status, 200);
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save.data.money, 42);
    const board = (await alice('GET', '/api/arcade/blast/leaderboard')).body.players;
    // Prestiges first, then the best stage.
    assert.deepEqual(board.map((p) => [p.username, p.prestige, p.score]), [['carol', 2, 8], ['bob', 0, 30], ['alice', 0, 12]]);
    await alice('DELETE', '/api/arcade/blast/save');
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save, null);
  } finally {
    await srv.stop();
  }
});
