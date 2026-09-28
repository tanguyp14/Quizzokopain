import {
  state, render, show, api, esc, plural, avatar, levelsHtml, title,
} from '../core.js';
import { statusBadge } from './myThemes.js';
import { normalizeSave, fmt } from '../games/blast/logic.js';

const tile = (value, label, emoji) => `<div class="tile"><div class="tile-emoji">${emoji}</div><div class="tile-value">${value}</div><div class="tile-label">${label}</div></div>`;

const playTime = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

export async function statsPage() {
  let data;
  let blast = null;
  let territoire = null;
  try {
    [data, blast] = await Promise.all([
      api('/api/stats'),
      api('/api/arcade/blast/save').then((r) => (r.save ? normalizeSave(r.save.data) : null)).catch(() => null),
      api('/api/arcade/territoire/save').then((r) => r.save?.data || null).catch(() => null),
    ]).then(([d, b, tr]) => { territoire = tr; return [d, b]; });
  } catch (err) {
    return render(`<div class="card">${esc(err.message)}</div>`);
  }
  const { stats, quizzes } = data;
  show(() => render(`
    <div class="row" style="margin-bottom:16px">${avatar(state.me, 56)}<div><h1 style="margin:0">${title('📊', 'Mes stats')}</h1><span class="muted">${esc(state.me.username)}</span></div></div>

    <h2 class="section-title">🎮 En tant que joueur</h2>
    <div class="tiles">
      ${tile(stats.played, stats.played > 1 ? 'parties jouées' : 'partie jouée', '🎮')}
      ${tile(stats.wins, stats.wins > 1 ? 'victoires' : 'victoire', '🏆')}
      ${tile(stats.points, stats.points > 1 ? 'points' : 'point', '⭐')}
      ${tile(`${stats.successRate} %`, 'de bonnes réponses', '🎯')}
      ${tile(stats.hosted, stats.hosted > 1 ? 'parties animées' : 'partie animée', '🎙️')}
      ${tile(data.favorites, data.favorites > 1 ? 'quiz favoris' : 'quiz favori', '💛')}
    </div>
    ${stats.mostPlayedTheme ? `<p class="muted">Ton quiz le plus joué : <strong>${esc(stats.mostPlayedTheme.label)}</strong> (${plural(stats.mostPlayedTheme.count, 'partie')})</p>` : ''}

    <h2 class="section-title">🚀 Jimmy Blast</h2>
    ${blast ? `<div class="tiles">
      ${tile(fmt(blast.maxStage), 'meilleur secteur', '🗺️')}
      ${tile(blast.prestige, blast.prestige > 1 ? 'prestiges' : 'prestige', '⭐')}
      ${tile(fmt(blast.totalEarned), 'crédits gagnés', '🪙')}
      ${tile(fmt(blast.stats.blocks), 'blocs cassés', '🧱')}
      ${tile(fmt(blast.stats.golds), 'blocs dorés', '✨')}
      ${tile(fmt(blast.stats.bosses), blast.stats.bosses > 1 ? 'planètes conquises' : 'planète conquise', '🚩')}
      ${tile(fmt(blast.stats.ufos), 'soucoupes attrapées', '🛸')}
      ${tile(fmt(blast.stats.merges), 'fusions', '🧬')}
      ${blast.stats.starsFound ? tile(fmt(blast.stats.starsFound), blast.stats.starsFound > 1 ? 'étoiles trouvées' : 'étoile trouvée', '🔭') : ''}
      ${tile(playTime(blast.stats.playTime), 'de jeu', '⏱️')}
    </div>` : '<p class="muted">Tu n’as pas encore joué. <a href="#/games/blast">Lance ta flotte !</a></p>'}

    <h2 class="section-title">🛸 Territoire</h2>
    ${territoire ? `<div class="tiles">
      ${tile(fmt(territoire.best || 0), 'record', '🏆')}
      ${tile(territoire.bestLevel || 0, 'meilleure planète', '🪐')}
      ${tile(territoire.games || 0, (territoire.games || 0) > 1 ? 'parties' : 'partie', '🎮')}
    </div>` : '<p class="muted">Pas encore de partie. <a href="#/territoire">Nettoie ta première planète !</a></p>'}

    <h2 class="section-title">✍️ Mes quiz créés</h2>
    <div class="tiles">
      ${tile(quizzes.created, quizzes.created > 1 ? 'quiz créés' : 'quiz créé', '📝')}
      ${tile(quizzes.approved, quizzes.approved > 1 ? 'validés' : 'validé', '✅')}
      ${tile(quizzes.pending, 'en attente', '⏳')}
      ${tile(quizzes.totalPlays, quizzes.totalPlays > 1 ? 'parties jouées sur mes quiz' : 'partie jouée sur mes quiz', '🔥')}
      ${tile(quizzes.totalFavorites, quizzes.totalFavorites > 1 ? 'mises en favori' : 'mise en favori', '⭐')}
    </div>
    <div class="card" style="margin-top:16px">
      ${quizzes.list.length ? `<div class="table-wrap"><table class="history">
        <thead><tr><th>Quiz</th><th>Statut</th><th>Niveaux</th><th>Questions</th><th>Joué</th><th>Favoris</th></tr></thead>
        <tbody>${quizzes.list.map((t) => `<tr>
          <td><a href="#/my-themes/${t.id}">${esc(t.emoji)} ${esc(t.name)}</a></td>
          <td>${statusBadge(t.status)}</td><td>${levelsHtml(t.levels)}</td>
          <td>${t.questionCount}</td><td>${t.playCount} fois</td><td>⭐ ${t.favoriteCount}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted center">Tu n’as pas encore créé de quiz. <a href="#/my-themes/new">Crée le premier !</a></p>'}
    </div>`));
}
