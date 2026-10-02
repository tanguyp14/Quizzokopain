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
const num = (n) => Math.round(n || 0).toLocaleString('fr-FR');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');

/** « 🥇 1er / 12 » for a place in a ranking (nothing when the player is not ranked). */
function rankChip(place, label) {
  if (!place?.rank) return '';
  const medal = ['🥇', '🥈', '🥉'][place.rank - 1] || '🏅';
  return `<span class="st-rank ${place.rank <= 3 ? 'top' : ''}">${medal} <strong>${place.rank}<sup>${place.rank === 1 ? 'er' : 'e'}</sup></strong> / ${place.of}<span class="muted small">${label}</span></span>`;
}

/** One game: its banner (name, ranks, a link to play), then its tiles. */
const gameCard = ({ emoji, name, href, cta, color, ranks = '', body, cls = '' }) => `
  <section class="card st-game ${cls}" style="--gc:${color}">
    <header class="st-head"><span class="st-emoji">${emoji}</span><h2>${name}</h2><a class="btn ghost sm" href="${href}">${cta} →</a></header>
    ${ranks ? `<div class="st-ranks">${ranks}</div>` : ''}
    ${body}
  </section>`;
const empty = (text, href, link) => `<p class="muted st-empty">${text} <a href="${href}">${link}</a></p>`;

