// Games hub: the quiz and the arcade games.
import { render, api, esc, title } from '../core.js';
import { fmt, TIERS } from '../games/blast/logic.js';

export async function gamesPage() {
  let best = null;
  try { best = (await api('/api/arcade/blast/save')).save?.data?.maxStage || null; } catch { /* not played yet */ }
  render(`
    <h1>${title('🕹️', 'Jeux')}</h1>
    <p class="muted">Le quiz entre amis, et des petits jeux pour passer le temps entre deux parties.</p>
    <div class="games-grid">
      <a class="card game-card" href="#/">
        <span class="game-emoji">🧠</span>
        <div><h2>Quiz</h2><p class="muted">Rooms privées, tous types de questions, en solo ou entre amis.</p></div>
        <span class="btn">Jouer</span>
      </a>
      <a class="card game-card" href="#/games/blast">
        <span class="game-emoji game-ships">${TIERS.slice(0, 3).map((t) => `<svg viewBox="-12 -12 24 24" width="34" height="34" aria-hidden="true"><path d="M0 -11 L7.7 7.7 L0 3.8 L-7.7 7.7 Z" fill="${t.color}"/></svg>`).join('')}</span>
        <div><h2>Jimmy Blast <span class="badge">Nouveau</span></h2>
          <p class="muted">Jeu incrémental : ta flotte casse des blocs, tu gagnes des crédits, tu améliores tes vaisseaux et tu fusionnes.</p>
          ${best ? `<p class="small">🏅 Ton record : <strong>secteur ${esc(fmt(best))}</strong></p>` : ''}</div>
        <span class="btn accent">${best ? 'Continuer' : 'Jouer'}</span>
      </a>
    </div>`);
}
