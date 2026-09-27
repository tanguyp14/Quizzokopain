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
  assert.equal(L.mergeShips(s, 1), 0, 'nothing left to merge');
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

test('blast: prestige resets the run for 10M (then +10M) and adds 10 % damage', async () => {
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
  assert.equal(L.prestigeCost(s), 20_000_000, 'the price goes up by 10M');
  s.money = 19_999_999;
  assert.equal(L.doPrestige(s), false);
  s.money = 20_000_000;
  L.doPrestige(s);
  assert.equal(L.prestigeCost(s), 30_000_000, '+10M each time');
  assert.equal(L.prestigeCost({ ...s, prestige: 3 }), 40_000_000);
  assert.equal(s.pp, 20, '10 workshop points per prestige');
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

test('blast: ship workshop opens with the first prestige and is kept', async () => {
  const L = await logic();
  const s = L.newSave();
  s.pp = 100;
  assert.equal(L.buyCaliber(s, 0), false, 'closed before the first prestige');
  s.money = L.prestigeCost(s);
  L.doPrestige(s);
  assert.equal(s.pp, 110);
  const dmg = L.fleetDamage(s, 2);
  assert.ok(L.buyCaliber(s, 2));
  assert.equal(s.pp, 110 - L.CALIBER.cost(0, 2));
  assert.ok(Math.abs(L.fleetDamage(s, 2) - dmg * 1.25) < 1e-9);
  assert.equal(L.caliberCost(s, 2), L.CALIBER.cost(1, 2), 'caliber price rises');
  assert.ok(L.buyModule(s, 2));
  assert.equal(L.buyModule(s, 2), false, 'a module is bought once');
  assert.ok(L.hasModule(s, 2));
  const tap = L.clickDamage(s);
  assert.ok(L.buyFinger(s));
  assert.ok(Math.abs(L.clickDamage(s) - tap * 1.1) < 1e-9);
  assert.ok(L.buyFingerModule(s, 'auto'));
  s.money = L.prestigeCost(s);
  L.doPrestige(s);
  assert.deepEqual([s.workshop.caliber[2], s.workshop.modules[2], s.workshop.finger, s.workshop.fingerModules.auto], [1, true, 1, true], 'kept after a prestige');
  const back = L.normalizeSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.workshop, s.workshop);
  assert.equal(back.pp, s.pp);
  assert.equal(back.ppEarned, 20, "2 prestiges");
});

test('blast: games in progress get the points of their earlier prestiges', async () => {
  const L = await logic();
  // A save from before the workshop: 3 prestiges, no points.
  const old = L.normalizeSave({ prestige: 3, stage: 4 });
  assert.deepEqual([old.pp, old.ppEarned, L.workshopOpen(old)], [30, 30, true]);
  // Prestiges done before and after the points existed, some points already spent.
  const mixed = L.normalizeSave({ prestige: 3, pp: 5, workshop: { caliber: [1, 0, 0, 0, 0, 0, 0, 0], modules: [], finger: 0, fingerModules: {} } });
  assert.equal(mixed.pp, 30 - 5, 'owned + spent = earned');
  // Up-to-date saves are left alone.
  const fine = L.normalizeSave({ prestige: 1, pp: 10, ppEarned: 10 });
  assert.equal(fine.pp, 10);
  assert.equal(L.workshopOpen(L.newSave()), false, 'locked until 10 points');
});

test('blast: the forge opens at prestige 5 for 15 points and turns ores into advanced upgrades', async () => {
  const L = await logic();
  const s = L.newSave();
  s.prestige = 4;
  s.pp = 40;
  s.ppEarned = 40;
  assert.equal(L.forgeVisible(s), false);
  assert.equal(L.unlockForge(s), false, 'prestige 5 needed');
  s.prestige = 5;
  s.ppEarned = 50;
  assert.ok(L.forgeVisible(s));
  s.pp = 14;
  assert.equal(L.unlockForge(s), false, '15 points needed');
  s.pp = 50;
  assert.ok(L.unlockForge(s));
  assert.equal(s.pp, 35);
  // One ore per zone of 10 sectors.
  assert.deepEqual([1, 10, 11, 20, 61, 71].map(L.resourceFor), [0, 0, 1, 1, 6, 0]);
  // Recipe: X of one ore + Y of another.
  assert.deepEqual(L.forgeRecipe('alloy', 0, 0), [{ res: 0, amount: 8 }, { res: 1, amount: 6 }]);
  assert.equal(L.forgeUpgrade(s, 'alloy', 0), false, 'no ore yet');
  L.collectOre(s, 0, 8);
  L.collectOre(s, 1, 6);
  assert.equal(s.stats.ores, 14);
  const dmg = L.fleetDamage(s, 0);
  assert.ok(L.forgeUpgrade(s, 'alloy', 0));
  assert.deepEqual(s.forge.res.slice(0, 2), [0, 0]);
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 1.15) < 1e-9);
  assert.deepEqual(L.forgeRecipe('alloy', 0, 1), [{ res: 0, amount: 15 }, { res: 1, amount: 11 }], 'exponential prices (×1.9)');
  assert.equal(L.forgeRecipe('alloy', 0, 2).length, 3, 'a 3rd ore from level 3');
  assert.equal(L.forgeRecipe('alloy', 0, 5).length, 4, 'a 4th ore from level 6');
  assert.ok(L.forgeRecipe('alloy', 0, 9)[0].amount > 2000);
  assert.equal(L.forgeRecipe('alloy', 0, 25).length, 7, 'all 7 ores at high levels, and no level cap');
  assert.equal(L.FORGE_UPGRADES.alloy.max, Infinity);
  const deep = L.newSave();
  deep.forge.stab[0] = 60;
  assert.ok(L.bounceFactor(deep, 0) >= 0.2, 'stabilizers never go below 20 %');
  L.collectOre(s, 2, 10);
  L.collectOre(s, 3, 8);
  assert.ok(L.forgeUpgrade(s, 'stab', 0));
  assert.ok(Math.abs(L.bounceFactor(s, 0) - 0.92) < 1e-9);
  // Kept by prestiges and saves; the 15 points are not given back by the points check.
  s.money = L.prestigeCost(s);
  L.doPrestige(s);
  assert.deepEqual([s.forge.unlocked, s.forge.alloy[0], s.forge.stab[0]], [true, 1, 1]);
  const back = L.normalizeSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.forge, s.forge);
  assert.equal(back.pp, s.pp);
});

