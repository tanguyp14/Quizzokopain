// L'Empire de Jimmy — page (open to every player). The server keeps the empire; the page
// shows it live with the same rules (production ticking, countdowns) and asks the server to act.
import {
  state, actions, render, api, esc, notify, title, avatar,
  systemNotifs, askSystemNotifs,
} from '../core.js';
import {
  RESOURCES, RES_KEYS, BUILDINGS, RESEARCH, MAX_PLANETS, normalizeEmpire, advance, production, START_BOOST, startBoostEnd, planetProduction, energy, storageCap,
  buildingCost, researchCost, buildTime, researchTime, buildBlocker, researchBlocker, missing, planned, nextLevel, lineJobs, QUEUE_MAX, resourceMissing, bestLab,
  colonyCost, colonyBlocker, colonySlots, BUTCH, butchOffer, SHIPS, cargoCapacity, cargosFor, flightTime, shipCost, shipTime, shipBlocker, shipMissing, mineEnergy, PORTAL, contributionPoints, SWARM, EXPEDITION, MARKET, RELICS, RELIC_MAX, maxExpeditions,
} from '../games/empire/logic.js';
import { notesButton } from '../patchnotes.js';
import { announceJob, watchEmpire } from '../empireWatch.js';

/** System notifications (constructions finished while the tab is in the background). */
const notifsButton = () => {
  const st = systemNotifs();
  if (st === 'none') return '';
  return `<button class="btn ghost sm" data-action="emp-notifs" title="Être prévenu quand une construction se termine, même dans un autre onglet">${st === 'on' ? '🔔 Notifs activées' : st === 'blocked' ? '🔕 Notifs bloquées' : '🔕 Activer les notifs'}</button>`;
};
actions['emp-notifs'] = async () => {
  if (systemNotifs() === 'on') return notify('empire', 'Les notifications sont déjà activées : tu seras prévenu à la fin de chaque construction.');
  const st = await askSystemNotifs();
  notify('empire', st === 'on' ? '🔔 Notifications activées : tu seras prévenu à la fin de chaque construction, même dans un autre onglet.'
    : 'Notifications refusées par le navigateur : autorise-les dans les réglages du site pour être prévenu.', st !== 'on');
  draw();
};

let E = null; // { empire, offset (server - client clock), timer, key, sel (planet shown) }

const serverNow = () => Date.now() + (E?.offset || 0);
const n = (v) => Math.floor(v).toLocaleString('fr-FR');
/** A production per hour, shown per minute (« +3,4/min »). */
const perMin = (perHour) => {
  const m = perHour / 60;
  const digits = m < 1 ? 2 : m < 10 ? 1 : 0;
  return `+${(Math.floor(m * 10 ** digits) / 10 ** digits).toLocaleString('fr-FR')}/min`;
};
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
  render('<p class="muted">Connexion à l’empire…</p>');
  await load();
  if (!location.hash.startsWith('#/empire')) return;
  state.view = draw;
  state.ui.cleanup = () => { clearInterval(E?.timer); E = null; };
  draw();
  E.timer = setInterval(tick, 1000);
}

/**
 * The server keeps the only real empire: every answer replaces the one shown. Requests are
 * numbered so that an older answer arriving late never overwrites a newer one (a build would
 * seem undone and its price given back on screen).
 */
let seq = 0;
let applied = 0;
const fresh = (id) => { if (id < applied) return false; applied = id; return true; };
/** Reloads at least this often: what happens on the server (deliveries, the Nuée) shows up. */
const RESYNC = 30000;

async function load() {
  const id = ++seq;
  const r = await api('/api/empire');
  if (!fresh(id)) return;
  const empire = r.empire ? normalizeEmpire(r.empire) : null;
  E = { sel: 0, ...(E || {}), empire, offset: r.now - Date.now(), key: '', loadedAt: Date.now() };
  if (empire && E.sel >= empire.planets.length) E.sel = 0;
  for (const d of r.done || []) announceJob(empire, d);
  watchEmpire(empire, E.offset);
}

/** Reloads the empire from the server and redraws (one reload at a time; errors are ignored). */
let reloading = null;
function reload() {
  const here = () => E && location.hash.startsWith('#/empire');
  if (!here()) return Promise.resolve();
  reloading ||= (async () => {
    const before = E.key;
    await load();
    if (!here() || !E.empire) return;
    // Only redraw when something changed (a form being filled in is kept); the numbers follow anyway.
    if (structureKey(E.empire) === before) E.key = before;
    else draw();
  })().catch(() => {}).finally(() => { reloading = null; });
  return reloading;
}

async function act(path, body) {
  const id = ++seq;
  try {
    const r = await api(`/api/empire/${path}`, { method: 'POST', body });
    if (!E || !fresh(id)) return;
    E.empire = normalizeEmpire(r.empire);
    E.offset = r.now - Date.now();
    E.key = '';
    E.loadedAt = Date.now();
    watchEmpire(E.empire, E.offset);
    if (Number.isInteger(r.planet)) { E.sel = r.planet; notify('empire', `🚀 Nouvelle colonie : ${E.empire.planets[r.planet].name} !`); }
    draw();
  } catch (err) {
    notify('empire', err.message, true);
    // Refused: what is shown was off, take the server's empire again.
    if (E) await reload();
  }
}

// ---- display ----

function draw() {
  if (!E) return;
  const e = E.empire;
  if (!e) {
    render(`<div class="emp">
      <h1>${title('🪐', 'L’Empire de Jimmy')}</h1>
      <div class="card emp-intro stack center">
        <p style="font-size:3rem;margin:0">🛸</p>
        <p>Jimmy a besoin d’une base. Ta première planète est tirée au hasard : ses taux de 🔩 métal, 💎 cristal et 🔥 plasma sont uniques. Plus tard, jusqu’à 3 planètes, dont certaines sans une ressource : il faudra échanger avec les autres joueurs pour avancer ensemble.</p>
        <button class="btn accent" data-action="emp-start">🚀 Fonder mon empire</button>
      </div></div>`);
    return;
  }
  E.key = structureKey(e);
  const view = E.view || 'planets';
  render(`<div class="emp emp-layout"><div class="emp-main">
    <div class="emp-views">${VIEWS.map(([k, label]) => `<button class="btn ghost sm ${k === view ? 'active' : ''}" data-action="emp-view" data-v="${k}">${label}</button>`).join('')}
      ${notesButton('empire')}${notifsButton()}</div>
    ${startBoostEnd(e) ? `<div class="card emp-boost">🚀 <strong>Élan de départ</strong> : ta production est <strong>×${START_BOOST.factor}</strong> encore <strong data-until="${startBoostEnd(e)}"></strong>. Profites-en pour lancer tes mines !</div>` : ''}
    ${e.swarmMalus ? '<div class="card emp-malus">🐛 La Nuée a percé le Bouclier galactique : <strong>production −30 %</strong> pour tout le monde pendant quelques heures. Engagez plus de 🛡️ gardes pour la prochaine vague !</div>' : ''}
    ${resBar(e, view)}
    ${view === 'galaxy' ? galaxyView(e) : view === 'market' ? marketView() : view === 'fleets' ? fleetsView(e) : view === 'portal' ? portalView(e) : view === 'swarm' ? swarmView(e) : view === 'expeditions' ? expeditionsView(e) : planetsView(e)}
  </div><aside class="card emp-side">
    <div class="bl-top-switch ${E.side === 'swarm' ? 'right' : ''}" role="tablist">
      <button class="btn ghost sm ${E.side !== 'swarm' ? 'active' : ''}" data-action="emp-side" data-s="portal">🌀 Portail</button>
      <button class="btn ghost sm ${E.side === 'swarm' ? 'active' : ''}" data-action="emp-side" data-s="swarm">🐛 Nuée</button>
    </div><div class="emp-side-body" id="emp-side">${sidePanel()}</div></aside></div>`);
  if (view === 'planets') syncOrbits(e);
  if (E.side === 'swarm' ? !E.swarmData : !E.portalData) refreshSide();
  tick(true);
}

