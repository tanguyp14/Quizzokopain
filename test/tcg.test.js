const test = require('node:test');
const assert = require('node:assert/strict');

const load = async () => ({
  data: await import('../tcg/src/data.js'),
  E: await import('../tcg/src/engine.js'),
  bot: await import('../tcg/src/bot.js'),
});

/** Partie où chaque joueur a une main imposée (le reste du deck derrière), prête à former les piles. */
async function duelSetup(hand0, hand1, { champions = ['garde', 'garde'] } = {}) {
  const { E, bot } = await load();
  const s = E.createGame({
    players: champions.map((championId) => ({ championId, deck: bot.autoDeck(championId) })),
    seed: 7,
  });
  [hand0, hand1].forEach((ids, i) => {
    s.players[i].hand = ids.map((id, k) => ({ uid: `t${i}-${k}`, id }));
  });
  assert.equal(E.advance(s).type, 'program');
  return { s, E };
}

/** Forme les deux piles dans l'ordre de la main et joue tout le tour. */
function playTurn(E, s) {
  for (const p of s.players) E.program(s, p.idx, p.hand.map((x) => x.uid));
  for (;;) {
    const r = E.advance(s);
    if (r.type === 'decision') throw new Error(`décision inattendue : ${s.pending[0].kind}`);
    if (r.type === 'turn-end' || r.type === 'over') return r;
  }
}

test('tcg data: 48 cards, 15 champions (one per colour pair), every card rated', async () => {
  const { data, bot } = await load();
  assert.equal(data.CARDS.length, 48);
  assert.equal(data.CHAMPIONS.length, 15);
  const pairs = new Set(data.CHAMPIONS.map((c) => [...c.couleurs].sort().join('+')));
  assert.equal(pairs.size, 15);
  for (const color of Object.keys(data.COLORS)) assert.equal(data.CARDS.filter((c) => c.couleur === color).length, 8);
  for (const card of data.CARDS) assert.ok(bot.RATING[card.id], card.id);
});

test('tcg decks: 20 cards, 2 copies max, champion colours only', async () => {
  const { E, bot, data } = await load();
  for (const c of data.CHAMPIONS) assert.deepEqual(E.deckProblems(c.id, bot.autoDeck(c.id)), [], c.id);
  assert.match(E.deckProblems('jimmy', ['RO01']).join(' '), /20 cartes/);
  assert.match(E.deckProblems('jimmy', Array(20).fill('VI03')).join(' '), /2 au plus/);
  assert.match(E.deckProblems('jimmy', Array(20).fill('RO01')).join(' '), /couleur/);
});

test('tcg turns: 3 cards first, +1 per turn, mandatory discard at 5, 7 and 10, never more than 10', async () => {
  const { E, bot } = await load();
  const s = E.createGame({ players: [{ championId: 'garde', deck: bot.autoDeck('garde') }, { championId: 'garde', deck: bot.autoDeck('garde') }], seed: 3 });
  const sizes = [];
  const discards = [];
  for (let turn = 1; turn <= 9; turn++) {
    let r = E.advance(s);
    while (r.type === 'decision') {
      for (const d of [...s.pending]) {
        if (d.kind === 'discard' && d.player === 0) discards.push(s.turn);
        E.answer(s, d.player, bot.autoDecide(s, d));
      }
      r = E.advance(s);
    }
    assert.equal(r.type, 'program');
    sizes.push(s.players[0].hand.length);
    // Tour sans dégâts : on vide les PV adverses de rien, on joue juste.
    s.players.forEach((p) => { p.pv = 999; });
    playTurnAuto(E, bot, s);
  }
  assert.deepEqual(sizes, [3, 4, 5, 6, 7, 8, 9, 10, 10]);
  assert.deepEqual(discards, [3, 5, 8]);
});

function playTurnAuto(E, bot, s) {
  for (const p of s.players) if (!p.programmed) E.program(s, p.idx, p.hand.map((x) => x.uid));
  for (;;) {
    const r = E.advance(s);
    if (r.type === 'decision') { for (const d of [...s.pending]) E.answer(s, d.player, bot.autoDecide(s, d)); continue; }
    if (r.type === 'turn-end' || r.type === 'over') return r;
  }
}