test('blast: interspace travel (prestige 5, 20 stars) keeps the fleet in a chosen sector', async () => {
  const L = await logic();
  const s = L.newSave();
  s.stars = 30;
  s.prestige = 4;
  s.runBest = 37;
  s.stage = 37;
  assert.ok(L.skillLocked(s, 'travel'));
  assert.equal(L.buySkill(s, 'travel'), false, 'prestige 5 needed');
  assert.equal(L.travelTo(s, 12), false, 'not bought');
  s.prestige = 5;
  assert.ok(L.buySkill(s, 'travel'));
  assert.equal(s.stars, 10, 'costs 20 stars');
  assert.equal(L.travelTo(s, 38), false, 'only sectors already reached');
  assert.ok(L.travelTo(s, 12));
  assert.deepEqual([s.stage, s.locked], [12, 12]);
  const back = L.normalizeSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual([back.stage, back.locked], [12, 12], 'saved');
  L.resumeConquest(s);
  assert.deepEqual([s.stage, s.locked], [37, null], 'conquest resumes at the best sector');
  s.money = L.prestigeCost(s);
  L.travelTo(s, 20);
  L.doPrestige(s);
  assert.deepEqual([s.locked, s.skills.travel], [null, 1], 'a prestige ends the stay, the skill is kept');
});

test('blast: automatic shipyard (prestige 7, 25 stars) buys and merges on its own', async () => {
  const L = await logic();
  const s = L.newSave();
  s.stars = 25;
  s.prestige = 6;
  assert.equal(L.buySkill(s, 'auto'), false, 'prestige 7 needed');
  s.prestige = 7;
  assert.ok(L.buySkill(s, 'auto'));
  assert.equal(s.stars, 0);
  // Auto on a tier turns the lower ones on; off turns the higher ones off.
  L.setAuto(s, 2, true);
  assert.deepEqual(s.auto.slice(0, 4), [true, true, true, false]);
  L.setAuto(s, 1, false);
  assert.deepEqual(s.auto.slice(0, 4), [true, false, false, false]);
  L.setAuto(s, 2, true);
  s.money = 1e6;
  const done = L.autoBuy(s);
  assert.ok(done.bought > 0 && done.merged > 0);
  assert.ok(s.tiers[1].count + s.tiers[2].count > 0, 'scouts were merged up');
  assert.ok(s.tiers[0].count <= L.MAX_SHIPS_PER_TIER);
  assert.ok(s.money < L.shipCost(s), 'spends until the next ship is too expensive');
  assert.deepEqual(L.normalizeSave(JSON.parse(JSON.stringify(s))).auto, s.auto);
  const off = L.newSave();
  off.money = 1e6;
  off.auto[0] = true;
  assert.deepEqual(L.autoBuy(off), { merged: 0, bought: 0 }, 'nothing without the skill');
});

