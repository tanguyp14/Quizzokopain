// Le Poker de Butch — Picture Poker rules (pure: shared by the server, which deals, and the page).
//
// Six pictures, from the weakest to the strongest: asteroid, rocket, planet, saucer, Jimmy, star.
// Each hand: 1 coin to play, up to 5 in all (raised after seeing your cards), then one swap of
// the cards you choose; Butch swaps his too. The best hand wins; your bet is paid × the hand.

export const CARDS = [
  { key: 'asteroid', emoji: '☄️', name: 'Astéroïde' },
  { key: 'rocket', emoji: '🚀', name: 'Fusée' },
  { key: 'planet', emoji: '🪐', name: 'Planète' },
  { key: 'saucer', emoji: '🛸', name: 'Soucoupe' },
  { key: 'jimmy', emoji: '👽', name: 'Jimmy' },
  { key: 'star', emoji: '🌟', name: 'Étoile' },
]; // index = strength
export const HAND_SIZE = 5;
export const COPIES = 6; // cards of each picture in the deck
export const START_COINS = 10;
export const MAX_BET = 5;
/** A game is a fixed number of hands from 10 coins: the score is the coins left at the end. */
export const RUN_HANDS = 30;

/** Hands, strongest first, with what they pay (× the bet). */
export const HANDS = [
  { key: 'five', name: 'Cinq identiques', mult: 16 },
  { key: 'four', name: 'Carré', mult: 8 },
  { key: 'full', name: 'Full', mult: 6 },
  { key: 'three', name: 'Brelan', mult: 4 },
  { key: 'twoPairs', name: 'Double paire', mult: 3 },
  { key: 'pair', name: 'Paire', mult: 2 },
  { key: 'junk', name: 'Rien', mult: 0 },
];
const HAND = Object.fromEntries(HANDS.map((h, i) => [h.key, { ...h, rank: HANDS.length - 1 - i }]));

/** A shuffled deck (card indexes), with `rand` in [0, 1). */
export function newDeck(rand = Math.random) {
  const deck = [];
  for (let c = 0; c < CARDS.length; c++) for (let k = 0; k < COPIES; k++) deck.push(c);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * What a hand is: { key, name, mult, rank, groups } — groups: [[card, count], …] biggest group
 * first, then the strongest card (to break ties).
 */
export function evaluate(cards) {
  const counts = new Map();
  for (const c of cards) counts.set(c, (counts.get(c) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [a, b] = [groups[0][1], groups[1]?.[1] || 0];
  const key = a === 5 ? 'five' : a === 4 ? 'four' : a === 3 && b === 2 ? 'full' : a === 3 ? 'three'
    : a === 2 && b === 2 ? 'twoPairs' : a === 2 ? 'pair' : 'junk';
  return { ...HAND[key], groups: groups.filter(([, n]) => n > 1) };
}

/** > 0 if hand A wins, < 0 if B wins, 0 for a draw (same hand with the same pictures, or both junk). */
export function compare(a, b) {
  const ea = evaluate(a);
  const eb = evaluate(b);
  if (ea.rank !== eb.rank) return ea.rank - eb.rank;
  for (let i = 0; i < ea.groups.length; i++) if (ea.groups[i][0] !== eb.groups[i][0]) return ea.groups[i][0] - eb.groups[i][0];
  return 0;
}

/**
 * Butch's swap: he keeps every card that makes a pair or more and changes the rest; with nothing,
 * he keeps his best card (a star or Jimmy) and changes the other four.
 */
export function dealerHold(cards) {
  const { groups } = evaluate(cards);
  const keep = new Set(groups.map(([c]) => c));
  if (keep.size) return cards.map((c) => keep.has(c));
  const best = Math.max(...cards);
  let kept = false;
  return cards.map((c) => (c === best && best >= 4 && !kept ? (kept = true) : false));
}

/** Replaces the cards not held with the next cards of the deck. */
export function swap(cards, hold, deck) {
  return cards.map((c, i) => (hold[i] ? c : deck.shift()));
}

/** Coins won back at the end of a hand (the bet was paid when playing). */
export function payout(bet, result, hand) {
  if (result > 0) return bet * hand.mult;
  if (result === 0) return bet;
  return 0;
}
