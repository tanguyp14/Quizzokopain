// Interface du jeu : collection, decks, champ de bataille, impression et équilibrage.
import {
  GAME_NAME, COLORS, TYPES, RARITIES, CARDS, CHAMPIONS, MARKERS, CARD_BY_ID, CHAMPION_BY_ID, MARKER_BY_ID, DECK_SIZE, MAX_COPIES,
  rhythmLabel, cardsForChampion,
} from './data.js';
import {
  openBooster, dropRates, planBoosters, seededRandom,
} from './booster.js';
import {
  createGame, advance, program, answer, deckProblems, HAND_MAX, SUDDEN_DEATH_TURN,
} from './engine.js';
import {
  autoDeck, botAct, botOrder, autoDecide, LEVELS,
} from './bot.js';
import {
  cardsCsv, figmaCsv, quantitiesCsv, compositionCsv, orderSummary,
} from './csv.js';

const $main = document.getElementById('main');
const $nav = document.getElementById('nav');
const $modal = document.getElementById('modal');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---- sauvegarde locale ---------------------------------------------------------------------

const STORE = 'collision-tcg';
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
// En ligne, toutes les cartes sont accessibles : on garde seulement les decks et les préférences.
const store = {
  decks: [], level: 'normal', speed: 'normal', ...loadStore(),
};
function saveStore() {
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { /* stockage indisponible : la partie continue */ }
}
const deckPlayable = (d) => !deckProblems(d.champion, d.cards).length;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; }, 2400);
}

// ---- dessin des cartes ------------------------------------------------------------------------

function cardHtml(card, { cls = '', badge = '', attrs = '', version = 'normale' } = {}) {
  const color = COLORS[card.couleur];
  if (version === 'alternative') cls += ' alt';
  const value = card.valeur === null ? '' : `<span class="tc-val">${esc(card.valeur)}</span>`;
  return `<div class="tc t-${card.type} ${cls}" style="--c:${color.hex};--cd:${color.dark}" title="${esc(card.nom)} : ${esc(card.effet || TYPES[card.type].nom)}" ${attrs}>
    <div class="tc-head"><span class="tc-name">${esc(card.nom)}</span>${value}</div>
    <div class="tc-art">${card.art}</div>
    <div class="tc-type">${TYPES[card.type].icone} ${TYPES[card.type].nom} · ${color.emoji}</div>
    <div class="tc-text">${esc(card.effet) || '<span class="tc-none">—</span>'}</div>
    <div class="tc-foot"><span>${String(card.numero).padStart(3, '0')}</span><span>${version === 'alternative' ? '❖ ' : ''}${RARITIES[card.rarete].symbole}</span></div>
    ${badge}
  </div>`;
}

function championHtml(c, { cls = '', badge = '', attrs = '', version = 'normale' } = {}) {
  const [a, b] = c.couleurs.map((k) => COLORS[k]);
  if (version === 'alternative') cls += ' alt';
  return `<div class="tc champ ${cls}" style="--c:${a.hex};--c2:${b.hex};--cd:${a.dark}" title="${esc(c.nom)}" ${attrs}>
    <div class="tc-head"><span class="tc-name">${esc(c.nom)}</span><span class="tc-pv">❤️ ${c.pv}</span></div>
    <div class="tc-art">${c.art}</div>
    <div class="tc-type">${a.emoji} ${a.nom} · ${b.emoji} ${b.nom}</div>
    <div class="tc-text"><strong>${esc(c.pouvoir)}</strong> <em>(${esc(rhythmLabel(c.rythme))})</em><br>${esc(c.texte)}</div>
    <div class="tc-foot"><span>C${String(c.numero - 100).padStart(2, '0')}</span><span>${version === 'alternative' ? '❖ ' : ''}Personnage</span></div>
    ${badge}
  </div>`;
}

/** Carte marqueur : on y suit ses PV, son armure (bouclier) et le tour avec des jetons ou des trombones. */
function markerHtml(m, { cls = '', badge = '', attrs = '' } = {}) {
  const color = COLORS[m.couleur];
  const track = (label, from, to) => `<div class="mk-track"><span class="mk-label">${label}</span><div class="mk-cells">${Array.from({ length: to - from + 1 }, (_, k) => `<i>${from + k}</i>`).join('')}</div></div>`;
  return `<div class="tc marker ${cls}" style="--c:${color.hex};--cd:${color.dark}" title="${esc(m.nom)}" ${attrs}>
    <div class="tc-head"><span class="tc-name">${m.art} ${esc(m.nom)}</span></div>
    ${track('❤️ PV', 0, 29)}
    ${track('🛡️ Armure', 0, 10)}
    ${track('⏳ Tour', 1, 12)}
    <div class="tc-foot"><span>M${String(m.numero - 200).padStart(2, '0')}</span><span>Marqueur</span></div>
    ${badge}
  </div>`;
}

/** N'importe quelle carte du jeu (carte, champion ou marqueur) d'après son id. */
function anyCardHtml(kind, id, opts = {}) {
  if (kind === 'champion') return championHtml(CHAMPION_BY_ID[id], opts);
  if (kind === 'marker') return markerHtml(MARKER_BY_ID[id], opts);
  return cardHtml(CARD_BY_ID[id], opts);
}

const backHtml = (cls = '', attrs = '') => `<div class="tc back ${cls}" ${attrs}><div class="back-logo">⚛️<br><span>${esc(GAME_NAME)}</span></div></div>`;

// ---- navigation ------------------------------------------------------------------------------

const VIEWS = {
  home: ['🏠', 'Accueil'], play: ['⚔️', 'Jouer'], collection: ['📚', 'Collection'], decks: ['🃏', 'Decks'],
  print: ['🖨️', 'Imprimer'], balance: ['📊', 'Équilibrage'], rules: ['📖', 'Règles'],
};
let view = 'home';
const ui = {};

function go(name, opts = {}) {
  if (game && name !== 'play' && game.s.phase !== 'over' && !opts.force) {
    if (!confirm('Quitter la partie en cours ?')) return;
    stopGame();
  }
  view = name;
  renderNav();
  render();
  window.scrollTo(0, 0);
}

function renderNav() {
  $nav.innerHTML = Object.entries(VIEWS).map(([k, [icon, label]]) => `<button class="${view === k ? 'on' : ''}" data-go="${k}">${icon} <span>${label}</span></button>`).join('');
}

function render() {
  ({
    home: renderHome, play: renderPlay, collection: renderCollection, decks: renderDecks, print: renderPrint, balance: renderBalance, rules: renderRules,
  })[view]();
}

document.addEventListener('click', (e) => {
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) { go(goBtn.dataset.go); return; }
  const act = e.target.closest('[data-act]');
  if (act && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act](act, e);
});
document.addEventListener('change', (e) => {
  const act = e.target.closest('[data-change]');
  if (act && ACTIONS[act.dataset.change]) ACTIONS[act.dataset.change](act, e);
});
document.addEventListener('input', (e) => {
  const act = e.target.closest('[data-input]');
  if (act && ACTIONS[act.dataset.input]) ACTIONS[act.dataset.input](act, e);
});

const ACTIONS = {};

// ---- accueil ---------------------------------------------------------------------------------