const VIEWS = [['planets', '🪐 Planètes'], ['galaxy', '🗺️ Galaxie'], ['market', '🏪 Marché'], ['fleets', '🛰️ Flottes'], ['portal', '🌀 Portail'], ['swarm', '🐛 Nuée'], ['expeditions', '🔭 Expéditions']];

function resBar(e, view) {
  const p = e.planets[E.sel];
  return `<div class="emp-res">${RES_KEYS.map((r) => `
      <div class="card emp-r" style="--rc:${RESOURCES[r].color}"><span class="emp-r-emoji">${RESOURCES[r].emoji}</span>
        <div><strong id="er-${r}"></strong><div class="small muted"><span id="ep-${r}"></span> · max <span id="ec-${r}"></span></div></div></div>`).join('')}
      ${view === 'planets' ? `<div class="card emp-r" style="--rc:#ffd166"><span class="emp-r-emoji">⚡</span><div><strong id="en-e"></strong><div class="small muted">énergie de ${esc(p.name)}</div></div></div>`
        : view === 'expeditions' ? `<div class="card emp-r" style="--rc:#ffd166"><span class="emp-r-emoji">${SHIPS.explorer.emoji}</span><div><strong>${e.ships.explorer}</strong><div class="small muted">explorateurs · ${e.ships.guard} ${SHIPS.guard.emoji} au port</div></div></div>`
        : view === 'swarm' ? `<div class="card emp-r" style="--rc:#7ee0a1"><span class="emp-r-emoji">${SHIPS.guard.emoji}</span><div><strong>${e.ships.guard}</strong><div class="small muted">gardes au port</div></div></div>`
        : `<div class="card emp-r" style="--rc:#b18cff"><span class="emp-r-emoji">${SHIPS.cargo.emoji}</span><div><strong>${e.ships.cargo}</strong><div class="small muted">cargos au port · ${n(cargoCapacity(e))} chacun</div></div></div>`}
    </div>`;
}

function planetsView(e) {
  const i = E.sel;
  const p = e.planets[i];
  return `<div class="emp-planets">${e.planets.map((pl, k) => `
      <button class="card emp-tab ${k === i ? 'active' : ''}" data-action="emp-sel" data-i="${k}">
        ${planetBall(pl, 46)}<span><strong>${esc(pl.name)}</strong><span class="emp-rates small">${ratesLine(pl)}</span></span></button>`).join('')}
      ${[...Array(MAX_PLANETS - e.planets.length).keys()].map((k) => slot(e, e.planets.length + k)).join('')}
    </div>
    <div class="emp-scene" id="emp-scene" style="--pa:${p.look.a};--pb:${p.look.b}">
      <span class="emp-stars" style="box-shadow:${stars(p.seed, 90)}"></span>
      <span class="emp-stars twinkle" style="box-shadow:${stars(p.seed + 7, 40)}"></span>
      <span class="emp-swirl" style="left:${p.seed % 2 ? 14 + (p.seed % 13) : 72 + (p.seed % 17)}%;top:${18 + (p.seed % 30)}%"><span></span></span>
      <div class="emp-scene-planet">${planetBall(p, 140)}</div>
      <div class="emp-scene-info"><h1 style="margin:0">${esc(p.name)}</h1>
        <div class="emp-rates">${ratesLine(p)}</div>
        <div class="muted small">${i === 0 ? 'Planète mère' : `Colonie ${i}`} · position ${e.coords.x}:${e.coords.y}</div></div>
    </div>
    <div class="card emp-queue" id="emp-queue"></div>
    <h2 class="section-title">🏗️ Bâtiments de ${esc(p.name)}</h2>
    <div class="emp-grid">${cards(e, 'building', BUILDINGS, i)}</div>
    <h2 class="section-title">🛰️ Vaisseaux</h2>
    <div class="emp-grid">${Object.entries(SHIPS).map(([k, def]) => shipCard(e, i, k, def)).join('')}</div>
    <h2 class="section-title">🔬 Recherche <span class="muted small">(pour tout l’empire)</span></h2>
    ${bestLab(e) ? `<div class="emp-grid">${cards(e, 'research', RESEARCH, i)}</div>` : '<p class="muted">🔒 La recherche arrive avec un 🔬 laboratoire.</p>'}
`;
}

/** A ship to build on the planet shown (or what it still needs). */
function shipCard(e, i, key, def) {
  const need = shipMissing(e, i, key);
  return `<div class="card emp-ships ${need ? 'locked' : ''}">
      <div class="emp-card-head"><span class="emp-card-emoji">${def.emoji}</span>
        <div><strong>${esc(def.name)}</strong> <span class="badge">${e.ships[key]} au port</span>
          <div class="muted small">${esc(def.desc)}${key === 'cargo' ? ` · capacité ${n(cargoCapacity(e))}` : ''}</div></div></div>
      ${need ? `<p class="small muted" style="margin:0">🔒 Il faut ${need.research ? 'la recherche ' : ''}${need.emoji} ${esc(need.name.toLowerCase())} niv. ${need.level}${need.research ? '' : ` sur ${esc(e.planets[i].name)}`}.</p>`
        : `<div class="row emp-butch-form"><label>Construire <input id="sh-count-${key}" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
          <span class="bl-recipe" id="sh-cost-${key}"></span><span class="small muted" id="sh-time-${key}"></span>
          <button class="btn sm" data-action="emp-ships" data-key="${key}" id="sh-go-${key}">Construire</button></div>`}
    </div>`;
}

// ---- the planet's scene: a starry sky, and what orbits the planet (more as the empire grows) ----

