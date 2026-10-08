// Le bot : il forme sa pile en simulant des tours contre des piles adverses plausibles,
// et prend ses décisions (Ban, échange, défausse) avec des réflexes simples.
// Il ne triche pas : il ne connaît de ta main que les cartes déjà révélées.
import {
  CARD_BY_ID, CHAMPION_BY_ID, DECK_SIZE, MAX_COPIES, cardsForChampion,
} from './data.js';
import {
  advance, answer, program, rand, shuffle,
} from './engine.js';

/** Force estimée de chaque carte (1 = faible, 5 = très forte), pour les decks automatiques et la défausse. */
export const RATING = {
  RO01: 3, RO02: 3, RO03: 4, RO04: 4, RO05: 3, RO06: 3, RO07: 4, RO08: 3,
  BL01: 4, BL02: 5, BL03: 3, BL04: 3, BL05: 2, BL06: 3, BL07: 3, BL08: 3,
  VE01: 3, VE02: 3, VE03: 2, VE04: 2, VE05: 3, VE06: 4, VE07: 3, VE08: 2,
  JA01: 3, JA02: 4, JA03: 3, JA04: 3, JA05: 3, JA06: 2, JA07: 4, JA08: 3,
  VI01: 4, VI02: 3, VI03: 4, VI04: 4, VI05: 4, VI06: 2, VI07: 3, VI08: 2,
  NO01: 4, NO02: 2, NO03: 3, NO04: 3, NO05: 4, NO06: 4, NO07: 5, NO08: 3,
};

export const LEVELS = {
  facile: { label: 'Facile', candidates: 0, samples: 0 },
  normal: { label: 'Normal', candidates: 40, samples: 6 },
  difficile: { label: 'Difficile', candidates: 160, samples: 14 },
};

/** Répartition visée pour un deck automatique (complétée par les meilleures cartes restantes). */
const DECK_QUOTAS = { attaque: 8, contre: 4, garde: 4, tactique: 4 };

/** Deck de 20 cartes pour un champion : les meilleures cartes de chaque type, 2 exemplaires, selon DECK_QUOTAS. */
export function autoDeck(championId, owned = null, s = { rng: 12345 }) {
  const pool = cardsForChampion(CHAMPION_BY_ID[championId])
    .map((c) => ({ c, max: Math.min(MAX_COPIES, owned ? owned[c.id] || 0 : MAX_COPIES), score: RATING[c.id] + rand(s) * 1.5 }))
    .filter((x) => x.max > 0)
    .sort((a, b) => b.score - a.score);
  const deck = [];
  const count = (id) => deck.filter((x) => x === id).length;
  for (const [type, quota] of Object.entries(DECK_QUOTAS)) {
    let n = 0;
    for (const x of pool.filter((y) => y.c.type === type)) {
      while (count(x.c.id) < x.max && n < quota && deck.length < DECK_SIZE) { deck.push(x.c.id); n++; }
    }
  }
  for (const x of pool) while (count(x.c.id) < x.max && deck.length < DECK_SIZE) deck.push(x.c.id);
  return deck.sort();
}

// ---- décisions ------------------------------------------------------------------------------

const val = (id) => (typeof CARD_BY_ID[id].valeur === 'number' ? CARD_BY_ID[id].valeur : 3);

/** Intérêt d'opposer ma carte à celle d'en face (positif = bon pour moi). */
export function matchup(mine, theirs) {
  if (!mine) return 0;
  const a = CARD_BY_ID[mine].type;
  if (!theirs) return a === 'attaque' ? val(mine) : 0;
  const b = CARD_BY_ID[theirs].type;
  if (a === 'contre') {
    if (b === 'attaque' && theirs !== 'RO07') return 2 + val(theirs);
    if (mine === 'VI04' && b === 'tactique') return 3;
    if (mine === 'NO06') return 1;
    return -1;
  }
  if (a === 'attaque') {
    if (b === 'contre') return theirs === 'NO06' || mine === 'RO07' ? val(mine) - 1 : -2 - val(mine);
    if (b === 'garde') return val(mine) - val(theirs);
    return val(mine);
  }
  if (a === 'garde') return b === 'attaque' ? Math.min(val(mine), val(theirs)) : 0.5;
  return b === 'attaque' ? -val(theirs) + 1 : 1;
}

