// L'Empire de Jimmy — page (secret: SuperAdmin only for now). The server keeps the empire; the page
// shows it live with the same rules (production ticking, countdowns) and asks the server to act.
import {
  state, actions, render, api, esc, toast, title, avatar,
} from '../core.js';
import {
  RESOURCES, RES_KEYS, BUILDINGS, RESEARCH, MAX_PLANETS, normalizeEmpire, advance, production, planetProduction, energy, storageCap,
  buildingCost, researchCost, buildTime, researchTime, buildBlocker, researchBlocker, missing, resourceMissing, bestLab,
  colonyCost, colonyBlocker, colonySlots, BUTCH, butchOffer, SHIPS, cargoCapacity, cargosFor, flightTime, shipCost, shipTime, shipBlocker, PORTAL, contributionPoints,
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
  const view = E.view || 'planets';
  render(`<div class="emp">
    <div class="emp-views">${VIEWS.map(([k, label]) => `<button class="btn ghost sm ${k === view ? 'active' : ''}" data-action="emp-view" data-v="${k}">${label}</button>`).join('')}
      <span class="badge">🔒 secret · SuperAdmin</span></div>
    ${resBar(e, view)}
    ${view === 'galaxy' ? galaxyView(e) : view === 'market' ? marketView() : view === 'fleets' ? fleetsView(e) : view === 'portal' ? portalView(e) : planetsView(e)}
  </div>`);
  tick(true);
}

const VIEWS = [['planets', '🪐 Planètes'], ['galaxy', '🗺️ Galaxie'], ['market', '🏪 Marché'], ['fleets', '🛰️ Flottes'], ['portal', '🌀 Portail']];

function resBar(e, view) {
  const p = e.planets[E.sel];
  return `<div class="emp-res">${RES_KEYS.map((r) => `
      <div class="card emp-r" style="--rc:${RESOURCES[r].color}"><span class="emp-r-emoji">${RESOURCES[r].emoji}</span>
        <div><strong id="er-${r}"></strong><div class="small muted"><span id="ep-${r}"></span> · max <span id="ec-${r}"></span></div></div></div>`).join('')}
      ${view === 'planets' ? `<div class="card emp-r" style="--rc:#ffd166"><span class="emp-r-emoji">⚡</span><div><strong id="en-e"></strong><div class="small muted">énergie de ${esc(p.name)}</div></div></div>`
        : `<div class="card emp-r" style="--rc:#b18cff"><span class="emp-r-emoji">${SHIPS.cargo.emoji}</span><div><strong>${e.ships.cargo}</strong><div class="small muted">cargos au port · ${n(cargoCapacity(e))} chacun</div></div></div>`}
    </div>`;
}

function planetsView(e) {
  const i = E.sel;
  const p = e.planets[i];
  const yard = p.buildings.shipyard > 0;
  return `<div class="emp-planets">${e.planets.map((pl, k) => `
      <button class="card emp-tab ${k === i ? 'active' : ''}" data-action="emp-sel" data-i="${k}">
        ${planetBall(pl, 46)}<span><strong>${esc(pl.name)}</strong><span class="emp-rates small">${ratesLine(pl)}</span></span></button>`).join('')}
      ${[...Array(MAX_PLANETS - e.planets.length).keys()].map((k) => slot(e, e.planets.length + k)).join('')}
    </div>
    <div class="emp-head card">
      ${planetBall(p, 104)}
      <div><h1 style="margin:0">${esc(p.name)}</h1>
        <div class="emp-rates">${ratesLine(p)}</div>
        <div class="muted small">${i === 0 ? 'Planète mère' : `Colonie ${i}`} · position ${e.coords.x}:${e.coords.y}</div></div>
    </div>
    <div class="card emp-queue" id="emp-queue"></div>
    <h2 class="section-title">🏗️ Bâtiments de ${esc(p.name)}</h2>
    <div class="emp-grid">${cards(e, 'building', BUILDINGS, i)}</div>
    <h2 class="section-title">🛰️ Vaisseaux</h2>
    <div class="card emp-ships">
      <div class="emp-card-head"><span class="emp-card-emoji">${SHIPS.cargo.emoji}</span>
        <div><strong>${SHIPS.cargo.name}</strong> <span class="badge">${e.ships.cargo} au port</span>
          <div class="muted small">${esc(SHIPS.cargo.desc)} · capacité ${n(cargoCapacity(e))}</div></div></div>
      ${yard ? `<div class="row emp-butch-form"><label>Construire <input id="sh-count" type="number" min="1" step="1" value="1" inputmode="numeric"> cargo(s)</label>
          <span class="bl-recipe" id="sh-cost"></span><span class="small muted" id="sh-time"></span>
          <button class="btn sm" data-action="emp-ships" id="sh-go">Construire</button></div>`
        : `<p class="small muted" style="margin:0">🔒 Il faut un 🛠️ chantier spatial sur ${esc(p.name)} (débloqué avec l’usine de robots niv. 2).</p>`}
    </div>
    <h2 class="section-title">🔬 Recherche <span class="muted small">(pour tout l’empire)</span></h2>
    ${bestLab(e) ? `<div class="emp-grid">${cards(e, 'research', RESEARCH, i)}</div>` : '<p class="muted">🔒 La recherche arrive avec un 🔬 laboratoire.</p>'}
    <p class="muted small">Prochaine étape : 🐛 la Nuée (menaces PvE).</p>`;
}

