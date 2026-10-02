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

test('blast: prestige resets the run for 100K (then a share of a sector of income) and adds 10 % damage', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = L.prestigeCost(s) - 1;
  s.stage = 31;
  s.maxStage = 31;
  s.totalEarned = 5e7;
  s.tiers[2] = { count: 3, level: 40 };
  s.upgrades.gain = 10;
  assert.equal(L.doPrestige(s), false, 'needs 10M');
  s.universeBest = 25; // best sector 25: the usual goal (80 %) is sector 20
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  const dmg = L.fleetDamage(s, 0);
  assert.equal(L.doPrestige(s), true);
  assert.equal(s.prestige, 1);
  assert.deepEqual([s.money, s.stage, s.tiers[0].count, s.tiers[2].count, s.upgrades.gain], [0, 1, 1, 0, 0]);
  assert.deepEqual([s.maxStage, s.totalEarned], [31, 5e7], 'record and lifetime earnings kept');
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 1.1) < 1e-9, 'the usual goal reached: +10 %');
  assert.equal(L.prestigeCost(s), 100_000, 'still 100K at sector 20 (5 sectors of income, at least 100K)');
  s.money = 19_999_999;
  assert.equal(L.doPrestige(s), false);
  s.money = 200_000;
  s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.equal(L.prestigeCost(s), 100_000, 'at least 100K, whatever the prestige count');
  s.universeBest = 300; s.lastRun = 0; // goal 240: 5 sectors of income there
  const goal = L.prestigeSector(s);
  assert.ok(goal >= 240 && goal % 10 === 0, `goal ${goal}: a planet near 80 % of 300`);
  assert.ok(Math.abs(L.prestigeCost(s) - L.PRESTIGE_COST_SECTORS * L.stageHp(goal) * 1.5 * L.CREDIT_RATE) < 1e-6 * L.prestigeCost(s), 'then a fifth of a sector of income at the goal');
  s.universeBest = 0;
  assert.equal(s.pp, 20, '10 workshop points per prestige');
  assert.ok(Math.abs(L.prestigeFactor(s) - 1.21) < 1e-9, 'compounded');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).prestige, 2);
});

test('blast: star tree, stars from prestige and starting bonuses', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  s.runBest = 34;
  assert.equal(L.starsFor(s), 4, '1 + 1 per 10 sectors');
  s.stars = 2;
  L.doPrestige(s);
  assert.equal(s.stars, 6);
  assert.equal(s.runBest, 1);
  assert.equal(L.buySkill(s, 'merge'), true, 'costs 6');
  assert.equal(s.stars, 0);
  assert.equal(L.mergeCost(s, 1), 4);
  assert.deepEqual([5, 6, 7].map((t) => L.mergeCost(s, t)), [3, 2, 2], 'the last tiers need fewer ships');
  assert.equal(L.buySkill(s, 'power'), false, 'no stars left');
  s.stars = 10;
  L.buySkill(s, 'power');
  assert.ok(Math.abs(L.fleetDamage(s, 0) - L.shipDamage(0, 1) * 1.2 * 1.1) < 1e-9, 'a first run far past sector 20: +20 %, Noyau ×1.1');
  L.buySkill(s, 'fleet');
  L.buySkill(s, 'bank');
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  L.doPrestige(s);
  assert.equal(s.tiers[0].count, 6, '1 + 5 scouts');
  assert.equal(L.SKILLS.fleet.max, Infinity, 'no cap on the starting fleet');
  assert.equal(s.money, 1000);
  assert.deepEqual([s.skills.merge, s.skills.power, s.skills.fleet], [1, 1, 1], 'skills are kept');
});

test('blast: ship workshop opens with the first prestige and is kept', async () => {
  const L = await logic();
  const s = L.newSave();
  s.pp = 100;
  assert.equal(L.buyCaliber(s, 0), false, 'closed before the first prestige');
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  L.doPrestige(s);
  assert.equal(s.pp, 110);
  const dmg = L.fleetDamage(s, 2);
  assert.ok(L.buyCaliber(s, 2));
  assert.equal(s.pp, 110 - L.CALIBER.cost(0, 2));
  assert.ok(Math.abs(L.fleetDamage(s, 2) - dmg * 1.1) < 1e-9, 'calibre: ×1.1 damage per level');
  assert.ok(Math.abs(L.lootFactor(s, 2) - 1.1) < 1e-9, 'calibre: ×1.1 credits');
  assert.ok(Math.abs(L.caliberFactor(s, 2) - 1.1) < 1e-9, 'and ×1.1 damage');
  assert.equal(L.caliberCost(s, 2), L.CALIBER.cost(1, 2), 'caliber price rises');
  assert.ok(L.buyModule(s, 2));
  assert.equal(L.buyModule(s, 2), false, 'a module is bought once');
  assert.ok(L.hasModule(s, 2));
  const tap = L.clickDamage(s);
  assert.ok(L.buyFinger(s));
  assert.ok(Math.abs(L.clickDamage(s) - tap * 1.1) < 1e-9);
  assert.ok(L.buyFingerModule(s, 'auto'));
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
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
  assert.deepEqual(L.forgeRecipe('alloy', 0, 1), [{ res: 0, amount: 13 }, { res: 1, amount: 10 }], 'exponential prices (×1.6)');
  assert.equal(L.forgeRecipe('alloy', 0, 2).length, 3, 'a 3rd ore from level 3');
  assert.equal(L.forgeRecipe('alloy', 0, 5).length, 4, 'a 4th ore from level 6');
  assert.ok(L.forgeRecipe('alloy', 0, 9)[0].amount > 500);
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
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
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
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
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
  // The game runs autoBuy every 500 ms; each round is capped, so loop until it idles.
  const done = L.autoBuy(s);
  for (let r; (r = L.autoBuy(s)).bought || r.merged;) { done.bought += r.bought; done.merged += r.merged; }
  assert.ok(done.bought > 0 && done.merged > 0);
  assert.ok(s.tiers[1].count + s.tiers[2].count > 0, 'scouts were merged up');
  assert.ok(Number.isFinite(s.tiers[0].count));
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
  const pts = L.prestigePoints(s);
  assert.ok(L.buySkill(s, 'academy'));
  assert.equal(L.prestigePoints(s), pts + 2, 'level 1: +2 prestige points per prestige');
  assert.ok(L.buySkill(s, 'academy'));
  assert.equal(L.prestigePoints(s), pts + 6, 'level 2: +2 +4');
  assert.deepEqual([3, 10, 20].map(L.academyPoints), [12, 110, 420], 'N+2: L × (L + 1)');
  assert.ok(L.skillCost('academy', 5) > L.skillCost('academy', 0) * 5);
  L.buySkill(s, 'night');
  s.rate = 1;
  s.savedAt = Date.now() - 100 * 3600 * 1000;
  assert.equal(L.offlineEarnings(s).seconds, 3 * 3600, '+1 h per level');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).skills.power, 60, 'saved without cap');
});

