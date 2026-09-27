// L'Empire de Jimmy — page (secret: SuperAdmin only for now). The server keeps the empire; the page
// shows it live with the same rules (production ticking, countdowns) and asks the server to act.
import {
  state, actions, render, api, esc, toast, title,
} from '../core.js';
import {
  RESOURCES, RES_KEYS, BUILDINGS, RESEARCH, MAX_PLANETS, normalizeEmpire, advance, production, planetProduction, energy, storageCap,
  buildingCost, researchCost, buildTime, researchTime, buildBlocker, researchBlocker, missing, resourceMissing, bestLab,
  colonyCost, colonyBlocker, colonySlots, BUTCH, butchOffer,
} from '../games/empire/logic.js';

let E = null; // { empire, offset (server - client clock), timer, key, sel (planet shown) }

const serverNow = () => Date.now() + (E?.offset || 0);
const n = (v) => Math.floor(v).toLocaleString('fr-FR');
const rate = (x) => `×${String(x).replace('.', ',')}`;
const duration = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : m ? `${m} min ${String(s % 60).padStart(2, '0')}` : `${s} s`;
};

/** A planet drawn in CSS from its random look: colours, bands, spots, ring. */
export function planetBall(p, size = 120) {
  const { a, b, bands, tilt, ring, spots } = p.look;
  const bandCss = bands ? `repeating-linear-gradient(${90 + tilt}deg, rgba(255,255,255,.10) 0 ${100 / (bands * 2)}%, rgba(0,0,0,.14) ${100 / (bands * 2)}% ${100 / bands}%),` : '';
  const spotCss = spots ? 'radial-gradient(circle at 65% 62%, rgba(0,0,0,.25) 0 8%, transparent 9%), radial-gradient(circle at 42% 70%, rgba(0,0,0,.18) 0 5%, transparent 6%),' : '';
  return `<span class="emp-planet ${ring ? 'ringed' : ''}" style="--pa:${a};--pb:${b};--ps:${size}px;--tilt:${tilt}deg" aria-hidden="true">
    <span class="emp-planet-body" style="background:radial-gradient(circle at 32% 30%, rgba(255,255,255,.5), transparent 28%), ${spotCss} ${bandCss} radial-gradient(circle at 35% 35%, ${a}, ${b} 70%, #05040f 100%)"></span></span>`;
}
/** The planet's rates: « 🔩 ×1,85 · 💎 ×0,42 · 🔥 absent ». */
const ratesLine = (p) => RES_KEYS.map((r) => (p.rates[r]
  ? `<span class="emp-rate ${p.rates[r] >= 1.4 ? 'good' : p.rates[r] <= 0.8 ? 'bad' : ''}">${RESOURCES[r].emoji} ${rate(p.rates[r])}</span>`
  : `<span class="emp-rate none">${RESOURCES[r].emoji} absent</span>`)).join('');

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
  E = { sel: 0, ...(E || {}), empire, offset: r.now - Date.now(), key: '' };
  if (empire && E.sel >= empire.planets.length) E.sel = 0;
  for (const d of r.done || []) {
    const def = d.kind === 'building' ? BUILDINGS[d.key] : RESEARCH[d.key];
    toast(`${def.emoji} ${def.name} niveau ${d.level} terminé${d.kind === 'building' ? ` sur ${empire.planets[d.planet].name}` : ''} !`);
  }
}

async function act(path, body) {
  try {
    const r = await api(`/api/empire/${path}`, { method: 'POST', body });
    E.empire = normalizeEmpire(r.empire);
    E.offset = r.now - Date.now();
    E.key = '';
    if (Number.isInteger(r.planet)) { E.sel = r.planet; toast(`🚀 Nouvelle colonie : ${E.empire.planets[r.planet].name} !`); }
    draw();
  } catch (err) { toast(err.message, true); }
}

// ---- display ----

const badge = '<span class="badge">🔒 secret · SuperAdmin</span>';