test('blast: a tap is a share of the fleet’s damage per second, the fleet stays the heart of the game', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.equal(L.clickDamage(s), 1, 'at least 1 with the first ship');
  s.tiers[0] = { count: 40, level: 100 };
  s.tiers[1] = { count: 5, level: 50 };
  const power = L.fleetPower(s);
  assert.ok(Math.abs(L.clickDamage(s) - power * 0.01) < 1e-6, '1 % of the fleet per second');
  s.upgrades.click = 20;
  assert.ok(Math.abs(L.clickDamage(s) - power * 0.07) < 1e-6, '+0.3 % per level');
  // Even maxed out (upgrade and workshop), tapping 6 times a second stays below the fleet.
  s.upgrades.click = L.UPGRADES.click.max;
  s.workshop.finger = L.FINGER_CALIBER.max;
  assert.ok(L.clickDamage(s) * 6 < power * 1.3);
  assert.equal(L.normalizeSave({ upgrades: { click: 180 } }).upgrades.click, L.UPGRADES.click.max);
});

test('blast: merge ×n / Max, no levels without a ship, caliber prices by level and tier', async () => {
  const L = await logic();
  const s = L.newSave();
  s.tiers[0].count = 23;
  assert.equal(L.possibleMerges(s, 1), 4);
  assert.equal(L.mergeShips(s, 1, 10), 4, 'as many as possible');
  assert.deepEqual([s.tiers[0].count, s.tiers[1].count], [3, 4]);
  assert.equal(L.mergeShips(s, 2, 1), 0, 'only 4 fighters');
  // Levels need at least one ship of the tier.
  s.money = 1e12;
  assert.equal(L.canLevel(s, 2), false);
  assert.equal(L.levelUp(s, 2), false);
  assert.ok(L.levelUp(s, 1));
  // Caliber: dearer at each level, and for higher tiers.
  const c = (l, t) => L.CALIBER.cost(l, t);
  assert.ok(c(1, 0) > c(0, 0) && c(9, 0) > 2 * c(4, 0), 'rises with the level');
  assert.ok(c(0, 2) > c(0, 0) && c(5, 7) > 3 * c(5, 0), 'rises with the tier');
  // Points spent before the new prices are never given back twice.
  const old = L.normalizeSave({ prestige: 3, pp: 5, workshop: { caliber: [3, 0, 0, 0, 0, 0, 0, 0], modules: [], finger: 0, fingerModules: {} } });
  assert.equal(old.pp, 5, 'owned points kept, none added');
});

test('blast: infinite star bonuses always leave something to buy', async () => {
  const L = await logic();
  const s = L.newSave();
  s.stars = 1e9;
  for (let i = 0; i < 60; i++) assert.ok(L.buySkill(s, 'power'), `power level ${i + 1}`);
  assert.equal(s.skills.power, 60, 'no cap');
  assert.ok(L.skillCost('power', 60) > L.skillCost('power', 30) * 50, 'exponential after level 20');
  const gain = L.gainFactor(s);
  L.buySkill(s, 'cosmic');
  assert.ok(Math.abs(L.gainFactor(s) - gain * 1.1) < 1e-9);
  s.skills.hyper = 200;
  assert.ok(L.speedFactor(s) < 1.5 && L.speedFactor(s) > 1.49, 'speed tends to +50 %');
  s.runBest = 40;
  const stars = L.starsFor(s);
  for (let i = 0; i < 10; i++) L.buySkill(s, 'constellation');
  assert.equal(L.starsFor(s), stars * 2, '+10 % stars per level');
  for (let i = 0; i < 100; i++) L.buySkill(s, 'vein');
  assert.equal(L.oreChance(s), 0.3, 'ore blocks capped at 30 %');
  L.buySkill(s, 'night');
  s.rate = 1;
  s.savedAt = Date.now() - 100 * 3600 * 1000;
  assert.equal(L.offlineEarnings(s).seconds, 3 * 3600, '+1 h per level');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).skills.power, 60, 'saved without cap');
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
    // Two devices: a save based on an outdated version is refused instead of overwriting.
    const read = (await alice('GET', '/api/arcade/blast/save')).body.save.updatedAt;
    const phone = await alice('PUT', '/api/arcade/blast/save', { data: { money: 50 }, score: 12, device: 'phone', basedOn: read });
    assert.equal(phone.status, 200);
    const pc = await alice('PUT', '/api/arcade/blast/save', { data: { money: 99 }, score: 12, device: 'pc', basedOn: phone.body.updatedAt });
    assert.equal(pc.status, 200, 'the PC read the phone’s version first');
    const stale = await alice('PUT', '/api/arcade/blast/save', { data: { money: 51 }, score: 12, device: 'phone', basedOn: phone.body.updatedAt });
    assert.equal(stale.status, 409, 'the phone is behind the PC');
    assert.equal(stale.body.save.data.money, 99, 'the latest version comes back');
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save.data.money, 99, 'nothing was overwritten');
    const again = await alice('PUT', '/api/arcade/blast/save', { data: { money: 100 }, score: 12, device: 'pc', basedOn: pc.body.updatedAt });
    assert.equal(again.status, 200, 'the device playing keeps saving');
    await alice('DELETE', '/api/arcade/blast/save');
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save, null);
  } finally {
    await srv.stop();
  }
});
