import { state, actions, forms, render, show, api, go, sessionTake } from '../core.js';

state.ui.authTab = 'login';

export function authPage() {
  return show(() => {
    const login = state.ui.authTab === 'login';
    render(`
      <section class="hero">
        <h1>Quizzokopain 🥖</h1>
        <p class="muted">Des quiz gratuits entre potes, dans des rooms privées.<br>QCM, questions libres, rébus, films en emojis… et tes propres quiz.</p>
      </section>
      <div class="card auth-card">
        <div class="tabs">
          <button data-action="auth-tab" data-tab="login" class="${login ? 'active' : ''}">Connexion</button>
          <button data-action="auth-tab" data-tab="register" class="${login ? '' : 'active'}">Créer un compte</button>
        </div>
        <form data-form="auth" class="stack">
          <div class="field"><label for="auth-user">Pseudo</label>
            <input id="auth-user" name="username" type="text" autocomplete="username" required minlength="3" maxlength="20" data-autofocus></div>
          <div class="field"><label for="auth-pass">Mot de passe</label>
            <input id="auth-pass" name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" required minlength="6"></div>
          <p class="error" id="auth-error"></p>
          <button class="btn accent big block" type="submit">${login ? 'Se connecter' : 'Créer mon compte'}</button>
        </form>
      </div>`);
  });
}

actions['auth-tab'] = (el) => { state.ui.authTab = el.dataset.tab; authPage(); };

forms.auth = async (form) => {
  const data = Object.fromEntries(new FormData(form));
  const $err = document.getElementById('auth-error');
  try {
    const res = await api(state.ui.authTab === 'login' ? '/api/login' : '/api/register', { method: 'POST', body: data });
    state.me = res.user;
    go(sessionTake('qzk_after_login') || '#/');
  } catch (err) {
    if ($err) $err.textContent = err.message;
  }
};
