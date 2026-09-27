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
  s.money = L.prestigeCost(s); s.runBest = Math.max(s.runBest, L.prestigeSector(s));
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
  s.runBest = L.prestigeSector(s);
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
  assert.ok(Math.abs(L.fleetDamage(s, 0) - L.shipDamage(0, 1) * 1.1 * 1.25) < 1e-9);
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
  assert.equal(L.fleetDamage(s, 2), dmg, 'the workshop no longer boosts damage (the forge does)');
  assert.ok(Math.abs(L.lootFactor(s, 2) - 1.1) < 1e-9, 'soute à butin: +10 % credits');
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
  assert.equal(L.prestigePoints(s), pts + 1, '+1 prestige point per prestige');
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
  // Alembic: 3 for 1 towards the next zone, ×3 per zone, 1 for 1 back.
  s.forge.res[0] = 100;
  assert.equal(L.transmute(s, 0, 1, 10), 10);
  assert.deepEqual(s.forge.res.slice(0, 2), [70, 10]);
  assert.equal(L.transmute(s, 0, 2, 100), 7, 'only 7 × 9 = 63 available');
  assert.equal(L.transmute(s, 2, 0, 3), 3, '1 for 1 back');
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
  s.maxStage = 100;
  const dmg = L.fleetDamage(s, 0);
  assert.ok(L.forgeRelic(s, 'astrolabe'));
  assert.ok(Math.abs(L.fleetDamage(s, 0) - dmg * 1.5) < 1e-9, '+0.5 % per record sector');
  s.forge.relics.crown = 2;
  assert.equal(L.prestigePoints(s), 14);
  s.forge.relics.totem = 1;
  assert.equal(L.planetOre(s), 8);
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
  assert.ok(Math.abs(L.shipCost(s) - price * 0.9025) < 1e-9, '-5 % per level');
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
    const { players: board, bySector } = (await alice('GET', '/api/arcade/blast/leaderboard')).body;
    // Prestiges first, then the best stage; or the best stage first.
    assert.deepEqual(board.map((p) => [p.username, p.prestige, p.score]), [['carol', 2, 8], ['bob', 0, 30], ['alice', 0, 12]]);
    assert.deepEqual(bySector.map((p) => p.username), ['bob', 'alice', 'carol']);
    await alice('PUT', '/api/arcade/blast/save', { data: { money: 42, achPoints: 35 }, score: 12 });
    const { byAch } = (await alice('GET', '/api/arcade/blast/leaderboard')).body;
    assert.deepEqual(byAch.map((p) => [p.username, p.ach]), [['alice', 35], ['bob', 0], ['carol', 0]], 'achievement points first');
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
    const pre = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 3, stage: 200 }, score: 200, device: 'pc', basedOn: again.body.updatedAt });
    assert.equal(pre.status, 200);
    const phonePrestige = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 4, stage: 1 }, score: 200, device: 'phone', basedOn: 0 });
    assert.equal(phonePrestige.status, 200, 'a newer run always goes through');
    const oldRun = await alice('PUT', '/api/arcade/blast/save', { data: { prestige: 3, stage: 201 }, score: 201, device: 'pc', basedOn: phonePrestige.body.updatedAt });
    assert.equal(oldRun.status, 409, 'the older run is refused even when up to date');
    assert.equal((await alice('GET', '/api/arcade/blast/save')).body.save.data.stage, 1);
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

test('blast: a prestige needs a sector: 20 + 5 per prestige, at most 75 % of the record', async () => {
  const L = await logic();
  const s = L.newSave();
  s.money = 1e12;
  assert.equal(L.prestigeSector(s), 20);
  s.runBest = 19;
  assert.equal(L.canPrestige(s), false, 'credits are not enough');
  s.runBest = 20;
  assert.ok(L.canPrestige(s));
  s.prestige = 10;
  s.maxStage = 200;
  assert.equal(L.prestigeSector(s), 70);
  s.prestige = 39;
  s.maxStage = 459;
  assert.equal(L.prestigeSector(s), 215, '20 + 5 × 39');
  s.maxStage = 240;
  assert.equal(L.prestigeSector(s), 180, 'capped at 75 % of the record');
  s.maxStage = 10;
  assert.equal(L.prestigeSector(s), 20, 'never below 20');
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
  assert.deepEqual(L.claimAchievement(s, 'sector25'), { stars: 5, pp: 0 });
  assert.equal(s.stars, 5);
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

test('blast: workshop drones (prestige points + ores, no limit) escort every ship at 10 %', async () => {
  const L = await logic();
  const s = L.newSave();
  s.ppEarned = 1e6;
  s.pp = 1e6;
  s.tiers[2].count = 5;
  s.forge.res = s.forge.res.map(() => 1e9);
  assert.equal(L.buyDrone(s, 2), false, 'needs the forge');
  s.forge.unlocked = true;
  const first = L.droneCost(s, 2);
  for (let i = 0; i < 12; i++) assert.ok(L.buyDrone(s, 2), 'no limit');
  assert.ok(L.droneCost(s, 2).pp > first.pp * 50, 'dearer every level');
  assert.equal(L.droneCount(s, 2), 5 * 12);
  assert.equal(L.droneShare(s, 2), 0.1);
  s.tiers[6].count = 1;
  assert.equal(L.droneCount(s, 6), 2, 'mother ships keep their 2 drones');
  assert.equal(L.droneShare(s, 6), 0.15);
  const back = L.normalizeSave(JSON.parse(JSON.stringify({ ...s, pp: 0 })));
  assert.equal(back.workshop.drones[2], 12);
  assert.equal(back.pp, s.pp - L.FORGE.cost, 'drone points counted as spent (the forge was opened for free here)');
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
  for (let i = 0; i < 3; i++) assert.ok(L.buySkill(s, 'portal'));
  assert.equal(L.portalStart(s), 31);
  assert.ok(L.skillCost('portal', 5) > 250, 'dear');
  s.money = L.prestigeCost(s); s.runBest = L.prestigeSector(s);
  L.doPrestige(s);
  assert.deepEqual([s.stage, s.runBest], [31, 31]);
  assert.ok(s.money >= L.portalCredits(31) && L.portalCredits(31) > L.stageHp(30));
  s.maxStage = 40;
  assert.equal(L.portalStart(s), 21, 'at most half of the record');
  s.maxStage = 10;
  assert.equal(L.portalStart(s), 1);
});