function renderHome() {
  const sample = ['VI03', 'BL02', 'NO07', 'RO04', 'JA02'].map((id) => CARD_BY_ID[id]);
  $main.innerHTML = `
    <section class="hero">
      <h1>⚛️ ${esc(GAME_NAME)}</h1>
      <p class="lead">Chaque tour, empile toute ta main face cachée. Les deux piles entrent en <strong>collision</strong>, carte contre carte. Tu connais les cartes de ton adversaire : devine dans quel ordre il les joue.</p>
      <div class="row center">
        <button class="btn big accent" data-go="play">⚔️ Jouer contre le bot</button>
        <button class="btn big" data-go="decks">🃏 Construire un deck</button>
      </div>
      <div class="fan">${sample.map((x) => cardHtml(x)).join('')}</div>
    </section>
    <section class="panel">
      <h2>Ce qu'il y a dans ce prototype</h2>
      <ul>
        <li><strong>⚔️ Jouer</strong> : choisis ton deck et affronte le bot (3 niveaux) sur un champ de bataille aux couleurs des deux champions.</li>
        <li><strong>📚 Collection</strong> : les ${CARDS.length} cartes, les ${CHAMPIONS.length} personnages et les ${MARKERS.length} marqueurs, toutes disponibles en ligne.</li>
        <li><strong>🃏 Decks</strong> : 20 cartes des 2 couleurs de ton champion, 2 exemplaires maximum.</li>
        <li><strong>🖨️ Imprimer</strong> : des planches au format carte (63 × 88 mm), le CSV de toutes les cartes avec leurs taux de drop, et la simulation d’un booster de l’édition papier.</li>
        <li><strong>📊 Équilibrage</strong> : des centaines de parties entre bots, pour voir quels champions et quelles cartes gagnent trop.</li>
      </ul>
      <p class="muted small">Tout est enregistré dans ce navigateur. Le nom « ${esc(GAME_NAME)} » est provisoire.</p>
    </section>`;
}

// ---- collection ------------------------------------------------------------------------------

ui.filter = { color: '', type: '', q: '' };

