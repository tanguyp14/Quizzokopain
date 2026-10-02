import {
  state, actions, render, show, api, toast, esc, avatar, FRAMES,
} from '../core.js';

const SIZE = 256;

let myFrames = null; // frames earned (loaded with the page)

const COLLECTION_SLOTS = 12; // the TCG binder: face-down cards until the cards arrive

/** A place won in a ranking, for the showcase. */
const trophy = (emoji, game, place, label) => (place?.rank ? `<div class="pp-trophy ${place.rank <= 3 ? 'top' : ''}">
  <span class="pp-trophy-medal">${['🥇', '🥈', '🥉'][place.rank - 1] || emoji}</span>
  <span><strong>${game}</strong><span class="muted small">${place.rank}<sup>${place.rank === 1 ? 'er' : 'e'}</sup> / ${place.of} · ${label}</span></span></div>` : '');

export async function profilePage() {
  let games = {};
  let quiz = null;
  [myFrames, games, quiz] = await Promise.all([
    myFrames ? Promise.resolve(myFrames) : api('/api/me/frames').then((r) => r.frames).catch(() => []),
    api('/api/stats/games').catch(() => ({})),
    api('/api/stats').then((r) => r.stats).catch(() => null),
  ]);
  if (!location.hash.startsWith('#/profile')) return;
  const trophies = [
    trophy('🚀', 'Jimmy Blast', games.blast?.prestige, 'prestige'),
    trophy('🗺️', 'Jimmy Blast', games.blast?.sector, 'secteur'),
    trophy('🃏', 'Poker de Butch', games.poker, 'classement'),
    trophy('🂡', 'Blackjack', games.blackjack, 'classement'),
    trophy('🛸', 'Territoire', games.territoire, 'classement'),
  ].join('');
  const frame = state.me.frame && FRAMES[state.me.frame];
  show(() => render(`<div class="pp">
    <section class="pp-hero">
      <div class="pp-hero-bg" aria-hidden="true"></div>
      <div class="profile-avatar">${avatar(state.me, 132)}</div>
      <div class="pp-id">
        <h1>${esc(state.me.username)}</h1>
        <div class="pp-tags">
          ${state.me.role === 'superadmin' ? '<span class="badge st-approved">👑 SuperAdmin</span>' : ''}
          ${frame ? `<span class="badge">🖼️ ${esc(frame.name)}</span>` : ''}
          ${quiz ? `<span class="badge">🧠 ${quiz.wins} victoire${quiz.wins > 1 ? 's' : ''} au quiz</span>` : ''}
          ${games.empire ? `<span class="badge">🪐 ${games.empire.points} pts d’empire</span>` : ''}
        </div>
        <div class="row pp-photo">
          <label class="btn accent sm" for="avatar-file" style="margin:0">📷 ${state.me.avatar ? 'Changer la photo' : 'Ajouter une photo'}</label>
          <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic" class="visually-hidden">
          ${state.me.avatar ? '<button class="btn ghost sm" data-action="remove-avatar">Supprimer</button>' : ''}
          <a class="btn ghost sm" href="#/stats">📊 Mes stats</a>
        </div>
      </div>
    </section>

    <div class="pp-grid">
      <section class="card pp-collection">
        <div class="pp-sec-head"><h2>🃏 Ma collection</h2><span class="badge pp-soon">Bientôt</span></div>
        <p class="muted small" style="margin:0 0 14px">Les cartes Neutron arrivent : tu les gagneras en jouant à tous les jeux du site, puis tu les rangeras ici pour te construire un deck.</p>
        <div class="pp-binder">${Array.from({ length: COLLECTION_SLOTS }, (_, i) => `<div class="pp-slot" style="--i:${i}"><span>?</span></div>`).join('')}</div>
        <div class="pp-deck"><strong>🗂️ Mon deck</strong><span class="muted small">0 / 30 cartes · vide pour l’instant</span></div>
      </section>

      <aside class="pp-side">
        <section class="card">
          <h2 style="margin:0 0 10px">🏅 Vitrine</h2>
          ${trophies ? `<div class="pp-trophies">${trophies}</div>` : '<p class="muted small" style="margin:0">Pas encore de classement. Joue pour remplir ta vitrine !</p>'}
        </section>
        <section class="card stack">
          <h2 style="margin:0">🖼️ Cadres</h2>
          <p class="muted small" style="margin:0">Un cadre s’affiche autour de ta photo dans tous les jeux, pour tout le monde. Ils se gagnent à la fin des saisons.</p>
          ${myFrames.length ? `<div class="frame-grid">
            <button class="frame-pick ${state.me.frame ? '' : 'active'}" data-action="pick-frame" data-frame="">${avatar({ ...state.me, frame: null }, 56)}<span class="small">Aucun</span></button>
            ${myFrames.filter((f) => FRAMES[f.frame]).map((f) => `
            <button class="frame-pick ${state.me.frame === f.frame ? 'active' : ''}" data-action="pick-frame" data-frame="${esc(f.frame)}" title="${esc(FRAMES[f.frame].desc)}${f.label ? ` · ${esc(f.label)}` : ''}">
              ${avatar({ ...state.me, frame: f.frame }, 56)}<span class="small">${esc(FRAMES[f.frame].name)}${f.season ? ` · saison ${f.season}` : ''}</span></button>`).join('')}
          </div>` : '<p class="muted" style="margin:0">Aucun cadre pour l’instant. Les premiers se gagneront à la fin de la première saison. 👀</p>'}
        </section>
      </aside>
    </div>
  </div>`));
}

/** Crops the picture to a centred square and re-encodes it small enough for the server. */
async function toSquareDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

export function setMyAvatar(url) {
  state.me.avatar = url;
  document.dispatchEvent(new Event('me-changed'));
  if (location.hash.startsWith('#/profile')) profilePage();
}

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'avatar-file' || !e.target.files?.[0]) return;
  try {
    const dataUrl = await toSquareDataUrl(e.target.files[0]);
    const { avatar: url } = await api('/api/me/avatar', { method: 'PUT', body: { dataUrl } });
    setMyAvatar(url);
    toast('Photo mise à jour 📸');
  } catch (err) {
    toast(err.message || 'Impossible de lire cette image.', true);
  }
});

actions['pick-frame'] = async (el) => {
  const frame = el.dataset.frame || null;
  try {
    await api('/api/me/frame', { method: 'PUT', body: { frame } });
    state.me.frame = frame;
    document.dispatchEvent(new Event('me-changed'));
    profilePage();
  } catch (err) { toast(err.message, true); }
};

actions['remove-avatar'] = async () => {
  try {
    await api('/api/me/avatar', { method: 'DELETE' });
    setMyAvatar(null);
  } catch (err) { toast(err.message, true); }
};

