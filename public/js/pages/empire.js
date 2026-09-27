// L'Empire de Jimmy — page (secret: SuperAdmin only for now). The server keeps the empire; the page
// shows it live with the same rules (production ticking, countdowns) and asks the server to act.
import {
  state, actions, render, api, esc, toast, title,
} from '../core.js';
import {
  RESOURCES, RES_KEYS, PLANET_TYPES, BUILDINGS, RESEARCH, normalizeEmpire, advance, production, energy, storageCap,
  buildingCost, researchCost, buildTime, researchTime, buildBlocker, researchBlocker,
} from '../games/empire/logic.js';

let E = null; // { empire, offset (server - client clock), timer, key }

const serverNow = () => Date.now() + (E?.offset || 0);
const n = (v) => Math.floor(v).toLocaleString('fr-FR');
const duration = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : m ? `${m} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
};
const planetBall = (type, size = 120) => {
  const [a, b] = PLANET_TYPES[type].colors;
  return `<span class="emp-planet" style="--pa:${a};--pb:${b};--ps:${size}px" aria-hidden="true"></span>`;
};

export async function empirePage() {
  if (state.me.role !== 'superadmin') { location.hash = '#/'; return; }
  render('<p class="muted">Connexion à l’empire…</p>');
  await load();
  if (!location.hash.startsWith('#/empire')) return;
  state.view = draw;
  state.ui.cleanup = () => { clearInterval(E?.timer); E = null; };
  draw();
  E.timer = setInterval(tick, 1000);
}

async function load() {
  const r = await api('/api/empire');
  const empire = r.empire ? normalizeEmpire(r.empire) : null;
  E = { ...(E || {}), empire, offset: r.now - Date.now(), key: '' };
  for (const d of r.done || []) toast(`${d.kind === 'building' ? BUILDINGS[d.key].emoji : RESEARCH[d.key].emoji} ${d.kind === 'building' ? BUILDINGS[d.key].name : RESEARCH[d.key].name} niveau ${d.level} terminé !`);
}

async function act(path, body) {
  try {
    const r = await api(`/api/empire/${path}`, { method: 'POST', body });
    E.empire = normalizeEmpire(r.empire);
    E.offset = r.now - Date.now();
    E.key = '';
    draw();
  } catch (err) { toast(err.message, true); }
}

// ---- display ----

function draw() {
  if (!E) return;
  const e = E.empire;
  if (!e) {
    render(`<div class="emp">
      <h1>${title('🪐', 'L’Empire de Jimmy')} <span class="badge">🔒 secret · SuperAdmin</span></h1>
      <p class="muted">Jimmy a besoin d’une base. Choisis ta planète : chacune produit une ressource deux fois plus vite, les autres un peu moins. Plus tard, tu échangeras avec les autres joueurs pour avancer ensemble.</p>
      <div class="emp-types">${Object.entries(PLANET_TYPES).map(([k, t]) => `
        <div class="card emp-type">${planetBall(k, 110)}
          <h2 style="margin:0">${t.emoji} ${esc(t.name)}</h2>
          <p class="muted small" style="margin:0">${RESOURCES[t.best].emoji} ${esc(RESOURCES[t.best].name)} ×2 · le reste ×0,8</p>
          <button class="btn accent" data-action="emp-start" data-type="${k}">Coloniser</button>
        </div>`).join('')}</div></div>`);
    return;
  }
  E.key = structureKey(e);
  const t = PLANET_TYPES[e.planet.type];
  render(`<div class="emp">
    <div class="emp-head card">
      ${planetBall(e.planet.type, 96)}
      <div><h1 style="margin:0">${esc(e.planet.name)}</h1>
        <div class="muted">${t.emoji} Planète ${esc(t.name.toLowerCase())} · spécialité ${RESOURCES[t.best].emoji} ${esc(RESOURCES[t.best].name)} <span class="badge">🔒 secret · SuperAdmin</span></div></div>
    </div>
    <div class="emp-res">${RES_KEYS.map((r) => `
      <div class="card emp-r" style="--rc:${RESOURCES[r].color}"><span class="emp-r-emoji">${RESOURCES[r].emoji}</span>
        <div><strong id="er-${r}"></strong><div class="small muted"><span id="ep-${r}"></span> · max <span id="ec-${r}"></span></div></div></div>`).join('')}
      <div class="card emp-r" style="--rc:#ffd166"><span class="emp-r-emoji">⚡</span><div><strong id="en-e"></strong><div class="small muted">énergie</div></div></div>
    </div>
    <div class="card emp-queue" id="emp-queue"></div>
    <h2 class="section-title">🏗️ Bâtiments</h2>
    <div class="emp-grid">${Object.entries(BUILDINGS).map(([k, b]) => card('building', k, b)).join('')}</div>
    <h2 class="section-title">🔬 Recherche</h2>
    <div class="emp-grid">${Object.entries(RESEARCH).map(([k, b]) => card('research', k, b)).join('')}</div>
    <p class="muted small">Prochaines étapes : 🗺️ carte galactique et 📦 commerce entre joueurs, 🌀 le Portail de Jimmy (projet commun), 🐛 la Nuée.</p>
  </div>`);
  tick(true);
}

const structureKey = (e) => JSON.stringify([e.buildings, e.research, e.queue]);

function card(kind, key, def) {
  return `<div class="card emp-card" id="emc-${kind}-${key}">
    <div class="emp-card-head"><span class="emp-card-emoji">${def.emoji}</span>
      <div><strong>${esc(def.name)}</strong> <span class="badge" id="eml-${kind}-${key}"></span><div class="muted small">${esc(def.desc)}</div></div></div>
    <div class="bl-recipe" id="emr-${kind}-${key}"></div>
    <div class="spread"><span class="small muted" id="emt-${kind}-${key}"></span>
      <button class="btn sm" data-action="emp-${kind}" data-key="${key}" id="emb-${kind}-${key}"></button></div>
  </div>`;
}

const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };

/** Every second: production and countdowns (a finished job reloads from the server). */
async function tick(fromDraw = false) {
  if (!E?.empire) return;
  const e = E.empire;
  const done = advance(e, serverNow());
  if (done.length && !fromDraw) {
    await load();
    draw();
    return;
  }
  if (!fromDraw && structureKey(e) !== E.key) { draw(); return; }
  const p = production(e);
  const cap = storageCap(e);
  for (const r of RES_KEYS) {
    set(`er-${r}`, n(e.res[r]));
    set(`ep-${r}`, `+${n(p[r])}/h`);
    set(`ec-${r}`, n(cap));
    document.getElementById(`er-${r}`)?.classList.toggle('full', e.res[r] >= cap);
  }
  const en = energy(e);
  set('en-e', `<span class="${en.made < en.used ? 'bad' : ''}">${n(en.made - en.used)}</span> <span class="small muted">(${n(en.made)} / ${n(en.used)})</span>`);
  // Queue.
  set('emp-queue', e.queue.length ? e.queue.map((q) => {
    const def = q.kind === 'building' ? BUILDINGS[q.key] : RESEARCH[q.key];
    const total = q.kind === 'building' ? buildTime(e, q.key, q.level) : researchTime(e, q.key, q.level);
    const left = q.endsAt - serverNow();
    return `<div class="emp-job"><span>${def.emoji} <strong>${esc(def.name)}</strong> → niveau ${q.level}</span>
      <div class="bl-bar"><span style="width:${Math.min(100, Math.max(0, (1 - left / total) * 100))}%"></span></div>
      <span class="small">⏳ ${duration(left)}</span>
      <button class="btn ghost sm" data-action="emp-cancel" data-kind="${q.kind}" title="Annuler (remboursé)">✕</button></div>`;
  }).join('') : '<span class="muted">Aucun chantier ni recherche en cours. Lance-en un ci-dessous !</span>');
  // Cards.
  for (const [kind, defs] of [['building', BUILDINGS], ['research', RESEARCH]]) {
    for (const key of Object.keys(defs)) {
      const lvl = kind === 'building' ? e.buildings[key] : e.research[key];
      const cost = kind === 'building' ? buildingCost(key, lvl + 1) : researchCost(key, lvl + 1);
      const time = kind === 'building' ? buildTime(e, key, lvl + 1) : researchTime(e, key, lvl + 1);
      const why = kind === 'building' ? buildBlocker(e, key) : researchBlocker(e, key);
      set(`eml-${kind}-${key}`, `niv. ${lvl}`);
      set(`emr-${kind}-${key}`, RES_KEYS.filter((r) => cost[r]).map((r) => `<span class="bl-chip ${e.res[r] >= cost[r] ? '' : 'missing'}">${RESOURCES[r].emoji} ${n(cost[r])}</span>`).join(''));
      set(`emt-${kind}-${key}`, `⏱️ ${duration(time)}${why && /laboratoire/.test(why) ? ` · <span class="muted">🔒 ${esc(why)}</span>` : ''}`);
      const $b = document.getElementById(`emb-${kind}-${key}`);
      if ($b) {
        $b.disabled = Boolean(why);
        set(`emb-${kind}-${key}`, `${kind === 'building' ? 'Construire' : 'Rechercher'} niv. ${lvl + 1}`);
      }
    }
  }
}

actions['emp-start'] = (el) => act('start', { type: el.dataset.type });
actions['emp-building'] = (el) => act('build', { key: el.dataset.key });
actions['emp-research'] = (el) => act('research', { key: el.dataset.key });
actions['emp-cancel'] = (el) => act('cancel', { kind: el.dataset.kind });
