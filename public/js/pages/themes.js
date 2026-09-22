import {
  state, actions, render, show, api, toast, esc, plural, keywordChips, levelsHtml, DIFFICULTIES, draft, loadCatalog, title, sourceHtml,
} from '../core.js';
import { createRoom } from './home.js';

state.ui.themeFilter = { difficulty: '', favorites: false };

/** One quiz card: name, creator underneath, difficulty, keywords, usage, favourite star. */
export function themeCard(t, { playable = true } = {}) {
  return `<article class="theme-card">
    <button class="star ${t.favorite ? 'on' : ''}" data-action="toggle-fav" data-key="${esc(t.key)}" data-on="${t.favorite ? 1 : 0}"
      title="${t.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-pressed="${t.favorite}">${t.favorite ? '★' : '☆'}</button>
    <div class="tc-emoji">${esc(t.emoji)}</div>
    <h3 class="tc-name">${esc(t.name)}</h3>
    <div class="tc-author">par <strong>${esc(t.authorName || 'compte supprimé')}</strong></div>
    <div class="row tc-meta"><span class="badge">❓ ${plural(t.count, 'question')}</span>${levelsHtml(t.levels)}</div>
    ${t.description ? `<p class="small muted tc-desc">${esc(t.description)}</p>` : ''}
    <div class="kws">${keywordChips(t.keywords)}</div>
    ${sourceHtml(t.source)}
    <div class="spread tc-foot">
      <span class="muted small">🎮 ${plural(t.playCount, 'partie')} · ⭐ ${t.favoriteCount}</span>
      ${playable ? `<span class="row"><button class="btn ghost sm" data-action="play-theme-solo" data-key="${esc(t.key)}" title="Jouer seul">🎯 Solo</button>
        <button class="btn accent sm" data-action="play-theme" data-key="${esc(t.key)}">Jouer</button></span>` : ''}
    </div>
  </article>`;
}

export async function themesPage() {
  let catalog;
  try {
    catalog = await loadCatalog(true);
  } catch (err) {
    return render(`<div class="card">${esc(err.message)}</div>`);
  }
  show(() => {
    const f = state.ui.themeFilter;
    const needle = normalize(draft('theme-q'));
    // A difficulty filter keeps quizzes that contain questions of that level.
    const list = catalog.themes.filter((t) => (!f.difficulty || t.levels?.[f.difficulty] > 0)
      && (!f.favorites || t.favorite)
      && (!needle || [t.name, t.authorName, t.description, ...(t.keywords || [])].some((x) => normalize(x).includes(needle))));
    render(`
      <div class="spread" style="margin-bottom:16px">
        <h1 style="margin:0">${title('📚', 'Les quiz')}</h1>
        <a class="btn accent" href="#/my-themes/new">✍️ Créer un quiz</a>
      </div>
      <div class="card stack">
        <input id="theme-q" type="search" data-draft data-live placeholder="🔎 Rechercher un quiz, un mot-clé ou un pseudo…" autocomplete="off">
        <div class="row">
          <button class="pill ${!f.difficulty ? 'active' : ''}" data-action="filter-diff" data-level="">Toutes difficultés</button>
          ${Object.entries(DIFFICULTIES).map(([k, d]) => `<button class="pill ${f.difficulty === k ? 'active' : ''}" data-action="filter-diff" data-level="${k}">${d.emoji} ${d.label}</button>`).join('')}
          <button class="pill ${f.favorites ? 'active' : ''}" data-action="filter-fav">⭐ Mes favoris</button>
        </div>
      </div>
      <p class="muted small" style="margin:14px 4px">${list.length} quiz trouvé${list.length > 1 ? 's' : ''}</p>
      ${list.length ? `<div class="theme-grid">${list.map((t) => themeCard(t)).join('')}</div>`
        : `<div class="card center muted">${f.favorites ? 'Aucun favori pour l’instant : clique sur ☆ pour en ajouter.' : 'Aucun quiz ne correspond à ta recherche.'}</div>`}`);
  });
}

export const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

actions['filter-diff'] = (el) => { state.ui.themeFilter.difficulty = el.dataset.level; state.view(); };
actions['filter-fav'] = () => { state.ui.themeFilter.favorites = !state.ui.themeFilter.favorites; state.view(); };
actions['play-theme'] = (el) => createRoom({ themeId: el.dataset.key });
actions['play-theme-solo'] = (el) => createRoom({ themeId: el.dataset.key, hostPlays: true });
actions['toggle-fav'] = async (el) => {
  const key = el.dataset.key;
  const on = el.dataset.on !== '1';
  try {
    await api(`/api/favorites/${encodeURIComponent(key)}`, { method: on ? 'PUT' : 'DELETE' });
    const t = state.catalog?.themes.find((x) => x.key === key);
    if (t) { t.favorite = on; t.favoriteCount += on ? 1 : -1; }
    toast(on ? 'Ajouté aux favoris ⭐' : 'Retiré des favoris');
    state.view();
  } catch (err) { toast(err.message, true); }
};
