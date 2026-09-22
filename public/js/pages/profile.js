import {
  state, actions, render, show, api, toast, esc, avatar,
} from '../core.js';

const SIZE = 256;

export function profilePage() {
  show(() => render(`
    <h1>👤 Mon profil</h1>
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

actions['remove-avatar'] = async () => {
  try {
    await api('/api/me/avatar', { method: 'DELETE' });
    setMyAvatar(null);
  } catch (err) { toast(err.message, true); }
};

