// Mini-jeux: the landing page of the sub-menu (Casino Spatial, Bomber, Territoire).
import { render, title } from '../core.js';

const GAMES = [
  { href: '#/casino', emoji: '🎰', art: '🃏🧔🂡', name: 'Casino Spatial', color: '#ffb938',
    text: 'Poker de Butch et Blackjack contre Butch. Une partie = 30 mains en partant de 100 pièces ; le Top garde ta meilleure.' },
  { href: '#/bomber', emoji: '💣', art: '💣👽🪨', name: 'Jimmy Bomber', color: '#ff4d6d',
    text: 'Arènes de 2 à 4 aliens en temps réel. Invite tes potes avec un code, les bots complètent les places vides.' },
  { href: '#/territoire', emoji: '🛸', art: '🛸🪐✨', name: 'Territoire', color: '#4ade80',
    text: 'Nettoie les planètes case après case sans te faire toucher, et bats ton record.' },
];

export function miniPage() {
  render(`<div class="mini">
    <h1>${title('🎮', 'Mini-jeux')}</h1>
    <p class="muted" style="margin-top:-6px">Des parties courtes, chacune avec son Top.</p>
    <div class="mini-grid">${GAMES.map((g) => `
      <a class="card mini-card" href="${g.href}" style="--gc:${g.color}">
        <div class="mini-art" aria-hidden="true">${g.art}</div>
        <h2>${g.emoji} ${g.name}</h2>
        <p class="muted">${g.text}</p>
        <span class="btn accent">Jouer →</span>
      </a>`).join('')}
    </div>
  </div>`);
}
