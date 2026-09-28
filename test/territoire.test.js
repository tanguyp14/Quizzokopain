const test = require('node:test');
const assert = require('node:assert/strict');

const logic = () => import('../public/js/games/territoire/logic.js');

/** Draws a vertical line at column x, from the bottom or the top edge to the other one. */
function cut(L, s, x) {
  while (s.ship.x !== x) assert.ok(L.moveShip(s, s.ship.x > x ? 'left' : 'right').moved, 'along the edge');
  const dir = s.ship.y ? 'up' : 'down';
  let r;
  for (let i = 0; i < L.GRID - 1; i++) r = L.moveShip(s, dir);
  assert.equal(s.trail.length, 0);
  return r;
}

test('territoire: the ship flies over the land, draws in the void and conquers the side without asteroid', async () => {
  const L = await logic();
  const s = L.newLevel(1, () => 0.5);
  s.asteroids = [L.newAsteroid('big', 80, 50)];
  assert.equal(s.claimed, 0);
  for (let i = 0; i < 30; i++) assert.ok(L.moveShip(s, 'left').moved);
  assert.deepEqual(s.ship, { x: 20, y: 99 });
  assert.equal(L.moveShip(s, 'down').moved, false, 'out of the zone');
  for (let i = 0; i < 98; i++) assert.equal(L.moveShip(s, 'up').closed, 0);
  assert.equal(s.trail.length, 98);
  const r = L.moveShip(s, 'up');
  assert.ok(r.closed > 1900, 'the left part is conquered');
  assert.deepEqual(r.kills, [], 'the asteroid has too much room');
  assert.ok(s.claimed > 0.19 && s.claimed < 0.22);
  assert.equal(s.grid[50 * L.GRID + 80], L.EMPTY, 'the asteroid side stays empty');
  assert.equal(s.asteroids.length, 1);
});

test('territoire: an asteroid shut in a small enough area explodes, the smaller the tighter', async () => {
  const L = await logic();
  // A big one needs 768 cells or less.
  const s = L.newLevel(1, () => 0.5);
  s.asteroids = [L.newAsteroid('big', 95, 50), L.newAsteroid('medium', 30, 50)];
  const r = cut(L, s, 89);
  assert.equal(r.kills.length, 0, 'x 90 to 98: 882 cells, too big even for a big one');
  const r2 = cut(L, s, 92);
  assert.deepEqual(r2.kills.map((k) => [k.size, k.zone]), [['big', 6 * 98]]);
  assert.equal(s.asteroids.length, 1);
  assert.equal(s.grid[50 * L.GRID + 95], L.LAND, 'x 93 to 98: its area becomes land');
  // A medium one needs 384 cells or less: 3 columns (294 cells).
  const m = L.newLevel(1, () => 0.5);
  m.asteroids = [L.newAsteroid('medium', 2, 50), L.newAsteroid('small', 60, 50)];
  assert.equal(cut(L, m, 5).kills.length, 0, '4 columns (392 cells): not tight enough');
  const km = cut(L, m, 4).kills;
  assert.deepEqual(km.map((k) => k.size), ['medium']);
  assert.ok(L.killPoints(km, 1) > L.killPoints([{ size: 'medium', zone: 384 }], 1), 'tighter pays more');
});

test('territoire: several asteroids in one go make a combo; the last one ends the planet', async () => {
  const L = await logic();
  const s = L.newLevel(1, () => 0.5);
  s.asteroids = [L.newAsteroid('big', 95, 20), L.newAsteroid('big', 95, 80)];
  const r = cut(L, s, 92);
  assert.equal(r.kills.length, 2, 'both in the same strip');
  assert.equal(s.asteroids.length, 0);
  const one = L.killPoints([r.kills[0]], 1) + L.killPoints([r.kills[1]], 1);
  assert.ok(L.killPoints(r.kills, 1) > one, 'combo bonus');
  // Two sides of one line: each asteroid is judged by its own area.
  const t = L.newLevel(1, () => 0.5);
  t.asteroids = [L.newAsteroid('small', 2, 50), L.newAsteroid('big', 60, 50)];
  assert.deepEqual(cut(L, t, 2).kills.map((k) => k.size), ['small'], 'a line on it: no room at all');
});