function renderCollection() {
  const f = ui.filter;
  const list = CARDS.filter((x) => (!f.color || x.couleur === f.color) && (!f.type || x.type === f.type)
    && (!f.q || `${x.nom} ${x.effet}`.toLowerCase().includes(f.q.toLowerCase())));
  $main.innerHTML = `
    <div class="toolbar">
      <h1>📚 Collection</h1>
      <span class="muted">${CARDS.length} cartes · ${CHAMPIONS.length} personnages · ${MARKERS.length} marqueurs, toutes disponibles en ligne</span>
    </div>
    <div class="filters">
      <button class="chip ${!f.color ? 'on' : ''}" data-act="filterColor" data-v="">Toutes</button>
      ${Object.entries(COLORS).map(([k, c]) => `<button class="chip ${f.color === k ? 'on' : ''}" data-act="filterColor" data-v="${k}">${c.emoji} ${c.nom}</button>`).join('')}
      <span class="sep"></span>
      <button class="chip ${!f.type ? 'on' : ''}" data-act="filterType" data-v="">Tous types</button>
      ${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${f.type === k ? 'on' : ''}" data-act="filterType" data-v="${k}">${t.icone} ${t.nom}</button>`).join('')}
      <input type="search" placeholder="Rechercher…" value="${esc(f.q)}" data-input="filterQ" id="filterQ">
    </div>
    <div class="grid">${list.map((x) => cardHtml(x, { attrs: `data-act="showCard" data-id="${x.id}"` })).join('') || '<p class="muted">Aucune carte.</p>'}</div>
    <h2>👤 Personnages</h2>
    <div class="grid">${CHAMPIONS.map((c) => championHtml(c)).join('')}</div>
    <h2>🎯 Marqueurs</h2>
    <p class="muted small">Pour les parties sur table : pose un jeton (ou un trombone) sur tes PV, ton armure et le tour en cours.</p>
    <div class="grid">${MARKERS.map((m) => markerHtml(m)).join('')}</div>`;
  const q = document.getElementById('filterQ');
  if (ui.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); ui.focusQ = false; }
}

ACTIONS.filterColor = (el) => { ui.filter.color = el.dataset.v; render(); };
ACTIONS.filterType = (el) => { ui.filter.type = el.dataset.v; render(); };
ACTIONS.filterQ = (el) => { ui.filter.q = el.value; ui.focusQ = true; render(); };
/** Simule l'ouverture d'un booster de l'édition papier : 1 marqueur, 1 personnage, 6 communes, 2 peu communes, 1 rare. */
ACTIONS.booster = () => {
  const cards = openBooster();
  openModal(`<h2>🎁 Booster de l’édition papier</h2>
    <p class="muted small">Clique sur les cartes pour les retourner, dans l’ordre : la rare est la dernière.</p>
    <div class="booster">${cards.map((x, k) => `<div class="flip-wrap"><div class="flip ${x.version === 'alternative' ? 'is-alt' : ''}" data-act="flip" style="--d:${k * 90}ms"><div class="flip-in">${backHtml('face back-face')}${anyCardHtml(x.kind, x.id, { cls: 'face front-face', version: x.version })}</div></div><span class="small muted">${esc(x.slot)}${x.version === 'alternative' ? ' · ❖ Alternative' : ''}</span></div>`).join('')}</div>
    <div class="row center"><button class="btn" data-act="flipAll">Tout retourner</button><button class="btn accent" data-act="closeModal">Fermer</button></div>`);
};
ACTIONS.flip = (el) => el.classList.add('done');
ACTIONS.flipAll = () => document.querySelectorAll('.flip').forEach((x) => x.classList.add('done'));

// ---- fenêtre modale ---------------------------------------------------------------------------

let onModalClose = null;
function openModal(html, onClose = null, { closable = true } = {}) {
  $modal.innerHTML = `<div class="modal-box">${closable ? '<button class="modal-x" data-act="closeModal" aria-label="Fermer">✕</button>' : ''}${html}</div>`;
  $modal.hidden = false;
  onModalClose = onClose;
}
function closeModal() {
  $modal.hidden = true;
  $modal.innerHTML = '';
  const fn = onModalClose;
  onModalClose = null;
  if (fn) fn();
}
ACTIONS.closeModal = closeModal;

// ---- decks -----------------------------------------------------------------------------------

/** Les decks de base (un par champion) puis les decks du joueur. */
function allDecks() {
  const base = CHAMPIONS.map((c) => ({ id: `base-${c.id}`, name: `${c.nom} (deck de base)`, champion: c.id, cards: autoDeck(c.id), base: true }));
  return [...store.decks, ...base];
}
const deckById = (id) => allDecks().find((d) => d.id === id);

function deckStats(cards) {
  const byType = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0]));
  for (const id of cards) byType[CARD_BY_ID[id].type] += 1;
  return byType;
}

function renderDecks() {
  if (ui.editing) { renderDeckEditor(); return; }
  $main.innerHTML = `
    <div class="toolbar"><h1>🃏 Decks</h1><button class="btn accent" data-act="newDeck">➕ Nouveau deck</button></div>
    ${store.decks.length ? '' : '<p class="panel muted">Tu n’as pas encore de deck à toi. Crée-en un, ou copie un deck de base pour le modifier.</p>'}
    <div class="deck-list">${allDecks().map((d) => {
    const c = CHAMPION_BY_ID[d.champion];
    const st = deckStats(d.cards);
    const problems = deckProblems(d.champion, d.cards);
    return `<div class="deck-item ${d.base ? 'base' : ''}">
        ${championHtml(c, { cls: 'mini' })}
        <div class="deck-info">
          <strong>${esc(d.name)}</strong>
          <span class="muted small">${d.cards.length} cartes · ${Object.entries(st).map(([k, n]) => `${TYPES[k].icone} ${n}`).join(' · ')}</span>
          ${problems.length ? `<span class="bad small">⚠️ ${esc(problems[0])}</span>` : ''}
          <div class="row">
            ${d.base ? `<button class="btn sm" data-act="copyDeck" data-id="${d.id}">📋 Copier pour modifier</button>`
    : `<button class="btn sm" data-act="editDeck" data-id="${d.id}">✏️ Modifier</button><button class="btn sm ghost" data-act="deleteDeck" data-id="${d.id}">🗑️</button>`}
            <button class="btn sm accent" data-act="playDeck" data-id="${d.id}" ${deckPlayable(d) ? '' : 'disabled'}>⚔️ Jouer</button>
          </div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

ACTIONS.newDeck = () => { ui.editing = { id: null, name: '', champion: null, cards: [] }; render(); };
ACTIONS.copyDeck = (el) => {
  const d = deckById(el.dataset.id);
  ui.editing = { id: null, name: `Mon deck ${CHAMPION_BY_ID[d.champion].nom}`, champion: d.champion, cards: [...d.cards] };
  render();
};
ACTIONS.editDeck = (el) => {
  const d = deckById(el.dataset.id);
  ui.editing = { id: d.id, name: d.name, champion: d.champion, cards: [...d.cards] };
  render();
};
ACTIONS.deleteDeck = (el) => {
  if (!confirm('Supprimer ce deck ?')) return;
  store.decks = store.decks.filter((d) => d.id !== el.dataset.id);
  saveStore();
  render();
};
ACTIONS.playDeck = (el) => { ui.setup = { ...(ui.setup || {}), deckId: el.dataset.id }; go('play'); };

function renderDeckEditor() {
  const ed = ui.editing;
  if (!ed.champion) {
    $main.innerHTML = `<div class="toolbar"><h1>🃏 Choisis ton champion</h1><button class="btn ghost" data-act="cancelEdit">Annuler</button></div>
      <p class="muted">Ton deck se compose des cartes de ses 2 couleurs.</p>
      <div class="grid">${CHAMPIONS.map((c) => championHtml(c, { cls: 'pick', attrs: `data-act="pickChampion" data-id="${c.id}"` })).join('')}</div>`;
    return;
  }
  const c = CHAMPION_BY_ID[ed.champion];
  const pool = cardsForChampion(c);
  const counts = {};
  for (const id of ed.cards) counts[id] = (counts[id] || 0) + 1;
  const st = deckStats(ed.cards);
  const problems = deckProblems(ed.champion, ed.cards);
  $main.innerHTML = `
    <div class="toolbar">
      <h1>🃏 ${esc(ed.name || 'Nouveau deck')}</h1>
      <div class="row"><button class="btn ghost" data-act="cancelEdit">Annuler</button><button class="btn accent" data-act="saveDeck" ${problems.length ? 'disabled' : ''}>💾 Enregistrer</button></div>
    </div>
    <div class="editor">
      <aside class="panel side">
        ${championHtml(c)}
        <button class="btn sm ghost" data-act="changeChampion">Changer de champion</button>
        <label class="field">Nom du deck<input type="text" id="deckName" value="${esc(ed.name)}" data-input="deckName" placeholder="Mon deck"></label>
        <div class="meter"><div style="width:${(100 * ed.cards.length) / DECK_SIZE}%"></div></div>
        <strong class="${ed.cards.length === DECK_SIZE ? 'good' : ''}">${ed.cards.length} / ${DECK_SIZE} cartes</strong>
        <div class="types">${Object.entries(st).map(([k, n]) => `<span>${TYPES[k].icone} ${TYPES[k].nom} <b>${n}</b></span>`).join('')}</div>
        ${problems.length && ed.cards.length === DECK_SIZE ? `<p class="bad small">${problems.map(esc).join('<br>')}</p>` : ''}
        <div class="row"><button class="btn sm" data-act="autoFill">✨ Compléter</button><button class="btn sm ghost" data-act="clearDeck">Vider</button></div>
        <p class="muted small">Clique sur une carte pour l’ajouter, sur ses boutons pour en enlever.</p>
      </aside>
      <div class="grid">${pool.map((x) => {
    const n = counts[x.id] || 0;
    const max = MAX_COPIES;
    return `<div class="pickable ${n ? 'in' : ''}">
          ${cardHtml(x, { attrs: `data-act="addCard" data-id="${x.id}"`, badge: n ? `<span class="count">×${n}</span>` : '' })}
          <div class="row center"><button class="btn sm" data-act="removeCard" data-id="${x.id}" ${n ? '' : 'disabled'}>−</button><span class="small">${n} / ${max}</span><button class="btn sm" data-act="addCard" data-id="${x.id}" ${n < max && ed.cards.length < DECK_SIZE ? '' : 'disabled'}>+</button></div>
        </div>`;
  }).join('')}</div>
    </div>`;
  if (ui.focusName) {
    const el = document.getElementById('deckName');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    ui.focusName = false;
  }
}

ACTIONS.cancelEdit = () => { ui.editing = null; render(); };
ACTIONS.pickChampion = (el) => {
  const ed = ui.editing;
  ed.champion = el.dataset.id;
  ed.cards = ed.cards.filter((id) => CHAMPION_BY_ID[ed.champion].couleurs.includes(CARD_BY_ID[id].couleur));
  if (!ed.name) ed.name = `Mon deck ${CHAMPION_BY_ID[ed.champion].nom}`;
  render();
};
ACTIONS.changeChampion = () => { ui.editing.champion = null; render(); };
ACTIONS.deckName = (el) => { ui.editing.name = el.value; ui.focusName = true; render(); };
ACTIONS.addCard = (el) => {
  const ed = ui.editing;
  const id = el.dataset.id;
  const n = ed.cards.filter((x) => x === id).length;
  if (ed.cards.length >= DECK_SIZE) { toast(`Le deck a déjà ${DECK_SIZE} cartes.`); return; }
  if (n >= MAX_COPIES) { toast('2 exemplaires au plus.'); return; }
  ed.cards.push(id);
  ed.cards.sort((a, b) => CARD_BY_ID[a].numero - CARD_BY_ID[b].numero);
  render();
};
ACTIONS.removeCard = (el) => {
  const ed = ui.editing;
  const k = ed.cards.indexOf(el.dataset.id);
  if (k >= 0) ed.cards.splice(k, 1);
  render();
};
ACTIONS.clearDeck = () => { ui.editing.cards = []; render(); };
ACTIONS.autoFill = () => {
  const ed = ui.editing;
  const best = autoDeck(ed.champion, null, { rng: Date.now() | 0 });
  const counts = {};
  for (const id of ed.cards) counts[id] = (counts[id] || 0) + 1;
  for (const id of best) {
    if (ed.cards.length >= DECK_SIZE) break;
    if ((counts[id] || 0) < MAX_COPIES) { ed.cards.push(id); counts[id] = (counts[id] || 0) + 1; } else counts[id] -= 1;
  }
  for (const x of cardsForChampion(CHAMPION_BY_ID[ed.champion])) {
    while (ed.cards.length < DECK_SIZE && ed.cards.filter((y) => y === x.id).length < MAX_COPIES) ed.cards.push(x.id);
  }
  ed.cards.sort((a, b) => CARD_BY_ID[a].numero - CARD_BY_ID[b].numero);
  render();
};
ACTIONS.saveDeck = () => {
  const ed = ui.editing;
  const deck = { id: ed.id || `d${Date.now().toString(36)}`, name: ed.name.trim() || `Mon deck ${CHAMPION_BY_ID[ed.champion].nom}`, champion: ed.champion, cards: [...ed.cards] };
  const k = store.decks.findIndex((d) => d.id === deck.id);
  if (k >= 0) store.decks[k] = deck; else store.decks.unshift(deck);
  saveStore();
  ui.editing = null;
  toast('Deck enregistré 💾');
  render();
};

// ---- partie : préparation -------------------------------------------------------------------

let game = null;

function renderPlay() {
  if (game) { renderBattle(); return; }
  const decks = allDecks().filter(deckPlayable);
  const setup = ui.setup = { deckId: decks[0]?.id, opponent: 'random', level: store.level, ...(ui.setup || {}) };
  if (!decks.some((d) => d.id === setup.deckId)) setup.deckId = decks[0]?.id;
  const mine = deckById(setup.deckId);
  $main.innerHTML = `
    <h1>⚔️ Nouvelle partie</h1>
    <div class="setup">
      <section class="panel">
        <h2>1. Ton deck</h2>
        <select data-change="setupDeck">${decks.map((d) => `<option value="${d.id}" ${d.id === setup.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
        ${mine ? championHtml(CHAMPION_BY_ID[mine.champion]) : '<p class="muted">Aucun deck valide : crée-en un dans 🃏 Decks.</p>'}
      </section>
      <section class="panel">
        <h2>2. Ton adversaire</h2>
        <div class="opp-pick">
          <button class="chip ${setup.opponent === 'random' ? 'on' : ''}" data-act="setupOpp" data-v="random">🎲 Au hasard</button>
          ${CHAMPIONS.map((c) => `<button class="chip ${setup.opponent === c.id ? 'on' : ''}" data-act="setupOpp" data-v="${c.id}" title="${esc(c.pouvoir)} : ${esc(c.texte)}">${c.art} ${esc(c.nom)}</button>`).join('')}
        </div>
        <h2>3. Niveau du bot</h2>
        <div class="row">${Object.entries(LEVELS).map(([k, l]) => `<button class="chip ${setup.level === k ? 'on' : ''}" data-act="setupLevel" data-v="${k}">${l.label}</button>`).join('')}</div>
        <p class="muted small">Facile : il joue au hasard. Normal et Difficile : il simule des tours contre ce qu’il sait de ta main.</p>
        <button class="btn big accent" data-act="startGame" ${mine ? '' : 'disabled'}>⚔️ Combattre</button>
      </section>
    </div>`;
}

ACTIONS.setupDeck = (el) => { ui.setup.deckId = el.value; render(); };
ACTIONS.setupOpp = (el) => { ui.setup.opponent = el.dataset.v; render(); };
ACTIONS.setupLevel = (el) => { ui.setup.level = el.dataset.v; store.level = el.dataset.v; saveStore(); render(); };

ACTIONS.startGame = () => {
  const mine = deckById(ui.setup.deckId);
  const oppId = ui.setup.opponent === 'random' ? CHAMPIONS[Math.floor(Math.random() * CHAMPIONS.length)].id : ui.setup.opponent;
  const s = createGame({
    players: [
      { championId: mine.champion, deck: mine.cards, name: CHAMPION_BY_ID[mine.champion].nom },
      { championId: oppId, deck: autoDeck(oppId, null, { rng: Date.now() | 0 }), name: `${CHAMPION_BY_ID[oppId].nom}${oppId === mine.champion ? ' (bot)' : ''}` },
    ],
    seed: Date.now() | 0,
  });
  game = { s, me: 0, bot: 1, level: ui.setup.level, order: [], busy: false, flash: null, timer: null };
  pump();
};

function stopGame() {
  if (game) clearTimeout(game.timer);
  game = null;
  closeModal();
}

// ---- partie : déroulement ---------------------------------------------------------------------

const DELAYS = { lent: 1800, normal: 1000, rapide: 450 };

/** Fait avancer la partie jusqu'à ce qu'il faille le joueur, en animant les duels. */
function pump() {
  if (!game) return;
  const { s } = game;
  clearTimeout(game.timer);
  for (let guard = 0; guard < 100; guard++) {
    const r = advance(s);
    if (r.type === 'decision') {
      if (s.pending.some((d) => d.player === game.bot)) { botAct(s, game.bot, game.level); continue; }
      renderBattle();
      askDecision(s.pending.find((d) => d.player === game.me));
      return;
    }
    if (r.type === 'program') {
      if (!s.players[game.bot].programmed) {
        game.thinking = true;
        renderBattle();
        game.timer = setTimeout(() => {
          if (!game) return;
          program(s, game.bot, botOrder(s, game.bot, game.level));
          game.thinking = false;
          game.order = [];
          pump();
        }, 60);
        return;
      }
      renderBattle();
      return;
    }
    if (r.type === 'duel') {
      renderBattle();
      game.timer = setTimeout(pump, DELAYS[store.speed] || 1000);
      return;
    }
    if (r.type === 'turn-end') {
      game.flash = `Fin du tour ${s.turn}`;
      renderBattle();
      game.timer = setTimeout(() => { if (game) { game.flash = null; pump(); } }, (DELAYS[store.speed] || 1000) + 300);
      return;
    }
    if (r.type === 'over') { renderBattle(); showGameOver(); return; }
  }
}

function askDecision(d) {
  const { s } = game;
  const p = s.players[game.me];
  const o = s.players[game.bot];
  if (d.kind === 'discard' || d.kind === 'prospect') {
    ui.picked = [];
    const many = d.kind === 'prospect';
    openModal(`<h2>${many ? '🧭 Prospection' : '♻️ Défausse obligatoire'}</h2>
      <p>${many ? `Choisis jusqu’à ${d.max} cartes à défausser : tu en pioches autant.` : `Ta main a atteint ${p.hand.length} cartes : choisis 1 carte à défausser <strong>face cachée</strong>, tu en pioches une autre.`}</p>
      <div class="hand-pick">${p.hand.map((x) => cardHtml(CARD_BY_ID[x.id], { attrs: `data-act="pickDiscard" data-uid="${x.uid}" data-max="${many ? d.max : 1}"` })).join('')}</div>
      <div class="row center"><button class="btn accent" data-act="confirmDiscard" ${many ? '' : 'disabled'} id="confirmDiscard">${many ? 'Valider' : 'Défausser'}</button></div>`, null, { closable: false });
    return;
  }
  if (d.kind === 'ban') {
    const theirs = CARD_BY_ID[d.id];
    const mine = s.duel.eff[game.me] && CARD_BY_ID[s.duel.eff[game.me]];
    openModal(`<h2>👑 Décret impérial ?</h2>
      <p>${esc(o.name)} révèle <strong>${esc(theirs.nom)}</strong>. Tu peux l’annuler (encore ${p.uses} décret${p.uses > 1 ? 's' : ''} dans la partie).</p>
      <div class="vs">${mine ? cardHtml(mine) : backHtml()}<span>contre</span>${cardHtml(theirs)}</div>
      <div class="row center"><button class="btn accent" data-act="decide" data-v="1">👑 Annuler cette carte</button><button class="btn" data-act="decide" data-v="0">Laisser passer</button></div>`, null, { closable: false });
    return;
  }
  if (d.kind === 'swap') {
    const seen = o.pile.slice(d.at, d.at + 2).map((x) => (p.seen.includes(x.uid) ? cardHtml(CARD_BY_ID[x.id]) : backHtml()));
    const mine = [p.pile[d.at], p.pile[d.at + 1]].map((x) => cardHtml(CARD_BY_ID[x.id]));
    openModal(`<h2>🔀 ${esc(d.source)}</h2>
      <p>Voici les prochaines cartes de ${esc(o.name)} (celles que tu as vues), et tes 2 prochaines cartes. Les échanger ?</p>
      <div class="swap"><div><span class="muted small">${esc(o.name)}</span><div class="row">${seen.join('')}</div></div><div><span class="muted small">Toi</span><div class="row">${mine.join('')}</div></div></div>
      <div class="row center"><button class="btn accent" data-act="decide" data-v="1">🔀 Échanger</button><button class="btn" data-act="decide" data-v="0">Garder l’ordre</button></div>`, null, { closable: false });
  }
}

ACTIONS.pickDiscard = (el) => {
  const uid = el.dataset.uid;
  const max = Number(el.dataset.max);
  if (ui.picked.includes(uid)) ui.picked = ui.picked.filter((u) => u !== uid);
  else if (max === 1) ui.picked = [uid];
  else if (ui.picked.length < max) ui.picked.push(uid);
  document.querySelectorAll('.hand-pick .tc').forEach((x) => x.classList.toggle('picked', ui.picked.includes(x.dataset.uid)));
  const btn = document.getElementById('confirmDiscard');
  if (max === 1) btn.disabled = ui.picked.length !== 1;
  else btn.textContent = ui.picked.length ? `Défausser ${ui.picked.length} carte${ui.picked.length > 1 ? 's' : ''}` : 'Garder ma main';
};
ACTIONS.confirmDiscard = () => {
  answer(game.s, game.me, ui.picked);
  closeModal();
  pump();
};
ACTIONS.decide = (el) => {
  answer(game.s, game.me, el.dataset.v === '1');
  closeModal();
  pump();
};

function showGameOver() {
  const { s } = game;
  const win = s.winner === game.me;
  const title = s.winner === 'draw' ? '🤝 Égalité' : win ? '🏆 Victoire !' : '💀 Défaite';
  openModal(`<h2 class="center">${title}</h2>
    <p class="center">${s.winner === 'draw' ? 'Les deux champions tombent ensemble.' : win ? `Tu as battu ${esc(s.players[game.bot].name)} en ${s.turn} tours.` : `${esc(s.players[game.bot].name)} t’a battu en ${s.turn} tours.`}</p>
    <div class="row center"><button class="btn accent" data-act="rematch">🔁 Revanche</button><button class="btn" data-act="newSetup">Changer de partie</button></div>`);
}
ACTIONS.rematch = () => { closeModal(); stopGame(); ACTIONS.startGame(); };
ACTIONS.newSetup = () => { closeModal(); stopGame(); render(); };
ACTIONS.quitGame = () => { if (confirm('Abandonner la partie ?')) { stopGame(); render(); } };
ACTIONS.speed = (el) => { store.speed = el.dataset.v; saveStore(); renderBattle(); };

// ---- champ de bataille ----------------------------------------------------------------------

function statusHtml(p) {
  const f = p.flags;
  const c = CHAMPION_BY_ID[p.championId];
  const chips = [];
  if (p.shield) chips.push(`<span class="st sh" title="Bouclier">🛡️ ${p.shield}</span>`);
  if (f.poison) chips.push(`<span class="st" title="Poison : perd 1 PV à la fin des prochains duels">☠️ ${f.poison}</span>`);
  if (f.frozen) chips.push('<span class="st" title="Sa prochaine carte sera annulée">🥶 Gelé</span>');
  if (f.curse) chips.push(`<span class="st" title="Ni bouclier ni soin">💀 ${f.curse}</span>`);
  if (f.attackBonus) chips.push(`<span class="st" title="Prochaine Attaque">⚡ +${f.attackBonus}</span>`);
  if (f.attackDouble || f.nextDouble) chips.push('<span class="st" title="Prochaine Attaque doublée">✖️2</span>');
  if (f.blind) chips.push(`<span class="st" title="Prochaine Attaque affaiblie">😎 −${f.blind}</span>`);
  if (f.valueMinus) chips.push(`<span class="st" title="Prochaine carte">🌱 −${f.valueMinus}</span>`);
  if (f.noDamageNext) chips.push('<span class="st" title="Aucun dégât au prochain duel">🐈 Neuf vies</span>');
  if (f.keepShield) chips.push('<span class="st" title="Bouclier gardé au tour suivant">🌐</span>');
  const r = c.rythme;
  let power = '';
  if (['cartes', 'attaques', 'annulations'].includes(r.kind)) {
    power = `<span class="pips" title="${esc(c.pouvoir)} : ${esc(rhythmLabel(r))}">${Array.from({ length: r.n }, (_, k) => `<i class="${k < p.charge ? 'on' : ''}"></i>`).join('')}</span>`;
  } else if (r.kind === 'fois') power = `<span class="st" title="${esc(c.pouvoir)}">${c.art} ×${p.uses}</span>`;
  else if (r.kind === 'tours') power = `<span class="st" title="${esc(c.pouvoir)}">${c.art} tour ${Math.ceil((game.s.turn || 1) / r.n) * r.n}</span>`;
  return `<div class="power"><span class="pname">${c.art} ${esc(c.pouvoir)}</span>${power}</div><div class="sts">${chips.join('')}</div>`;
}

function heroHtml(p, side) {
  const c = CHAMPION_BY_ID[p.championId];
  const pct = Math.max(0, (100 * p.pv) / p.maxPv);
  return `<div class="hero-bar ${side}">
    <div class="avatar" style="--c:${COLORS[c.couleurs[0]].hex};--c2:${COLORS[c.couleurs[1]].hex}" data-act="showChampion" data-id="${c.id}">${c.art}</div>
    <div class="hero-main">
      <div class="hero-name"><strong>${side === 'me' ? 'Toi' : esc(p.name)}</strong> <span class="muted small">${side === 'me' ? esc(c.nom) : '🤖 bot'}</span></div>
      <div class="pv"><div class="pv-fill" style="width:${pct}%"></div><span>❤️ ${Math.max(0, p.pv)} / ${p.maxPv}</span></div>
      ${statusHtml(p)}
    </div>
    <div class="hero-side small muted">🂠 ${p.deck.length}<br>✋ ${p.programmed ? p.pile.length : p.hand.length}</div>
  </div>`;
}

ACTIONS.showChampion = (el) => openModal(`<div class="center">${championHtml(CHAMPION_BY_ID[el.dataset.id], { cls: 'big' })}</div>`);
ACTIONS.showCard = (el) => openModal(`<div class="center">${cardHtml(CARD_BY_ID[el.dataset.id], { cls: 'big' })}</div>`);

function renderBattle() {
  if (!game) { renderPlay(); return; }
  const { s } = game;
  const me = s.players[game.me];
  const opp = s.players[game.bot];
  const [m1, m2] = CHAMPION_BY_ID[me.championId].couleurs.map((k) => COLORS[k]);
  const [o1, o2] = CHAMPION_BY_ID[opp.championId].couleurs.map((k) => COLORS[k]);
  const programming = s.phase === 'program' && !me.programmed;
  const resolving = s.phase === 'resolve' || (s.phase === 'over' && s.turnDuels.length);
  const revealed = s.duel ? s.duel.i + 1 : s.duelIndex;
  const results = Object.fromEntries(s.turnDuels.map((d) => [d.i, d]));
  if (s.duel) results[s.duel.i] = { cancelled: s.duel.cancelled, eff: s.duel.eff, cancelBy: s.duel.cancelBy };

  // Les deux piles, en colonnes : une colonne = un duel.
  let columns = '';
  if (programming) {
    const order = game.order.map((u) => me.hand.find((x) => x.uid === u));
    const n = me.hand.length;
    columns = Array.from({ length: n }, (_, k) => {
      const mine = order[k];
      return `<div class="col">
        <div class="slot">${opp.programmed ? backHtml('sm') : backHtml('sm ghost-card')}</div>
        <div class="num">${k + 1}</div>
        <div class="slot drop" data-slot="${k}">${mine ? cardHtml(CARD_BY_ID[mine.id], { cls: 'sm', attrs: `draggable="true" data-act="unpick" data-uid="${mine.uid}" data-k="${k}"` }) : '<div class="empty-slot">?</div>'}</div>
      </div>`;
    }).join('');
  } else if (resolving || s.phase === 'program') {
    const n = Math.max(me.pile.length, opp.pile.length, game.thinking ? me.hand.length : 0);
    columns = Array.from({ length: n }, (_, k) => {
      const res = results[k];
      const show = (p, side) => {
        const card = p.pile[k];
        if (!card) return '<div class="empty-slot">∅</div>';
        if (k < revealed) {
          const effId = res?.eff?.[side] || card.id;
          const cancelled = res?.cancelled?.[side];
          const copy = effId !== card.id ? `<span class="copy-badge">= ${esc(CARD_BY_ID[effId].nom)}</span>` : '';
          return cardHtml(CARD_BY_ID[card.id], { cls: `sm ${k === revealed - 1 ? 'pop' : ''} ${cancelled ? 'cancelled' : ''}`, attrs: `data-act="showCard" data-id="${card.id}"`, badge: copy + (cancelled ? `<span class="x-badge">✕ ${esc(res.cancelBy[side] || '')}</span>` : '') });
        }
        if (side === game.bot && me.seen.includes(card.uid)) return cardHtml(CARD_BY_ID[card.id], { cls: 'sm seen', badge: '<span class="eye">👁️</span>' });
        if (side === game.me) return cardHtml(CARD_BY_ID[card.id], { cls: 'sm dim' });
        return backHtml('sm');
      };
      return `<div class="col ${k === revealed - 1 ? 'current' : ''}">
        <div class="slot">${show(opp, game.bot)}</div>
        <div class="num">${k + 1}</div>
        <div class="slot">${show(me, game.me)}</div>
      </div>`;
    }).join('');
  }

  const turnLog = s.log.filter((l) => l.turn === s.turn).slice(-14);
  const knownCards = me.known.map((u) => [...opp.hand, ...opp.pile, ...opp.played, ...opp.discard, ...opp.removed].find((x) => x.uid === u)).filter(Boolean);
  const knownIds = {};
  for (const x of knownCards) if (!opp.removed.includes(x)) knownIds[x.id] = (knownIds[x.id] || 0) + 1;
  const oppHand = opp.programmed ? opp.pile.length : opp.hand.length;
  const knownTotal = Object.values(knownIds).reduce((a, b) => a + b, 0);

  let banner = '';
  if (s.phase === 'over') banner = s.winner === 'draw' ? '🤝 Égalité' : s.winner === game.me ? '🏆 Victoire !' : '💀 Défaite';
  else if (game.flash) banner = game.flash;
  else if (game.thinking) banner = '🤖 Le bot forme sa pile…';
  else if (programming) banner = `Tour ${s.turn} · forme ta pile : clique tes cartes dans l’ordre (1 = premier duel)`;
  else if (s.phase === 'resolve') banner = `Tour ${s.turn} · duel ${Math.min(revealed, Math.max(me.pile.length, opp.pile.length))} / ${Math.max(me.pile.length, opp.pile.length)}`;
  const sudden = s.turn >= SUDDEN_DEATH_TURN - 1 ? `<span class="st bad">⏳ Mort subite ${s.turn >= SUDDEN_DEATH_TURN ? 'en cours' : 'au prochain tour'}</span>` : '';

  $main.innerHTML = `
    <div class="battle" style="--m1:${m1.hex};--m2:${m2.hex};--o1:${o1.hex};--o2:${o2.hex}">
      <div class="battle-top">
        <span class="muted small">Tour ${s.turn} · main max ${HAND_MAX}</span>${sudden}
        <span class="speed">${Object.keys(DELAYS).map((k) => `<button class="chip sm ${store.speed === k ? 'on' : ''}" data-act="speed" data-v="${k}">${k}</button>`).join('')}</span>
        <button class="btn sm ghost" data-act="quitGame">Abandonner</button>
      </div>
      ${heroHtml(opp, 'opp')}
      <div class="arena">
        <div class="banner">${esc(banner)}</div>
        <div class="cols">${columns}</div>
      </div>
      ${heroHtml(me, 'me')}
      ${programming ? `
        <div class="hand">
          <div class="hand-cards">${me.hand.filter((x) => !game.order.includes(x.uid)).map((x) => cardHtml(CARD_BY_ID[x.id], { cls: 'sm', attrs: `data-act="pick" data-uid="${x.uid}"` })).join('') || '<span class="muted">Toutes tes cartes sont dans la pile.</span>'}</div>
          <div class="row center">
            <button class="btn" data-act="orderReset" ${game.order.length ? '' : 'disabled'}>↺ Tout reprendre</button>
            <button class="btn" data-act="orderRandom">🎲 Au hasard</button>
            <button class="btn accent" data-act="orderDone" ${game.order.length === me.hand.length ? '' : 'disabled'}>✅ Valider ma pile</button>
          </div>
          <p class="muted small center">Glisse les cartes de ta pile pour changer leur ordre. Clique une carte de la pile pour la reprendre.</p>
        </div>` : ''}
      <div class="info-row">
        <div class="panel known">
          <h3>🔎 Ce que tu sais de sa main</h3>
          <p class="small muted">${oppHand} carte${oppHand > 1 ? 's' : ''} en main · ${Math.min(knownTotal, oppHand)} déjà vue${knownTotal > 1 ? 's' : ''}${knownTotal > oppHand ? ' (il a peut-être défaussé une carte vue)' : ''}</p>
          <div class="known-list">${Object.entries(knownIds).map(([id, n]) => `<span class="kc" style="--c:${COLORS[CARD_BY_ID[id].couleur].hex}" data-act="showCard" data-id="${id}">${CARD_BY_ID[id].art} ${esc(CARD_BY_ID[id].nom)}${n > 1 ? ` ×${n}` : ''}</span>`).join('') || '<span class="muted small">Rien encore : c’est le premier tour.</span>'}</div>
        </div>
        <div class="panel log">
          <h3>📜 Journal du tour</h3>
          ${turnLog.map((l) => `<div class="log-line ${l.player === game.me ? 'me' : l.player === game.bot ? 'opp' : ''}">${l.duel ? `<b>${l.duel}</b> ` : ''}${esc(l.text)}</div>`).join('')}
        </div>
      </div>
    </div>`;
  if (programming) bindDrag();
}

ACTIONS.pick = (el) => {
  if (!game.order.includes(el.dataset.uid)) game.order.push(el.dataset.uid);
  renderBattle();
};
ACTIONS.unpick = (el) => {
  game.order = game.order.filter((u) => u !== el.dataset.uid);
  renderBattle();
};
ACTIONS.orderReset = () => { game.order = []; renderBattle(); };
ACTIONS.orderRandom = () => {
  const uids = game.s.players[game.me].hand.map((x) => x.uid);
  for (let i = uids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uids[i], uids[j]] = [uids[j], uids[i]];
  }
  game.order = uids;
  renderBattle();
};
ACTIONS.orderDone = () => {
  program(game.s, game.me, game.order);
  game.order = [];
  pump();
};

/** Glisser-déposer dans la pile pour changer l'ordre. */
function bindDrag() {
  let from = null;
  for (const el of document.querySelectorAll('.slot.drop .tc')) {
    el.addEventListener('dragstart', (e) => { from = Number(el.dataset.k); e.dataTransfer.effectAllowed = 'move'; });
  }
  for (const slot of document.querySelectorAll('.slot.drop')) {
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('over'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = Number(slot.dataset.slot);
      if (from === null || from === to) return;
      const order = game.order;
      const [uid] = order.splice(from, 1);
      order.splice(Math.min(to, order.length), 0, uid);
      from = null;
      renderBattle();
    });
  }
}

// ---- impression -------------------------------------------------------------------------------

ui.print = { what: 'all' };

function printList() {
  const w = ui.print.what;
  if (w === 'all') return CARDS.map((x) => ({ card: x }));
  if (w === 'playset') return CARDS.flatMap((x) => [{ card: x }, { card: x }]);
  if (w === 'champions') return CHAMPIONS.map((x) => ({ champion: x }));
  if (w === 'backs') return Array.from({ length: 9 }, () => ({ back: true }));
  if (w === 'markers') return MARKERS.map((x) => ({ marker: x }));
  const d = deckById(w);
  return d ? [{ champion: CHAMPION_BY_ID[d.champion] }, ...d.cards.map((id) => ({ card: CARD_BY_ID[id] }))] : [];
}

function renderPrint() {
  const items = printList();
  const pages = [];
  for (let k = 0; k < items.length; k += 9) pages.push(items.slice(k, k + 9));
  $main.innerHTML = `
    <div class="no-print">
      <h1>🖨️ Imprimer les cartes</h1>
      <div class="panel">
        <div class="row">
          <select data-change="printWhat">
            <option value="all" ${ui.print.what === 'all' ? 'selected' : ''}>Toutes les cartes (×1) · ${CARDS.length} cartes</option>
            <option value="playset" ${ui.print.what === 'playset' ? 'selected' : ''}>Toutes les cartes (×2) · ${CARDS.length * 2} cartes</option>
            <option value="champions" ${ui.print.what === 'champions' ? 'selected' : ''}>Les ${CHAMPIONS.length} champions</option>
            <option value="markers" ${ui.print.what === 'markers' ? 'selected' : ''}>Les ${MARKERS.length} marqueurs</option>
            <option value="backs" ${ui.print.what === 'backs' ? 'selected' : ''}>Une planche de dos</option>
            ${allDecks().map((d) => `<option value="${d.id}" ${ui.print.what === d.id ? 'selected' : ''}>Deck : ${esc(d.name)}</option>`).join('')}
          </select>
          <button class="btn accent" data-act="doPrint">🖨️ Imprimer (${items.length} cartes, ${pages.length} page${pages.length > 1 ? 's' : ''})</button>
          <button class="btn" data-act="downloadCsv">⬇️ CSV complet</button>
          <button class="btn" data-act="downloadFigma">🎨 CSV pour Figma</button>
        </div>
        <p class="muted small">Format carte à jouer : 63 × 88 mm, 9 cartes par page A4. Dans la fenêtre d’impression : échelle 100 %, marges par défaut, « graphiques d’arrière-plan » activé. Le CSV (séparateur « ; ») contient toutes les infos de chaque carte et de chaque champion, avec une colonne pour le fichier de ton illustration.</p>
      </div>
    </div>
    <details class="panel no-print"><summary><strong>📦 Édition papier : boosters et taux de drop</strong></summary>
      <p class="small">Un booster : 10 cartes (1 personnage obligatoire, les rares à la fin) + 1 carte marqueur. Les taux de chaque carte sont dans le CSV (colonnes <code>taux_par_booster</code> et <code>taux_alternative</code>).</p>
      <table>${dropRates().map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td></tr>`).join('')}</table>
      <p class="row"><button class="btn" data-act="booster">🎁 Simuler l’ouverture d’un booster</button></p>
      <h3>📦 Commande pour l’imprimeur</h3>
      <p class="small muted">Prépare des boosters qui respectent exactement les taux, sans doublon dans un même booster, et télécharge 3 fichiers : les quantités à imprimer, le contenu de chaque booster et un résumé à envoyer.</p>
      <div class="row">
        <label class="field inline">Nombre de boosters<input type="number" id="orderCount" min="1" max="100000" value="${ui.orderCount || 100}"></label>
        <label class="field inline">Graine (facultatif)<input type="number" id="orderSeed" placeholder="au hasard" value="${ui.orderSeed ?? ''}"></label>
        <button class="btn accent" data-act="prepareOrder">📦 Préparer la commande</button>
      </div>
    </details>
    <div class="sheets">${pages.map((page) => `<div class="sheet">${page.map((it) => (it.back ? backHtml('print') : it.marker ? markerHtml(it.marker, { cls: 'print' }) : it.champion ? championHtml(it.champion, { cls: 'print' }) : cardHtml(it.card, { cls: 'print' }))).join('')}</div>`).join('')}</div>`;
}

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

ACTIONS.prepareOrder = () => {
  const n = Math.floor(Number(document.getElementById('orderCount').value));
  const seedText = document.getElementById('orderSeed').value;
  if (!n || n < 1 || n > 100000) { toast('Indique un nombre de boosters entre 1 et 100 000.'); return; }
  const seed = seedText === '' ? Math.floor(Math.random() * 1e9) : Math.floor(Number(seedText));
  ui.orderCount = n;
  ui.orderSeed = seedText === '' ? null : seed;
  const boosters = planBoosters(n, seededRandom(seed));
  const summary = orderSummary(boosters, { seed, gameName: GAME_NAME });
  const prefix = `${GAME_NAME.toLowerCase()}-${n}-boosters`;
  download(`${prefix}-impression-quantites.csv`, quantitiesCsv(boosters), 'text/csv;charset=utf-8');
  download(`${prefix}-composition.csv`, compositionCsv(boosters), 'text/csv;charset=utf-8');
  download(`${prefix}-resume.txt`, `\ufeff${summary}\n`, 'text/plain;charset=utf-8');
  openModal(`<h2>📦 Commande prête</h2><p class="small muted">3 fichiers téléchargés.</p><pre class="summary">${esc(summary)}</pre>`);
};

ACTIONS.printWhat = (el) => { ui.print.what = el.value; render(); };
ACTIONS.doPrint = () => window.print();
ACTIONS.downloadFigma = () => download(`${GAME_NAME.toLowerCase()}-cartes-figma.csv`, figmaCsv(), 'text/csv;charset=utf-8');
ACTIONS.downloadCsv = () => download(`${GAME_NAME.toLowerCase()}-cartes.csv`, cardsCsv(), 'text/csv;charset=utf-8');

// ---- équilibrage ------------------------------------------------------------------------------

ui.balance = { games: 2, level: 'normal', running: false, result: null };

function renderBalance() {
  const b = ui.balance;
  const r = b.result;
  const champRows = r ? CHAMPIONS.map((c) => ({ c, ...r.champ[c.id] })).filter((x) => x.games).sort((x, y) => y.wins / y.games - x.wins / x.games) : [];
  const cardRows = r ? CARDS.map((x) => ({ x, ...(r.cards[x.id] || { seen: 0, won: 0 }) })).filter((x) => x.seen).sort((p, q) => q.won / q.seen - p.won / p.seen) : [];
  const pct = (a, n) => (n ? Math.round((100 * a) / n) : 0);
  const bar = (v) => `<span class="wbar"><i style="width:${v}%;background:${v > 60 ? '#ff5d73' : v < 40 ? '#3fa9f5' : '#2ecc8f'}"></i></span>`;
  $main.innerHTML = `
    <h1>📊 Équilibrage</h1>
    <div class="panel">
      <p>Fait jouer les bots entre eux, avec les decks de base de chaque champion, pour repérer ce qui gagne trop (en rouge) ou pas assez (en bleu). Autour de 50 %, c’est équilibré.</p>
      <div class="row">
        <label class="field inline">Parties par affrontement
          <select data-change="balGames">${[1, 2, 4, 8].map((n) => `<option ${b.games === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field inline">Niveau des bots
          <select data-change="balLevel">${['facile', 'normal'].map((k) => `<option value="${k}" ${b.level === k ? 'selected' : ''}>${LEVELS[k].label}</option>`).join('')}</select></label>
        <button class="btn accent" data-act="runBalance" ${b.running ? 'disabled' : ''}>▶️ Lancer ${CHAMPIONS.length * (CHAMPIONS.length - 1) * b.games} parties</button>
      </div>
      ${b.running ? `<div class="meter"><div style="width:${b.progress}%"></div></div><p class="muted small">${b.done} / ${b.total} parties…</p>` : ''}
      <p class="muted small">« Normal » : des bots qui réfléchissent, le plus proche de vraies parties (compte une minute environ). « Facile » : des bots qui jouent au hasard, très rapide, mais certains champions y changent beaucoup (le Chat néon y gagne plus, le Garde galactique moins). Avec 2 parties par affrontement, un champion peut varier d’environ 10 % d’un lancement à l’autre : monte à 4 ou 8 pour des chiffres plus sûrs.</p>
    </div>
    ${r ? `
    <div class="balance">
      <section class="panel"><h2>Champions</h2>
        <p class="muted small">${r.games} parties · durée médiane ${r.medianTurns} tours (90 % en ${r.p90Turns} tours ou moins)</p>
        <table><tr><th>Champion</th><th>Victoires</th><th></th></tr>${champRows.map((x) => `<tr><td>${x.c.art} ${esc(x.c.nom)}</td><td>${pct(x.wins, x.games)} %</td><td>${bar(pct(x.wins, x.games))}</td></tr>`).join('')}</table>
      </section>
      <section class="panel"><h2>Cartes</h2>
        <p class="muted small">Part des fois où la carte a été jouée par le joueur qui a gagné la partie.</p>
        <table><tr><th>Carte</th><th>Jouée</th><th>Gagnante</th><th></th></tr>${cardRows.map((x) => `<tr><td>${x.x.art} ${esc(x.x.nom)}</td><td>${x.seen}</td><td>${pct(x.won, x.seen)} %</td><td>${bar(pct(x.won, x.seen))}</td></tr>`).join('')}</table>
      </section>
    </div>` : ''}`;
}

ACTIONS.balGames = (el) => { ui.balance.games = Number(el.value); render(); };
ACTIONS.balLevel = (el) => { ui.balance.level = el.value; render(); };
ACTIONS.runBalance = () => {
  const b = ui.balance;
  const ids = CHAMPIONS.map((c) => c.id);
  const jobs = [];
  for (const a of ids) for (const c of ids) if (a !== c) for (let k = 0; k < b.games; k++) jobs.push([a, c]);
  const champ = Object.fromEntries(ids.map((id) => [id, { games: 0, wins: 0 }]));
  const cards = {};
  const turns = [];
  Object.assign(b, { running: true, total: jobs.length, done: 0, progress: 0 });
  render();
  let seed = 1;
  const step = () => {
    const until = performance.now() + 40;
    while (b.done < jobs.length && performance.now() < until) {
      const [a, c] = jobs[b.done];
      const s = createGame({ players: [a, c].map((id) => ({ championId: id, deck: autoDeck(id, null, { rng: seed++ }) })), seed: seed++ });
      s.quiet = true;
      for (let g = 0; g < 3000; g++) {
        const r = advance(s);
        if (r.type === 'over') break;
        if (r.type === 'decision') for (const d of [...s.pending]) answer(s, d.player, autoDecide(s, d));
        if (r.type === 'program') for (const p of s.players) botAct(s, p.idx, b.level);
      }
      turns.push(s.turn);
      s.players.forEach((p, i) => {
        champ[p.championId].games += 1;
        if (s.winner === i) champ[p.championId].wins += 1;
        for (const [id, n] of Object.entries(p.tally)) {
          cards[id] = cards[id] || { seen: 0, won: 0 };
          cards[id].seen += n;
          if (s.winner === i) cards[id].won += n;
        }
      });
      b.done += 1;
    }
    b.progress = Math.round((100 * b.done) / b.total);
    if (b.done < jobs.length) {
      if (view === 'balance') render();
      setTimeout(step, 0);
      return;
    }
    turns.sort((x, y) => x - y);
    b.result = {
      games: jobs.length, champ, cards, medianTurns: turns[Math.floor(turns.length / 2)], p90Turns: turns[Math.floor(turns.length * 0.9)],
    };
    b.running = false;
    if (view === 'balance') render();
  };
  setTimeout(step, 0);
};

// ---- règles ----------------------------------------------------------------------------------

function renderRules() {
  $main.innerHTML = `
    <h1>📖 Règles</h1>
    <div class="rules">
      <section class="panel">
        <h2>Le but</h2>
        <p>Faire tomber le champion adverse à 0 PV. Chaque champion a 2 couleurs, ses PV (20 de base) et un pouvoir.</p>
        <h2>Le deck</h2>
        <p>20 cartes des 2 couleurs de ton champion, 2 exemplaires maximum par carte. Pas de cartes neutres.</p>
        <h2>Un tour</h2>
        <ol>
          <li><strong>Pioche</strong> 1 carte (pas au 1ᵉʳ tour : on joue les 3 cartes de départ). La main va jusqu’à 10 cartes.</li>
          <li><strong>Défausse obligatoire</strong> quand la main atteint 5, 7 puis 10 cartes : défausse 1 carte face cachée, puis pioche-en 1.</li>
          <li><strong>Pile</strong> : chacun empile toute sa main face cachée, dans l’ordre de son choix.</li>
          <li><strong>Collision</strong> : on révèle les cartes deux par deux, en même temps. Chaque paire est un duel.</li>
          <li><strong>Reprise</strong> : chacun reprend toutes ses cartes en main. Le bouclier disparaît.</li>
        </ol>
        <p>Dès le 2ᵉ tour, tu connais les cartes de ton adversaire : tout le bluff est dans l’ordre.</p>
        <h2>Mort subite</h2>
        <p>À partir du tour ${SUDDEN_DEATH_TURN}, chaque champion perd 2 PV au début du tour, puis 4, 6… pour que la partie finisse.</p>
      </section>
      <section class="panel">
        <h2>Les 4 types de cartes</h2>
        <ul>
          <li>🗡️ <strong>Attaque</strong> : des dégâts. Le bouclier absorbe d’abord.</li>
          <li>🛡️ <strong>Garde</strong> : du bouclier (10 au plus), jusqu’à la fin du tour.</li>
          <li>🌀 <strong>Contre</strong> : annule l’Attaque d’en face. Contre autre chose, il ne sert à rien.</li>
          <li>✨ <strong>Tactique</strong> : soin, vision, gel, échange de cartes, bonus pour la suite…</li>
        </ul>
        <h2>Ordre d’un duel</h2>
        <ol>
          <li>Révélation des deux cartes (et Décret impérial de l’Empereur galactique).</li>
          <li>Annulations : Contres, Gel… Une carte annulée ne fait rien, sauf « Si annulée ».</li>
          <li>Effets : bouclier, soins, vision, échanges, bonus.</li>
          <li>Dégâts, en même temps.</li>
          <li>Après : sacrifices, poison, puis pouvoirs des champions.</li>
        </ol>
        <h2>Mots-clés</h2>
        <p class="small"><b>Perforant</b> : ignore le bouclier. <b>Épines X</b> : si une Attaque adverse te touche pendant ce duel, son attaquant subit X dégâts. <b>Poison X</b> : −1 PV à la fin des X prochains duels. <b>Gel</b> : la prochaine carte adverse est annulée. <b>Vision X</b> : regarde les X prochaines cartes adverses. <b>Sacrifice X</b> : perds X PV. <b>Vol de vie</b> : regagne les PV infligés. <b>Détruire</b> : la carte ne revient plus. <b>Usage unique</b> : défaussée après usage.</p>
        <h2>Les pouvoirs</h2>
        <p class="small">Leur compteur (les ronds sous le champion) avance à chaque carte jouée, même annulée, et continue d’un tour à l’autre. Il est visible des deux joueurs.</p>
      </section>
    </div>`;
}

// ---- démarrage --------------------------------------------------------------------------------

document.title = `${GAME_NAME} · prototype`;
document.getElementById('brand').textContent = GAME_NAME;
$modal.addEventListener('click', (e) => { if (e.target === $modal && $modal.querySelector('.modal-x')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $modal.querySelector('.modal-x')) closeModal(); });
renderNav();
render();
