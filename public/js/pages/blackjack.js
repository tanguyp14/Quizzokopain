// Blackjack du Casino Spatial: the server deals and settles; the page shows the table and sends
// the player's choices (bet, card, stand, double).
import {
  state, actions, render, api, esc, avatar, notify,
} from '../core.js';
import {
  SUITS, RANKS, BETS, RUN_HANDS, START_COINS, handValue,
} from '../games/blackjack/logic.js';
import { notesButton } from '../patchnotes.js';

let B = null; // { data (server state), bet, top, bubble, anim, seen }

const num = (n) => Math.round(n).toLocaleString('fr-FR');
const BUBBLES = {
  idle: 'Assieds-toi, l’ami. Choisis ta mise.',
  play: 'Une carte ? Ou tu t’arrêtes là ?',
  blackjack: ['Blackjack… Tu as un ange gardien ou quoi ?', 'Hmpf. 21 d’entrée. Profite.'],
  win: ['Tu as eu de la chance.', 'La prochaine est pour moi.'],
  lose: ['Merci pour les pièces !', 'La maison gagne toujours, l’ami.', 'Trop gourmand, hein ?'],
  push: ['Égalité. Reprends ta mise.'],
  over: 'Fin de la partie. Reviens quand tu veux.',
};
const pick = (v) => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);

export async function blackjackPage() {
  render('<p class="muted">Butch sort le sabot…</p>');
  try {
    const [data, top] = await Promise.all([api('/api/blackjack'), api('/api/blackjack/top').catch(() => ({ players: [] }))]);
    if (!location.hash.startsWith('#/casino/blackjack')) return;
    B = { data, bet: BETS[0], top: top.players, bubble: BUBBLES[data.hand?.phase === 'play' ? 'play' : 'idle'], seen: 0 };
    state.view = () => {};
    state.ui.cleanup = () => { B = null; };
    draw();
  } catch (err) { render(`<p class="bad">${esc(err.message)}</p>`); }
}

/** A playing card (or its back); the new ones fly in. */
function card(c, { back = false, delay = 0, anim = false } = {}) {
  if (back) return `<div class="bj-card back ${anim ? 'anim' : ''}" style="--d:${delay}ms"><span>🧔</span></div>`;
  const s = SUITS[c.s];
  return `<div class="bj-card ${anim ? 'anim' : ''}" style="--d:${delay}ms;--sc:${s.color}">
    <span class="bj-corner">${RANKS[c.r]}<i>${s.emoji}</i></span><span class="bj-mid">${s.emoji}</span><span class="bj-corner end">${RANKS[c.r]}<i>${s.emoji}</i></span></div>`;
}
const total = (cards) => {
  const v = handValue(cards);
  return v.soft && v.total < 21 ? `${v.total - 10} / ${v.total}` : String(v.total);
};