export async function statsPage() {
  let data;
  let blast = null;
  let territoire = null;
  let games = {};
  try {
    [data, blast, territoire, games] = await Promise.all([
      api('/api/stats'),
      api('/api/arcade/blast/save').then((r) => (r.save ? normalizeSave(r.save.data) : null)).catch(() => null),
      api('/api/arcade/territoire/save').then((r) => r.save?.data || null).catch(() => null),
      api('/api/stats/games').catch(() => ({})),
    ]);
  } catch (err) {
    return render(`<div class="card">${esc(err.message)}</div>`);
  }
  const { stats, quizzes } = data;
  const { poker, blackjack, empire } = games;

  const quizCard = gameCard({
    emoji: '🧠', name: 'Quiz', href: '#/', cta: 'Jouer', color: '#7c5cff',
    body: `<div class="tiles">
      ${tile(stats.played, stats.played > 1 ? 'parties jouées' : 'partie jouée', '🎮')}
      ${tile(stats.wins, stats.wins > 1 ? 'victoires' : 'victoire', '🏆')}
      ${tile(num(stats.points), stats.points > 1 ? 'points' : 'point', '⭐')}
      ${tile(`${stats.successRate} %`, 'de bonnes réponses', '🎯')}
      ${tile(stats.hosted, stats.hosted > 1 ? 'parties animées' : 'partie animée', '🎙️')}
      ${tile(data.favorites, data.favorites > 1 ? 'quiz favoris' : 'quiz favori', '💛')}
    </div>
    ${stats.mostPlayedTheme ? `<p class="muted small st-foot">Ton quiz le plus joué : <strong>${esc(stats.mostPlayedTheme.label)}</strong> (${plural(stats.mostPlayedTheme.count, 'partie')})</p>` : ''}`,
  });

  const blastCard = gameCard({
    emoji: '🚀', name: 'Jimmy Blast', href: '#/games/blast', cta: 'Jouer', color: '#ff6b9a',
    ranks: blast ? rankChip(games.blast?.prestige, 'prestige') + rankChip(games.blast?.sector, 'secteur') + rankChip(games.blast?.ach, 'succès') : '',
    body: blast ? `<div class="tiles">
      ${tile(fmt(blast.maxStage), 'meilleur secteur', '🗺️')}
      ${tile(blast.prestige, blast.prestige > 1 ? 'prestiges' : 'prestige', '⭐')}
      ${blast.bigBangs ? tile(blast.bigBangs, blast.bigBangs > 1 ? 'Big Bangs' : 'Big Bang', '💥') : ''}
      ${tile(fmt(blast.totalEarned), 'crédits gagnés', '🪙')}
      ${tile(fmt(blast.stats.blocks), 'blocs cassés', '🧱')}
      ${tile(fmt(blast.stats.golds), 'blocs dorés', '✨')}
      ${tile(fmt(blast.stats.bosses), blast.stats.bosses > 1 ? 'planètes conquises' : 'planète conquise', '🚩')}
      ${tile(fmt(blast.stats.ufos), 'soucoupes attrapées', '🛸')}
      ${tile(fmt(blast.stats.merges), 'fusions', '🧬')}
      ${blast.stats.starsFound ? tile(fmt(blast.stats.starsFound), blast.stats.starsFound > 1 ? 'étoiles trouvées' : 'étoile trouvée', '🔭') : ''}
      ${tile(playTime(blast.stats.playTime), 'de jeu', '⏱️')}
    </div>` : empty('Tu n’as pas encore joué.', '#/games/blast', 'Lance ta flotte !'),
  });

  const ships = empire ? Object.values(empire.ships).reduce((a, b) => a + b, 0) : 0;
  const prod = empire?.production || {};
  const empireCard = gameCard({
    emoji: '🪐', name: 'L’Empire de Jimmy', href: '#/empire', cta: 'Mon empire', color: '#38c8ff',
    body: empire ? `<div class="tiles">
      ${tile(num(empire.points), 'points d’empire', '👑')}
      ${tile(empire.planets, empire.planets > 1 ? 'planètes' : 'planète', '🪐')}
      ${tile(num(empire.buildings), 'niveaux de bâtiments', '🏗️')}
      ${tile(num(empire.research), 'niveaux de recherche', '🔬')}
      ${tile(num(ships), ships > 1 ? 'vaisseaux au port' : 'vaisseau au port', '🛰️')}
      ${tile(empire.relics, empire.relics > 1 ? 'reliques' : 'relique', '🏺')}
      ${tile(`${Math.max(1, Math.floor((Date.now() - empire.createdAt) / 86400000))} j`, 'd’empire', '📅')}
    </div>
    <p class="muted small st-foot">Production : 🔩 ${num(prod.metal / 60)} · 💎 ${num(prod.crystal / 60)} · 🔥 ${num(prod.plasma / 60)} par minute</p>`
      : empty('Pas encore de planète.', '#/empire', 'Fonde ton empire !'),
  });

  const casinoGame = (p, label, emoji) => (p ? `<div class="st-sub">
      <div class="st-sub-head"><strong>${emoji} ${label}</strong>${rankChip(p, 'classement')}</div>
      <div class="tiles">
        ${tile(`🪙 ${num(p.best)}`, 'meilleure partie', '🏆')}
        ${tile(p.runs, p.runs > 1 ? 'parties' : 'partie', '🎲')}
        ${tile(num(p.hands), p.hands > 1 ? 'mains jouées' : 'main jouée', '🃏')}
        ${tile(pct(p.wins, p.hands), 'de mains gagnées', '🎯')}
      </div></div>` : `<div class="st-sub"><div class="st-sub-head"><strong>${emoji} ${label}</strong></div><p class="muted small">Pas encore de partie.</p></div>`);
  const casinoCard = gameCard({
    emoji: '🎰', name: 'Casino Spatial', href: '#/casino', cta: 'Entrer', color: '#ffb938', cls: 'st-casino',
    body: `<div class="st-subs">${casinoGame(poker, 'Poker de Butch', '🃏')}${casinoGame(blackjack, 'Blackjack', '🂡')}</div>`,
  });

  const territoireCard = gameCard({
    emoji: '🛸', name: 'Territoire', href: '#/territoire', cta: 'Jouer', color: '#4ade80',
    ranks: territoire ? rankChip(games.territoire, 'classement') : '',
    body: territoire ? `<div class="tiles">
      ${tile(fmt(territoire.best || 0), 'record', '🏆')}
      ${tile(territoire.bestLevel || 0, 'meilleure planète', '🪐')}
      ${tile(territoire.games || 0, (territoire.games || 0) > 1 ? 'parties' : 'partie', '🎮')}
    </div>` : empty('Pas encore de partie.', '#/territoire', 'Nettoie ta première planète !'),
  });

  show(() => render(`<div class="st">
    <div class="st-top">${avatar(state.me, 64)}<div><h1 style="margin:0">${title('📊', 'Mes stats')}</h1><span class="muted">${esc(state.me.username)} · tous les jeux</span></div>
      <a class="btn ghost sm" href="#/profile" style="margin-left:auto">👤 Ma page</a></div>
    <div class="st-grid">
      ${quizCard}${blastCard}${empireCard}${casinoCard}${territoireCard}
      <section class="card st-game st-wide" style="--gc:#a78bfa">
        <header class="st-head"><span class="st-emoji">✍️</span><h2>Mes quiz créés</h2><a class="btn ghost sm" href="#/my-themes/new">Créer →</a></header>
        <div class="tiles">
          ${tile(quizzes.created, quizzes.created > 1 ? 'quiz créés' : 'quiz créé', '📝')}
          ${tile(quizzes.approved, quizzes.approved > 1 ? 'validés' : 'validé', '✅')}
          ${tile(quizzes.pending, 'en attente', '⏳')}
          ${tile(quizzes.totalPlays, quizzes.totalPlays > 1 ? 'parties jouées sur mes quiz' : 'partie jouée sur mes quiz', '🔥')}
          ${tile(quizzes.totalFavorites, quizzes.totalFavorites > 1 ? 'mises en favori' : 'mise en favori', '⭐')}
        </div>
        ${quizzes.list.length ? `<div class="table-wrap" style="margin-top:14px"><table class="history">
          <thead><tr><th>Quiz</th><th>Statut</th><th>Niveaux</th><th>Questions</th><th>Joué</th><th>Favoris</th></tr></thead>
          <tbody>${quizzes.list.map((t) => `<tr>
            <td><a href="#/my-themes/${t.id}">${esc(t.emoji)} ${esc(t.name)}</a></td>
            <td>${statusBadge(t.status)}</td><td>${levelsHtml(t.levels)}</td>
            <td>${t.questionCount}</td><td>${t.playCount} fois</td><td>⭐ ${t.favoriteCount}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="muted center">Tu n’as pas encore créé de quiz. <a href="#/my-themes/new">Crée le premier !</a></p>'}
      </section>
    </div>
  </div>`));
}