/** Réponse automatique à une décision (le bot, et les deux camps dans les simulations). */
export function autoDecide(s, d) {
  const p = s.players[d.player];
  switch (d.kind) {
    case 'discard': {
      const worst = [...p.hand].sort((a, b) => RATING[a.id] - RATING[b.id] || rand(s) - 0.5)[0];
      return [worst.uid];
    }
    case 'prospect':
      return p.hand.filter((x) => RATING[x.id] <= 2).slice(0, d.max).map((x) => x.uid);
    case 'ban': {
      const mine = s.duel.eff[p.idx];
      const theirs = d.id;
      const t = CARD_BY_ID[theirs].type;
      if (t === 'attaque' && val(theirs) >= 4) return true;
      if (t === 'contre' && mine && CARD_BY_ID[mine].type === 'attaque' && val(mine) >= 4) return true;
      return theirs === 'NO07';
    }
    case 'swap': {
      const o = s.players[1 - p.idx];
      const known = (i) => (o.pile[i] && p.seen.includes(o.pile[i].uid) ? o.pile[i].id : null);
      const [a, b] = [p.pile[d.at].id, p.pile[d.at + 1].id];
      const [x, y] = [known(d.at), known(d.at + 1)];
      const keep = (x ? matchup(a, x) : 0) + (y ? matchup(b, y) : 0);
      const swap = (x ? matchup(b, x) : 0) + (y ? matchup(a, y) : 0);
      return swap > keep;
    }
    default: return null;
  }
}

// ---- formation de la pile -----------------------------------------------------------------

/** Ce que le bot croit savoir de la main adverse : les cartes déjà vues, complétées au hasard. */
function guessOpponentHand(s, me, r) {
  const o = s.players[1 - me];
  const p = s.players[me];
  const size = o.programmed ? o.pile.length : o.hand.length;
  const allUid = new Map([...o.played, ...o.hand, ...o.discard, ...o.removed, ...o.pile].map((x) => [x.uid, x]));
  let known = p.known.map((u) => allUid.get(u)).filter((x) => x && !o.removed.includes(x));
  known = shuffle(r, known).slice(0, size).map((x) => x.id);
  const pool = cardsForChampion(CHAMPION_BY_ID[o.championId]).map((c) => c.id);
  while (known.length < size) {
    const id = pool[Math.floor(rand(r) * pool.length)];
    if (known.filter((k) => k === id).length < MAX_COPIES) known.push(id);
  }
  return shuffle(r, known);
}

/** Joue le reste du tour avec des décisions automatiques. Renvoie l'écart de PV final, du point de vue de `me`. */
function playOut(sim, me) {
  for (let guard = 0; guard < 200; guard++) {
    const r = advance(sim);
    if (r.type === 'decision') {
      for (const d of [...sim.pending]) answer(sim, d.player, autoDecide(sim, d));
      continue;
    }
    if (r.type === 'over') return sim.winner === me ? 100 : sim.winner === 'draw' ? 0 : -100;
    if (r.type === 'turn-end' || r.type === 'program') break;
  }
  const p = sim.players[me];
  const o = sim.players[1 - me];
  return (p.pv - o.pv) + 0.3 * (o.flags.poison - p.flags.poison) + (p.flags.frozen ? -1.5 : 0) + (o.flags.frozen ? 1.5 : 0);
}

function simulate(s, me, myOrder, theirIds) {
  const sim = structuredClone(s);
  sim.quiet = true;
  sim.log = [];
  const p = sim.players[me];
  const o = sim.players[1 - me];
  const byUid = new Map(p.hand.map((x) => [x.uid, x]));
  p.pile = myOrder.map((u) => byUid.get(u));
  p.hand = [];
  p.programmed = true;
  o.pile = theirIds.map((id, k) => ({ uid: `sim-${k}`, id }));
  o.hand = [];
  o.programmed = true;
  return playOut(sim, me);
}

/** Choisit l'ordre de la pile du bot. Renvoie une liste d'uid. */
export function botOrder(s, me, level = 'normal') {
  const p = s.players[me];
  const uids = p.hand.map((x) => x.uid);
  const cfg = LEVELS[level] || LEVELS.normal;
  const scratch = { rng: (s.rng ^ 0x5bd1e995) | 0 };
  if (!cfg.candidates || uids.length < 2) return shuffle(scratch, [...uids]);
  const samples = Array.from({ length: cfg.samples }, () => guessOpponentHand(s, me, scratch));
  const seen = new Set();
  const candidates = [];
  for (let k = 0; k < cfg.candidates * 3 && candidates.length < cfg.candidates; k++) {
    const order = shuffle(scratch, [...uids]);
    const key = order.join(',');
    if (!seen.has(key)) { seen.add(key); candidates.push(order); }
  }
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const order of candidates) {
    let total = 0;
    for (const sample of samples) total += simulate(s, me, order, sample);
    if (total > bestScore) { bestScore = total; best = order; }
  }
  return best;
}

/** Le bot joue tout ce qui le concerne maintenant (pile, décisions). */
export function botAct(s, me, level) {
  if (s.phase === 'program' && !s.players[me].programmed) program(s, me, botOrder(s, me, level));
  for (const d of s.pending.filter((x) => x.player === me)) answer(s, me, autoDecide(s, d));
}

