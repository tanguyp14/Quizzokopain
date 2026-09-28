// Patch notes of each game, shown in the games (newest first). Add an entry at the top of a game's
// list for each update players should know about; its « Nouveautés » button shows a dot until read.
import { actions, esc, state } from './core.js';

const BLAST = [
  {
    id: '2026-09-29',
    date: '29 septembre 2026',
    title: 'La flotte joue pendant ton absence',
    items: [
      '🌙 Absence : la flotte continue de jouer. En voyage interspatial elle farme le secteur choisi, sinon elle avance jusqu’à une planète qui résiste. Étoiles du Télescope et minerais compris (au rythme des gains hors ligne : 10 % du temps, +10 % par niveau de Pilote automatique).',
      '🛡️ Les points d’objectifs du Top sont recalculés par le serveur : seuls les objectifs vraiment atteints comptent.',
      '📜 Le Top et les missions gardent la hauteur de l’écran et défilent à l’intérieur.',
    ],
  },
  {
    id: '2026-09-28',
    date: '28 septembre 2026',
    title: 'Alambic et Chantier naval',
    items: [
      '⚗️ Alambic : 3 minerais pour 1, quelle que soit la paire (les minerais forment un cycle, aucun n’est plus cher qu’un autre).',
      '⚗️ Alambic : nouveaux boutons ×100 et ×1000.',
      '🏗️ Chantier naval : en plus de −5 % par niveau, la hausse du prix des éclaireurs est réduite de 3 % par niveau (jusqu’à −70 %). Bien plus d’éclaireurs, donc bien plus de fusions et de Neutrons.',
      '🙈 « Masquer les débloqués » cache aussi les synergies déjà achetées.',
      '📜 Nouveau : ces notes de mise à jour.',
      '🛡️ Les sauvegardes sont vérifiées par le serveur : un prestige ou un record impossible est refusé.',
    ],
  },
  {
    id: '2026-09-27-c',
    date: '27 septembre 2026',
    title: 'Plan d’attaque, synergies et portail',
    items: [
      '🗺️ Plan d’attaque : 44 objectifs permanents (⭐ ou 🔷) et 13 chaînes légendaires sans fin ; Top par points d’objectifs.',
      '🔗 Synergies à débloquer avec des étoiles (tir croisé, marquage perçant, onde d’aura, guidage).',
      '🪐 Planètes vulnérables à un type de vaisseau (×5) et formation complète (×1,5 à ×10).',
      '🌀 Portail temporel : commence tes parties 10, 20, 30… secteurs plus loin, avec les crédits des secteurs sautés.',
      '💥 Coups dévastateurs : +10 % de dégâts critiques par niveau, sans limite.',
      '⚛️ Rayon Neutron : 100 % sur tout le secteur (150 % / 200 % avec les modules).',
      '🤖 Ascension automatique (80 ⭐) et Instructeur de vol (45 ⭐) pour les vaisseaux en auto.',
    ],
  },
  {
    id: '2026-09-27-b',
    date: '27 septembre 2026',
    title: 'Vaisseaux et atelier',
    items: [
      '🛸 Vaisseau-mère : aura de +10 % aux coups dans son cercle (plus grande avec le Hangar).',
      '🧩 Module II par vaisseau dans l’atelier (150 à 600 🔷), une seule case module qui passe au module II.',
      '⭐ Améliorations avancées en deux paliers (50 ⭐ puis 150 ⭐) : réaction en chaîne, siège planétaire, nettoyage express, plasma, escadrille d’élite.',
      '🔧 Fusions des derniers rangs moins chères (4 → cuirassé, 3 → vaisseau-mère, 3 → Neutron).',
      '🧹 Retirés : blocs scellés, blindés et régénérants, brise-blindage et drones par vaisseau (tout est remboursé).',
    ],
  },
  {
    id: '2026-09-27-a',
    date: '27 septembre 2026',
    title: 'Progression',
    items: [
      '🔭 Télescope : des blocs étoile dans les secteurs (0,1 % par secteur, jusqu’à 20 %, puis +1 % par niveau).',
      '🚀 Départ lancé sans limite au-delà du niveau 100 (ascensions incluses, Alliage requis).',
      '🎯 Les 3 missions du jour rapportent 2 étoiles par prestige, et disparaissent une fois récupérées.',
      '👑 Le prestige demande aussi un secteur (20 + 5 par prestige, au plus 75 % du record).',
      '🛠️ Ingénieur de bord (40 ⭐) : achat automatique des améliorations, on/off par ligne.',
      '🙈 Bouton « Masquer les débloqués ».',
    ],
  },
];

const TERRITOIRE = [
  {
    id: '2026-09-28',
    date: '28 septembre 2026',
    title: 'Chasse aux astéroïdes',
    items: [
      '💥 Nouveau but : détruis les astéroïdes en les enfermant dans une zone assez petite. Plus d’astéroïdes : planète suivante.',
      '☄️ Trois tailles : gros (zone ≤ 8 % de la planète), moyen (≤ 4 %), petit (≤ 2 %, et plus rapide).',
      '🔥 Plus la zone est serrée, plus ça rapporte, et plusieurs astéroïdes d’un seul trait font un combo.',
      '👾 Les sentinelles sont parties : seuls les astéroïdes sont dangereux.',
      '🛸 Ta soucoupe vole partout sur la terre conquise : plus jamais bloquée loin d’une zone vide.',
      '🏆 Nouveau jeu, nouveaux records : les anciens records sont remis à zéro (ton nombre de parties est gardé).',
    ],
  },
  {
    id: '2026-09-27',
    date: '27 septembre 2026',
    title: 'Sortie de Territoire',
    items: [
      '🛸 Nouveau jeu façon Qix : trace des lignes depuis la zone conquise pour capturer 75 % de l’espace.',
      '☄️ Des astéroïdes rebondissent dans le vide : s’ils touchent ta trace, tu perds une vie.',
      '👾 Les sentinelles patrouillent sur les bords conquis : évite-les.',
      '🏆 Points pour chaque zone (plus pour les grandes), bonus de niveau, et un Top.',
    ],
  },
];