test('blast: alembic and relics unlock with stars and prestige points; relics are end-game', async () => {
  const L = await logic();
  const s = L.newSave();
  s.prestige = 4;
  s.forge.unlocked = true;
  s.stars = 1000;
  s.pp = 500;
  s.ppEarned = 515; // 500 owned + 15 paid for the forge
  assert.equal(L.forgeFeatureVisible(s, 'alembic'), false, 'from prestige 5');
  s.prestige = 5;
  assert.ok(L.forgeFeatureVisible(s, 'alembic'));
  assert.equal(L.unlockFeature(s, 'relics'), false, 'relics from prestige 10');
  const stars = s.stars;
  s.stars = L.FORGE_UNLOCKS.alembic.stars - 1;
  assert.equal(L.unlockFeature(s, 'alembic'), false, 'needs the stars too');
  s.stars = stars;
  assert.ok(L.unlockFeature(s, 'alembic'));
  assert.equal(s.stars, 1000 - L.FORGE_UNLOCKS.alembic.stars);
  assert.equal(s.pp, 500 - L.FORGE_UNLOCKS.alembic.pp, 'both prices are paid');
  // Alembic: 3 for 1 between any two ores (they are a cycle).
  s.forge.res[0] = 100;
  assert.equal(L.transmute(s, 0, 1, 10), 10);
  assert.deepEqual(s.forge.res.slice(0, 2), [70, 10]);
  assert.equal(L.transmute(s, 0, 6, 100), 23, 'only 70 / 3 = 23');
  assert.equal(L.transmute(s, 6, 0, 3), 3, '3 for 1 the other way too');
  assert.equal(s.forge.res[6], 23 - 9);
  // Relics with prestige points; the points spent are never given back.
  s.prestige = 10;
  assert.ok(L.unlockFeature(s, 'relics'));
  assert.equal(s.pp, 500 - L.FORGE_UNLOCKS.alembic.pp - L.FORGE_UNLOCKS.relics.pp);
  const back = L.normalizeSave(JSON.parse(JSON.stringify(s)));
  assert.equal(back.pp, s.pp, 'no points returned by the points check');
  const recipe = L.relicRecipe('astrolabe', 0);
  assert.equal(recipe.length, 7, 'all 7 ores');
  assert.ok(recipe.every((r) => r.amount >= 800), 'super expensive');
  assert.ok(L.relicRecipe('astrolabe', 3)[0].amount > 10000, '×2.5 per level');
  assert.equal(L.forgeRelic(s, 'astrolabe'), false);
  s.forge.res = recipe.map((r) => r.amount);
  s.maxStage = 900; // all-time record (earlier universes): not counted
  s.universeBest = 100;
  const dmg = L.fleetDamage(s, 0);
  assert.ok(L.forgeRelic(s, 'astrolabe'));
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 1.1) < 1e-9, 'Astrolabe: ×1.1 per level, compounded');
  s.forge.relics.crown = 2;
  s.runBest = 80; // the usual goal (80 % of 100)
  assert.equal(L.prestigePoints(s), 19, 'Couronne: +25 % per level ((10 + 3) × 1.5)');
  s.forge.relics.totem = 1;
  assert.equal(L.planetOre(s, 50), 8, 'Totem +50 %, at sector 50');
  assert.equal(L.planetOre(s, 10), 2, 'a low planet gives little');
  assert.equal(L.planetOre(s, 250), 38, 'a far one a lot');
  assert.equal(L.bossTime(s), 35);
});

test('blast: level-100 ascension (workshop open) costs credits and ores and multiplies damage', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = 1e300;
  s.tiers[0].level = 99;
  assert.equal(L.levelCap(s, 0), Infinity, 'no cap without the workshop');
  assert.ok(L.levelUp(s, 0, 5));
  s.tiers[0].level = 99;
  s.prestige = 1;
  s.ppEarned = 10; // workshop open
  assert.equal(L.levelCap(s, 0), 100);
  assert.equal(L.levelUp(s, 0, 2), false, 'cannot jump over the cap');
  assert.ok(L.levelUp(s, 0, 1));
  assert.ok(L.atLevelCap(s, 0));
  assert.equal(L.levelUp(s, 0), false, 'blocked at 100');
  const cost = L.ascensionCost(s, 0);
  assert.ok(cost.credits > L.levelCost(0, 100) * 100, 'a big price');
  assert.deepEqual(cost.ores, [], 'no ores before the forge');
  const dmg = L.fleetDamage(s, 0);
  assert.equal(L.ascend(s, 0), false, 'needs the forge alloy level 1');
  s.forge.unlocked = true;
  s.forge.alloy[0] = 1;
  for (const { res, amount } of L.ascensionCost(s, 0).ores) s.forge.res[res] = amount;
  assert.ok(L.ascend(s, 0));
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 5 * 1.15) < 1e-6 * dmg, '×5 damage (and the alloy +15 %)');
  assert.equal(L.levelCap(s, 0), 200);
  assert.ok(L.levelUp(s, 0));
  // Ascension 2 needs alloy 2, and ores.
  s.tiers[0].level = 200;
  const next = L.ascensionCost(s, 0);
  assert.equal(next.ores.length, 2);
  for (const { res, amount } of next.ores) s.forge.res[res] = amount;
  assert.equal(L.ascend(s, 0), false, 'alloy 1 is not enough for ascension 2');
  s.forge.alloy[0] = 2;
  assert.ok(L.ascend(s, 0));
  assert.equal(s.tiers[0].asc, 2);
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).tiers[0].asc, 2, 'saved');
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  L.doPrestige(s);
  assert.equal(s.tiers[0].asc, 0, 'a prestige resets the fleet and its ascensions');
});

test('blast: the ships caliber has no level cap', async () => {
  const L = await logic();
  const s = L.newSave();
  s.prestige = 1;
  s.ppEarned = 10;
  s.pp = 1e9;
  for (let i = 0; i < 25; i++) assert.ok(L.buyCaliber(s, 0), `caliber ${i + 1}`);
  assert.equal(s.workshop.caliber[0], 25);
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).workshop.caliber[0], 25, 'saved above 10');
});

test('blast: fleet reserve (30 stars) keeps a minimum of ships out of merges', async () => {
  const L = await logic();
  const s = L.newSave();
  s.tiers[0].count = 12;
  assert.equal(L.setReserve(s, 0, 8), false, 'needs the star skill');
  s.stars = 30;
  assert.ok(L.buySkill(s, 'reserve'));
  assert.equal(s.stars, 0);
  L.setReserve(s, 0, 8);
  assert.equal(L.possibleMerges(s, 1), 0, 'only 4 ships above the reserve');
  s.tiers[0].count = 18;
  assert.equal(L.mergeShips(s, 1, 10), 2);
  assert.equal(s.tiers[0].count, 8, 'the reserve is kept');
  // The automatic shipyard keeps it too.
  s.skills.auto = 1;
  L.setAuto(s, 1, true);
  s.money = 1e6;
  L.autoBuy(s);
  assert.ok(s.tiers[0].count >= 8);
  L.setReserve(s, 0, -3);
  assert.equal(s.reserve[0], 0, 'never negative');
  L.setReserve(s, 0, 5);
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  L.doPrestige(s);
  assert.equal(s.reserve[0], 5, 'kept after a prestige');
});

test('blast: zones favour some ship types, a full squadron boosts the fleet, cheaper scouts', async () => {
  const L = await logic();
  // Zone affinity: Glace (sectors 11-20) shatters under Destroyers and Cuirassés, resists Éclaireurs.
  assert.equal(L.zoneFactor(15, 4), 3);
  assert.equal(L.zoneFactor(15, 5), 3);
  assert.equal(L.zoneFactor(15, 0), 0.5);
  assert.equal(L.zoneFactor(15, 2), 1);
  assert.equal(L.zoneFactor(85, 4), 3, 'zones cycle every 70 sectors');
  assert.ok(L.ZONE_AFFINITY.every((z) => z.weak.length === 2 && !z.weak.includes(z.resist)));
  // Squadron: +15 % per type in service (10 ships, or level 50 with a ship).
  const s = L.newSave();
  assert.equal(L.squadronTypes(s), 0);
  s.tiers[0].count = 10;
  s.tiers[1] = { count: 1, level: 50, asc: 0 };
  s.tiers[2] = { count: 3, level: 10, asc: 0 };
  assert.equal(L.squadronTypes(s), 2);
  const dmg = L.fleetDamage(s, 0);
  s.tiers[2].count = 10;
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 1.45 / 1.3) < 1e-9);
  // Special sectors.
  assert.ok(L.isSwarmStage(8) && L.isSwarmStage(13) && !L.isSwarmStage(10) && !L.isSwarmStage(3));
  // Cheaper scouts with the star tree.
  const price = L.shipCost(s);
  s.stars = 100;
  L.buySkill(s, 'shipyard');
  L.buySkill(s, 'shipyard');
  assert.ok(L.shipCost(s) < price * 0.9025, '-5 % per level, and a slower rise');
  s.tiers[0].count = 40;
  const at40 = (lvl) => { s.skills.shipyard = lvl; return L.shipCost(s); };
  assert.ok(at40(23) < at40(0) * 0.01, 'the rise matters most with a big fleet');
  assert.equal(L.shipRise({ skills: { shipyard: 500 } }), 0.3, 'down to 30 % of the rise');
  s.skills.shipyard = 2;
  assert.ok(L.skillCost('shipyard', 10) > L.skillCost('shipyard', 0) * 10, 'dearer each level');
});

test('blast: the removed « Brise-blindage » is refunded once', async () => {
  const L = await logic();
  const raw = L.newSave();
  raw.ppEarned = 1000;
  raw.pp = 100;
  raw.workshop.pierce = [0, 0, 2, 0, 0, 0, 0, 0]; // an old save: 2 levels on frigates (6 + 15 points)
  const back = L.normalizeSave(JSON.parse(JSON.stringify(raw)));
  assert.equal(back.workshop.pierce, undefined, 'gone');
  assert.ok(back.pp >= 100 + 6 + 15, 'points back');
  const again = L.normalizeSave(JSON.parse(JSON.stringify(back)));
  assert.equal(again.pp, back.pp, 'refunded only once');
});

