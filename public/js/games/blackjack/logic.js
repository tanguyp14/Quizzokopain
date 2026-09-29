// Blackjack du Casino Spatial — rules (pure: shared by the server, which deals, and the page).
//
// Get closer to 21 than Butch without going over. Aces count 1 or 11, faces 10. Butch draws to
// 16 and stands on every 17. A blackjack (ace + a 10 on the first two cards) pays 3 to 2;
// a win pays 1 to 1; a draw gives the bet back. Doubling: the bet ×2, one card, and it's over.

export const SUITS = [
  { key: 'moons', emoji: '🌙', color: '#3f6bd8' },
  { key: 'suns', emoji: '☀️', color: '#e0802b' },
  { key: 'comets', emoji: '☄️', color: '#c0392b' },
  { key: 'planets', emoji: '🪐', color: '#7b4bd6' },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const DECKS = 4; // cards in the shoe: 4 × 52
export const START_COINS = 100;
export const BETS = [2, 4, 6, 8, 10]; // even, so that 3 to 2 stays in whole coins
/** A game is a fixed number of hands from 100 coins: the score is the coins left at the end. */
export const RUN_HANDS = 30;

/** A card is { r: rank index, s: suit index }. */
export function newShoe(rand = Math.random) {
  const shoe = [];
  for (let d = 0; d < DECKS; d++) for (let s = 0; s < SUITS.length; s++) for (let r = 0; r < RANKS.length; r++) shoe.push({ r, s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

const cardValue = (c) => (c.r === 0 ? 1 : Math.min(10, c.r + 1));
/** { total, soft } — soft when an ace counts 11. */
export function handValue(cards) {
  let total = cards.reduce((sum, c) => sum + cardValue(c), 0);
  const ace = cards.some((c) => c.r === 0);
  const soft = ace && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft };
}
export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
export const isBust = (cards) => handValue(cards).total > 21;

/** Butch draws until 17 or more (he stands on a soft 17 too). */
export function dealerPlay(dealer, shoe) {
  while (handValue(dealer).total < 17) dealer.push(shoe.shift());
  return dealer;
}

/**
 * The end of a hand: { outcome: 'blackjack' | 'win' | 'lose' | 'push', back } — `back` is what
 * comes back to the player (the bet was paid when playing).
 */
export function settle(player, dealer, bet) {
  const pbj = isBlackjack(player);
  const dbj = isBlackjack(dealer);
  if (pbj && dbj) return { outcome: 'push', back: bet };
  if (pbj) return { outcome: 'blackjack', back: bet + (bet * 3) / 2 };
  if (dbj) return { outcome: 'lose', back: 0 };
  if (isBust(player)) return { outcome: 'lose', back: 0 };
  if (isBust(dealer)) return { outcome: 'win', back: bet * 2 };
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  if (p > d) return { outcome: 'win', back: bet * 2 };
  if (p < d) return { outcome: 'lose', back: 0 };
  return { outcome: 'push', back: bet };
}