test('tcg duels: a Contre cancels an Attack, but not Feu de barrage; two Attacks both hit', async () => {
  const G = (await load()).data.CHAMPION_BY_ID.garde.pv;
  let { s, E } = await duelSetup(['BL01', 'BL01', 'RO01'], ['RO01', 'RO07', 'RO01']);
  playTurn(E, s);
  assert.equal(s.players[0].pv, G - 2 - 3, 'Parade blocks the canon, not the barrage; then both canons hit');
  assert.equal(s.players[1].pv, G - 3);
  ({ s, E } = await duelSetup(['JA01', 'NO01'], ['RO01', 'JA01']));
  playTurn(E, s);
  assert.equal(s.players[0].pv, G - 1 + 0, 'shield 3 absorbs the canon; Lame sacrifices 1');
  assert.equal(s.players[1].pv, G - 4, 'Perforant ignores the shield');
});

test('tcg effects: Trou noir destroys for good, Gel cancels the next card, poison ticks', async () => {
  const G = (await load()).data.CHAMPION_BY_ID.garde.pv;
  let { s, E } = await duelSetup(['NO07', 'RO01'], ['RO03', 'RO01']);
  playTurn(E, s);
  assert.equal(s.players[1].hand.length, 1, 'Rage de lave is destroyed');
  assert.equal(s.players[0].hand.length, 1, 'Trou noir is single use');
  ({ s, E } = await duelSetup(['BL04', 'JA01', 'JA01'], ['JA01', 'RO03', 'RO01']));
  playTurn(E, s);
  assert.equal(s.players[0].pv, G, 'Rage de lave is frozen, and the canon is absorbed by the shield (3 + 3)');
  ({ s, E } = await duelSetup(['VE01', 'JA01', 'JA01'], ['JA01', 'JA01', 'JA01']));
  playTurn(E, s);
  assert.equal(s.players[1].pv, G - 2, 'Spores absorbed by the shield, then 2 poison ticks');
});

test('tcg champions: Jimmy sees and swaps, the Emperor cancels a card, the Phénix comes back', async () => {
  const { E, bot, data } = await load();
  // Jimmy (3 cartes) : au 3e duel il voit la carte suivante et peut échanger.
  let { s } = await duelSetup(['VI03', 'VI03', 'VI03', 'VI07', 'BL01', 'JA01'], ['JA01', 'JA01', 'JA01', 'RO03', 'JA01', 'JA01'], { champions: ['jimmy', 'garde'] });
  for (const p of s.players) E.program(s, p.idx, p.hand.map((x) => x.uid));
  let swapAsked = false;
  for (;;) {
    const r = E.advance(s);
    if (r.type === 'decision') {
      const d = s.pending[0];
      assert.equal(d.kind, 'swap');
      swapAsked = true;
      assert.ok(s.players[0].seen.length, 'Jimmy saw the next card');
      E.answer(s, 0, bot.autoDecide(s, d));
      continue;
    }
    if (r.type === 'turn-end') break;
  }
  assert.ok(swapAsked);
  assert.equal(s.players[0].pv, data.CHAMPION_BY_ID.jimmy.pv, 'the Parade was moved in front of Rage de lave');
  // Empereur galactique : Décret impérial sur une grosse attaque.
  ({ s } = await duelSetup(['JA01'], ['RO03'], { champions: ['empereur', 'garde'] }));
  for (const p of s.players) E.program(s, p.idx, p.hand.map((x) => x.uid));
  assert.equal(E.advance(s).type, 'decision');
  assert.equal(s.pending[0].kind, 'ban');
  E.answer(s, 0, true);
  while (E.advance(s).type !== 'turn-end');
  assert.equal(s.players[0].pv, data.CHAMPION_BY_ID.empereur.pv);
  assert.equal(s.players[0].uses, 2);
  // Phénix : revient à 5 PV une fois.
  ({ s } = await duelSetup(['RO01'], ['RO03'], { champions: ['phenix', 'garde'] }));
  s.players[0].pv = 2;
  playTurn(E, s);
  assert.equal(s.players[0].pv, 5);
  assert.equal(s.phase, 'upkeep');
});

