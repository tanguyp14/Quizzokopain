const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http } = require('./helpers');

const logic = () => import('../public/js/games/poker/logic.js');

test('poker: hands, ties and Butch’s swap', async () => {
  const P = await logic();
  const [asteroid, rocket, planet, saucer, jimmy, star] = [0, 1, 2, 3, 4, 5];
  assert.equal(P.evaluate([star, star, star, star, star]).key, 'five');
  assert.equal(P.evaluate([star, star, star, rocket, rocket]).key, 'full');
  assert.equal(P.evaluate([planet, planet, saucer, saucer, star]).key, 'twoPairs');
  assert.equal(P.evaluate([asteroid, rocket, planet, saucer, jimmy]).key, 'junk');
  assert.ok(P.compare([rocket, rocket, rocket, star, jimmy], [star, star, jimmy, jimmy, saucer]) > 0, 'three beats two pairs');
  assert.ok(P.compare([star, star, asteroid, rocket, planet], [jimmy, jimmy, saucer, planet, rocket]) > 0, 'a pair of stars beats a pair of Jimmy');
  assert.ok(P.compare([saucer, saucer, planet, planet, star], [saucer, saucer, rocket, rocket, star]) > 0, 'second pair breaks the tie');
  assert.equal(P.compare([asteroid, rocket, planet, saucer, star], [asteroid, rocket, planet, jimmy, star]), 0, 'junk against junk: a draw');
  assert.equal(P.compare([jimmy, jimmy, rocket, planet, asteroid], [jimmy, jimmy, star, saucer, planet]), 0, 'same pair: a draw');
  assert.deepEqual(P.dealerHold([star, rocket, planet, saucer, asteroid]), [true, false, false, false, false], 'keeps his star');
  assert.deepEqual(P.dealerHold([planet, rocket, planet, rocket, star]), [true, true, true, true, false], 'keeps his pairs');
  assert.equal(P.newDeck().length, P.CARDS.length * P.COPIES);
  assert.equal(P.payout(3, 1, P.evaluate([star, star, star, rocket, planet])), 12, 'three × bet 3');
  assert.equal(P.payout(3, 0, P.evaluate([star, rocket, planet, saucer, asteroid])), 3, 'draw: bet back');
});

test('poker: the server deals, the player only chooses; a game is 30 hands', async () => {
  const srv = await startServer();
  try {
    const bob = http(srv.base, await register(srv.base, 'bob'));
    let s = (await bob('GET', '/api/poker')).body;
    assert.deepEqual([s.coins, s.left, s.best, s.hand], [10, 30, 0, null]);
    assert.equal((await bob('POST', '/api/poker/draw', { hold: [] })).status, 400, 'no hand yet');
    s = (await bob('POST', '/api/poker/deal')).body;
    assert.equal(s.coins, 9);
    assert.equal(s.hand.player.length, 5);
    assert.equal(s.hand.dealer, undefined, 'Butch’s cards stay hidden');
    assert.equal((await bob('POST', '/api/poker/deal')).status, 400, 'one hand at a time');
    for (let k = 0; k < 4; k++) s = (await bob('POST', '/api/poker/raise')).body;
    assert.deepEqual([s.coins, s.hand.bet], [5, 5]);
    assert.equal((await bob('POST', '/api/poker/raise')).status, 400, 'max 5');
    const kept = s.hand.player;
    s = (await bob('POST', '/api/poker/draw', { hold: [true, true, true, true, true] })).body;
    assert.deepEqual(s.hand.player, kept, 'held cards stay');
    assert.equal(s.hand.dealer.length, 5, 'Butch shows his cards');
    assert.equal(s.left, 29);
    const back = { win: null, lose: 5, draw: 10 }[s.hand.result.outcome];
    if (back !== null) assert.equal(s.coins, back);
    // Play the game to its end.
    for (let k = 0; k < 40 && !s.over; k++) {
      s = (await bob('POST', '/api/poker/deal')).body;
      s = (await bob('POST', '/api/poker/draw', { hold: [] })).body;
    }
    assert.ok(s.over, 'the game ends after 30 hands (or with no coin left)');
    assert.equal(s.best, s.coins, 'its score is the record');
    assert.equal((await bob('POST', '/api/poker/deal')).status, 400, 'game over: start a new one');
    const top = (await bob('GET', '/api/poker/top')).body.players;
    assert.equal(top[0].username, 'bob');
    assert.equal(top[0].runs, 1);
    s = (await bob('POST', '/api/poker/restart')).body;
    assert.deepEqual([s.coins, s.left, s.over], [10, 30, false]);
  } finally {
    await srv.stop();
  }
});