function draw() {
  if (!B) return;
  const { data } = B;
  const h = data.hand;
  const playing = h?.phase === 'play';
  const done = h?.phase === 'done';
  const over = data.over;
  // Only the cards that just arrived are animated.
  const fresh = (i, side) => B.anim && i >= (B.prev?.[side] ?? 0);
  const result = done && {
    blackjack: `🌟 Blackjack ! <strong>+${num(h.won)} 🪙</strong>`, win: `🎉 Gagné ! <strong>+${num(h.won)} 🪙</strong>`,
    lose: `💸 Perdu… <strong>${num(h.won)} 🪙</strong>`, push: '🤝 Égalité, mise rendue',
  }[h.outcome];
  const canBet = (b) => data.coins >= b;
  render(`<div class="pk">
    <section class="pk-play">
      <div class="card pk-table bj-table">
        <div class="pk-dealer"><span class="pk-butch">🧔</span><div class="pk-bubble">${esc(B.bubble)}</div></div>
        <div class="bj-side-label">Butch ${h ? `<span class="badge">${done ? total(h.dealer) : total(h.dealer)}${done ? '' : ' + ?'}</span>` : ''}</div>
        <div class="bj-row">${h ? [...h.dealer.map((c, i) => card(c, { delay: i * 160, anim: fresh(i, 'dealer') })), ...(done ? [] : [card(null, { back: true, anim: fresh(1, 'dealer'), delay: 160 })])].join('')
          : [card(null, { back: true }), card(null, { back: true })].join('')}</div>
        <div class="pk-mid">${done ? `<div class="pk-result ${h.outcome === 'lose' ? 'lose' : h.outcome === 'push' ? 'draw' : 'win'}">${result}</div>`
          : playing ? `<div class="pk-pot">Mise <strong>${h.bet} 🪙</strong>${h.doubled ? ' (doublée)' : ''}</div>` : '<div class="pk-pot muted">Blackjack paie 3 pour 2 · Butch tire jusqu’à 16</div>'}</div>
        <div class="bj-row">${h ? h.player.map((c, i) => card(c, { delay: 80 + i * 160, anim: fresh(i, 'player') })).join('') : [card(null, { back: true }), card(null, { back: true })].join('')}</div>
        <div class="bj-side-label">Toi ${h ? `<span class="badge ${handValue(h.player).total > 21 ? 'bad' : ''}">${total(h.player)}</span>` : ''}</div>
        <div class="pk-actions">
          ${playing ? `<button class="btn accent" data-action="bj-hit">🃏 Carte</button>
            <button class="btn" data-action="bj-stand">✋ Je reste</button>
            ${h.player.length === 2 ? `<button class="btn ghost" data-action="bj-double" ${data.coins < h.bet ? 'disabled' : ''}>✖️2 Doubler</button>` : ''}`
            : over ? `<div class="pk-over"><span>Partie terminée : <strong>🪙 ${num(data.coins)}</strong>${data.coins >= data.best && data.coins > 0 ? ' · 🏆 nouveau record !' : ''}</span>
                <button class="btn accent big" data-action="bj-restart">🂡 Nouvelle partie (${START_COINS} 🪙, ${RUN_HANDS} mains)</button></div>`
              : `<div class="bj-bets">${BETS.map((b) => `<button class="btn ghost bj-chip ${B.bet === b ? 'active' : ''}" data-action="bj-bet" data-b="${b}" ${canBet(b) ? '' : 'disabled'}>${b}</button>`).join('')}</div>
                <button class="btn accent big" data-action="bj-deal" ${canBet(B.bet) ? '' : 'disabled'}>🂡 Distribuer (${B.bet} 🪙)</button>`}
        </div>
      </div>
    </section>
    <aside class="pk-side">
      <div class="card pk-stats">
        <div class="tr-stat"><span class="muted small">Pièces</span><strong>🪙 ${num(data.coins)}</strong></div>
        <div class="tr-stat"><span class="muted small">Record</span><strong>🏆 ${num(data.best)}</strong></div>
        <div class="tr-stat"><span class="muted small">Main</span><strong>${Math.min(RUN_HANDS, RUN_HANDS - data.left + (playing ? 1 : 0))} / ${RUN_HANDS}</strong></div>
        <div class="tr-stat"><span class="muted small">Victoires</span><strong>${data.hands ? Math.round((data.wins / data.hands) * 100) : 0} %</strong></div>
        <div class="bl-bar pk-progress"><span style="width:${((RUN_HANDS - data.left) / RUN_HANDS) * 100}%"></span></div>
        <p class="small muted" style="grid-column:1/-1;margin:0">Une partie : ${RUN_HANDS} mains en partant de ${START_COINS} 🪙. Ton score, ce sont les pièces à la fin ; le Top garde ta meilleure partie.</p>
        ${!playing && !over && data.left < RUN_HANDS ? '<button class="btn ghost sm" style="grid-column:1/-1" data-action="bj-restart">↩️ Abandonner et recommencer</button>' : ''}
        <div style="grid-column:1/-1">${notesButton('casino')}</div>
      </div>
      <div class="card pk-rules">
        <strong>Règles</strong>
        <ul class="bj-rules small">
          <li>Approche-toi de <strong>21</strong> sans le dépasser. Figures = 10, As = 1 ou 11.</li>
          <li>Butch tire jusqu’à 16 et s’arrête à 17.</li>
          <li><strong>Blackjack</strong> (As + 10 d’entrée) : payé 3 pour 2.</li>
          <li>Victoire : payée 1 pour 1. Égalité : mise rendue.</li>
          <li><strong>Doubler</strong> : mise ×2, une seule carte de plus.</li>
        </ul>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px">🏆 Top Blackjack</h3>
        ${B.top.length ? `<ol class="bl-rank">${B.top.map((p, k) => `<li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${avatar(p, 26)}
          <span class="bl-rank-name">${esc(p.username)}</span><span class="badge">🪙 ${num(p.best)}</span><span class="small muted">${p.runs} partie${p.runs > 1 ? 's' : ''}</span></li>`).join('')}</ol>` : '<p class="muted">Personne au classement pour l’instant.</p>'}
      </div>
    </aside>
  </div>`);
  B.anim = false;
  B.prev = h ? { player: h.player.length, dealer: done ? h.dealer.length : 2 } : null;
}

async function send(path, body) {
  if (!B || B.busy) return null;
  B.busy = true;
  const before = B.data.hand && B.data.hand.phase === 'play' ? { player: B.data.hand.player.length, dealer: 1 } : { player: 0, dealer: 0 };
  try {
    const data = await api(`/api/blackjack/${path}`, { method: 'POST', body: body || {} });
    if (!B) return null;
    B.data = data;
    B.anim = true;
    B.prev = before;
    const h = data.hand;
    if (h?.phase === 'done') {
      B.bubble = pick(BUBBLES[h.outcome]);
      if (data.over) B.bubble = BUBBLES.over;
      api('/api/blackjack/top').then((r) => { if (B) B.top = r.players; }).catch(() => {});
    } else if (h?.phase === 'play') B.bubble = BUBBLES.play;
    return data;
  } catch (err) {
    notify('casino', err.message, true);
    B.data = await api('/api/blackjack').catch(() => B.data);
    return null;
  } finally {
    if (B) B.busy = false;
  }
}

actions['bj-bet'] = (el) => { B.bet = Number(el.dataset.b); draw(); };
actions['bj-deal'] = async () => { await send('deal', { bet: B.bet }); draw(); };
actions['bj-hit'] = async () => { await send('hit'); draw(); };
actions['bj-stand'] = async () => { await send('stand'); draw(); };
actions['bj-double'] = async () => { await send('double'); draw(); };
actions['bj-restart'] = async () => {
  if (!B.data.over && !confirm('Abandonner la partie en cours ? Elle compte avec tes pièces actuelles.')) return;
  await send('restart');
  B.bubble = BUBBLES.idle;
  draw();
};