// ---- galaxy, market, fleets (loaded from the server when shown) ----

async function loadView(view) {
  try {
    if (view === 'galaxy') E.galaxy = (await api('/api/empire/galaxy')).empires;
    if (view === 'market') { const r = await api('/api/empire/market'); E.market = r; }
    if (view === 'fleets') E.fleets = (await api('/api/empire/fleets')).fleets;
    if (view === 'portal') E.portalData = await api('/api/empire/portal');
    E.viewAt = Date.now();
  } catch (err) { toast(err.message, true); }
}

function galaxyView(e) {
  if (!E.galaxy) return '<p class="muted">Chargement de la galaxie…</p>';
  const others = E.galaxy.filter((g) => !g.me);
  return `<div class="emp-galaxy">
    <div class="card emp-map">${E.galaxy.map((g) => `<span class="emp-dot ${g.me ? 'me' : ''}" style="left:${g.coords.x}%;top:${g.coords.y}%" title="${esc(g.username)} · ${g.coords.x}:${g.coords.y}"><i></i><b>${esc(g.me ? 'Toi' : g.username)}</b></span>`).join('')}</div>
    <div class="stack">
      <p class="muted small" style="margin:0">Chaque empire a ses planètes et ses taux : repère qui a ce qui te manque, et échange sur le 🏪 marché ou envoie des ressources par cargo.</p>
      ${others.length ? others.map((g) => `
      <div class="card emp-neighbour">
        <div class="spread"><span class="row">${avatar(g, 32)} <strong>${esc(g.username)}</strong></span>
          <span class="small muted">${g.coords.x}:${g.coords.y} · ✈️ ${duration(flightTime(e, g.coords))} · ${g.points} pts</span></div>
        <div class="emp-neigh-planets">${g.planets.map((pl) => `<span class="emp-mini">${planetBall(pl, 26)} <span><strong class="small">${esc(pl.name)}</strong><span class="emp-rates small">${ratesLine(pl)}</span></span></span>`).join('')}</div>
        ${E.sendTo === g.username ? sendForm(e, g) : `<button class="btn ghost sm" data-action="emp-send-open" data-to="${esc(g.username)}">📦 Envoyer des ressources</button>`}
      </div>`).join('') : '<p class="muted">Aucun autre empire pour l’instant.</p>'}
    </div></div>`;
}
function sendForm(e, g) {
  return `<div class="emp-send">
    ${RES_KEYS.map((r) => `<label>${RESOURCES[r].emoji} <input id="sd-${r}" type="number" min="0" step="100" value="0" inputmode="numeric"></label>`).join('')}
    <span class="small" id="sd-info"></span>
    <button class="btn sm accent" data-action="emp-send" data-to="${esc(g.username)}" id="sd-go">Envoyer</button>
    <button class="btn ghost sm" data-action="emp-send-open" data-to="">Annuler</button>
  </div>`;
}

