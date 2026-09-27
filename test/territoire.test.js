const test = require('node:test');
const assert = require('node:assert/strict');

const logic = () => import('../public/js/games/territoire/logic.js');

test('territoire: the ship follows the edges, draws in the void and conquers the side without the Gloubi', async () => {
  const L = await logic();
  const s = L.newLevel(1, () => 0.5);
  s.gloubis = [{ x: 80, y: 50, vx: 1, vy: 0, phase: 0 }];
  assert.equal(s.claimed, 0);
  // Along the bottom edge to the left.
  for (let i = 0; i < 30; i++) assert.ok(L.moveShip(s, 'left').moved);
  assert.deepEqual(s.ship, { x: 20, y: 99 });
  assert.equal(L.moveShip(s, 'down').moved, false, 'out of the zone');
  // Up through the void to the top edge: a vertical line at x = 20.
  for (let i = 0; i < 98; i++) assert.equal(L.moveShip(s, 'up').closed, 0);
  assert.equal(s.trail.length, 98);
  const r = L.moveShip(s, 'up');
  assert.ok(r.closed > 1900, 'the left part is conquered');
  assert.equal(s.trail.length, 0);
  assert.ok(s.claimed > 0.19 && s.claimed < 0.22);
  assert.equal(s.grid[50 * L.GRID + 80], L.EMPTY, 'the Gloubi side stays empty');
});

test('territoire: a hit wipes the trail and sends the ship back; sentinels stay on the edges', async () => {
  const L = await logic();
  const s = L.newLevel(3, () => 0.3);
  for (let i = 0; i < 10; i++) L.moveShip(s, 'up');
  assert.equal(s.trail.length, 10);
  L.loseTrail(s);
  assert.equal(s.trail.length, 0);
  assert.deepEqual(s.ship, { x: 50, y: 99 });
  assert.ok(s.grid.every((c) => c !== L.TRAIL));
  for (const t of s.sentinels) for (let i = 0; i < 200; i++) { L.moveSentinel(s, t); assert.ok(L.isEdge(s.grid, t.x, t.y)); }
  assert.ok(L.levelSpec(10).gloubis > L.levelSpec(1).gloubis && L.levelSpec(10).sentinels > L.levelSpec(1).sentinels);
});

test('territoire: the Gloubi bounces inside and cuts a trail it touches', async () => {
  const L = await logic();
  const s = L.newLevel(1, () => 0.5);
  const g = { x: 50, y: 50, vx: 1, vy: 0, phase: 0 };
  for (let i = 0; i < 600; i++) {
    L.moveGloubi(s, g, 1 / 60, () => 0.5);
    assert.ok(g.x > 0.5 && g.x < L.GRID - 1.5 && g.y > 0.5 && g.y < L.GRID - 1.5, 'stays in the void');
  }
  s.grid[Math.round(g.y) * L.GRID + Math.round(g.x) + 1] = L.TRAIL;
  assert.equal(L.moveGloubi(s, g, 0.001, () => 0.5), true);
  assert.ok(L.capturePoints(2000, 1) > 2 * L.capturePoints(1000, 1), 'bigger captures pay more');
});