/** Stars as box-shadows of a 1px dot (the same sky for the same planet). */
function stars(seed, count) {
  let a = (seed >>> 0) || 1;
  const r = () => { a = (Math.imul(a ^ (a >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return a / 4294967296; };
  return [...Array(count)].map(() => `${Math.floor(r() * 1600)}px ${Math.floor(r() * 320)}px 0 ${r() < 0.15 ? 1 : 0}px rgba(255,255,255,${(0.25 + r() * 0.75).toFixed(2)})`).join(',');
}
/** What orbits the planet shown: satellites (its buildings), and the empire's ships at home. */
function orbiters(e, i) {
  const levels = Object.values(e.planets[i].buildings).reduce((a, b) => a + b, 0);
  const few = (n) => (n > 0 ? Math.min(4, Math.ceil(Math.log2(n + 1))) : 0);
  return [
    ...Array(Math.min(5, Math.ceil(levels / 6))).fill('dot'),
    ...Array(few(e.ships.cargo)).fill('🛰️'),
    ...Array(few(e.ships.guard)).fill('🚀'),
    ...Array(few(e.ships.explorer)).fill('🛸'),
  ];
}
/** A new orbit (tilt, size, speed, direction), starting from behind the planet. */
function reroll(o, W, H, pr) {
  const low = o.kind === 'dot';
  const max = Math.max(pr * 1.3, W / 2 - 18);
  o.R = low ? pr * (1.12 + Math.random() * 0.35) : pr * 1.35 + Math.random() * (max - pr * 1.35);
  o.flat = Math.min(0.4, (0.8 * pr) / o.R);
  const tiltMax = Math.min(40, (Math.asin(Math.min(1, (H / 2 - 16) / o.R)) * 180) / Math.PI);
  o.tilt = ((Math.random() * 2 - 1) * tiltMax * Math.PI) / 180;
  o.speed = (Math.PI * 2) / ((low ? 7 : 9) + Math.random() * 9);
  o.dir = Math.random() < 0.5 ? 1 : -1;
  o.a = -Math.PI / 2;
}
function syncOrbits(e) {
  const list = orbiters(e, E.sel);
  const sig = `${E.sel}|${list.join()}`;
  if (E.orbits?.sig !== sig) {
    E.orbits = { sig, list: list.map((kind, k) => ({ kind, a: -Math.PI / 2, pause: 0.2 + k * 0.35 + Math.random() * 0.6, R: 0 })) };
  }
  const scene = document.getElementById('emp-scene');
  if (!scene) return;
  scene.insertAdjacentHTML('beforeend', E.orbits.list.map((o) => `<span class="emp-orb ${o.kind === 'dot' ? 'dot' : ''}">${o.kind === 'dot' ? '' : o.kind}</span>`).join(''));
  if (!orbitRaf) orbitRaf = requestAnimationFrame(orbitLoop);
}
let orbitRaf = null;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function orbitLoop(ts) {
  const scene = document.getElementById('emp-scene');
  if (!scene || !E?.orbits) { orbitRaf = null; E && (E.orbitTs = 0); return; }
  const dt = reduceMotion() ? 0 : Math.min(0.05, (ts - (E.orbitTs || ts)) / 1000);
  E.orbitTs = ts;
  const W = scene.clientWidth;
  const H = scene.clientHeight;
  const pr = (scene.querySelector('.emp-planet')?.offsetWidth || 140) / 2;
  const els = scene.querySelectorAll('.emp-orb');
  E.orbits.list.forEach((o, k) => {
    const el = els[k];
    if (!el) return;
    if (!o.R) reroll(o, W, H, pr);
    if (o.pause > 0) {
      // Parked behind the planet; then off again on another orbit.
      o.pause -= dt;
      if (o.pause <= 0) reroll(o, W, H, pr);
    } else {
      const prev = o.a;
      o.a += o.speed * o.dir * dt;
      const turn = (x) => Math.floor((x + Math.PI / 2) / (Math.PI * 2));
      if (turn(prev) !== turn(o.a)) { o.a = -Math.PI / 2; o.pause = 0.6 + Math.random() * 2.2; }
    }
    const lx = o.R * Math.cos(o.a);
    const ly = o.R * o.flat * Math.sin(o.a);
    const x = lx * Math.cos(o.tilt) - ly * Math.sin(o.tilt);
    const y = lx * Math.sin(o.tilt) + ly * Math.cos(o.tilt);
    const depth = Math.sin(o.a); // > 0: in front of the planet
    // Heading (for the rocket, which points up-right).
    const hx = -Math.sin(o.a) * o.dir * Math.cos(o.tilt) - Math.cos(o.a) * o.flat * o.dir * Math.sin(o.tilt);
    const hy = -Math.sin(o.a) * o.dir * Math.sin(o.tilt) + Math.cos(o.a) * o.flat * o.dir * Math.cos(o.tilt);
    const rot = o.kind === '🚀' ? (Math.atan2(hy, hx) * 180) / Math.PI + 45 : 0;
    el.style.transform = `translate(${W / 2 + x}px, ${H / 2 + y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${0.75 + 0.35 * (depth + 1) / 2})`;
    el.style.zIndex = depth >= 0 ? 4 : 1;
    el.style.opacity = depth >= 0 ? 1 : 0.55 + 0.45 * (1 + depth);
  });
  orbitRaf = requestAnimationFrame(orbitLoop);
}

// ---- galaxy, market, fleets (loaded from the server when shown) ----

async function loadView(view) {
  try {
    if (view === 'galaxy') E.galaxy = (await api('/api/empire/galaxy')).empires;
    if (view === 'market') { const r = await api('/api/empire/market'); E.market = r; }
    if (view === 'fleets') E.fleets = (await api('/api/empire/fleets')).fleets;
    if (view === 'portal') E.portalData = await api('/api/empire/portal');
    if (view === 'swarm') E.swarmData = await api('/api/empire/swarm');
    if (view === 'expeditions') E.fleets = (await api('/api/empire/fleets')).fleets;
    E.viewAt = Date.now();
  } catch (err) { notify('empire', err.message, true); }
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

/** Butch's scrapyard: space junk piled up (emoji, left %, bottom %, size px, rotation). */
const JUNK = [
  ['🛞', 4, 6, 30, -12], ['🛰️', 12, 20, 34, 38], ['⚙️', 22, 8, 26, 0], ['📡', 30, 24, 30, -20], ['🔩', 20, 30, 20, 60],
  ['🚀', 70, 30, 34, 120], ['🪫', 80, 10, 24, 90], ['🧰', 88, 22, 28, -8], ['🛞', 92, 4, 26, 20], ['🛸', 62, 8, 36, -18],
  ['🔧', 74, 18, 20, -40], ['💡', 38, 6, 18, 150],
];

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
      <div class="emp-trade">
        <div class="emp-trade-side"><span class="emp-trade-label">Je donne</span>
          <div class="emp-trade-row"><input id="mk-ga" type="number" min="1" step="100" value="1000" inputmode="numeric">${opt('mk-g', 'metal')}</div></div>
        <button class="btn ghost emp-trade-swap" data-action="emp-offer-swap" title="Inverser">⇄</button>
        <div class="emp-trade-side"><span class="emp-trade-label">Je veux</span>
          <div class="emp-trade-row"><input id="mk-wa" type="number" min="1" step="100" value="1000" inputmode="numeric">${opt('mk-w', 'crystal')}</div></div>
        <div class="emp-trade-go"><span class="small" id="mk-info"></span>
          <button class="btn accent" data-action="emp-offer" id="mk-go">📢 Publier</button></div>
      </div>
      <p class="small muted" style="margin:0">Ce que tu donnes est mis de côté jusqu’à ce que quelqu’un accepte (ou que tu retires l’offre). Une fois acceptée, chacun reçoit sa part après le temps de trajet entre les deux empires. Au plus ${MARKET.maxOffers} offres à la fois.</p>
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
    <div class="card emp-yard">
      <div class="emp-yard-scene" aria-hidden="true">
        <span class="emp-yard-sign">BUTCH<small>casse spatiale · occasions</small></span>
        <span class="emp-yard-pile a"></span><span class="emp-yard-pile b"></span><span class="emp-yard-pile c"></span>
        ${JUNK.map(([emoji, x, y, size, rot]) => `<span class="emp-junk" style="left:${x}%;bottom:${y}%;font-size:${size}px;transform:rotate(${rot}deg)">${emoji}</span>`).join('')}
        <span class="emp-yard-smoke"></span><span class="emp-yard-smoke two"></span>
        <span class="emp-yard-butch">🧔</span>
        <span class="emp-yard-bubble">J’ai ce qu’il te faut, l’ami. Pas de discussion, c’est mon prix.</span>
      </div>
      <div class="emp-yard-deal">
        <p class="muted small" style="margin:0">Butch passe toutes les 4 heures avec un seul lot, à prendre ou à laisser.</p>
        <div class="emp-butch-deal" id="bt-deal"></div>
        <div class="row emp-butch-form">
          <label>J’en prends <input id="bt-amount" type="number" min="1" step="100" value="500" inputmode="numeric"></label>
          <button class="btn ghost sm" data-action="emp-butch-max">Tout ce que je peux</button>
          <button class="btn sm accent" data-action="emp-butch" id="bt-go">Marché conclu</button>
        </div>
        <p class="small" id="bt-preview" style="margin:0"></p>
      </div>
    </div>`;
}

// ---- the Portail, always in view on the right (the goal of the whole galaxy) ----

const sidePanel = () => (E.side === 'swarm' ? swarmSide() : portalSide());
/** Reloads what the right panel shows (the Portail or the Nuée). */
async function refreshSide() {
  if (E.sideBusy) return;
  E.sideBusy = true;
  try {
    if (E.side === 'swarm') E.swarmData = await api('/api/empire/swarm');
    else E.portalData = await api('/api/empire/portal');
    E.sideAt = Date.now();
    set('emp-side', sidePanel());
  } catch { /* shown on the next try */ }
  E.sideBusy = false;
}
function swarmSide() {
  const S = E.swarmData;
  if (!S) return '<p class="muted small" style="margin:0">🐛 Connexion au Bouclier galactique…</p>';
  const hold = S.defense >= S.strength;
  const L = S.last;
  const rank = S.top.findIndex((g) => g.username === state.me.username);
  return `<div class="emp-side-head">
      <div class="emp-swarm-bug small">🐛</div>
      <div><span class="emp-trade-label">Menace de la galaxie</span><h3 style="margin:2px 0 0">La Nuée · vague ${S.wave}</h3>
        <span class="small">⏳ dans <strong data-side-until="${S.nextAt}"></strong></span></div>
    </div>
    ${S.malusUntil ? '<div class="small bad">💥 Bouclier percé : production −30 % pour tous.</div>' : ''}
    <div class="stack" style="gap:6px">
      <div class="spread small"><span>🐛 Force <strong>${n(S.strength)}</strong></span><span class="${hold ? 'good' : 'bad'}">🛡️ Bouclier <strong>${n(S.defense)}</strong></span></div>
      <div class="bl-bar emp-swarm-bar ${hold ? 'ok' : ''}"><span style="width:${Math.min(1, S.defense / S.strength) * 100}%"></span></div>
      <span class="small">${hold ? '✅ Le Bouclier tiendra.' : `⚠️ Il manque <strong>${n(S.strength - S.defense)}</strong> garde${S.strength - S.defense > 1 ? 's' : ''}.`}</span>
    </div>
    <div class="emp-side-me small">🛡️ Tes gardes : <strong>${S.mine.alive}</strong> en poste${S.mine.inFlight ? ` · ${S.mine.inFlight} en route` : ''}${rank >= 0 ? ` · <strong>${rank + 1}ᵉ</strong> défenseur` : ''}</div>
    ${L ? `<div class="small">${L.won ? '🛡️' : '💥'} Vague ${L.wave} : ${L.won ? 'repoussée' : 'le Bouclier a cédé'} (${n(L.defense)} contre ${n(L.strength)})</div>` : ''}
    ${(E.view || 'planets') !== 'swarm' ? '<button class="btn accent" data-action="emp-view" data-v="swarm">🛡️ Engager des gardes</button>' : ''}`;
}
function portalSide() {
  const P = E.portalData;
  if (!P) return '<p class="muted small" style="margin:0">🌀 Connexion au Portail…</p>';
  const opened = P.phase >= PORTAL.phases.length;
  const current = PORTAL.phases[Math.min(P.phase, PORTAL.phases.length - 1)];
  const rank = P.top.findIndex((c) => c.username === state.me.username);
  return `<div class="emp-side-head">
      <div class="emp-portal-ring small ${opened ? 'open' : ''}" style="--pp:${P.phase / PORTAL.phases.length}"><span>${opened ? '👽' : current.emoji}</span></div>
      <div><span class="emp-trade-label">Objectif de la galaxie</span><h3 style="margin:2px 0 0">🌀 Portail de Jimmy</h3><span class="small muted">Saison ${P.season} · ${P.players} empire${P.players > 1 ? 's' : ''}</span></div>
    </div>
    <div class="emp-side-phases">${PORTAL.phases.map((ph, k) => `<span class="${k < P.phase ? 'done' : k === P.phase ? 'now' : ''}" title="${esc(ph.name)}">${k < P.phase ? '✅' : ph.emoji}</span>`).join('')}</div>
    ${opened ? '<p style="margin:0"><strong>🎉 Le Portail est ouvert !</strong> Jimmy rentre chez lui.</p>' : `
    <div class="stack" style="gap:8px">
      <strong>Phase ${P.phase + 1} / ${PORTAL.phases.length} : ${esc(current.name)}</strong>
      ${RES_KEYS.map((r) => {
        const need = P.needs[r];
        const have = Math.min(need, P.progress[r] || 0);
        const flying = Math.min(need - have, P.inFlight[r] || 0);
        return `<div class="emp-need small"><span class="spread">${RESOURCES[r].emoji} <span>${n(have)} / ${n(need)}</span></span>
          <div class="bl-bar emp-need-bar"><span style="width:${(have / need) * 100}%"></span><i style="left:${(have / need) * 100}%;width:${(flying / need) * 100}%"></i></div></div>`;
      }).join('')}
      <span class="small">🎁 ${esc(current.bonus)}</span>
    </div>`}
    <div class="emp-side-me small">${P.mine ? `🏅 Ta contribution : <strong>${n(P.mine.points)} pts</strong>${rank >= 0 ? ` · <strong>${rank + 1}ᵉ</strong>` : ''}` : '🏅 Tu n’as pas encore contribué.'}</div>
    ${P.phase ? `<div class="emp-side-bonus">${PORTAL.phases.slice(0, P.phase).map((ph) => `<span class="bl-chip" title="${esc(ph.name)}">${ph.emoji} ${esc(ph.bonus)}</span>`).join('')}</div>` : ''}
    ${!opened && (E.view || 'planets') !== 'portal' ? '<button class="btn accent" data-action="emp-view" data-v="portal">🛰️ Contribuer</button>' : ''}`;
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

// ---- expeditions ----

const EXP_TEXT = {
  resources: ['Un champ d’astéroïdes riche en minerai.', 'Une nébuleuse chargée de particules a rempli les soutes.', 'Une lune abandonnée cachait un vieux dépôt minier.'],
  deposit: ['Gisement exceptionnel : une comète de cristal pur !', 'Une planète morte couverte de minerai à ciel ouvert.', 'Un entrepôt oublié de l’ancienne flotte de Jimmy !'],
  nothing: ['Rien. Du vide, encore du vide.', 'Tes explorateurs ont juste pris de jolies photos d’une nébuleuse.', 'Un signal prometteur… c’était le micro-ondes de bord.'],
  piratesWon: ['Des pirates ont attaqué : ton escorte les a mis en fuite et a récupéré leur butin.', 'Embuscade de pirates repoussée ! Leur cargaison est à toi.', 'Les pirates ont vite compris leur erreur. Butin saisi.'],
  piratesLost: ['Des pirates ont attaqué et l’escorte n’a pas suffi…', 'Embuscade de pirates : les soutes ont été pillées.', 'Les pirates étaient trop nombreux. Retour en catastrophe.'],
  wreck: ['Une épave dérivait : quelques vaisseaux volent encore.', 'Un cimetière de vaisseaux, et quelques-uns réparables.', 'Un vaisseau fantôme… avec un équipage de robots ravi de te rejoindre.'],
  relic: ['Une relique des Anciens flottait dans un champ de débris !', 'Au cœur d’un astéroïde creux : un artefact des Anciens.', 'Un temple orbital abandonné gardait une relique.'],
  storm: ['Une tempête ionique a retardé le retour, mais les soutes sont pleines.', 'Tempête ionique ! Détour obligatoire, butin quand même.', 'Les instruments ont grillé dans une tempête ionique. Retour lent.'],
  butch: ['Butch Pakovski, en panne sèche, a été dépanné. « Tiens, garde ça, et pas un mot. »', 'Butch Pakovski dérivait sans carburant. Il a payé en plasma.', '« Butch Pakovski n’oublie jamais un service ! » (il a laissé du plasma).'],
  blackhole: ['Un trou noir… Plus aucun signal de la flotte.', 'La flotte a frôlé un trou noir. Elle ne reviendra pas.', 'Silence radio. Un trou noir a tout avalé.'],
};
const EXP_ICON = { resources: '📦', deposit: '💰', nothing: '🌌', piratesWon: '🏴‍☠️', piratesLost: '🏴‍☠️', wreck: '🛰️', relic: '🏺', storm: '⛈️', butch: '🧔', blackhole: '🕳️' };

function expeditionsView(e) {
  if (!e.research.astrophysics) {
    return `<div class="card emp-intro stack center"><p style="font-size:3rem;margin:0">🔭</p>
      <p>Les expéditions partent explorer l’espace inconnu : ressources, épaves, <strong>reliques</strong> aux bonus permanents… ou pirates.</p>
      <p class="muted">🔒 Il faut la recherche 🔭 Astrophysique (laboratoire niv. 4 et Logistique niv. 2), puis des 🛸 explorateurs (chantier spatial niv. 3).</p></div>`;
  }
  const out = (E.fleets || []).filter((f) => f.kind === 'expedition' && f.mine);
  const hours = E.expHours || 2;
  const found = Object.entries(RELICS).filter(([k]) => e.relics[k]);
  return `<div class="emp-portal">
    <div class="card stack">
      <div class="spread"><strong>🔭 Nouvelle expédition</strong><span class="badge">${out.length} / ${maxExpeditions(e)} en cours</span></div>
      <p class="small muted" style="margin:0">Plus d’explorateurs et plus longtemps : plus de butin, et plus de chances de trouver une relique. Une escorte de 🛡️ gardes repousse les pirates (sinon ils pillent tout et la moitié des explorateurs est perdue).</p>
      <div class="emp-send">
        <label>${SHIPS.explorer.emoji} <input id="ex-n" type="number" min="1" step="1" value="${Math.min(1, e.ships.explorer)}" inputmode="numeric"></label>
        <label>${SHIPS.guard.emoji} <input id="ex-g" type="number" min="0" step="1" value="0" inputmode="numeric"></label>
        <span class="emp-durations">${EXPEDITION.durations.map((h) => `<button class="btn ghost sm ${h === hours ? 'active' : ''}" data-action="emp-exp-h" data-h="${h}">${h} h</button>`).join('')}</span>
        <span class="small" id="ex-info"></span>
        <button class="btn sm accent" data-action="emp-exp" id="ex-go">Lancer</button>
      </div>
    </div>
    ${out.length ? `<div class="stack">${out.map((f) => `<div class="card emp-fleet"><span>🔭 ${SHIPS.explorer.emoji} ×${f.trip.explorers}${f.trip.guards ? ` + ${SHIPS.guard.emoji} ×${f.trip.guards}` : ''} dans l’espace inconnu (${f.trip.hours} h)</span>
      <span class="small">🔙 retour dans <strong data-until="${f.returnsAt}"></strong></span></div>`).join('')}</div>` : ''}
    <h2 class="section-title">🏺 Reliques <span class="muted small">(bonus permanents, ${RELIC_MAX} max chacune)</span></h2>
    <div class="emp-relics">${Object.entries(RELICS).map(([k, r]) => `
      <div class="card emp-relic ${e.relics[k] ? '' : 'none'}"><span class="emp-relic-emoji">${r.emoji}</span>
        <div><strong>${esc(r.name)}</strong> ${e.relics[k] ? `<span class="badge">×${e.relics[k]}</span>` : ''}<div class="small muted">${esc(r.desc)} chacune</div></div></div>`).join('')}</div>
    ${found.length ? '' : '<p class="muted small">Aucune relique pour l’instant. Les longues expéditions en trouvent plus souvent.</p>'}
    <h2 class="section-title">📜 Rapports</h2>
    ${e.log.length ? `<div class="stack">${e.log.map(report).join('')}</div>` : '<p class="muted">Aucune expédition revenue pour l’instant.</p>'}
  </div>`;
}

function report(x) {
  const key = x.kind === 'pirates' ? (x.won ? 'piratesWon' : 'piratesLost') : x.kind;
  const chips = [];
  for (const r of RES_KEYS) if (x.kept?.[r]) chips.push(`<span class="bl-chip">+${n(x.kept[r])} ${RESOURCES[r].emoji}</span>`);
  for (const [ship, c] of Object.entries(x.found || {})) chips.push(`<span class="bl-chip">+${c} ${SHIPS[ship].emoji} ${esc(SHIPS[ship].name.toLowerCase())}</span>`);
  if (x.relic) chips.push(`<span class="bl-chip good">${RELICS[x.relic].emoji} ${esc(RELICS[x.relic].name)} · ${esc(RELICS[x.relic].desc)}</span>`);
  if (x.lost?.explorer) chips.push(`<span class="bl-chip missing">−${x.lost.explorer} ${SHIPS.explorer.emoji}</span>`);
  if (x.lost?.guard) chips.push(`<span class="bl-chip missing">−${x.lost.guard} ${SHIPS.guard.emoji}</span>`);
  const lostLoot = RES_KEYS.some((r) => (x.loot?.[r] || 0) > (x.kept?.[r] || 0));
  const bad = key === 'piratesLost' || key === 'blackhole';
  return `<div class="card emp-report ${bad ? 'bad' : x.relic || key === 'deposit' ? 'great' : ''}">
    <span class="emp-report-icon">${EXP_ICON[key]}</span>
    <div class="stack" style="gap:4px"><span>${esc(EXP_TEXT[key][x.text % 3])}${x.pirates ? ` <span class="muted small">(${x.pirates} pirates contre ${x.guards} 🛡️)</span>` : ''}</span>
      ${chips.length ? `<span class="bl-recipe">${chips.join(' ')}</span>` : ''}
      ${lostLoot ? '<span class="small muted">📦 Entrepôts pleins : une partie du butin a été perdue.</span>' : ''}
      <span class="small muted">${SHIPS.explorer.emoji} ×${x.explorers}${x.guards ? ` + ${SHIPS.guard.emoji} ×${x.guards}` : ''} · ${x.hours} h · retour ${new Date(x.at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
  </div>`;
}

function swarmView(e) {
  const S = E.swarmData;
  if (!S) return '<p class="muted">Connexion au Bouclier galactique…</p>';
  const ratio = Math.min(1, S.defense / S.strength);
  const hold = S.defense >= S.strength;
  const L = S.last;
  const res = (load) => RES_KEYS.map((r) => `<span class="bl-chip">${RESOURCES[r].emoji} ${n(load[r])}</span>`).join(' ');
  return `<div class="emp-portal">
    <div class="card emp-swarm-hero">
      <div class="emp-swarm-bug">🐛</div>
      <div class="stack">
        <h2 style="margin:0">La Nuée <span class="badge">Vague ${S.wave}</span></h2>
        <p class="muted" style="margin:0">Chaque semaine, une vague de la Nuée frappe la galaxie, toujours plus forte. Les 🛡️ gardes engagés par tous les joueurs dans le Bouclier galactique la repoussent ensemble. Personne ne perd son empire, mais si le Bouclier cède, toute la galaxie produit moins pendant ${duration(SWARM.malusFor)}.</p>
        <div class="spread"><span>⏳ Prochaine vague dans <strong data-until="${S.nextAt}"></strong></span>
          ${state.me.role === 'superadmin' ? '<button class="btn ghost sm" data-action="emp-swarm-now" title="Pour tester : déclenche la vague maintenant">⚡ Test : vague maintenant</button>' : ''}</div>
      </div>
    </div>
    <div class="card stack">
      <div class="spread"><strong>🐛 Force de la vague ${S.wave} : ${n(S.strength)}</strong><strong class="${hold ? 'good' : 'bad'}">🛡️ Bouclier : ${n(S.defense)}</strong></div>
      <div class="bl-bar emp-swarm-bar ${hold ? 'ok' : ''}"><span style="width:${ratio * 100}%"></span></div>
      <p class="small" style="margin:0">${hold ? '✅ Le Bouclier tiendra si personne ne tombe d’ici là.' : `⚠️ Il manque <strong>${n(S.strength - S.defense)}</strong> garde${S.strength - S.defense > 1 ? 's' : ''} pour tenir.`}
        Tenir : 🎁 par garde ${res(S.reward)} et ${Math.round(SWARM.lossWin * 100)} % de pertes. Céder : −30 % de production pour tous et ${Math.round(SWARM.lossLose * 100)} % de pertes.</p>
    </div>
    <div class="card stack">
      <strong>🛡️ Engager des gardes</strong>
      <p class="small muted" style="margin:0">Tu as <strong>${S.mine.alive}</strong> garde${S.mine.alive > 1 ? 's' : ''} en poste${S.mine.inFlight ? ` et ${S.mine.inFlight} en route` : ''}. Ils rejoignent le Bouclier (50:50) en ${duration(flightTime(e, PORTAL.coords))} et y restent jusqu’à leur chute. Construis-en au 🛠️ chantier spatial niv. 2 (onglet 🪐 Planètes).</p>
      <div class="emp-send">
        <label>${SHIPS.guard.emoji} <input id="sw-count" type="number" min="1" step="1" value="${Math.min(1, e.ships.guard)}" inputmode="numeric"></label>
        <button class="btn ghost sm" data-action="emp-guard-max">Tous (${e.ships.guard})</button>
        <button class="btn sm accent" data-action="emp-guard" id="sw-go">Engager</button>
      </div>
    </div>
    ${L ? `<div class="card emp-swarm-last ${L.won ? 'won' : 'lost'}">${L.won ? '🛡️' : '💥'} <span>Vague ${L.wave} : <strong>${L.won ? 'repoussée' : 'le Bouclier a cédé'}</strong> (force ${n(L.strength)} contre ${n(L.defense)} gardes, ${L.defenders} défenseur${L.defenders > 1 ? 's' : ''})</span></div>` : ''}
    <h2 class="section-title">🏆 Défenseurs de la galaxie</h2>
    ${S.top.length ? `<ol class="bl-rank">${S.top.map((g, k) => `
      <li class="${g.username === state.me.username ? 'me' : ''}"><span class="bl-rank-n">${['🥇', '🥈', '🥉'][k] || k + 1}</span>${avatar(g, 28)}
        <span class="bl-rank-name">${esc(g.username)}</span>
        <span class="bl-rank-badges"><span class="badge">${g.waves} vague${g.waves > 1 ? 's' : ''}</span>
          <span class="small muted">🛡️ ${g.alive} en poste · ${g.engaged} engagés · ${g.lost} tombés</span></span></li>`).join('')}</ol>`
      : '<p class="muted">Aucun garde n’est encore engagé. La galaxie compte sur toi !</p>'}
  </div>`;
}

function fleetsView(e) {
  if (!E.fleets) return '<p class="muted">Chargement des flottes…</p>';
  const now = serverNow();
  return E.fleets.length ? `<div class="stack">${E.fleets.map((f) => {
    const load = RES_KEYS.filter((r) => f.load[r]).map((r) => `<span class="bl-chip">${RESOURCES[r].emoji} ${n(f.load[r])}</span>`).join('');
    const going = now < f.arrivesAt;
    return `<div class="card emp-fleet">
      <span>${f.kind === 'expedition' ? `🔭 ${SHIPS.explorer.emoji} ×${f.trip.explorers}${f.trip.guards ? ` + ${SHIPS.guard.emoji} ×${f.trip.guards}` : ''} → <strong>espace inconnu</strong> (${f.trip.hours} h)` : f.kind === 'guard' ? `🐛 ${SHIPS.guard.emoji} ×${f.cargos} → <strong>Bouclier galactique</strong>` : f.kind === 'reward' ? '🎁 <strong>Récompense de la Nuée</strong>' : f.kind === 'portal' ? `🌀 ${SHIPS.cargo.emoji} ×${f.cargos} → <strong>Portail de Jimmy</strong>` : f.kind === 'market' ? `🏪 ${f.mine ? `livraison vers <strong>${esc(f.dest)}</strong>` : `achat livré par <strong>${esc(f.owner)}</strong>`}`
        : f.mine ? `${SHIPS.cargo.emoji} ×${f.cargos} → <strong>${esc(f.dest)}</strong>` : `📥 de <strong>${esc(f.owner)}</strong>`}</span>
      <span class="bl-recipe">${load}</span>
      <span class="small">${f.kind === 'expedition' ? `🔙 retour dans <strong data-until="${f.returnsAt}"></strong>` : going ? `✈️ arrive dans <strong data-until="${f.arrivesAt}"></strong>` : f.kind === 'guard' ? '🛡️ en poste' : f.mine && f.cargos ? `🔙 retour dans <strong data-until="${f.returnsAt}"></strong>` : '📦 livré'}</span>
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

const structureKey = (e) => JSON.stringify([e.planets.map((p) => [p.buildings, p.off]), e.research, e.queue, E.sel]);

/** Unlocked cards first, then the locked ones with what they need. */
function cards(e, kind, defs, planet) {
  const keys = Object.keys(defs);
  const f = planned(e); // what is queued counts for the unlocks
  const isLocked = (k) => (kind === 'building' && resourceMissing(e, planet, k)) || missing(f, kind, k, planet).length;
  return keys.filter((k) => !isLocked(k)).map((k) => card(kind, k, defs[k])).join('')
    + keys.filter(isLocked).map((k) => lockedCard(f, kind, k, defs[k], planet)).join('');
}
function card(kind, key, def) {
  return `<div class="card emp-card">
    <div class="emp-card-head"><span class="emp-card-emoji">${def.emoji}</span>
      <div><strong>${esc(def.name)}</strong> <span class="badge" id="eml-${kind}-${key}"></span><div class="muted small">${esc(def.desc)}</div></div></div>
    ${kind === 'building' ? `<div class="emp-yield small" id="emy-${key}"></div>` : ''}
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
      : `<div class="emp-unlock"><span class="muted">Se débloque avec :</span>${missing(e, kind, key, planet).map((m) => `<span class="bl-chip missing">${m.emoji} ${esc(m.name)} niv. ${m.level} <span class="muted">(${m.have})</span></span>`).join('')}</div>`}</div>
  </div>`;
}

const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };

/** What a building gives now, and at its next level (a mine's production takes the energy into account). */
function buildingYield(e, i, key) {
  const lvl = e.planets[i].buildings[key];
  const next = { ...e, planets: e.planets.map((p, k) => (k === i ? { ...p, buildings: { ...p.buildings, [key]: lvl + 1 } } : p)) };
  const line = (label, now, then) => `<span class="muted">${label}</span><span><strong>${now}</strong> → <strong class="good">${then}</strong> <span class="muted">au niv. ${lvl + 1}</span></span>`;
  const res = BUILDINGS[key].res;
  if (res) {
    const f = (x) => perMin(planetProduction(x, i)[res]);
    // Energy: what this mine uses now and at the next level, and what the planet will have left.
    const use = (l) => mineEnergy(key, l);
    const off = e.planets[i].off?.[key];
    const pause = `<button class="btn ghost sm emp-pause ${off ? 'on' : ''}" data-action="emp-pause" data-key="${key}" title="${off ? 'Relancer la mine' : 'Mettre la mine en pause : elle ne produit plus et laisse son énergie aux autres'}">${off ? '▶️ Relancer' : '⏸️ Pause'}</button>`;
    if (off) return `<span class="spread"><span class="muted">⏸️ En pause : ne produit rien, ne consomme rien (${n(use(lvl))} ⚡ libérés)</span>${pause}</span>`;
    const after = energy(next, i);
    const left = after.made - after.used;
    return `<span class="spread"><span class="muted">${RESOURCES[res].emoji} Produit</span>${lvl ? pause : ''}</span>${line('', f(e), f(next)).replace('<span class="muted"></span>', '')}
      <span class="muted">⚡ Consomme</span><span><strong>${n(use(lvl))}</strong> → <strong>${n(use(lvl + 1))}</strong> <span class="muted">au niv. ${lvl + 1}</span>
        · <span class="${left < 0 ? 'bad' : 'good'}">reste ${left < 0 ? '' : '+'}${n(left)} ⚡</span></span>
      ${left < 0 ? `<span class="small bad">⚠️ Au niv. ${lvl + 1}, il manquerait ${n(-left)} ⚡ : toutes les mines de la planète tourneraient moins vite. Monte d’abord la ☀️ centrale.</span>` : ''}`;
  }
  if (key === 'power') {
    const f = (x) => n(energy(x, i).made);
    return line('⚡ Énergie', f(e), f(next));
  }
  if (key === 'storage') return line('📦 Place', n(storageCap(e)), n(storageCap(next)));
  if (key === 'robotics') return line('🏗️ Vitesse de construction', `×${lvl + 1}`, `×${lvl + 2}`);
  if (key === 'shipyard') return line('🛠️ Vitesse des vaisseaux', `×${lvl + 1}`, `×${lvl + 2}`);
  if (key === 'lab') {
    const best = bestLab(e);
    const nb = bestLab(next);
    return line('🔬 Vitesse de recherche', `×${best + 1}`, `×${nb + 1}`);
  }
  return '';
}

/** Every second: production and countdowns (a finished job reloads from the server). */
async function tick(fromDraw = false) {
  if (!E?.empire) return;
  const e = E.empire;
  const i = E.sel;
  const done = advance(e, serverNow());
  if (fromDraw !== true && (done.length || Date.now() - (E.loadedAt || 0) > RESYNC)) { await reload(); return; }
  if (fromDraw !== true && (structureKey(e) !== E.key || (!startBoostEnd(e) && document.querySelector('.emp-boost')))) { draw(); return; }
  const p = production(e);
  const here = planetProduction(e, i);
  const cap = storageCap(e);
  for (const r of RES_KEYS) {
    set(`er-${r}`, n(e.res[r]));
    set(`ep-${r}`, `${perMin(p[r])}${e.planets.length > 1 ? ` <span title="dont cette planète">(ici ${perMin(here[r])})</span>` : ''}`);
    set(`ec-${r}`, n(cap));
    document.getElementById(`er-${r}`)?.classList.toggle('full', e.res[r] >= cap);
  }
  const en = energy(e, i);
  set('en-e', `<span class="${en.made < en.used ? 'bad' : ''}">${n(en.made - en.used)}</span> <span class="small muted">(${n(en.made)} / ${n(en.used)})</span>${en.ratio < 1 ? ` <span class="small bad" title="Pas assez d’énergie : les mines de cette planète tournent au ralenti">· mines à ${Math.floor(en.ratio * 100)} %</span>` : ''}`);
  const now = serverNow();
  set('emp-queue', e.queue.length ? [...e.queue].sort((a, b) => a.endsAt - b.endsAt).map((q) => {
    const def = q.kind === 'building' ? BUILDINGS[q.key] : q.kind === 'ship' ? SHIPS[q.key] : RESEARCH[q.key];
    const total = q.startsAt ? q.endsAt - q.startsAt
      : q.kind === 'building' ? buildTime(e, q.planet, q.key, q.level) : q.kind === 'ship' ? shipTime(e, q.planet, q.key, q.count) : researchTime(e, q.key, q.level);
    const left = q.endsAt - now;
    const waiting = q.startsAt > now;
    return `<div class="emp-job ${waiting ? 'waiting' : ''}"><span>${def.emoji} <strong>${esc(def.name)}</strong> ${q.kind === 'ship' ? `×${q.count}` : `→ niv. ${q.level}`}${q.kind !== 'research' && e.planets.length > 1 ? ` <span class="muted small">· ${esc(e.planets[q.planet].name)}</span>` : ''}</span>
      <div class="bl-bar"><span style="width:${waiting ? 0 : Math.min(100, Math.max(0, (1 - left / total) * 100))}%"></span></div>
      <span class="small">${waiting ? `⏸️ en file · commence dans ${duration(q.startsAt - now)}` : `⏳ ${duration(left)}`}</span>
      <button class="btn ghost sm" data-action="emp-cancel" data-kind="${q.kind}" data-planet="${q.planet ?? 0}" data-at="${q.endsAt}" title="Annuler (remboursé ; ce qui en dépend dans la file aussi)">✕</button></div>`;
  }).join('') + `<div class="small muted">Jusqu’à ${QUEUE_MAX} actions à la suite : par planète pour les bâtiments, ${QUEUE_MAX} recherches, ${QUEUE_MAX} commandes de vaisseaux. Tout est payé tout de suite.</div>`
    : `<span class="muted">Aucun chantier ni recherche en cours. Lance-en un ci-dessous ! Tu peux en empiler jusqu’à ${QUEUE_MAX} à la suite.</span>`);
  for (const [kind, defs] of [['building', BUILDINGS], ['research', RESEARCH]]) {
    for (const key of Object.keys(defs)) {
      if (!document.getElementById(`emb-${kind}-${key}`)) continue;
      const lvl = kind === 'building' ? e.planets[i].buildings[key] : e.research[key];
      const next = nextLevel(e, kind, key, i); // after what is already queued
      const max = kind === 'research' && next > (RESEARCH[key].max ?? Infinity);
      const cost = kind === 'building' ? buildingCost(key, next) : researchCost(key, next);
      const time = kind === 'building' ? buildTime(e, i, key, next) : researchTime(e, key, next);
      const why = kind === 'building' ? buildBlocker(e, i, key) : researchBlocker(e, key);
      const busy = lineJobs(e, kind, i).length > 0;
      set(`eml-${kind}-${key}`, `niv. ${lvl}${next - 1 > lvl ? ` → ${next - 1} en file` : ''}${kind === 'research' && RESEARCH[key].max ? ` / ${RESEARCH[key].max}` : ''}`);
      set(`emr-${kind}-${key}`, max ? '' : RES_KEYS.filter((r) => cost[r]).map((r) => `<span class="bl-chip ${e.res[r] >= cost[r] ? '' : 'missing'}">${RESOURCES[r].emoji} ${n(cost[r])}</span>`).join(''));
      set(`emt-${kind}-${key}`, max ? '' : `⏱️ ${duration(time)}`);
      if (kind === 'building') set(`emy-${key}`, buildingYield(e, i, key));
      const $b = document.getElementById(`emb-${kind}-${key}`);
      $b.disabled = Boolean(why);
      $b.title = why || '';
      set(`emb-${kind}-${key}`, max ? 'Max' : `${busy ? '➕ ' : ''}${kind === 'building' ? 'Construire' : 'Rechercher'} niv. ${next}`);
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
  // Market offer form.
  if (document.getElementById('mk-go')) {
    const ga = Math.floor(Number(document.getElementById('mk-ga').value) || 0);
    const wa = Math.floor(Number(document.getElementById('mk-wa').value) || 0);
    const g = document.getElementById('mk-g').value;
    const w = document.getElementById('mk-w').value;
    const why = g === w ? 'deux ressources différentes' : !(ga > 0 && wa > 0) ? 'quantités ?' : e.res[g] < ga ? `tu n’as que ${n(e.res[g])} ${RESOURCES[g].emoji}` : '';
    set('mk-info', why ? `<span class="bad">${why}</span>` : `1 ${RESOURCES[g].emoji} = <strong>${String(Math.round((wa / ga) * 100) / 100).replace('.', ',')}</strong> ${RESOURCES[w].emoji}`);
    document.getElementById('mk-go').disabled = Boolean(why);
  }
  // Ships forms.
  for (const key of Object.keys(SHIPS)) {
    if (!document.getElementById(`sh-go-${key}`)) continue;
    const count = Math.max(1, Math.floor(Number(document.getElementById(`sh-count-${key}`).value) || 1));
    const cost = shipCost(key, count);
    set(`sh-cost-${key}`, RES_KEYS.filter((r) => cost[r]).map((r) => `<span class="bl-chip ${e.res[r] >= cost[r] ? '' : 'missing'}">${RESOURCES[r].emoji} ${n(cost[r])}</span>`).join(''));
    set(`sh-time-${key}`, `⏱️ ${duration(shipTime(e, i, key, count))}`);
    const why = shipBlocker(e, i, key, count);
    const $b = document.getElementById(`sh-go-${key}`);
    $b.disabled = Boolean(why);
    $b.title = why || '';
  }
  // Expedition form.
  if (document.getElementById('ex-go')) {
    const ex = Math.floor(Number(document.getElementById('ex-n').value) || 0);
    const gd = Math.max(0, Math.floor(Number(document.getElementById('ex-g').value) || 0));
    const active = (E.fleets || []).filter((f) => f.kind === 'expedition' && f.mine).length;
    const why = active >= maxExpeditions(e) ? 'toutes les expéditions sont parties' : ex < 1 ? 'au moins un explorateur' : ex > e.ships.explorer ? `${e.ships.explorer} explorateur(s) au port` : gd > e.ships.guard ? `${e.ships.guard} garde(s) au port` : '';
    set('ex-info', why ? `<span class="bad">${why}</span>` : `🔙 retour dans ${E.expHours || 2} h (sauf imprévu)`);
    document.getElementById('ex-go').disabled = Boolean(why);
  }
  // Guards engagement form.
  if (document.getElementById('sw-go')) {
    const count = Math.floor(Number(document.getElementById('sw-count').value) || 0);
    document.getElementById('sw-go').disabled = !(count >= 1 && count <= e.ships.guard);
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
    if (landed) await reload();
    await loadView(view);
    draw();
    return;
  }
  // The right panel's countdown (the wave): refreshed when it is due, at most every 5 s.
  let due = false;
  for (const el of document.querySelectorAll('[data-side-until]')) {
    const left = Number(el.dataset.sideUntil) - serverNow();
    el.textContent = duration(left);
    if (left <= 0) due = true;
  }
  if (Date.now() - (E.sideAt || 0) > (due ? 5000 : 30000)) refreshSide();
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
actions['emp-ships'] = (el) => act('ships', { planet: E.sel, key: el.dataset.key, count: Number(document.getElementById(`sh-count-${el.dataset.key}`).value) });
actions['emp-guard'] = async () => {
  await act('swarm/engage', { count: Number(document.getElementById('sw-count').value) });
  notify('empire', '🛡️ Gardes en route vers le Bouclier galactique !');
  await loadView('swarm');
  draw();
};
actions['emp-exp-h'] = (el) => { E.expHours = Number(el.dataset.h); draw(); };
actions['emp-exp'] = async () => {
  await act('expedition', { explorers: Number(document.getElementById('ex-n').value), guards: Number(document.getElementById('ex-g').value), hours: E.expHours || 2 });
  notify('empire', '🔭 Expédition partie dans l’espace inconnu !');
  await loadView('expeditions');
  draw();
};
actions['emp-guard-max'] = () => { document.getElementById('sw-count').value = E.empire.ships.guard; tick(true); };
actions['emp-swarm-now'] = async () => {
  const r = await api('/api/empire/swarm/now', { method: 'POST', body: {} });
  notify('empire', r.last?.won ? `🛡️ Vague ${r.last.wave} repoussée !` : `🐛 La vague ${r.last?.wave} a percé le Bouclier…`, !r.last?.won);
  await load();
  await loadView('swarm');
  draw();
};
actions['emp-send-open'] = (el) => { E.sendTo = el.dataset.to || null; draw(); };
actions['emp-send'] = async (el) => {
  const load = Object.fromEntries(RES_KEYS.map((r) => [r, Number(document.getElementById(`sd-${r}`).value) || 0]));
  await act('send', { to: el.dataset.to, load });
  E.sendTo = null;
  notify('empire', `🛰️ Cargos en route vers ${el.dataset.to} !`);
  await loadView('galaxy');
  draw();
};
actions['emp-portal-give'] = async () => {
  const load = Object.fromEntries(RES_KEYS.map((r) => [r, Number(document.getElementById(`pt-${r}`).value) || 0]));
  await act('portal/contribute', { load });
  notify('empire', '🌀 Cargos en route vers le Portail !');
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
actions['emp-offer-swap'] = () => {
  const [ga, wa, g, w] = ['mk-ga', 'mk-wa', 'mk-g', 'mk-w'].map((id) => document.getElementById(id));
  [ga.value, wa.value] = [wa.value, ga.value];
  [g.value, w.value] = [w.value, g.value];
  tick(true);
};
actions['emp-offer-accept'] = async (el) => { await act(`market/${el.dataset.id}/accept`, {}); notify('empire', '🤝 Échange conclu ! Les ressources sont en route (onglet 🛰️ Flottes).'); await loadView('market'); draw(); };
actions['emp-offer-cancel'] = async (el) => { await act(`market/${el.dataset.id}/cancel`, {}); await loadView('market'); draw(); };
actions['emp-sel'] = (el) => { E.sel = Number(el.dataset.i); draw(); };
actions['emp-building'] = (el) => act('build', { planet: E.sel, key: el.dataset.key });
actions['emp-side'] = (el) => {
  E.side = el.dataset.s;
  const sw = el.parentElement;
  sw.classList.toggle('right', E.side === 'swarm');
  for (const b of sw.children) b.classList.toggle('active', b === el);
  set('emp-side', sidePanel());
  refreshSide();
};
actions['emp-pause'] = (el) => act('pause', { planet: E.sel, key: el.dataset.key });
actions['emp-research'] = (el) => act('research', { key: el.dataset.key });
actions['emp-cancel'] = (el) => act('cancel', { kind: el.dataset.kind, planet: Number(el.dataset.planet), at: Number(el.dataset.at) });
actions['emp-colonize'] = () => act('colonize', {});
actions['emp-butch'] = async () => {
  await act('butch', { amount: Number(document.getElementById('bt-amount').value) });
  notify('empire', '🧔 Butch : « Plaisir de faire affaire ! »');
};
actions['emp-butch-max'] = () => {
  const o = butchOffer(E.empire, serverNow());
  document.getElementById('bt-amount').value = Math.max(0, Math.min(o.left, Math.floor(E.empire.res[o.wants] / o.price)));
  tick(true);
};
document.addEventListener('input', (ev) => { if (E && /^(bt|sh|sd|mk|pt|sw|ex)-/.test(ev.target.id || '')) tick(true); });
document.addEventListener('change', (ev) => { if (E && /^(bt|sh|sd|mk|ex)-/.test(ev.target.id || '')) tick(true); });