function marketView() {
  if (!E.market) return '<p class="muted">Chargement du marché…</p>';
  const { offers, trades } = E.market;
  const opt = (id, sel) => `<select id="${id}">${RES_KEYS.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${RESOURCES[r].emoji} ${esc(RESOURCES[r].name)}</option>`).join('')}</select>`;
  // Going rate of each pair from the last trades (how much of B for 1 A).
  const rates = {};
  for (const t of trades) (rates[`${t.give}>${t.want}`] ||= []).push(t.wantAmount / t.giveAmount);
  const course = Object.entries(rates).map(([k, list]) => {
    const [a, b] = k.split('>');
    return `<span class="bl-chip">1 ${RESOURCES[a].emoji} ≈ ${String(Math.round((list.reduce((x, y) => x + y, 0) / list.length) * 100) / 100).replace('.', ',')} ${RESOURCES[b].emoji}</span>`;
  }).join('');
  return `<div class="card stack">
      <strong>📢 Publier une offre</strong>
      <div class="row emp-butch-form">
        <label>Je donne <input id="mk-ga" type="number" min="1" step="100" value="1000" inputmode="numeric"> ${opt('mk-g', 'metal')}</label>
        <label>contre <input id="mk-wa" type="number" min="1" step="100" value="1000" inputmode="numeric"> ${opt('mk-w', 'crystal')}</label>
        <button class="btn sm accent" data-action="emp-offer">Publier</button>
      </div>
      <p class="small muted" style="margin:0">Ce que tu donnes est mis de côté jusqu’à ce que quelqu’un accepte (ou que tu retires l’offre). Une fois acceptée, chacun reçoit sa part après le temps de trajet entre les deux empires. Au plus 5 offres à la fois.</p>
    </div>
    ${course ? `<div class="small">📈 Cours récents : ${course}</div>` : ''}
    <h2 class="section-title">🏪 Offres</h2>
    ${offers.length ? `<div class="stack">${offers.map((o) => `
      <div class="card emp-offer">
        <span class="row">${avatar({ username: o.seller, avatar: o.avatar, frame: o.frame }, 28)} <strong>${esc(o.mine ? 'Toi' : o.seller)}</strong></span>
        <span>donne <strong>${n(o.giveAmount)} ${RESOURCES[o.give].emoji}</strong> contre <strong>${n(o.wantAmount)} ${RESOURCES[o.want].emoji}</strong>
          <span class="muted small">(1 ${RESOURCES[o.give].emoji} = ${String(Math.round((o.wantAmount / o.giveAmount) * 100) / 100).replace('.', ',')} ${RESOURCES[o.want].emoji})</span>
          ${!o.mine && o.coords ? `<span class="small">· ✈️ livré en ${duration(flightTime(E.empire, o.coords))}</span>` : ''}</span>
        ${o.mine ? `<button class="btn ghost sm" data-action="emp-offer-cancel" data-id="${o.id}">Retirer</button>`
          : `<button class="btn sm" data-action="emp-offer-accept" data-id="${o.id}" data-want="${o.want}" data-amount="${o.wantAmount}">Accepter</button>`}
      </div>`).join('')}</div>` : '<p class="muted">Aucune offre pour l’instant. Publie la première !</p>'}
    <h2 class="section-title">🧔 ${BUTCH.name} est de passage</h2>
    <div class="card emp-butch">
      <p class="muted small" style="margin:0">« J’ai ce qu’il te faut, l’ami. Pas de discussion, c’est mon prix. » Butch passe toutes les 4 heures avec un seul lot, à prendre ou à laisser.</p>
      <div class="emp-butch-deal" id="bt-deal"></div>
      <div class="row emp-butch-form">
        <label>J’en prends <input id="bt-amount" type="number" min="1" step="100" value="500" inputmode="numeric"></label>
        <button class="btn ghost sm" data-action="emp-butch-max">Tout ce que je peux</button>
        <button class="btn sm accent" data-action="emp-butch" id="bt-go">Marché conclu</button>
      </div>
      <p class="small" id="bt-preview" style="margin:0"></p>
    </div>`;
}

/** The Portail de Jimmy: phases, what the current one needs, contributions and the top givers. */
function portalView(e) {
  const P = E.portalData;
  if (!P) return '<p class="muted">Connexion au Portail…</p>';
  const opened = P.phase >= PORTAL.phases.length;
  const current = PORTAL.phases[Math.min(P.phase, PORTAL.phases.length - 1)];
  return `<div class="emp-portal">
    <div class="card emp-portal-hero">
      <div class="emp-portal-ring ${opened ? 'open' : ''}" style="--pp:${P.phase / PORTAL.phases.length}"><span>${opened ? '👽' : current.emoji}</span></div>
      <div class="stack">
        <h2 style="margin:0">🌀 Le Portail de Jimmy <span class="badge">Saison ${P.season}</span></h2>
        <p class="muted" style="margin:0">Toute la galaxie construit ensemble le Portail qui ramènera Jimmy chez lui. Chaque phase terminée donne un bonus à tous les empires ; la dernière ouvre le Portail et termine la saison (les cadres de profil récompenseront les plus généreux).</p>
        <div class="emp-phases">${PORTAL.phases.map((ph, k) => `
          <span class="emp-phase ${k < P.phase ? 'done' : k === P.phase ? 'now' : ''}" title="${esc(ph.desc)} · ${esc(ph.bonus)}">${k < P.phase ? '✅' : ph.emoji} ${esc(ph.name)}</span>`).join('')}</div>
      </div>
    </div>
    ${opened ? `<div class="card center stack"><p style="font-size:3rem;margin:0">🎉👽🌀</p><h2 style="margin:0">Le Portail est ouvert !</h2><p class="muted">Jimmy rentre chez lui. Saison ${P.season} terminée : bravo à toute la galaxie.</p></div>` : `
    <div class="card stack">
      <div class="spread"><strong>Phase ${P.phase + 1} / ${PORTAL.phases.length} : ${current.emoji} ${esc(current.name)}</strong><span class="small muted">${esc(current.desc)}</span></div>
      ${RES_KEYS.map((r) => {
        const need = P.needs[r];
        const have = Math.min(need, P.progress[r] || 0);
        const flying = Math.min(need - have, P.inFlight[r] || 0);
        return `<div class="emp-need"><span>${RESOURCES[r].emoji} ${n(have)} / ${n(need)}${P.inFlight[r] ? ` <span class="muted small">(+${n(P.inFlight[r])} en route)</span>` : ''}</span>
          <div class="bl-bar emp-need-bar"><span style="width:${(have / need) * 100}%"></span><i style="left:${(have / need) * 100}%;width:${(flying / need) * 100}%"></i></div></div>`;
      }).join('')}
      <p class="small" style="margin:0">🎁 Une fois terminée : <strong>${esc(current.bonus)}</strong></p>
    </div>
    <div class="card stack">
      <strong>🛰️ Contribuer</strong>
      <p class="small muted" style="margin:0">Tes cargos livrent au centre de la galaxie (50:50) en ${duration(flightTime(e, PORTAL.coords))}, puis reviennent. Points de contribution : 🔩 ×1, 💎 ×1,5, 🔥 ×2.</p>
      <div class="emp-send">
        ${RES_KEYS.map((r) => `<label>${RESOURCES[r].emoji} <input id="pt-${r}" type="number" min="0" step="100" value="0" inputmode="numeric"></label>`).join('')}
        <span class="small" id="pt-info"></span>
        <button class="btn sm accent" data-action="emp-portal-give" id="pt-go">Envoyer au Portail</button>
      </div>
    </div>`}
    ${P.phase ? `<div class="small">🎁 Bonus obtenus : ${PORTAL.phases.slice(0, P.phase).map((ph) => `<span class="bl-chip">${ph.emoji} ${esc(ph.bonus)}</span>`).join(' ')}</div>` : ''}
    <h2 class="section-title">🏆 Plus grands contributeurs</h2>
    ${P.top.length ? `<ol class="bl-rank">${P.top.map((c, k) => `
      <li class="${c.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${avatar(c, 28)}
        <span class="bl-rank-name">${esc(c.username)}</span>
        <span class="bl-rank-badges"><span class="badge">${n(c.points)} pts</span>
          <span class="small muted">🔩 ${n(c.metal)} · 💎 ${n(c.crystal)} · 🔥 ${n(c.plasma)}</span></span></li>`).join('')}</ol>`
      : '<p class="muted">Personne n’a encore contribué. Sois le premier !</p>'}
  </div>`;
}

function fleetsView(e) {
  if (!E.fleets) return '<p class="muted">Chargement des flottes…</p>';
  const now = serverNow();
  return E.fleets.length ? `<div class="stack">${E.fleets.map((f) => {
    const load = RES_KEYS.filter((r) => f.load[r]).map((r) => `<span class="bl-chip">${RESOURCES[r].emoji} ${n(f.load[r])}</span>`).join('');
    const going = now < f.arrivesAt;
    return `<div class="card emp-fleet">
      <span>${f.kind === 'portal' ? `🌀 ${SHIPS.cargo.emoji} ×${f.cargos} → <strong>Portail de Jimmy</strong>` : f.kind === 'market' ? `🏪 ${f.mine ? `livraison vers <strong>${esc(f.dest)}</strong>` : `achat livré par <strong>${esc(f.owner)}</strong>`}`
        : f.mine ? `${SHIPS.cargo.emoji} ×${f.cargos} → <strong>${esc(f.dest)}</strong>` : `📥 de <strong>${esc(f.owner)}</strong>`}</span>
      <span class="bl-recipe">${load}</span>
      <span class="small">${going ? `✈️ arrive dans <strong data-until="${f.arrivesAt}"></strong>` : f.mine && f.cargos ? `🔙 retour dans <strong data-until="${f.returnsAt}"></strong>` : '📦 livré'}</span>
    </div>`;
  }).join('')}</div>` : `<p class="muted">Aucune flotte en vol. Envoie des ressources depuis la 🗺️ galaxie (il faut des cargos : ${e.ships.cargo} au port).</p>`;
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
    const def = q.kind === 'building' ? BUILDINGS[q.key] : q.kind === 'ship' ? SHIPS[q.key] : RESEARCH[q.key];
    const total = q.kind === 'building' ? buildTime(e, q.planet, q.key, q.level) : q.kind === 'ship' ? shipTime(e, q.planet, q.key, q.count) : researchTime(e, q.key, q.level);
    const left = q.endsAt - serverNow();
    return `<div class="emp-job"><span>${def.emoji} <strong>${esc(def.name)}</strong> ${q.kind === 'ship' ? `×${q.count}` : `→ niv. ${q.level}`}${q.kind !== 'research' && e.planets.length > 1 ? ` <span class="muted small">· ${esc(e.planets[q.planet].name)}</span>` : ''}</span>
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
  // Ships form.
  if (document.getElementById('sh-go')) {
    const count = Math.max(1, Math.floor(Number(document.getElementById('sh-count').value) || 1));
    const cost = shipCost('cargo', count);
    set('sh-cost', RES_KEYS.filter((r) => cost[r]).map((r) => `<span class="bl-chip ${e.res[r] >= cost[r] ? '' : 'missing'}">${RESOURCES[r].emoji} ${n(cost[r])}</span>`).join(''));
    set('sh-time', `⏱️ ${duration(shipTime(e, i, 'cargo', count))}`);
    document.getElementById('sh-go').disabled = Boolean(shipBlocker(e, i, 'cargo', count));
  }
  // Sending form.
  if (document.getElementById('sd-go')) {
    const load = Object.fromEntries(RES_KEYS.map((r) => [r, Math.max(0, Math.floor(Number(document.getElementById(`sd-${r}`).value) || 0))]));
    const need = cargosFor(e, load);
    const dest = E.galaxy?.find((g) => g.username === E.sendTo);
    const enough = RES_KEYS.every((r) => e.res[r] >= load[r]);
    set('sd-info', need ? `${SHIPS.cargo.emoji} ${need} cargo${need > 1 ? 's' : ''} (${e.ships.cargo} au port)${dest ? ` · ✈️ ${duration(flightTime(e, dest.coords))}` : ''}${enough ? '' : ' · <span class="bad">pas assez de ressources</span>'}` : '<span class="muted">Choisis ce que tu envoies.</span>');
    document.getElementById('sd-go').disabled = !need || need > e.ships.cargo || !enough;
  }
  // Portail contribution form.
  if (document.getElementById('pt-go')) {
    const load = Object.fromEntries(RES_KEYS.map((r) => [r, Math.max(0, Math.floor(Number(document.getElementById(`pt-${r}`).value) || 0))]));
    const need = cargosFor(e, load);
    const enough = RES_KEYS.every((r) => e.res[r] >= load[r]);
    set('pt-info', need ? `${SHIPS.cargo.emoji} ${need} cargo${need > 1 ? 's' : ''} (${e.ships.cargo} au port) · ${n(contributionPoints(load))} pts${enough ? '' : ' · <span class="bad">pas assez de ressources</span>'}` : '<span class="muted">Choisis ce que tu donnes.</span>');
    document.getElementById('pt-go').disabled = !need || need > e.ships.cargo || !enough;
  }
  // Countdowns (fleets); a fleet that just arrived or came back reloads the empire.
  let landed = false;
  for (const el of document.querySelectorAll('[data-until]')) {
    const left = Number(el.dataset.until) - serverNow();
    el.textContent = duration(left);
    if (left <= 0) landed = true;
  }
  const view = E.view || 'planets';
  if (fromDraw !== true && view !== 'planets' && (landed || Date.now() - (E.viewAt || 0) > 20000)) {
    E.viewAt = Date.now();
    if (landed) await load();
    await loadView(view);
    draw();
    return;
  }
  const $c = document.getElementById('emp-colonize');
  if ($c) $c.disabled = Boolean(colonyBlocker(e));
}

