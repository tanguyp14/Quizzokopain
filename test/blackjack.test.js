const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http } = require('./helpers');

const logic = () => import('../public/js/games/blackjack/logic.js');
const c = (r) => ({ r, s: 0 }); // rank index: 0 = A, 9 = 10, 12 = K

test('blackjack: values, soft aces, Butch draws to 17, payouts', async () => {
  const B = await logic();
  assert.deepEqual(B.handValue([c(0), c(5)]), { total: 17, soft: true }, 'A + 6 = soft 17');
  assert.deepEqual(B.handValue([c(0), c(5), c(9)]), { total: 17, soft: false }, 'the ace goes back to 1');
  assert.equal(B.handValue([c(0), c(0), c(8)]).total, 21, 'A + A + 9');
  assert.ok(B.isBlackjack([c(0), c(12)]));
  assert.ok(!B.isBlackjack([c(0), c(4), c(4)]), '21 in three cards is not a blackjack');
  const shoe = [c(4), c(9), c(9)];
  assert.equal(B.handValue(B.dealerPlay([c(9), c(5)], shoe)).total, 21, '16 draws a 5');
  assert.equal(B.dealerPlay([c(9), c(6)], [c(9)]).length, 2, 'stands on 17');
  assert.deepEqual(B.settle([c(0), c(12)], [c(9), c(8)], 4), { outcome: 'blackjack', back: 10 }, '3 to 2');
  assert.deepEqual(B.settle([c(9), c(8)], [c(9), c(6)], 4), { outcome: 'win', back: 8 });
  assert.deepEqual(B.settle([c(9), c(6)], [c(9), c(6)], 4), { outcome: 'push', back: 4 });
  assert.deepEqual(B.settle([c(9), c(8), c(5)], [c(9), c(5), c(9)], 4).outcome, 'lose', 'bust first loses even if Butch busts');
  assert.deepEqual(B.settle([c(9), c(5)], [c(9), c(5), c(9)], 4), { outcome: 'win', back: 8 }, 'Butch bust');
  assert.equal(B.newShoe().length, 52 * B.DECKS);
});

test('blackjack: the server deals, Butch’s hidden card stays hidden, 30 hands a game', async () => {
  const srv = await startServer();
  try {
    const ann = http(srv.base, await register(srv.base, 'ann'));
    let s = (await ann('GET', '/api/blackjack')).body;
    assert.deepEqual([s.coins, s.left, s.hand], [100, 30, null]);
    assert.equal((await ann('POST', '/api/blackjack/deal', { bet: 3 })).status, 400, 'odd bet');
    assert.equal((await ann('POST', '/api/blackjack/hit')).status, 400, 'no hand');
    for (let k = 0; k < 60 && !s.over; k++) {
      s = (await ann('POST', '/api/blackjack/deal', { bet: 10 })).body;
      if (s.hand.phase === 'play') {
        assert.equal(s.hand.dealer.length, 1, 'one card of Butch shown');
        assert.equal((await ann('POST', '/api/blackjack/deal', { bet: 2 })).status, 400, 'one hand at a time');
        s = (await ann('POST', k % 3 ? '/api/blackjack/stand' : '/api/blackjack/double')).body;
      }
      assert.equal(s.hand.phase, 'done');
      assert.ok(s.hand.dealer.length >= 2, 'all of Butch’s cards once over');
    }
    assert.ok(s.over);
    assert.equal(s.best, s.coins);
    assert.equal((await ann('POST', '/api/blackjack/deal', { bet: 2 })).status, 400, 'game over');
    assert.equal((await ann('GET', '/api/blackjack/top')).body.players[0].username, 'ann');
    s = (await ann('POST', '/api/blackjack/restart')).body;
    assert.deepEqual([s.coins, s.left], [100, 30]);
    // The poker's Top is its own.
    assert.deepEqual((await ann('GET', '/api/poker/top')).body.players, []);
  } finally {
    await srv.stop();
  }
});