test('tcg bot: full games between all champions always finish', async () => {
  const { E, bot, data } = await load();
  const ids = data.CHAMPIONS.map((c) => c.id);
  let games = 0;
  for (let i = 0; i < ids.length; i++) {
    for (const j of [i, (i + 4) % ids.length]) {
      const s = E.createGame({ players: [ids[i], ids[j]].map((championId) => ({ championId, deck: bot.autoDeck(championId) })), seed: i * 31 + j });
      for (let guard = 0; guard < 2000; guard++) {
        const r = E.advance(s);
        if (r.type === 'over') break;
        if (r.type === 'decision') for (const d of [...s.pending]) E.answer(s, d.player, bot.autoDecide(s, d));
        if (r.type === 'program') for (const p of s.players) bot.botAct(s, p.idx, guard % 2 ? 'facile' : 'normal');
      }
      assert.equal(s.phase, 'over', `${ids[i]} vs ${ids[j]}`);
      assert.ok(s.turn <= 20);
      games++;
    }
  }
  assert.equal(games, 30);
});

test('tcg boosters: 10 cards + 1 marker, a character in every pack, the rare last', async () => {
  const { openBooster, dropRates } = await import('../tcg/src/booster.js');
  const { CARD_BY_ID } = await import('../tcg/src/data.js');
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let alts = 0;
  for (let k = 0; k < 500; k++) {
    const pack = openBooster(random);
    assert.equal(pack.length, 11);
    assert.equal(pack[0].kind, 'marker');
    assert.equal(pack.filter((x) => x.kind === 'champion').length, 1);
    assert.equal(pack.filter((x) => x.kind === 'card').length, 9);
    assert.equal(CARD_BY_ID[pack[10].id].rarete, 'rare');
    assert.deepEqual(pack.slice(2, 8).map((x) => CARD_BY_ID[x.id].rarete), Array(6).fill('commune'));
    if (pack.some((x) => x.version === 'alternative')) alts++;
  }
  assert.ok(alts > 25 && alts < 80, `about 10 % of packs hold an alternative character or marker (${alts}/500)`);
    // seuls les personnages et les marqueurs ont des versions alternatives
  assert.ok(dropRates().length >= 5);
});

test('tcg printer order: exact drop rates, even quantities, no duplicate in a pack, reproducible', async () => {
  const { planBoosters, seededRandom, printQuantities } = await import('../tcg/src/booster.js');
  const { quantitiesCsv, compositionCsv, orderSummary } = await import('../tcg/src/csv.js');
  const { CARD_BY_ID } = await import('../tcg/src/data.js');
  const packs = planBoosters(100, seededRandom(42));
  assert.equal(packs.length, 100);
  for (const pack of packs) {
    assert.equal(pack.length, 11);
    assert.deepEqual(pack.slice(0, 2).map((x) => x.kind), ['marker', 'champion']);
    const ids = pack.filter((x) => x.kind === 'card').map((x) => x.id);
    assert.equal(new Set(ids).size, 9, 'no duplicate card in a pack');
    assert.equal(CARD_BY_ID[pack[10].id].rarete, 'rare', 'the rare comes last');
  }
  const total = (pred) => packs.flat().filter(pred).length;
  assert.equal(total((x) => x.kind === 'card' && CARD_BY_ID[x.id].rarete === 'rare'), 130, '100 rares + 15 % of the 200 uncommon slots');
  assert.equal(total((x) => x.version === 'alternative'), 5 + 5, 'alternatives at the exact rates (5 % characters, 5 % markers, none for the other cards)');
  assert.equal(total((x) => x.kind === 'card' && x.version === 'alternative'), 0);
  // Chaque carte d'une même rareté est imprimée le même nombre de fois, à une près.
  const byRarity = {};
  for (const r of printQuantities(packs).filter((x) => x.kind === 'card')) {
    const rarete = CARD_BY_ID[r.id].rarete;
    byRarity[rarete] = byRarity[rarete] || {};
    byRarity[rarete][r.id] = (byRarity[rarete][r.id] || 0) + r.quantite;
  }
  for (const counts of Object.values(byRarity)) {
    const v = Object.values(counts);
    assert.ok(Math.max(...v) - Math.min(...v) <= 1, JSON.stringify(counts));
  }
  assert.deepEqual(planBoosters(100, seededRandom(42)), packs, 'same seed, same boosters');
  assert.match(quantitiesCsv(packs), /TOTAL;;;1100/);
  assert.equal(compositionCsv(packs).trim().split('\r\n').length, 1 + 1100);
  assert.match(orderSummary(packs, { seed: 42 }), /1\s100 cartes/);
});