actions['emp-start'] = () => act('start', {});
actions['emp-view'] = async (el) => {
  E.view = el.dataset.v;
  E.sendTo = null;
  draw();
  if (E.view !== 'planets') { await loadView(E.view); draw(); }
};
actions['emp-ships'] = () => act('ships', { planet: E.sel, key: 'cargo', count: Number(document.getElementById('sh-count').value) });
actions['emp-send-open'] = (el) => { E.sendTo = el.dataset.to || null; draw(); };
actions['emp-send'] = async (el) => {
  const load = Object.fromEntries(RES_KEYS.map((r) => [r, Number(document.getElementById(`sd-${r}`).value) || 0]));
  await act('send', { to: el.dataset.to, load });
  E.sendTo = null;
  toast(`🛰️ Cargos en route vers ${el.dataset.to} !`);
  await loadView('galaxy');
  draw();
};
actions['emp-portal-give'] = async () => {
  const load = Object.fromEntries(RES_KEYS.map((r) => [r, Number(document.getElementById(`pt-${r}`).value) || 0]));
  await act('portal/contribute', { load });
  toast('🌀 Cargos en route vers le Portail !');
  await loadView('portal');
  draw();
};
actions['emp-offer'] = async () => {
  await act('market', {
    give: document.getElementById('mk-g').value, giveAmount: Number(document.getElementById('mk-ga').value),
    want: document.getElementById('mk-w').value, wantAmount: Number(document.getElementById('mk-wa').value),
  });
  await loadView('market');
  draw();
};
actions['emp-offer-accept'] = async (el) => { await act(`market/${el.dataset.id}/accept`, {}); toast('🤝 Échange conclu ! Les ressources sont en route (onglet 🛰️ Flottes).'); await loadView('market'); draw(); };
actions['emp-offer-cancel'] = async (el) => { await act(`market/${el.dataset.id}/cancel`, {}); await loadView('market'); draw(); };
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
document.addEventListener('input', (ev) => { if (E && /^(bt|sh|sd|mk|pt)-/.test(ev.target.id || '')) tick(true); });
document.addEventListener('change', (ev) => { if (E && /^(bt|sh|sd|mk)-/.test(ev.target.id || '')) tick(true); });