function draw() {
  if (!E) return;
  const e = E.empire;
  if (!e) {
    render(`<div class="emp">
      <h1>${title('🪐', 'L’Empire de Jimmy')} ${badge}</h1>
      <div class="card emp-intro stack center">
        <p style="font-size:3rem;margin:0">🛸</p>
        <p>Jimmy a besoin d’une base. Ta première planète est tirée au hasard : ses taux de 🔩 métal, 💎 cristal et 🔥 plasma sont uniques. Plus tard, jusqu’à 3 planètes, dont certaines sans une ressource : il faudra échanger avec les autres joueurs pour avancer ensemble.</p>
        <button class="btn accent" data-action="emp-start">🚀 Fonder mon empire</button>
      </div></div>`);
    return;
  }
  E.key = structureKey(e);
  const i = E.sel;
  const p = e.planets[i];
  render(`<div class="emp">
    <div class="emp-planets">${e.planets.map((pl, k) => `
      <button class="card emp-tab ${k === i ? 'active' : ''}" data-action="emp-sel" data-i="${k}">
        ${planetBall(pl, 46)}<span><strong>${esc(pl.name)}</strong><span class="emp-rates small">${ratesLine(pl)}</span></span></button>`).join('')}
      ${[...Array(MAX_PLANETS - e.planets.length).keys()].map((k) => slot(e, e.planets.length + k)).join('')}
    </div>
    <div class="emp-head card">
      ${planetBall(p, 104)}
      <div><h1 style="margin:0">${esc(p.name)}</h1>
        <div class="emp-rates">${ratesLine(p)}</div>
        <div class="muted small">${i === 0 ? 'Planète mère' : `Colonie ${i}`} · ${badge}</div></div>
    </div>
    <div class="emp-res">${RES_KEYS.map((r) => `
      <div class="card emp-r" style="--rc:${RESOURCES[r].color}"><span class="emp-r-emoji">${RESOURCES[r].emoji}</span>
        <div><strong id="er-${r}"></strong><div class="small muted"><span id="ep-${r}"></span> · max <span id="ec-${r}"></span></div></div></div>`).join('')}
      <div class="card emp-r" style="--rc:#ffd166"><span class="emp-r-emoji">⚡</span><div><strong id="en-e"></strong><div class="small muted">énergie de ${esc(p.name)}</div></div></div>
    </div>
    <div class="card emp-queue" id="emp-queue"></div>
    <h2 class="section-title">🏗️ Bâtiments de ${esc(p.name)}</h2>
    <div class="emp-grid">${cards(e, 'building', BUILDINGS, i)}</div>
    <h2 class="section-title">🔬 Recherche <span class="muted small">(pour tout l’empire)</span></h2>
    ${bestLab(e) ? `<div class="emp-grid">${cards(e, 'research', RESEARCH, i)}</div>` : '<p class="muted">🔒 La recherche arrive avec un 🔬 laboratoire.</p>'}
    <h2 class="section-title">🧔 ${BUTCH.name} est de passage</h2>
    <div class="card emp-butch">
      <p class="muted small" style="margin:0">« J’ai ce qu’il te faut, l’ami. Pas de discussion, c’est mon prix. » Butch passe toutes les 4 heures avec un seul lot, à prendre ou à laisser. En attendant le commerce entre joueurs, bien plus avantageux.</p>
      <div class="emp-butch-deal" id="bt-deal"></div>
      <div class="row emp-butch-form">
        <label>J’en prends <input id="bt-amount" type="number" min="1" step="100" value="500" inputmode="numeric"></label>
        <button class="btn ghost sm" data-action="emp-butch-max">Tout ce que je peux</button>
        <button class="btn sm accent" data-action="emp-butch" id="bt-go">Marché conclu</button>
      </div>
      <p class="small" id="bt-preview" style="margin:0"></p>
    </div>
    <p class="muted small">Prochaines étapes : 🗺️ carte galactique et 📦 commerce entre joueurs, 🌀 le Portail de Jimmy (projet commun), 🐛 la Nuée.</p>
  </div>`);
  tick(true);
}

/** An empty planet slot: colonise it, or what is still needed. */
function slot(e, index) {
  const allowed = index < colonySlots(e);
  const cost = colonyCost(index);
  const next = index === e.planets.length;
  return `<div class="card emp-tab emp-slot ${allowed && next ? '' : 'locked'}">
    <span class="emp-slot-icon">${allowed && next ? '🪐' : '🔒'}</span>
    <span><strong>Planète ${index + 1}</strong>
      <span class="small muted">${allowed && next ? RES_KEYS.map((r) => `<span class="bl-chip ${e.res[r] >= cost[r] ? '' : 'missing'}">${RESOURCES[r].emoji} ${n(cost[r])}</span>`).join('')
        : `Recherche 🚀 Colonisation niv. ${index}`}</span>
      ${allowed && next ? '<button class="btn sm accent" data-action="emp-colonize" id="emp-colonize">Coloniser</button>' : ''}</span>
  </div>`;
}

