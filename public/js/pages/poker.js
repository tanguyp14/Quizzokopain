// Le Poker de Butch (Picture Poker): the server deals and settles; the page shows the table and
// sends the player's choices (raise, cards to keep, swap).
import {
  state, actions, render, api, esc, avatar, title, notify,
} from '../core.js';
import {
  CARDS, HANDS, MAX_BET, HAND_SIZE, RUN_HANDS, START_COINS, evaluate,
} from '../games/poker/logic.js';
import { notesButton } from '../patchnotes.js';

let P = null; // { data (server state), hold: [bools], busy, top }

const num = (n) => Math.round(n).toLocaleString('fr-FR');
const handName = (key) => HANDS.find((h) => h.key === key)?.name || '';
const BUBBLES = {
  idle: 'Approche, l’ami. Une pièce pour jouer, pas de discussion.',
  draw: 'Choisis les cartes à échanger. Et ne me fais pas perdre mon temps.',
  win: ['Hmpf. La chance du débutant.', 'Tu triches ou quoi ?', 'Profite, ça ne durera pas.'],
  lose: ['Merci pour la pièce, l’ami !', 'La maison gagne toujours.', 'Butch Pakovski ne perd jamais longtemps.'],
  draw0: ['Égalité. Reprends ta mise.', 'Personne ne gagne, personne ne perd.'],
  broke: 'Plus un sou ? Allez, je t’offre 10 pièces pour une nouvelle partie.',
  over: 'Fin de la partie. Tu reviens me voir quand tu veux, l’ami.',
};
const pick = (list) => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list);

export async function pokerPage() {
  render('<p class="muted">Butch mélange les cartes…</p>');
  try {
    const [data, top] = await Promise.all([api('/api/poker'), api('/api/poker/top').catch(() => ({ players: [] }))]);
    if (!location.hash.startsWith('#/casino') || location.hash.startsWith('#/casino/blackjack')) return;
    P = { data, hold: Array(HAND_SIZE).fill(false), top: top.players, bubble: BUBBLES[data.hand?.phase === 'draw' ? 'draw' : 'idle'] };
    state.view = () => {};
    state.ui.cleanup = () => { P = null; };
    draw();
  } catch (err) { render(`<p class="bad">${esc(err.message)}</p>`); }
}

// Cards only fly in when they arrive (a deal, a swap, Butch's reveal), not at every redraw.
const card = (c, { back = false, held = false, i = null, delay = 0, anim = false } = {}) => (back
  ? `<div class="pk-card back ${anim ? 'anim' : ''}" style="--d:${delay}ms"><span>🧔</span></div>`
  : `<button class="pk-card c-${CARDS[c].key} ${held ? 'held' : ''} ${anim ? 'anim' : ''}" style="--d:${delay}ms" ${i !== null ? `data-action="pk-hold" data-i="${i}"` : 'disabled'}
      title="${esc(CARDS[c].name)}"><span class="pk-emoji">${CARDS[c].emoji}</span><small>${esc(CARDS[c].name)}</small>${held ? '<i>Gardée</i>' : ''}</button>`);

