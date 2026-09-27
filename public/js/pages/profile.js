import {
  state, actions, render, show, api, toast, esc, avatar, title, FRAMES,
} from '../core.js';

const SIZE = 256;

let myFrames = null; // frames earned (loaded with the page)

export async function profilePage() {
  if (!myFrames) {
    try { myFrames = (await api('/api/me/frames')).frames; } catch { myFrames = []; }
  }
  show(() => render(`
    <h1>${title('👤', 'Mon profil')}</h1>
    <div class="card stack center">
      <div class="profile-avatar">${avatar(state.me, 140)}</div>
      <h2 style="margin:0">${esc(state.me.username)}</h2>
      ${state.me.role === 'superadmin' ? '<span class="badge st-approved">👑 SuperAdmin</span>' : ''}
      <p class="muted small">Ta photo s’affiche dans les rooms, les classements et le podium.</p>
      <div class="row" style="justify-content:center">
        <label class="btn accent" for="avatar-file" style="margin:0">📷 ${state.me.avatar ? 'Changer la photo' : 'Ajouter une photo'}</label>
        <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic" class="visually-hidden">
        ${state.me.avatar ? '<button class="btn ghost" data-action="remove-avatar">Supprimer</button>' : ''}
      </div>
    </div>
    <div class="card stack" style="margin-top:16px">
      <h2 style="margin:0">🖼️ Cadres</h2>
      <p class="muted small" style="margin:0">Un cadre s’affiche autour de ta photo dans tous les jeux, pour tout le monde. Ils se gagnent à la fin des saisons.</p>
      ${myFrames.length ? `<div class="frame-grid">
        <button class="frame-pick ${state.me.frame ? '' : 'active'}" data-action="pick-frame" data-frame="">${avatar({ ...state.me, frame: null }, 56)}<span class="small">Aucun</span></button>
        ${myFrames.filter((f) => FRAMES[f.frame]).map((f) => `
        <button class="frame-pick ${state.me.frame === f.frame ? 'active' : ''}" data-action="pick-frame" data-frame="${esc(f.frame)}" title="${esc(FRAMES[f.frame].desc)}${f.label ? ` · ${esc(f.label)}` : ''}">
          ${avatar({ ...state.me, frame: f.frame }, 56)}<span class="small">${esc(FRAMES[f.frame].name)}${f.season ? ` · saison ${f.season}` : ''}</span></button>`).join('')}
      </div>` : '<p class="muted" style="margin:0">Aucun cadre pour l’instant. Les premiers se gagneront à la fin de la première saison. 👀</p>'}
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