test('blast: the Cuirassé marks blocks instead of repeating the Destroyer', async () => {
  const L = await logic();
  assert.equal(L.ABILITIES[5].name, 'Marquage');
  assert.ok(L.MARK.factor > 1 && L.MARK.moduleFactor > L.MARK.factor);
  assert.notEqual(L.ABILITIES[4].name, L.ABILITIES[5].name);
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
  a.prestige = 45;
  assert.equal(L.dailyStars(a), 90, 'twice the prestige count');
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
  assert.equal(fixed.tiers[0].count, 999, 'no fleet limit any more');
  assert.equal(fixed.upgrades.gain, L.UPGRADES.gain.max);
  assert.equal(L.normalizeSave(null).tiers[0].count, 1);

  assert.equal(L.fmt(999), '999');
  assert.equal(L.fmt(1234), '1,23K');
  assert.equal(L.fmt(18_305_000), '18,3M');
  assert.equal(L.fmt(2.5), '2,5');
});

test('blast: saves and leaderboard API', async () => {
  const srv = await startServer();
  // Time passes (the margins of a save grow with the time since the last one).
  const later = (secs = 600) => srv.repo.raw.exec(`UPDATE arcade_saves SET updated_at = updated_at - ${secs * 1000}, prestige_at = 0`);
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
    assert.equal((await carol('PUT', '/api/arcade/blast/save', { data: { prestige: 1 }, score: 8 })).status, 200);
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save.data.money, 42);
    const { players: board, bySector } = (await alice('GET', '/api/arcade/blast/leaderboard')).body;
    // Prestiges first, then the best stage; or the best stage first.
    assert.deepEqual(board.map((p) => [p.username, p.prestige, p.score]), [['carol', 1, 8], ['bob', 0, 30], ['alice', 0, 12]]);
    assert.deepEqual(bySector.map((p) => p.username), ['bob', 'alice', 'carol']);
    // Objective points are the server's: made-up points and goals not reached by the save are dropped.
    later(20);
    await alice('PUT', '/api/arcade/blast/save', { data: { money: 42, maxStage: 30, achPoints: 40000, ach: { sector25: 2, sector500: 2, 'inf:stars:400': 1, bogus: 1 } }, score: 12 });
    const kept = (await alice('GET', '/api/arcade/blast/save')).body.save.data;
    assert.deepEqual(kept.ach, { sector25: 2 }, 'only the goal the save reaches');
    assert.equal(kept.achPoints, 5, 'points rise at a capped pace (20 s × 0,25), never as sent');
    const { byAch } = (await alice('GET', '/api/arcade/blast/leaderboard')).body;
    assert.deepEqual(byAch.map((p) => p.ach), [5, 0, 0]);
    // Lifetime stats can't jump either (stars found, planets, play time).
    const statCheat = await alice('PUT', '/api/arcade/blast/save', { data: { money: 42, stats: { starsFound: 40000 } }, score: 12 });
    assert.equal(statCheat.status, 409);
    assert.match(statCheat.body.rejected, /starsFound/);
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
    // A prestige is never undone: an older run can't overwrite a newer one, whatever the device.
    later();
    const pre = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 1, stage: 100 }, score: 100, device: 'pc', basedOn: again.body.updatedAt });
    assert.equal(pre.status, 200);
    const tooFast = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 2, stage: 1 }, score: 100, device: 'phone', basedOn: 0 });
    assert.equal(tooFast.status, 409, 'two prestiges within seconds');
    assert.ok(tooFast.body.rejected);
    srv.repo.raw.exec("UPDATE arcade_saves SET prestige_at = 0");
    const phonePrestige = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 2, stage: 1 }, score: 100, device: 'phone', basedOn: 0 });
    assert.equal(phonePrestige.status, 200, 'a newer run always goes through');
    const oldRun = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 1, stage: 101 }, score: 101, device: 'pc', basedOn: phonePrestige.body.updatedAt });
    assert.equal(oldRun.status, 409, 'the older run is refused even when up to date');
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save.data.stage, 1);
    // Cheats: a save the server can't believe is refused, and the valid one comes back.
    srv.repo.raw.exec("UPDATE arcade_saves SET prestige_at = 0");
    const cheat = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 10000, stage: 1 }, score: 100, device: 'phone', basedOn: 0 });
    assert.equal(cheat.status, 409);
    assert.match(cheat.body.rejected, /prestige 2 → 10000/);
    assert.equal(cheat.body.save.data.prestige, 2, 'the valid save comes back');
    const now = (await alice('GET', '/api/arcade/blast/save')).body.save;
    for (const [data, score, what] of [[{ prestige: 2, maxStage: 5000 }, 5000, /record/], [{ prestige: 2, stars: 1e9 }, 100, /étoiles/], [{ prestige: 2, pp: 1e9 }, 100, /points de prestige/]]) {
      const r = await alice('PUT', '/api/arcade/blast/save', { data, score, device: 'phone', basedOn: now.updatedAt });
      assert.equal(r.status, 409);
      assert.match(r.body.rejected, what);
    }
    later();
    assert.equal((await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 2, maxStage: 140, stars: 500 }, score: 140, device: 'phone', basedOn: 0 })).status, 200, 'normal progress goes through');
    // A superadmin repairs a cheated save.
    srv.repo.raw.exec(`UPDATE arcade_saves SET data = json_set(data, '$.prestige', 10000) WHERE game = 'blast' AND user_id = ${srv.repo.findUserByName('bob').id}`);
    await register(srv.base, 'boss');
    srv.repo.setRoleByName('boss', 'superadmin');
    const boss = http(srv.base, (await (await fetch(`${srv.base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'secret123' }) })).headers.get('set-cookie')).split(';')[0]);
    const bobId = srv.repo.findUserByName('bob').id;
    assert.equal((await boss('GET', `/api/admin/users/${bobId}/arcade/blast`)).body.prestige, 10000);
    assert.equal((await boss('POST', `/api/admin/users/${bobId}/arcade/blast/prestige`, { prestige: 3 })).status, 200);
    assert.equal((await bob('GET', '/api/arcade/blast/save')).body.save.data.prestige, 3);
    assert.equal((await boss('POST', `/api/admin/users/${bobId}/arcade/blast/prestige`, { prestige: 3, stars: 12, pp: '' })).status, 200);
    assert.equal((await bob('GET', '/api/arcade/blast/save')).body.save.data.stars, 12, 'stars fixed too');
    const all = (await boss('GET', `/api/admin/users/${bobId}/arcade`)).body.games;
    assert.equal(all.blast.prestige, 3);
    assert.equal(all.territoire, null);
    assert.equal((await boss('DELETE', `/api/admin/users/${bobId}/arcade/blast`)).status, 200);
    assert.equal((await bob('GET', '/api/arcade/blast/save')).body.save, null, 'reset');
    assert.equal((await bob('DELETE', `/api/admin/users/${bobId}/arcade/blast`)).status, 403);
    assert.equal((await bob('POST', `/api/admin/users/${bobId}/arcade/blast/prestige`, { prestige: 99 })).status, 403);
    await alice('DELETE', '/api/arcade/blast/save');
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save, null);
  } finally {
    await srv.stop();
  }
});

test('blast: « Départ lancé » (stars + ores) makes a tier start its runs at level 25… 100', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.equal(L.canLaunch(s, 0), false, 'needs the forge');
  s.forge.unlocked = true;
  s.stars = 1000;
  s.forge.res = s.forge.res.map(() => 10_000);
  for (let k = 0; k < 4; k++) assert.ok(L.buyLaunch(s, 0));
  assert.equal(s.tiers[0].level, 100, 'lifts the current level too');
  assert.ok(L.buyLaunch(s, 3));
  assert.ok(s.stars < 1000 && s.forge.res[0] < 10_000);
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  L.doPrestige(s);
  assert.equal(s.tiers[0].level, 100);
  assert.equal(s.tiers[3].level, 25);
  assert.equal(s.tiers[1].level, 1);
  assert.deepEqual(L.normalizeSave(JSON.parse(JSON.stringify(s))).launch, s.launch);
});

test('blast: « Ingénieur de bord » (40 stars) buys the upgrades set to Auto', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = 1e6;
  s.autoUpg.speed = true;
  assert.equal(L.autoUpgrade(s), 0, 'skill needed');
  s.stars = 40;
  assert.ok(L.buySkill(s, 'autoUpg'));
  const n = L.autoUpgrade(s);
  assert.ok(n > 0 && s.upgrades.speed === n && s.upgrades.gain === 0);
  assert.ok(!L.canUpgrade(s, 'speed'), 'buys while affordable');
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
  L.doPrestige(s);
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).autoUpg.speed, true, 'kept after prestige');
});

test('blast: « Télescope » (100, 110, 120… ⭐): star blocks, +0.1 % per sector, cap 20 % then +1 % per level', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.equal(L.starBlockChance(s, 500), 0);
  s.stars = 100;
  assert.ok(L.buySkill(s, 'starfind'));
  assert.ok(Math.abs(L.starBlockChance(s, 10) - 0.01) < 1e-9, '1 % at sector 10');
  assert.ok(Math.abs(L.starBlockChance(s, 500) - 0.2) < 1e-9, 'capped at 20 %');
  s.stars = 110 + 120;
  for (let i = 0; i < 2; i++) assert.ok(L.buySkill(s, 'starfind'));
  assert.equal(s.stars, 0);
  assert.ok(Math.abs(L.starBlockChance(s, 500) - 0.22) < 1e-9, '22 % after 3 levels');
  s.skills.starfind = L.SKILLS.starfind.max;
  assert.ok(Math.abs(L.starBlockCap(s) - 0.5) < 1e-9, 'never above 50 %');
  L.findStar(s);
  assert.equal(s.stars, 1);
  assert.equal(s.stats.starsFound, 1);
});

test('blast: a prestige needs 80 % of the best sector of the universe (at least 20), whatever the prestige count', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = 1e12;
  assert.equal(L.prestigeSector(s), 20);
  s.runBest = 19;
  assert.equal(L.canPrestige(s), false, 'credits are not enough');
  s.runBest = 20;
  assert.ok(L.canPrestige(s));
  s.universeBest = 300;
  assert.equal(L.prestigeSector(s), 240);
  s.prestige = 500;
  assert.equal(L.prestigeSector(s), 240, 'no wall from the prestige count');
  // A run that goes further raises the next requirement, not this one.
  s.runBest = 350;
  assert.equal(L.prestigeSector(s), 240);
  s.money = 1e40;
  L.doPrestige(s);
  assert.equal(L.prestigeSector(s), 280, '80 % of 350');
  // Older saves: the universe is the record (no Big Bang yet); the previous run is taken as half of it at least.
  assert.equal(L.prestigeSector(L.normalizeSave({ maxStage: 300, prestige: 93 })), 150);
  // Prestiges without a new record: +3 % each, no ceiling (past the record), but never past what the fleet reaches.
  const farm = L.newSave();
  farm.universeBest = 280;
  const sectors = [];
  for (let k = 0; k < 8; k++) {
    sectors.push(L.prestigeSector(farm));
    farm.money = 1e40;
    farm.runBest = 279; // each run goes as far as it can, without a new record
    L.doPrestige(farm);
  }
  assert.deepEqual(sectors, [220, 230, 240, 240, 250, 260, 270, 270], 'always a planet (rounded down to a multiple of 10)');
  const exact = L.newSave();
  exact.universeBest = 280;
  exact.money = 1e40; exact.runBest = 220;
  L.doPrestige(exact);
  assert.equal(L.prestigeSector(exact), 220, 'stopping right at the goal keeps it (no wall)');
  farm.money = 1e40;
  farm.runBest = 300;
  L.doPrestige(farm);
  assert.deepEqual([farm.universeBest, farm.stall, L.prestigeSector(farm)], [300, 0, 240], 'a new record: 80 % again');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify({ ...farm, stall: 3 }))).stall, 3, 'kept in the save');
});

test('blast: « Départ lancé » goes past level 100 with the ascensions (Alliage required)', async () => {
  const L = await logic();
  const s = L.newSave();
  s.ppEarned = 100; // workshop open: ascensions active
  s.forge.unlocked = true;
  s.stars = 1e6;
  s.forge.res = s.forge.res.map(() => 1e9);
  for (let k = 0; k < 4; k++) assert.ok(L.buyLaunch(s, 0));
  assert.equal(L.launchAlloyNeed(s, 0), 1, 'level 125 needs Alliage 1');
  assert.equal(L.buyLaunch(s, 0), false);
  s.forge.alloy[0] = 1;
  assert.ok(L.buyLaunch(s, 0));
  assert.deepEqual([s.tiers[0].level, s.tiers[0].asc], [125, 1]);
  s.money = L.prestigeCost(s); s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.deepEqual([s.tiers[0].level, s.tiers[0].asc], [125, 1], 'kept at every run');
  assert.equal(L.levelCap(s, 0), 200);
});

test('blast: « Plan d’attaque » achievements pay stars or prestige points and count for the Top', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.deepEqual(L.updateAchievements(s), []);
  s.maxStage = 120;
  s.stats.taps = 1000;
  const fresh = L.updateAchievements(s).map((a) => a.id);
  assert.deepEqual(fresh.sort(), ['sector100', 'sector25', 'taps1k']);
  assert.equal(L.achievementPoints(s), 10 + 25 + 10);
  assert.equal(s.achPoints, 45);
  assert.deepEqual(L.claimAchievement(s, 'sector25'), { stars: 2, pp: 0 });
  assert.equal(s.stars, 2);
  assert.deepEqual(L.claimAchievement(s, 'sector100'), { stars: 0, pp: 15 });
  assert.deepEqual([s.pp, s.ppEarned], [15, 15]);
  assert.equal(L.claimAchievement(s, 'sector100'), null, 'once');
  assert.equal(L.claimAchievement(s, 'sector500'), null, 'not reached');
  // A goal that only holds for a moment stays reached.
  s.tiers[7].count = 1;
  L.updateAchievements(s);
  s.tiers[7].count = 0;
  L.updateAchievements(s);
  assert.equal(L.achState(s, 'neutron'), 1);
  s.money = L.prestigeCost(s); s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  const back = L.normalizeSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual([back.ach.sector25, back.ach.taps1k, back.ach.neutron], [2, 1, 1], 'kept through prestiges');
  assert.equal(back.achPoints, L.achievementPoints(back));
});

test('blast: endless legendary goals: once one is reached, the next one shows up', async () => {
  const L = await logic();
  const s = L.newSave();
  const next = (key) => L.achList(s).filter((a) => a.id.startsWith(`inf:${key}:`));
  assert.deepEqual(next('sector').map((a) => [a.id, a.target]), [['inf:sector:1', 750]]);
  s.maxStage = 1300;
  L.updateAchievements(s);
  // 750, 1000, 1250 reached; 1500 is next.
  assert.deepEqual(next('sector').map((a) => L.achState(s, a.id)), [1, 1, 1, 0]);
  assert.equal(next('sector')[3].name, 'Conquête sans fin IV');
  assert.equal(L.achDef('inf:sector:3').diff, 'legendaire');
  assert.deepEqual(L.claimAchievement(s, 'inf:sector:2'), { stars: 60, pp: 40 });
  assert.equal(L.claimAchievement(s, 'inf:sector:9'), null, 'not reached');
  const back = L.normalizeSave(JSON.parse(JSON.stringify({ ...s, ach: { ...s.ach, 'inf:nope:1': 1 } })));
  assert.equal(back.ach['inf:sector:2'], 2);
  assert.equal(back.ach['inf:nope:1'], undefined, 'unknown ids dropped');
  assert.ok(back.achPoints >= 300);
});

test('blast: advanced upgrades unlock with stars (50 then 150) and reset like the others', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = 1e30;
  assert.equal(L.buyUpgrade(s, 'chain'), false, 'locked');
  s.stars = 49;
  assert.equal(L.unlockAdv(s), false);
  s.stars = 200;
  assert.ok(L.unlockAdv(s));
  assert.equal(s.stars, 150);
  assert.ok(L.buyUpgrade(s, 'chain'));
  assert.equal(L.buyUpgrade(s, 'elite'), false, 'tier 2 still locked');
  assert.ok(L.unlockAdv(s));
  assert.equal(s.stars, 0);
  assert.equal(L.unlockAdv(s), false, 'no third tier');
  const f = L.squadronBonus(s);
  assert.ok(L.buyUpgrade(s, 'elite'));
  assert.ok(Math.abs(L.squadronBonus(s) - f - 0.03) < 1e-9);
  s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.deepEqual([s.advTier, s.upgrades.chain, s.upgrades.elite], [2, 0, 0], 'unlock kept, levels reset');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).advTier, 2);
});

test('blast: second ship modules need the first one and cost much more', async () => {
  const L = await logic();
  const s = L.newSave();
  s.ppEarned = 2000;
  s.pp = 2000;
  assert.equal(L.buyModule2(s, 3), false, 'module I first');
  assert.ok(L.buyModule(s, 3));
  assert.ok(L.buyModule2(s, 3));
  assert.equal(s.pp, 2000 - L.MODULES[3].cost - L.MODULES2[3].cost);
  assert.ok(L.hasModule2(s, 3));
  assert.ok(L.MODULES2.every((m, t) => m.cost >= 3 * L.MODULES[t].cost));
  const back = L.normalizeSave(JSON.parse(JSON.stringify({ ...s, pp: 0 })));
  assert.equal(back.workshop.modules2[3], true);
  assert.equal(back.pp, s.pp, 'counted as spent points');
});

test('blast: the removed workshop drones are refunded (points and ores), mother ships keep theirs', async () => {
  const L = await logic();
  const raw = L.newSave();
  raw.pp = 5;
  raw.workshop.drones = [0, 0, 2, 0, 0, 0, 0, 0]; // old save: 2 levels on frigates
  const back = L.normalizeSave(JSON.parse(JSON.stringify(raw)));
  assert.equal(back.workshop.drones, undefined);
  assert.ok(back.pp >= 5 + 24 + 38, 'points back');
  assert.equal(back.forge.res[5], 48 + 91, 'ores back');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(back))).forge.res[5], 139, 'only once');
  back.tiers[6].count = 2;
  assert.equal(L.droneCount(back, 6), 4);
  assert.equal(L.droneCount(back, 2), 0);
});

test('blast: « Instructeur de vol » (45 stars, prestige 7) levels the tiers set to Auto, cheapest first', async () => {
  const L = await logic();
  const s = L.newSave();
  s.tiers[1].count = 2;
  s.money = 1e7;
  s.autoLevel[0] = true;
  s.autoLevel[1] = true;
  assert.equal(L.autoLevelUp(s), 0, 'skill needed');
  s.stars = 45;
  s.prestige = 6;
  assert.equal(L.buySkill(s, 'autoLevel'), false, 'prestige 7 needed');
  s.prestige = 7;
  assert.ok(L.buySkill(s, 'autoLevel'));
  const n = L.autoLevelUp(s);
  assert.ok(n > 0 && s.tiers[0].level > 1 && s.tiers[1].level > 1, 'both tiers go up');
  assert.ok(s.money < L.levelCost(0, s.tiers[0].level) && s.money < L.levelCost(1, s.tiers[1].level), 'spends until the next level is too expensive');
  s.money = L.prestigeCost(s); s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.deepEqual(L.normalizeSave(JSON.parse(JSON.stringify(s))).autoLevel.slice(0, 2), [true, true], 'kept through prestiges');
});

test('blast: planet weakness, full formation and synergies push for a varied fleet', async () => {
  const L = await logic();
  // Planet weakness: a type the progression allows, changing between planets.
  assert.equal(L.planetWeakTier(10), 0, 'only scouts at first');
  const weak = [...Array(50).keys()].map((i) => L.planetWeakTier(400 + 10 * i));
  assert.ok(weak.every((t) => t >= 0 && t <= 7) && new Set(weak).size > 3, 'varies');
  assert.ok([...Array(20).keys()].every((i) => L.planetWeakTier(80 + 10 * (i % 4)) <= 2));
  // Formation: a chain from the Éclaireur up.
  const s = L.newSave();
  s.tiers[0].count = 1;
  s.tiers[1].count = 1;
  assert.equal(L.formationFactor(s), 1);
  s.tiers[2].count = 1;
  assert.equal(L.formationFactor(s), 1.5);
  s.tiers[4].count = 1;
  assert.equal(L.formationLength(s), 3, 'a gap stops the chain');
  s.tiers[3].count = 1;
  assert.equal(L.formationFactor(s), 3);
  const dmg = L.fleetDamage(s, 0);
  s.tiers[3].count = 0;
  assert.ok(Math.abs(L.fleetDamage(s, 0) * 2 - dmg) < 1e-9, 'counted in the fleet damage');
  // Synergies: bought with stars, active with both types.
  s.stars = 60;
  assert.ok(L.buySynergy(s, 'crossfire'));
  assert.equal(L.synergyOn(s, 'crossfire'), false, 'needs a croiseur');
  s.tiers[3].count = 1;
  assert.equal(L.synergyOn(s, 'crossfire'), true);
  assert.equal(L.buySynergy(s, 'guidance'), false, 'no stars left');
  s.money = L.prestigeCost(s); s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).synergies.crossfire, true, 'kept forever');
});

test('blast: « Coups dévastateurs » (star tree, no limit) raises critical damage by 10 % per level', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.equal(L.critFactor(s), 5);
  s.stars = 1000;
  for (let i = 0; i < 3; i++) assert.ok(L.buySkill(s, 'critdmg'));
  assert.ok(Math.abs(L.critFactor(s) - 6.5) < 1e-9);
  assert.equal(L.SKILLS.critdmg.max, Infinity);
  assert.ok(L.skillCost('critdmg', 10) > L.skillCost('critdmg', 0) * 5, 'dearer every level');
});

test('blast: « Portail temporel » starts the runs 10 sectors further, with the skipped credits', async () => {
  const L = await logic();
  const s = L.newSave();
  s.stars = 1000;
  s.maxStage = 300;
  s.universeBest = 300;
  for (let i = 0; i < 3; i++) assert.ok(L.buySkill(s, 'portal'));
  assert.equal(L.portalStart(s), 31);
  assert.ok(L.skillCost('portal', 5) > 75, 'dearer each level');
  assert.ok(L.skillCost('portal', 15) < 400, 'but it can follow the record (start 151)');
  s.money = L.prestigeCost(s); s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.deepEqual([s.stage, s.runBest], [31, 31]);
  assert.ok(s.money >= L.portalCredits(31) && L.portalCredits(31) > L.stageHp(30) * L.CREDIT_RATE, 'the credits of the skipped sectors, at the credit rate');
  s.universeBest = 40;
  s.runBest = 1;
  assert.equal(L.portalStart(s), 21, 'at most half of the best sector of the universe');
  s.universeBest = 10;
  assert.equal(L.portalStart(s), 1);
  s.maxStage = 5000;
  assert.equal(L.portalStart(s), 1, 'the all-time record (kept by a Big Bang) does not count');
});

test('blast: « Ascension automatique » (80 stars, prestige 10) ascends the tiers set to « Auto asc. » at their cap', async () => {
  const L = await logic();
  const s = L.newSave();
  s.ppEarned = 100; // workshop open: ascension caps
  s.forge.unlocked = true;
  s.forge.alloy[0] = 1;
  s.forge.res = s.forge.res.map(() => 1e6);
  s.skills.autoLevel = 1;
  s.autoLevel[0] = true;
  s.tiers[0].level = 100;
  s.money = 1e30;
  L.autoLevelUp(s);
  assert.equal(s.tiers[0].asc, 0, 'no auto ascension without the skill');
  s.stars = 80;
  s.prestige = 9;
  assert.equal(L.buySkill(s, 'autoAsc'), false, 'prestige 10 needed');
  s.prestige = 10;
  assert.ok(L.buySkill(s, 'autoAsc'));
  L.autoLevelUp(s);
  assert.equal(s.tiers[0].asc, 0, 'each ship has its own « Auto asc. » toggle, off by default');
  s.autoAscOn[0] = true;
  L.autoLevelUp(s);
  assert.equal(s.tiers[0].asc, 1, 'ascended');
  assert.ok(s.tiers[0].level > 100, 'and the levels went on');
  // Older saves: the toggle follows « Auto niv. »; then it is saved on its own.
  assert.deepEqual(L.normalizeSave({ autoLevel: [true, false] }).autoAscOn.slice(0, 2), [true, false]);
  assert.deepEqual(L.normalizeSave({ autoLevel: [true], autoAscOn: [false] }).autoAscOn[0], false);
});

test('blast: away, the fleet keeps clearing sectors (ores, no stars), or farms the travel sector', async () => {
  const L = await logic();
  const strong = () => {
    const s = L.newSave();
    s.tiers[0].count = 50;
    s.tiers[0].level = 60;
    s.skills.starfind = 31; // 50 % of star blocks
    s.skills.travel = 1;
    s.upgrades.offline = 5; // the fleet works 60 % of the time away
    s.forge.unlocked = true;
    s.stage = 5; s.runBest = 5; s.maxStage = 5;
    return s;
  };
  // Classic conquest: moves on, until a planet resists (then farms the sector before it).
  const s = strong();
  const out = L.offlineProgress(s, 2 * 3600);
  assert.ok(out.sectors > 0 && s.stage > 5, 'moved on');
  assert.ok(s.runBest >= s.stage, 'record of the run follows');
  assert.ok(s.maxStage >= s.stage);
  if (out.stuck) assert.equal(s.stage, out.stuck - 1, 'waits before the planet that resists');
  assert.ok(out.ores.some((n) => n > 0), 'ores collected');
  // Interspace travel: stays in the chosen sector.
  const t = strong();
  t.runBest = 25; t.maxStage = 25;
  assert.ok(L.travelTo(t, 25));
  const stars = t.stars;
  const farm = L.offlineProgress(t, 2 * 3600);
  assert.equal(t.stage, 25, 'stayed in the travel sector');
  assert.ok(farm.sectors > 100, `farmed (${farm.sectors})`);
  assert.equal(t.stars - stars, 0, 'no star blocks while away');
  assert.equal(farm.stars, 0);
  assert.ok(farm.ores.some((n) => n > 0), 'ores while away');
  // A fleet without ships does nothing.
  const e = L.newSave();
  e.tiers[0].count = 0;
  assert.equal(L.offlineProgress(e, 3600).sectors, 0);
});

test('blast: « Raffinage » (star tree, no limit) adds 1 ore per ore block and per level', async () => {
  const L = await logic();
  const s = L.newSave();
  s.stage = 30;
  assert.equal(L.oreYield(s), 2, '1 + 1 per 25 sectors');
  s.stars = 1000;
  assert.ok(L.buySkill(s, 'refine'));
  assert.ok(L.buySkill(s, 'refine'));
  assert.equal(L.oreYield(s), 4, '+1 per level');
  assert.ok(L.skillCost('refine', 1) > L.skillCost('refine', 0), 'dearer each level');
});

test('blast: procedural endless chains (difficulty going round) never run out', async () => {
  const L = await logic();
  const a1 = L.achDef('inf:merges:1');
  const a2 = L.achDef('inf:merges:2');
  const a3 = L.achDef('inf:merges:3');
  const a4 = L.achDef('inf:merges:4');
  assert.deepEqual([a1, a2, a3, a4].map((a) => a.diff), ['moyen', 'difficile', 'legendaire', 'moyen']);
  assert.ok(a4.target > a3.target && a3.target > a2.target, 'targets keep growing');
  assert.equal(L.achDef('inf:sector:1').diff, 'legendaire', 'the old chains stay legendary');
  // Always a next goal in each chain, and reached levels count once each.
  const s = L.newSave();
  s.stats.merges = a2.target;
  L.updateAchievements(s);
  assert.deepEqual(['inf:merges:1', 'inf:merges:2', 'inf:merges:3'].map((id) => L.achState(s, id)), [1, 1, 0]);
  assert.ok(L.achList(s).some((a) => a.id === 'inf:merges:3'), 'the next level shows up');
  assert.equal(L.achievementPoints(s) >= 25 + 50, true);
});

test('blast: second-degree stars at prestige, and a one-time catch-up for the older prestiges', async () => {
  const L = await logic();
  assert.deepEqual([50, 100].map(L.baseStars), [6, 11]);
  assert.deepEqual([150, 250, 400, 1000].map(L.baseStars), [150, 250, 400, 1000].map((r) => 1 + Math.floor(10 * 1.03 ** (r - 100))), '×1.03 per sector past 100');
  const s = L.newSave();
  s.runBest = 250;
  assert.equal(L.starsFor(s), L.baseStars(250));
  // An old save (no starsV2): its past prestiges are paid the difference, once.
  const old = { prestige: 114, maxStage: 300, stars: 495 };
  const a = L.normalizeSave(old);
  assert.ok(a.starsCatchUp > 500 && a.stars === 495 + a.starsCatchUp, `catch-up ${a.starsCatchUp}`);
  const again = L.normalizeSave(JSON.parse(JSON.stringify({ ...a, starsCatchUp: undefined })));
  assert.equal(again.stars, a.stars, 'only once');
  assert.equal(L.normalizeSave({ prestige: 5, maxStage: 60, stars: 3 }).stars, 3, 'nothing for runs under sector 100');
  assert.ok(L.newSave().starsV2, 'new players have nothing to catch up');
});

test('blast: Big Bang from sector 400 (+25 each) resets everything for 1 dark matter; the shop is eternal', async () => {
  const L = await logic();
  const s = L.newSave();
  s.prestige = 120; s.stars = 900; s.pp = 300; s.ppEarned = 800; s.skills.power = 20; s.skills.auto = 1; s.skills.autoLevel = 1;
  s.forge.unlocked = true; s.forge.alloy[0] = 10; s.forge.res[0] = 5000; s.launch[0] = 4; s.workshop.caliber[1] = 7;
  s.maxStage = 520; s.stats.bosses = 300; s.ach = { sector500: 2 }; s.achPoints = 100; s.money = 1e40;
  s.runBest = 399;
  assert.equal(L.canBigBang(s), false, 'sector 400 in the run');
  s.runBest = 400;
  assert.ok(L.doBigBang(s));
  assert.deepEqual([s.bigBangs, s.dm, s.prestige, s.stars, s.pp, s.skills.power, s.skills.auto, s.forge.unlocked, s.forge.res[0], s.launch[0], s.money],
    [1, 1, 0, 0, 0, 0, 0, false, 0, 0, 0], 'absolutely everything starts over');
  assert.deepEqual([s.maxStage, s.stats.bosses, s.ach.sector500, s.achPoints], [520, 300, 2, 100], 'Plan d’attaque, record and stats kept');
  assert.equal(L.lifetime(s, 'prestige'), 120, 'the Plan d’attaque counts the prestiges of every universe');
  assert.equal(L.lifetime(s, 'alloy'), 10);
  // Shop: Singularité 1 then 3, 4… (+50 % each, additive), N+1 for the others, 10 for the acceleration.
  assert.deepEqual([0, 1, 2, 3].map((l) => L.dmCost('singularity', l)), [1, 3, 4, 5]);
  assert.deepEqual([0, 1, 2].map((l) => L.dmCost('frame', l)), [1, 2, 3]);
  assert.equal(L.dmCost('autoBoost', 0), 10);
  assert.ok(L.buyDm(s, 'singularity'));
  assert.equal(L.singularityFactor(s), 2);
  assert.equal(L.buyDm(s, 'singularity'), false, '3 needed');
  s.dm = 7;
  assert.ok(L.buyDm(s, 'singularity'));
  assert.equal(L.singularityFactor(s), 4, 'compounded');
  assert.equal(L.dmSpent(s.dmShop), 4);
  // Kept through a prestige, and through the next Big Bang, with « Héritage » and « Pilote total ».
  assert.ok(L.buyDm(s, 'heritage'));
  assert.equal(s.skills.autoLevel, 0);
  assert.ok(L.buyDm(s, 'pilot'));
  assert.deepEqual(L.PILOT_SKILLS.map((k) => s.skills[k]), [1, 1, 1, 1], 'Pilote total I: the automation right away');
  s.money = 1e30; s.runBest = 424;
  L.doPrestige(s);
  assert.equal(s.dmShop.singularity, 2, 'kept at prestige');
  s.runBest = 30;
  assert.equal(L.universeBest(s), 424, 'the universe remembers its best sector through prestiges');
  assert.equal(L.canBigBang(s), false, 'the next one asks for sector 425');
  s.runBest = 425;
  assert.ok(L.canBigBang(s));
  s.ach.sector25 = 1; // reached, not collected
  L.doBigBang(s);
  assert.equal(s.ach.sector25, 2, 'uncollected rewards are lost with the universe');
  assert.equal(L.universeBest(s), 1, 'a new universe starts from nothing');
  assert.ok(Math.abs(L.resonance(s) - 1.25 ** 2) < 1e-9, 'Résonance: damage ×1.25 per Big Bang, compounded');
  assert.ok(Math.abs(L.resonanceYield(s) - 1.5 ** 2) < 1e-9, 'stars, points and ores ×1.5 per Big Bang');
  assert.equal(L.skillDiscount(s), 0.2, '−10 % on the star tree per Big Bang');
  assert.equal(L.skillPrice(s, 'power', 0), Math.ceil(L.skillCost('power', 0) * 0.8));
  assert.deepEqual([s.bigBangs, s.dmShop.singularity, s.stars, s.pp, s.skills.auto], [2, 2, 25, 15, 1], 'Héritage and Pilote total I');
  // A later universe ranks above any prestige count.
  assert.ok(L.runRank({ bigBangs: 1, prestige: 0 }) > L.runRank({ bigBangs: 0, prestige: 5000 }));
});

test('blast: the server checks Big Bangs and dark matter', async () => {
  const srv = await startServer();
  try {
    const L = await logic();
    const cookie = await register(srv.base, 'bang');
    const api = http(srv.base, cookie);
    const s = L.newSave();
    s.prestige = 1; s.maxStage = 100; s.runBest = 100;
    assert.equal((await api('PUT', '/api/arcade/blast/save', { data: s, score: 100 })).status, 200);
    // Pretend the player reached sector 520 long ago.
    srv.repo.raw.exec(`UPDATE arcade_saves SET data = json_set(data, '$.runBest', 520, '$.maxStage', 520), score = 520, prestige_at = 0, updated_at = 0 WHERE game = 'blast'`);
    const before = (await api('GET', '/api/arcade/blast/save')).body.save.data;
    const fake = L.normalizeSave(before);
    fake.dm = 5; fake.bigBangs = 1; fake.prestige = 0;
    const cheat = await api('PUT', '/api/arcade/blast/save', { data: fake, score: 520 });
    assert.equal(cheat.status, 409);
    assert.match(cheat.body.rejected, /matière noire/);
    const b = L.normalizeSave(before);
    assert.ok(L.doBigBang(b));
    const ok = await api('PUT', '/api/arcade/blast/save', { data: b, score: 520 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const { players } = (await api('GET', '/api/arcade/blast/leaderboard')).body;
    assert.equal(players[0].bang, 1, 'Big Bangs in the Top');
    // An older universe (more prestiges) never overwrites the new one.
    const old = await api('PUT', '/api/arcade/blast/save', { data: { ...before, prestige: 2 }, score: 520 });
    assert.equal(old.status, 409);
    assert.equal((await api('GET', '/api/arcade/blast/save')).body.save.data.bigBangs, 1);
  } finally { await srv.stop(); }
});

test('blast: star blocks reward conquering (5 times fewer in travel), and « Longue veille » stops at 10', async () => {
  const L = await logic();
  const s = L.newSave();
  s.skills.starfind = 31;
  assert.equal(L.starBlockChance(s, 600), 0.5);
  s.skills.travel = 1; s.runBest = 600;
  assert.ok(L.travelTo(s, 600));
  assert.equal(L.starBlockChance(s, 600), 0.1, 'farming one sector: ÷5');
  // Levels above the new cap are refunded.
  const old = L.normalizeSave({ stars: 0, skills: { night: 12 } });
  assert.equal(old.skills.night, 10);
  assert.equal(old.stars, L.SKILLS.night.cost(10) + L.SKILLS.night.cost(11));
});

test('blast: the rising prestige sector can’t be reset by editing the save', async () => {
  const srv = await startServer();
  try {
    const kk = http(srv.base, await register(srv.base, 'kkstall'));
    const put = (data) => kk('PUT', '/api/arcade/blast/save', { data: { maxStage: 100, ...data }, score: 100 });
    assert.equal((await put({ universeBest: 100, stall: 3 })).status, 200);
    const cheat = await put({ universeBest: 100, stall: 0 });
    assert.equal(cheat.status, 409);
    assert.match(cheat.body.rejected, /barre de prestige/);
    assert.equal((await put({ universeBest: 100, stall: 4 })).status, 200, 'rising is fine');
    srv.repo.raw.exec('UPDATE arcade_saves SET updated_at = updated_at - 600000'); // time to get 20 sectors further
    assert.equal((await put({ universeBest: 120, maxStage: 120, stall: 0 })).status, 200, 'a new record brings it back');
  } finally {
    await srv.stop();
  }
});

test('blast: many saves in a row share one reserve, refilled by the time spent, whatever their number', async () => {
  const srv = await startServer();
  try {
    const kk = http(srv.base, await register(srv.base, 'kkspam'));
    const put = (maxStage) => kk('PUT', '/api/arcade/blast/save', { data: { maxStage }, score: maxStage });
    assert.equal((await put(10)).status, 200);
    // +20 sectors, twenty times in a row: the steps spend the reserve (150 sectors), then are refused.
    let refused = 0;
    let stage = 10;
    for (let k = 0; k < 20; k++) {
      const r = await put(stage + 20);
      if (r.status === 200) stage += 20; else refused += 1;
    }
    assert.ok(refused >= 12, `${refused} refused`);
    assert.ok(stage <= 10 + 150 + 20, `no climb by small steps (${stage})`);
    // With real time, the same step goes through.
    srv.repo.raw.exec('UPDATE arcade_saves SET updated_at = updated_at - 60000');
    assert.equal((await put(stage + 20)).status, 200);
    // A player's burst (several goals claimed at once) goes through right after a save.
    const burst = await kk('PUT', '/api/arcade/blast/save', { data: { maxStage: stage + 20, stars: 600, pp: 200 }, score: stage + 20 });
    assert.equal(burst.status, 200);
    // The reserves stay on the server.
    const seen = (await kk('GET', '/api/arcade/blast/save')).body.save;
    assert.equal(seen.margins, undefined);
    assert.ok(srv.repo.getArcadeSave(srv.repo.findUserByName('kkspam').id, 'blast').margins.stage >= 0);
  } finally {
    await srv.stop();
  }
});

test('blast: a prestige needs its sector to have been reachable', async () => {
  const srv = await startServer();
  try {
    const kk = http(srv.base, await register(srv.base, 'kkprest'));
    const put = (data) => kk('PUT', '/api/arcade/blast/save', { data: { maxStage: 100, ...data }, score: 100 });
    assert.equal((await put({ universeBest: 100, runBest: 10, stage: 10 })).status, 200);
    srv.repo.raw.exec('UPDATE arcade_saves SET prestige_at = 0');
    const fast = await put({ universeBest: 100, prestige: 1 });
    assert.equal(fast.status, 409, 'from sector 10 to the prestige sector 80 in no time');
    assert.match(fast.body.rejected, /prestige avant le secteur 80/);
    srv.repo.raw.exec('UPDATE arcade_saves SET updated_at = updated_at - 120000');
    assert.equal((await put({ universeBest: 100, prestige: 1 })).status, 200, 'two minutes later, it could');
  } finally {
    await srv.stop();
  }
});

test('blast: the scouts of « Flotte de départ » are free and do not raise the price', async () => {
  const L = await logic();
  const s = L.newSave();
  const first = L.shipCost(s);
  s.skills.fleet = 10;
  s.tiers[0].count += L.START_FLEET_PER_LEVEL * 10; // what a prestige gives
  assert.equal(L.freeShips(s), 50);
  assert.equal(L.shipCost(s), first, 'the first scout bought costs the same');
  s.money = first * 3;
  assert.ok(L.affordableShips(s) >= 2);
  assert.ok(L.buyShip(s, 1));
  assert.ok(L.shipCost(s) > first, 'then the price rises with the scouts bought');
});

test('blast: the prestige sector never goes past the best sector of the previous run', async () => {
  const L = await logic();
  // Stuck case: record 285 from before a rebalance, 5 prestiges without record (95 %), last run 193.
  const s = L.normalizeSave({ prestige: 124, maxStage: 285, universeBest: 285, stall: 5, lastRun: 193, runBest: 150 });
  assert.equal(L.prestigeSector(s), 190, 'capped by the previous run (193) instead of 270, on the planet before');
  assert.ok(L.prestigeCapped(s));
  // The next run has to go as far as this one.
  s.money = 1e30; s.runBest = 200;
  L.doPrestige(s);
  assert.equal(s.lastRun, 200);
  assert.equal(L.prestigeSector(s), 200);
  // Without a previous run (new game, new universe): no cap.
  const n = L.newSave();
  n.universeBest = 100;
  assert.equal(L.prestigeSector(n), 80);
  // Older saves: the run in progress stands for the previous one.
  assert.equal(L.normalizeSave({ prestige: 3, maxStage: 285, universeBest: 285, stall: 5, runBest: 190 }).lastRun, 190);
});

test('blast: stopping right at the prestige goal still raises it, as fast as the damage gained (never a wall)', async () => {
  const L = await logic();
  const s = L.newSave();
  s.universeBest = 280;
  s.stall = 5; // 95 %: 266 asked by the share alone
  s.lastRun = 200; s.lastPower = L.permanentPower(s);
  const goals = [];
  for (let k = 0; k < 60; k++) {
    goals.push(L.prestigeSector(s));
    s.money = 1e40; s.runBest = L.prestigeSector(s); // auto-prestige: right at the goal
    L.doPrestige(s);
  }
  // Sector 200 of a best of 280 (89 % of the usual goal): about +7 % a prestige ≈ +0.23 sector, fractions kept;
  // the goal is always a planet, so it climbs by 10 once the fleet can reach the next one.
  assert.equal(goals[0], 200);
  assert.ok(goals.at(-1) >= 210, `climbs: ${goals.at(-1)}`);
  assert.ok(goals.every((g, i) => i === 0 || [0, 10].includes(g - goals[i - 1])), 'planet by planet');
  // Buying damage raises it at once: ×1.35 of permanent damage, +1 sector.
  const before = L.prestigeSector(s);
  s.skills.power += 20; // Noyau de neutron: ×(1 + 0.25 × 20) more or less
  assert.ok(L.prestigeSector(s) > before + 3, `${before} → ${L.prestigeSector(s)}`);
  assert.ok(L.prestigeSector(s) <= 266, 'never above the share of the record');
});

test('blast: stuck just under the record (95 %), the goal now goes past it, at the pace of the damage', async () => {
  const L = await logic();
  // Record 220, prestiging right at 209 every time: it used to stay at 209 forever.
  const s = L.normalizeSave({ prestige: 60, maxStage: 220, universeBest: 220, stall: 5, lastRun: 209, runBest: 209 });
  const goals = [];
  for (let k = 0; k < 12; k++) {
    goals.push(L.prestigeSector(s));
    s.money = 1e40; s.runBest = L.prestigeSector(s);
    L.doPrestige(s);
  }
  assert.ok(goals.at(-1) > 200, `the goal climbs: ${goals.join(', ')}`);
  assert.ok(goals.every((g, i) => i === 0 || g - goals[i - 1] <= 10), 'no faster than the damage gained (planet by planet)');
});

test('blast: going far pays in prestige points too, and the Noyau de neutron compounds', async () => {
  const L = await logic();
  const s = L.newSave();
  s.runBest = 20;
  assert.equal(L.prestigePoints(s), 10);
  s.runBest = 250;
  assert.equal(L.prestigePoints(s), Math.floor(20 * 1.015 ** 150), '+1 per 25 sectors, then ×1.015 per sector past 100');
  s.forge.relics.crown = 2;
  assert.equal(L.prestigePoints(s), Math.floor(20 * 1.015 ** 150 * 1.5), 'Couronne ×1.5');
  s.skills.power = 40;
  assert.ok(Math.abs(L.skillFactor(s) - 1.1 ** 40) < 1e-9);
  // Each level stays worth ×1.1, whatever the level (it used to fade to +2 %).
  const a = L.skillFactor(s);
  s.skills.power += 1;
  assert.ok(Math.abs(L.skillFactor(s) / a - 1.1) < 1e-9);
});

test('blast: « Pilote total » II turns the automatic prestige on, and prestiges remember their time', async () => {
  const L = await logic();
  const s = L.newSave();
  s.dm = 10;
  assert.ok(L.buyDm(s, 'pilot'));
  assert.equal(s.autoPrestigeOn, false, 'level I: automation only');
  assert.ok(L.buyDm(s, 'pilot'));
  assert.equal(s.autoPrestigeOn, true, 'level II: on right away');
  s.money = 1e12; s.runBest = 30;
  const t = Date.now();
  L.doPrestige(s);
  assert.ok(s.prestigedAt >= t, 'saved, so a reload does not allow a Big Bang the server would refuse');
  assert.equal(L.normalizeSave(JSON.parse(JSON.stringify(s))).prestigedAt, s.prestigedAt);
});

test('blast: a prestige gives damage by the distance of its run (short runs far below the best give almost nothing)', async () => {
  const L = await logic();
  const s = L.newSave();
  s.universeBest = 570;
  s.runBest = 60; // a night of short runs 30 → 60
  assert.ok(L.prestigeGain(s) < 0.001, `${L.prestigeGain(s)} (+0.02 %)`);
  assert.equal(L.prestigePoints(s), 1, 'and almost no prestige points');
  s.runBest = 456; // the usual goal: 80 % of 570
  assert.ok(Math.abs(L.prestigeGain(s) - 0.1) < 1e-9, '+10 %');
  s.runBest = 600; // a new record
  assert.ok(Math.abs(L.prestigeGain(s) - 0.2) < 1e-9, 'up to +20 %');
  // 300 short prestiges no longer make a fleet able to go 10 times further.
  const night = L.newSave();
  night.universeBest = 570;
  for (let k = 0; k < 300; k++) { night.money = 1e30; night.runBest = 60; night.lastRun = 0; night.stall = 0; L.doPrestige(night); night.universeBest = 570; }
  assert.ok(L.prestigeFactor(night) < 1.1, `×${L.prestigeFactor(night)} after 300 short prestiges (it was ×2.6e12)`);
  // Older saves keep their prestiges: ×1.1 each.
  assert.ok(Math.abs(L.prestigeFactor(L.normalizeSave({ prestige: 10 })) - 1.1 ** 10) < 1e-9);
});

test('blast: Forge stabilizers stop at 20 (their effect does), the ores of the levels above come back', async () => {
  const L = await logic();
  const s = L.newSave();
  s.forge.unlocked = true; s.forge.stab[0] = 20; s.forge.res = s.forge.res.map(() => 1e30);
  assert.equal(L.canForge(s, 'stab', 0), false, 'max 20');
  assert.ok(L.bounceFactor(s, 0) < 0.21, 'already (almost) the shortest bounce');
  const back = L.forgeRecipe('stab', 1, 20).concat(L.forgeRecipe('stab', 1, 21));
  const n = L.normalizeSave({ forge: { unlocked: true, stab: [0, 22] } });
  assert.equal(n.forge.stab[1], 20);
  for (const { res, amount } of back) assert.ok(n.forge.res[res] >= amount, 'refunded');
});

test('blast: everything compounds — ores grow with the sector, the Alliage multiplies, the Héritage keeps prestige power', async () => {
  const L = await logic();
  const s = L.newSave();
  assert.equal(L.oreAmount(100), 5);
  assert.equal(L.oreAmount(500), Math.floor(21 * 1.015 ** 400), 'ores ×1.015 per sector past 100');
  s.forge.alloy[0] = 20;
  assert.ok(Math.abs(L.alloyFactor(s, 0) - 1.15 ** 20) < 1e-9, 'Alliage ×1.15 per level, compounded (it was +15 % additive)');
  // Héritage: at the Big Bang, 10 % per level of the prestige power is kept (log scale).
  s.prestigeBoost = Math.log(1e12); s.dmShop.heritage = 5; s.runBest = 400; s.universeBest = 400; s.stage = 400;
  assert.ok(L.doBigBang(s));
  assert.ok(Math.abs(L.prestigeFactor(s) - 1e6) < 1, `kept ×${L.prestigeFactor(s).toExponential(1)} of ×1e12`);
});

test('blast: the Horizon (sector 2300) ends the universe — the Big Bang is open there and pays 5 more dark matter', async () => {
  const L = await logic();
  const s = L.newSave();
  s.stage = L.HORIZON.sector; s.runBest = L.HORIZON.sector; s.universeBest = L.HORIZON.sector; s.maxStage = L.HORIZON.sector;
  assert.ok(L.atHorizon(s));
  assert.ok(L.canBigBang(s));
  assert.ok(L.doBigBang(s));
  assert.deepEqual([s.bigBangs, s.dm, s.horizons], [1, 6, 1]);
  assert.equal(L.offlineProgress({ ...L.newSave(), stage: L.HORIZON.sector, tiers: [{ count: 1e9, level: 9000, asc: 0 }, ...Array(7).fill({ count: 0, level: 1, asc: 0 })] }, 3600).sectors, 0, 'nothing past the Horizon while away');
  // Era II content: elite sectors and shielded planets from sector 1001.
  assert.equal(L.eraLabel(1000), '');
  assert.equal(L.eraLabel(1001), 'Ère II');
  assert.ok(L.isEliteStage(1025) && !L.isEliteStage(25) && !L.isEliteStage(1030));
  assert.ok(L.isShieldedPlanet(1010) && !L.isShieldedPlanet(1000));
  assert.deepEqual([L.sectorHpFactor(1025), L.sectorHpFactor(1010), L.sectorHpFactor(1011)], [3, 2, 1]);
  const t = L.newSave();
  assert.equal(L.bossTime(t, 1010), 2 * L.bossTime(t, 1000), 'shielded planets: twice the time');
});