const QUIZ = [
  {
    id: '2026-09-27',
    date: '27 septembre 2026',
    title: 'Menu et cadres de profil',
    items: [
      '🧭 Nouveau menu : 🧠 Quiz (Jouer, Catalogue, Mes quiz) · 🚀 Blast · 🛸 Territoire · 📊 Stats.',
      '🖼️ Cadres de profil autour de la photo, visibles partout (rooms, podium, Tops). Ils se gagneront bientôt.',
    ],
  },
];

const EMPIRE = [
  {
    id: '2026-09-28-open',
    date: '28 septembre 2026',
    title: 'Ouverture à tous',
    items: [
      '🎉 L’Empire de Jimmy est ouvert à tous les joueurs : fondez votre empire depuis le menu 🪐 Empire !',
      '🤝 Échangez avec les autres, livrez le Portail de Jimmy et tenez le Bouclier face à la Nuée ensemble.',
    ],
  },
  {
    id: '2026-09-28',
    date: '28 septembre 2026',
    title: 'Interface',
    items: [
      '🌌 Scène animée de la planète : satellites et vaisseaux en orbite selon ta progression.',
      '🌀🐛 Panneau de droite Portail / Nuée sur tous les onglets.',
      '📈 Production et énergie de chaque bâtiment (maintenant et au niveau suivant), en /min ; mines en pause.',
      '🧔 Butch dans sa casse spatiale ; formulaire d’offre refait (donne ⇄ veux).',
    ],
  },
  {
    id: '2026-09-27',
    date: '27 septembre 2026',
    title: 'Les grandes étapes',
    items: [
      '🪐 3 planètes aléatoires, bâtiments et recherches débloqués pas à pas.',
      '🏪 Commerce : cargos, marché entre joueurs (avec temps de trajet), Butch Pakovski.',
      '🌀 Portail de Jimmy : le projet commun de la galaxie, en 5 phases.',
      '🐛 La Nuée : une vague par semaine contre le Bouclier galactique.',
      '🔭 Expéditions : ressources, épaves, pirates et reliques.',
    ],
  },
];

/** The games and their notes. */
export const PATCH_NOTES = {
  blast: { label: '🚀 Blast', notes: BLAST },
  territoire: { label: '🛸 Territoire', notes: TERRITOIRE },
  quiz: { label: '🧠 Quiz', notes: QUIZ },
  empire: { label: '🪐 Empire', notes: EMPIRE },
};
const games = () => Object.entries(PATCH_NOTES).filter(([, g]) => !g.superadmin || state.me?.role === 'superadmin');
const seenKey = (game) => `notes-seen-${game}`;
/** Has the player read the latest notes of this game? */
export function notesSeen(game) {
  try { return localStorage.getItem(seenKey(game)) === PATCH_NOTES[game].notes[0].id; } catch { return true; }
}
/** The « Nouveautés » button of a game (a dot until its latest notes are read). */
export const notesButton = (game) => `<button class="btn ghost sm notes-btn" data-action="patch-notes" data-game="${game}">📜 Nouveautés<i class="bl-dot notes-dot" data-notes-dot="${game}" ${notesSeen(game) ? 'hidden' : ''}></i></button>`;

/** The notes window, a toggle at the top to switch game. */
export function showPatchNotes(game = 'blast') {
  document.getElementById('patch-notes')?.remove();
  const list = games();
  const html = (g) => PATCH_NOTES[g].notes.map((v, k) => `<section class="bl-note ${k ? '' : 'latest'}"><h3>${k ? '' : '<span class="badge">Nouveau</span> '}${esc(v.title)} <span class="muted small">· ${esc(v.date)}</span></h3>
      <ul>${v.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></section>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="bl-notes-bg" id="patch-notes">
    <div class="card bl-notes" role="dialog" aria-label="Notes de mise à jour">
      <div class="spread"><h2 style="margin:0">📜 Nouveautés</h2><button class="btn ghost sm" data-close>✕</button></div>
      <div class="notes-switch" role="tablist">${list.map(([k, g]) => `<button class="btn ghost sm ${k === game ? 'active' : ''}" data-game="${k}">${g.label}${k === game || notesSeen(k) ? '' : '<i class="bl-dot"></i>'}</button>`).join('')}</div>
      <div id="patch-notes-body">${html(game)}</div>
    </div></div>`);
  const $bg = document.getElementById('patch-notes');
  const read = (g) => {
    try { localStorage.setItem(seenKey(g), PATCH_NOTES[g].notes[0].id); } catch { /* private mode */ }
    for (const d of document.querySelectorAll(`[data-notes-dot="${g}"]`)) d.hidden = true;
  };
  read(game);
  // Outside the page's #app: its own clicks (switch, ✕, or anywhere around the card).
  $bg.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-game]');
    if (tab) {
      for (const b of $bg.querySelectorAll('.notes-switch .btn')) b.classList.toggle('active', b === tab);
      tab.querySelector('.bl-dot')?.remove();
      document.getElementById('patch-notes-body').innerHTML = html(tab.dataset.game);
      read(tab.dataset.game);
    } else if (ev.target === $bg || ev.target.closest('[data-close]')) $bg.remove();
  });
}

actions['patch-notes'] = (el) => showPatchNotes(el.dataset.game);