function draw() {
  if (!P) return;
  const { data } = P;
  const h = data.hand;
  const playing = h?.phase === 'draw';
  const done = h?.phase === 'done';
  const over = data.over;
  const mine = h && evaluate(h.player);
  const res = done ? h.result : null;
  render(`<div class="pk">
    <section class="pk-play">
      <div class="card pk-table">
        <div class="pk-dealer">
          <span class="pk-butch">🧔</span>
          <div class="pk-bubble">${esc(P.bubble)}</div>
        </div>
        <div class="pk-row">${h ? (done ? h.dealer.map((c, i) => card(c, { delay: i * 120, anim: P.anim })).join('') : h.player.map((_, i) => card(0, { back: true, delay: i * 60, anim: P.anim })).join(''))
          : Array(HAND_SIZE).fill(0).map(() => card(0, { back: true })).join('')}</div>
        <div class="pk-mid">
          ${done ? `<div class="pk-result ${res.outcome}">${res.outcome === 'win' ? `🎉 Gagné ! <strong>+${num(h.won)} 🪙</strong>` : res.outcome === 'lose' ? `💸 Perdu… <strong>${num(h.won)} 🪙</strong>` : '🤝 Égalité, mise rendue'}
            <span class="small">Toi : ${esc(handName(res.mine))} · Butch : ${esc(handName(res.his))}</span></div>`
            : playing ? `<div class="pk-pot">Mise <strong>${h.bet} 🪙</strong> / ${MAX_BET}</div>` : '<div class="pk-pot muted">Une pièce pour jouer</div>'}
        </div>
        <div class="pk-row mine">${h ? h.player.map((c, i) => card(c, { held: playing && P.hold[i], i: playing ? i : null, delay: 300 + i * 90, anim: P.anim && !(done && P.kept?.[i]) })).join('')
          : Array(HAND_SIZE).fill(0).map(() => card(0, { back: true })).join('')}</div>
        ${h ? `<div class="pk-hand">Ta main : <strong>${esc(mine.name)}</strong>${mine.mult ? ` <span class="muted">(×${mine.mult})</span>` : ''}</div>` : ''}
        <div class="pk-actions">
          ${playing ? `<button class="btn ghost" data-action="pk-raise" ${h.bet >= MAX_BET || data.coins < 1 ? 'disabled' : ''}>➕ Miser 1 🪙</button>
            <button class="btn accent" data-action="pk-draw">🔄 ${P.hold.every(Boolean) ? 'Garder tout' : `Échanger ${P.hold.filter((x) => !x).length} carte${P.hold.filter((x) => !x).length > 1 ? 's' : ''}`}</button>`
            : over ? `<div class="pk-over"><span>Partie terminée : <strong>🪙 ${num(data.coins)}</strong>${data.coins >= data.best && data.coins > 0 ? ' · 🏆 nouveau record !' : ''}</span>
                <button class="btn accent big" data-action="pk-restart">🃏 Nouvelle partie (${START_COINS} 🪙, ${RUN_HANDS} mains)</button></div>`
              : '<button class="btn accent big" data-action="pk-deal">🃏 Distribuer (1 🪙)</button>'}
        </div>
        ${playing ? '<p class="small muted center" style="margin:0">Touche une carte pour la <strong>garder</strong> ; les autres seront échangées.</p>' : ''}
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
        ${!playing && !over && data.left < RUN_HANDS ? '<button class="btn ghost sm" style="grid-column:1/-1" data-action="pk-restart" title="La partie en cours compte avec ses pièces actuelles">↩️ Abandonner et recommencer</button>' : ''}
        <div style="grid-column:1/-1">${notesButton('casino')}</div>
      </div>
      <div class="card pk-rules">
        <strong>Gains (× la mise)</strong>
        <ul class="pk-pay">${HANDS.filter((x) => x.mult).map((x) => `<li class="${mine && mine.key === x.key ? 'on' : ''}"><span>${esc(x.name)}</span><strong>×${x.mult}</strong></li>`).join('')}</ul>
        <strong>Force des cartes</strong>
        <div class="pk-ranks">${[...CARDS].reverse().map((c) => `<span title="${esc(c.name)}">${c.emoji}</span>`).join('<i>›</i>')}</div>
        <p class="small muted" style="margin:0">Même main des deux côtés : la carte la plus forte gagne. Rien contre rien : égalité.</p>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px">🏆 Top</h3>
        ${P.top.length ? `<ol class="bl-rank">${P.top.map((p, k) => `<li class="${p.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${avatar(p, 26)}
          <span class="bl-rank-name">${esc(p.username)}</span><span class="badge">🪙 ${num(p.best)}</span><span class="small muted">${p.runs} partie${p.runs > 1 ? 's' : ''}</span></li>`).join('')}</ol>` : '<p class="muted">Personne au classement pour l’instant.</p>'}
      </div>
    </aside>
  </div>`);
  P.anim = false;
}

async function send(path, body) {
  if (!P || P.busy) return null;
  P.busy = true;
  try {
    const data = await api(`/api/poker/${path}`, { method: 'POST', body: body || {} });
    if (!P) return null;
    P.data = data;
    return data;
  } catch (err) {
    notify('casino', err.message, true);
    P.data = await api('/api/poker').catch(() => P.data);
    return null;
  } finally {
    if (P) P.busy = false;
  }
}

actions['pk-deal'] = async () => {
  const d = await send('deal');
  if (!d) return draw();
  P.hold = Array(HAND_SIZE).fill(false);
  // Butch keeps what makes a set: a hint for new players — pairs start held.
  const { groups } = evaluate(d.hand.player);
  const inSet = new Set(groups.map(([c]) => c));
  P.hold = d.hand.player.map((c) => inSet.has(c));
  P.bubble = BUBBLES.draw;
  P.anim = true;
  draw();
};
actions['pk-raise'] = async () => { await send('raise'); draw(); };
actions['pk-hold'] = (el) => { P.hold[Number(el.dataset.i)] = !P.hold[Number(el.dataset.i)]; draw(); };
actions['pk-draw'] = async () => {
  const kept = [...P.hold];
  const d = await send('draw', { hold: P.hold });
  if (d) {
    P.anim = true;
    P.kept = kept; // the kept cards don't fly in again
    const o = d.hand.result.outcome;
    P.bubble = pick(BUBBLES[o === 'win' ? 'win' : o === 'lose' ? 'lose' : 'draw0']);
    if (d.over) P.bubble = d.coins < 1 ? BUBBLES.broke : BUBBLES.over;
    api('/api/poker/top').then((r) => { if (P) { P.top = r.players; } }).catch(() => {});
  }
  draw();
};
actions['pk-restart'] = async (el) => {
  if (!P.data.over && !confirm('Abandonner la partie en cours ? Elle compte avec tes pièces actuelles.')) return;
  await send('restart');
  P.bubble = BUBBLES.idle;
  draw();
};