const structureKey = (e) => JSON.stringify([e.planets.map((p) => p.buildings), e.research, e.queue, E.sel]);

/** Unlocked cards first, then the locked ones with what they need. */
function cards(e, kind, defs, planet) {
  const keys = Object.keys(defs);
  const isLocked = (k) => (kind === 'building' && resourceMissing(e, planet, k)) || missing(e, kind, k, planet).length;
  return keys.filter((k) => !isLocked(k)).map((k) => card(kind, k, defs[k])).join('')
    + keys.filter(isLocked).map((k) => lockedCard(e, kind, k, defs[k], planet)).join('');
}
function card(kind, key, def) {
  return `<div class="card emp-card">
    <div class="emp-card-head"><span class="emp-card-emoji">${def.emoji}</span>
      <div><strong>${esc(def.name)}</strong> <span class="badge" id="eml-${kind}-${key}"></span><div class="muted small">${esc(def.desc)}</div></div></div>
    <div class="bl-recipe" id="emr-${kind}-${key}"></div>
    <div class="spread"><span class="small muted" id="emt-${kind}-${key}"></span>
      <button class="btn sm" data-action="emp-${kind}" data-key="${key}" id="emb-${kind}-${key}"></button></div>
  </div>`;
}
function lockedCard(e, kind, key, def, planet) {
  const noRes = kind === 'building' && resourceMissing(e, planet, key);
  return `<div class="card emp-card locked">
    <div class="emp-card-head"><span class="emp-card-emoji">${noRes ? '🚫' : '🔒'}</span>
      <div><strong>${esc(def.name)}</strong><div class="muted small">${esc(def.desc)}</div></div></div>
    <div class="small">${noRes ? `Pas de ${RESOURCES[def.res].emoji} ${esc(RESOURCES[def.res].name.toLowerCase())} sur cette planète : il faudra en obtenir autrement.`
      : `Se débloque avec : ${missing(e, kind, key, planet).map((m) => `<span class="bl-chip missing">${m.emoji} ${esc(m.name)} niv. ${m.level} <span class="muted">(${m.have})</span></span>`).join(' ')}`}</div>
  </div>`;
}

const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };

/** Every second: production and countdowns (a finished job reloads from the server). */
async function tick(fromDraw = false) {
  if (!E?.empire) return;
  const e = E.empire;
  const i = E.sel;
  const done = advance(e, serverNow());
  if (done.length && fromDraw !== true) { await load(); draw(); return; }
  if (fromDraw !== true && structureKey(e) !== E.key) { draw(); return; }
  const p = production(e);
  const here = planetProduction(e, i);
  const cap = storageCap(e);
  for (const r of RES_KEYS) {
    set(`er-${r}`, n(e.res[r]));
    set(`ep-${r}`, `+${n(p[r])}/h${e.planets.length > 1 ? ` <span title="dont cette planète">(ici +${n(here[r])})</span>` : ''}`);
    set(`ec-${r}`, n(cap));
    document.getElementById(`er-${r}`)?.classList.toggle('full', e.res[r] >= cap);
  }
  const en = energy(e, i);
  set('en-e', `<span class="${en.made < en.used ? 'bad' : ''}">${n(en.made - en.used)}</span> <span class="small muted">(${n(en.made)} / ${n(en.used)})</span>`);
  set('emp-queue', e.queue.length ? e.queue.map((q) => {
    const def = q.kind === 'building' ? BUILDINGS[q.key] : RESEARCH[q.key];
    const total = q.kind === 'building' ? buildTime(e, q.planet, q.key, q.level) : researchTime(e, q.key, q.level);
    const left = q.endsAt - serverNow();
    return `<div class="emp-job"><span>${def.emoji} <strong>${esc(def.name)}</strong> → niv. ${q.level}${q.kind === 'building' && e.planets.length > 1 ? ` <span class="muted small">· ${esc(e.planets[q.planet].name)}</span>` : ''}</span>
      <div class="bl-bar"><span style="width:${Math.min(100, Math.max(0, (1 - left / total) * 100))}%"></span></div>
      <span class="small">⏳ ${duration(left)}</span>
      <button class="btn ghost sm" data-action="emp-cancel" data-kind="${q.kind}" data-planet="${q.planet ?? 0}" title="Annuler (remboursé)">✕</button></div>`;
  }).join('') : '<span class="muted">Aucun chantier ni recherche en cours. Lance-en un ci-dessous !</span>');
  for (const [kind, defs] of [['building', BUILDINGS], ['research', RESEARCH]]) {
    for (const key of Object.keys(defs)) {
      if (!document.getElementById(`emb-${kind}-${key}`)) continue;
      const lvl = kind === 'building' ? e.planets[i].buildings[key] : e.research[key];
      const max = kind === 'research' && lvl >= (RESEARCH[key].max ?? Infinity);
      const cost = kind === 'building' ? buildingCost(key, lvl + 1) : researchCost(key, lvl + 1);
      const time = kind === 'building' ? buildTime(e, i, key, lvl + 1) : researchTime(e, key, lvl + 1);
      const why = kind === 'building' ? buildBlocker(e, i, key) : researchBlocker(e, key);
      set(`eml-${kind}-${key}`, `niv. ${lvl}${kind === 'research' && RESEARCH[key].max ? ` / ${RESEARCH[key].max}` : ''}`);
      set(`emr-${kind}-${key}`, max ? '' : RES_KEYS.filter((r) => cost[r]).map((r) => `<span class="bl-chip ${e.res[r] >= cost[r] ? '' : 'missing'}">${RESOURCES[r].emoji} ${n(cost[r])}</span>`).join(''));
      set(`emt-${kind}-${key}`, max ? '' : `⏱️ ${duration(time)}`);
      const $b = document.getElementById(`emb-${kind}-${key}`);
      $b.disabled = Boolean(why);
      set(`emb-${kind}-${key}`, max ? 'Max' : `${kind === 'building' ? 'Construire' : 'Rechercher'} niv. ${lvl + 1}`);
    }
  }
  if (document.getElementById('bt-deal')) {
    const o = butchOffer(e, serverNow());
    const S = RESOURCES[o.sells];
    const W = RESOURCES[o.wants];
    set('bt-deal', `<span class="emp-butch-lot">${S.emoji} <strong>${n(o.left)}</strong> / ${n(o.stock)} ${esc(S.name.toLowerCase())}</span>
      <span>à <strong>${o.price} ${W.emoji}</strong> ${esc(W.name.toLowerCase())} l’unité</span>
      <span class="muted small">· repart dans ${duration(o.leavesAt - serverNow())}</span>`);
    const amount = Math.floor(Number(document.getElementById('bt-amount')?.value) || 0);
    const cost = amount * o.price;
    const ok = amount > 0 && amount <= o.left && e.res[o.wants] >= cost;
    set('bt-preview', o.left ? `Tu paies <strong>${n(cost)} ${W.emoji}</strong> et tu reçois <strong>${n(amount)} ${S.emoji}</strong>${ok ? '' : amount > o.left ? ' <span class="muted">(stock insuffisant)</span>' : ' <span class="muted">(pas assez)</span>'}`
      : '<span class="muted">Butch n’a plus rien à vendre. Reviens à sa prochaine visite !</span>');
    document.getElementById('bt-go').disabled = !ok;
  }
  const $c = document.getElementById('emp-colonize');
  if ($c) $c.disabled = Boolean(colonyBlocker(e));
}

actions['emp-start'] = () => act('start', {});
actions['emp-sel'] = (el) => { E.sel = Number(el.dataset.i); draw(); };
actions['emp-building'] = (el) => act('build', { planet: E.sel, key: el.dataset.key });
actions['emp-research'] = (el) => act('research', { key: el.dataset.key });
actions['emp-cancel'] = (el) => act('cancel', { kind: el.dataset.kind, planet: Number(el.dataset.planet) });
actions['emp-colonize'] = () => act('colonize', {});
actions['emp-butch'] = async () => {
  await act('butch', { amount: Number(document.getElementById('bt-amount').value) });
  toast('🧔 Butch : « Plaisir de faire affaire ! »');
};
actions['emp-butch-max'] = () => {
  const o = butchOffer(E.empire, serverNow());
  document.getElementById('bt-amount').value = Math.max(0, Math.min(o.left, Math.floor(E.empire.res[o.wants] / o.price)));
  tick(true);
};
document.addEventListener('input', (ev) => { if (E && /^bt-/.test(ev.target.id || '')) tick(true); });
document.addEventListener('change', (ev) => { if (E && /^bt-/.test(ev.target.id || '')) tick(true); });