test('territoire: a hit wipes the trail; asteroids bounce inside and cut a trail they touch', async () => {
  const L = await logic();
  const s = L.newLevel(3, () => 0.3);
  for (let i = 0; i < 10; i++) L.moveShip(s, 'up');
  assert.equal(s.trail.length, 10);
  L.loseTrail(s);
  assert.equal(s.trail.length, 0);
  assert.deepEqual(s.ship, { x: 50, y: 99 });
  assert.ok(s.grid.every((c) => c !== L.TRAIL));
  for (const size of Object.keys(L.SIZES)) {
    const a = L.newAsteroid(size, 50, 50, () => 0.1);
    for (let i = 0; i < 600; i++) {
      L.moveAsteroid(s, a, 1 / 60, () => 0.5);
      assert.ok(a.x > 0.5 && a.x < L.GRID - 1.5 && a.y > 0.5 && a.y < L.GRID - 1.5, 'stays in the void');
    }
    s.grid[Math.round(a.y) * L.GRID + Math.round(a.x) + 1] = L.TRAIL;
    assert.equal(L.moveAsteroid(s, a, 0.001, () => 0.5), true);
    s.grid[Math.round(a.y) * L.GRID + Math.round(a.x) + 1] = L.EMPTY;
  }
  const l1 = L.levelSpec(1);
  const l10 = L.levelSpec(10);
  assert.deepEqual(l1.sizes, ['big', 'medium']);
  assert.ok(l10.sizes.length > l1.sizes.length && l10.speed > l1.speed && l10.sizes.includes('small'));
  assert.ok(L.limitCells('big') > L.limitCells('medium') && L.limitCells('medium') > L.limitCells('small'));
});

test('territoire: the server refuses an impossible record', async () => {
  const { startServer, register, http } = require('./helpers');
  const srv = await startServer();
  try {
    const kk = http(srv.base, await register(srv.base, 'kktus'));
    const save = (best, bestLevel) => kk('PUT', '/api/arcade/territoire/save', { data: { best, bestLevel, games: 1 }, score: best });
    assert.equal((await save(9000, 1)).status, 200, 'a first game');
    assert.equal((await save(9e9, 1)).status, 409, 'way above what a planet can give');
    assert.equal((await save(50000, 30)).status, 409, '30 planets in a few milliseconds');
    srv.repo.raw.exec("UPDATE arcade_saves SET updated_at = updated_at - 3600000");
    assert.equal((await save(60000, 4)).status, 200, 'a real record, an hour later');
    assert.equal((await kk('GET', '/api/arcade/territoire/save')).body.save.data.best, 60000);
  } finally {
    await srv.stop();
  }
});

test('territoire: the ship crosses the land to reach an area cut off from the others', async () => {
  const L = await logic();
  const s = L.newLevel(1, () => 0.5);
  s.asteroids = [L.newAsteroid('big', 20, 50), L.newAsteroid('big', 80, 50)];
  // A thick wall of land in the middle (x 40 to 60) splits the void in two.
  for (let y = 1; y < L.GRID - 1; y++) for (let x = 40; x <= 60; x++) s.grid[y * L.GRID + x] = L.LAND;
  // From the bottom of the wall, straight up through it, then into the left area.
  for (let i = 0; i < 49; i++) assert.ok(L.moveShip(s, 'up').moved, 'over the land');
  for (let i = 0; i < 10; i++) assert.ok(L.moveShip(s, 'left').moved);
  assert.equal(s.trail.length, 0, 'still over the land');
  assert.ok(L.moveShip(s, 'left').moved);
  assert.deepEqual(s.trail, [[39, 50]], 'draws in the left area');
});
