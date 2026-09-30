// Patch notes of each game, shown in the games (newest first). Add an entry at the top of a game's
// list for each update players should know about; its « Nouveautés » button shows a dot until read.
import { actions, esc, state } from './core.js';

const BLAST = [
  {
    id: '2026-10-01-stars',
    date: '1er octobre 2026',
    title: 'Tes étoiles servent enfin à avancer',
    items: [
      '⚛️ Noyau de neutron : ×1,1 de dégâts par niveau, cumulés (×2,6 au niveau 10, ×6,7 au 20, ×45 au 40), au lieu de +25 % qui s’additionnaient. Chaque niveau garde sa valeur : tes étoiles se transforment toujours en progression.',
      '🔷 Points de prestige : 10, +1 par tranche de 25 secteurs atteints dans la partie. Aller loin rapporte plus.',
      '👑 Couronne de Jimmy : +25 % d’étoiles et +25 % de 🔷 par niveau (au lieu de +2 🔷).',
    ],
  },
  {
    id: '2026-10-01-record',
    date: '1er octobre 2026',
    title: 'Prestige : on dépasse son record',
    items: [
      '⭐ Le secteur à atteindre n’est plus plafonné à 95 % de ton record : il continue de monter de 3 % par prestige sans record, jusqu’à dépasser ton record. Il ne va jamais plus vite que tes dégâts (+1 secteur par ×1,35 de dégâts permanents), donc pas de mur, mais plus moyen de rester bloqué juste sous son record.',
    ],
  },
  {
    id: '2026-10-01-lastrun',
    date: '1er octobre 2026',
    title: 'Prestige : plus jamais bloqué',
    items: [
      '⭐ Le secteur à atteindre pour un prestige ne dépasse plus jamais ce que ta flotte peut atteindre : ta partie précédente, +1 secteur par ×1,35 de dégâts permanents gagnés depuis (prestiges, arbre des étoiles, Calibres, Alliage, Singularité…). Un vieux record fait avant un rééquilibrage ne peut plus te bloquer, et la barre monte quand même un peu à chaque prestige.',
    ],
  },
  {
    id: '2026-09-30-fleet',
    date: '30 septembre 2026',
    title: 'Flotte de départ',
    items: [
      '🛸 Flotte de départ : ses éclaireurs sont gratuits et ne font plus monter le prix des suivants. Le premier éclaireur acheté coûte de nouveau 10 crédits, même avec 50 éclaireurs offerts.',
    ],
  },
  {
    id: '2026-09-30-b',
    date: '30 septembre 2026',
    title: 'Académie des pilotes',
    items: [
      '🎓 Chaque niveau rapporte 2 🔷 de plus que le précédent : +2, +4, +6… à chaque prestige, cumulés.',
      '📈 Niveau 5 : +30 🔷 par prestige · niveau 10 : +110 🔷 · niveau 20 : +420 🔷 (avant : +1 par niveau).',
      '🎁 Les niveaux déjà achetés comptent tout de suite.',
      '🛡️ Anti-triche renforcé : envoyer plein de petites sauvegardes à la suite ne permet plus de grimper (la marge se recharge avec le temps réel, pas avec le nombre de sauvegardes) ; un prestige doit avoir pu atteindre son secteur.',
    ],
  },
  {
    id: '2026-09-30-ui',
    date: '30 septembre 2026',
    title: 'Astrolabe, Calibre et sous-menus',
    items: [
      '💥 Atelier : la Soute à butin devient le Calibre. Chaque niveau donne ×1,1 de dégâts et de crédits au vaisseau (cumulés : ×2,6 au niveau 10, ×6,7 au niveau 20), sans limite. Tes 🔷 restent utiles à tous les niveaux.',
      '🗂️ Sous-menus : Forge (Vaisseaux, Reliques, Alambic), Atelier (Doigt de Jimmy, Vaisseaux) et Prestige (Arbre des étoiles, Bonus, Synergies, Départ lancé). Le prestige et tes ressources restent affichés en haut.',
      '🧭 Astrolabe : +0,5 % de dégâts par secteur de ton meilleur secteur de l’univers, et plus du record de tous les temps. Il repart de zéro après un Big Bang, comme le Portail.',
    ],
  },
  {
    id: '2026-09-30',
    date: '30 septembre 2026',
    title: 'Prestige et Portail temporel',
    items: [
      '👑 Le secteur à atteindre pour un prestige passe à 80 % de ton meilleur secteur de l’univers (au lieu de 60 %).',
      '🌀 Portail temporel : on démarre au plus à la moitié de ton meilleur secteur de l’univers, et plus du record de tous les temps. Il repart donc de zéro après un Big Bang.',
      '🛡️ Fini l’abus : partir de la moitié de son record pour prestige 10 % plus loin n’est plus possible.',
      '📈 La barre monte si tu stagnes : +3 % à chaque prestige sans nouveau record (95 % au plus). Dès que tu bats ton record, elle redescend à 80 % du nouveau record.',
    ],
  },
  {
    id: '2026-10-01',
    date: '1er octobre 2026',
    title: 'Plus de mur au prestige',
    items: [
      '⭐ Le secteur à atteindre pour un prestige ne dépend plus du nombre de prestiges : il vaut 60 % de ton meilleur secteur de l’univers (au moins 20). Ta flotte y est déjà allée, elle peut toujours y retourner, et chaque partie plus loin relève un peu la barre suivante.',
    ],
  },
  {
    id: '2026-09-30-b',
    date: '30 septembre 2026',
    title: 'Big Bang : vos retours',
    items: [
      '💥 Le Big Bang se débloque avec le meilleur secteur de l’univers, tous prestiges confondus : faire un prestige ne le bloque plus.',
      '🔔 Résonance cosmique bien plus forte : chaque Big Bang donne ×2, ×3, ×4… de dégâts, d’étoiles de prestige et de minerais, et −10 % sur l’arbre des étoiles (jusqu’à −50 %).',
      '🤖 Pilote total I rend les automatismes de l’arbre des étoiles tout de suite, sans attendre le Big Bang suivant.',
      '🗺️ Plan d’attaque : les récompenses pas encore récoltées sont perdues au Big Bang (récupère-les avant).',
      '⭐ Prestige : le secteur à atteindre monte de 3 par prestige au lieu de 5.',
      '🔭 Télescope : les blocs étoile récompensent la conquête. En voyage interspatial (secteur bloqué), 5 fois moins de chances, et plus d’étoiles pendant l’absence (les minerais restent).',
      '🌙 Longue veille : 10 niveaux au plus ; les niveaux au-delà sont remboursés en étoiles.',
      '🐢 Mode léger (bouton en haut) : moins de vaisseaux dessinés, sans traînées, 30 images/s, mêmes dégâts. Activé d’office sur téléphone et sur les petits processeurs.',
    ],
  },
  {
    id: '2026-09-30',
    date: '30 septembre 2026',
    title: '💥 Big Bang et matière noire',
    items: [
      '💥 Big Bang (onglet 🌑, dès le secteur 400 atteint dans ta partie, +25 à chaque Big Bang) : absolument tout repart de zéro (prestiges, étoiles, arbre des étoiles, atelier, Forge…) contre 1 🌑 matière noire. Gardés : le Plan d’attaque, ton record et tes stats.',
      '🌑 Boutique de matière noire, éternelle : Singularité (+50 % de dégâts par niveau), Héritage stellaire (+25 ⭐ et +15 🔷 au départ de chaque univers), Pilote total (automatismes gardés, puis prestige automatique), Accélération automatique, Cadre cosmique autour de ton pseudo dans le Top (3 niveaux).',
      '🔔 Résonance cosmique : chaque Big Bang donne +10 % d’étoiles de prestige et de minerais, pour toujours.',
      '🏆 Top : tes Big Bangs (🌑 ×N) et ton cadre cosmique s’affichent à côté de ton nom.',
      '♾️ Plan d’attaque : nouvelle chaîne « Créateur d’univers », et les prestiges, l’Alliage, les reliques, le Départ lancé, l’arbre des étoiles et les calibres comptent sur tous tes univers.',
    ],
  },
  {
    id: '2026-09-29-d',
    date: '29 septembre 2026',
    title: 'Monter paie enfin',
    items: [
      '⭐ Étoiles de prestige au 2e degré : pareil jusqu’au secteur 100, puis secteur² ÷ 1000 (63 ⭐ au secteur 250, 161 au 400). Aller loin rapporte bien plus que plusieurs prestiges courts.',
      '🎁 Rattrapage : tes prestiges passés sont recalculés avec la nouvelle formule, et la différence t’est versée une fois.',
      '🌀 Portail temporel bien moins cher (×1,15 par niveau au lieu de ×1,5), pour suivre ton record. Son prix s’affiche enfin lisiblement.',
      '🪐 Minerai des planètes selon le secteur : peu sur les planètes proches, beaucoup plus loin (×5 au secteur 250).',
      '🐛 Les niveaux d’« Au-delà du ciel » ne disparaissent plus du Top après un prestige.',
    ],
  },
  {
    id: '2026-09-29-c',
    date: '29 septembre 2026',
    title: 'Défis sans fin',
    items: [
      '🔁 Plan d’attaque : 7 nouvelles chaînes sans fin (fusions, touches, minerais, secteurs, accélérations, arbre des étoiles, calibres). Leur difficulté tourne à chaque niveau : moyen, difficile puis légendaire, et ça recommence un cran plus loin.',
      '♾️ Le Plan d’attaque n’a plus de fin : il y a toujours un prochain objectif.',
    ],
  },
  {
    id: '2026-09-29-b',
    date: '29 septembre 2026',
    title: 'Raffinage et ascension auto par vaisseau',
    items: [
      '🌟 Ascension automatique : un bouton « Auto asc. » sur chaque vaisseau, indépendant de « Auto niv. ». Il est déjà activé sur les vaisseaux qui étaient en « Auto niv. ».',
      '🧪 Raffinage (arbre des étoiles, sans limite) : +1 minerai par bloc de minerai cassé, à chaque niveau. Le bonus s’ajoute à celui du secteur, et compte aussi pendant ton absence.',
    ],
  },
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

const CASINO = [
  {
    id: '2026-09-29-b',
    date: '29 septembre 2026',
    title: 'Casino Spatial et Blackjack',
    items: [
      '🎰 Le Poker devient le Casino Spatial, avec son sous-menu : 🃏 Poker de Butch · 🂡 Blackjack.',
      '🂡 Nouveau : Blackjack contre Butch. Approche-toi de 21 sans le dépasser ; Butch tire jusqu’à 16.',
      '🌟 Blackjack payé 3 pour 2, victoire 1 pour 1, doubler sur les deux premières cartes.',
      '🏆 Une partie = 30 mains en partant de 100 pièces (mises de 2 à 10). Top à part pour chaque jeu.',
      '🛡️ Cartes distribuées par le serveur : la carte cachée de Butch n’arrive dans la page qu’à la fin de la main.',
    ],
  },
  {
    id: '2026-09-29',
    date: '29 septembre 2026',
    title: 'Ouverture du Poker de Butch',
    items: [
      '🃏 Nouveau jeu inspiré du Picture Poker : 5 cartes, un échange, contre Butch Pakovski.',
      '🌟 Six images, de la plus forte à la plus faible : Étoile, Jimmy, Soucoupe, Planète, Fusée, Astéroïde.',
      '🪙 1 pièce pour jouer, jusqu’à 5 en relançant après avoir vu tes cartes. Gains : paire ×2, double paire ×3, brelan ×4, full ×6, carré ×8, cinq identiques ×16.',
      '🏆 Une partie = 30 mains en partant de 10 pièces. Le Top garde ta meilleure partie.',
      '🛡️ C’est le serveur qui distribue les cartes : impossible de tricher.',
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
    id: '2026-09-30-activity',
    date: '30 septembre 2026',
    title: 'Joueurs absents',
    items: [
      '💤 Un joueur pas venu depuis 3 jours est marqué « absent » dans la galaxie.',
      '👋 Parti depuis plus de 7 jours (ou 2 jours pour un empire à peine commencé) : il sort de la carte, ne compte plus pour le coût du Portail ni pour la force de la Nuée, et ses offres du marché sont retirées.',
      '🔙 Son empire est gardé tel quel : à son retour, il retrouve tout (et ses offres remboursées) et compte à nouveau.',
    ],
  },
  {
    id: '2026-09-30',
    date: '30 septembre 2026',
    title: 'Notifications',
    items: [
      '🔔 Une notification « 🪐 Empire » à la fin de chaque construction, recherche ou commande de vaisseaux, sur toutes les pages du site (même en jouant à Blast).',
      '📱 Bouton « 🔕 Activer les notifs » : prévenu même quand l’onglet est en arrière-plan.',
      '🌙 En revenant sur le site : ce qui s’est terminé pendant ton absence.',
      '🏷️ Les notifications portent le nom de leur jeu (Blast, Empire, Casino…).',
    ],
  },
  {
    id: '2026-09-28-sync',
    date: '28 septembre 2026',
    title: 'Ressources toujours justes',
    items: [
      '🔄 L’empire se resynchronise avec le serveur toutes les 30 s : livraisons, échanges et Nuée s’affichent sans recharger la page.',
      '🛠️ Corrigé : une ancienne réponse du serveur pouvait écraser une construction toute neuve (elle semblait annulée, avec trop de ressources affichées).',
      '❌ Quand une action est refusée, les vraies ressources s’affichent aussitôt.',
      '⚡ Énergie : « mines à X % » quand il en manque, et un avertissement plus clair sur les mines (il concerne le niveau suivant).',
    ],
  },
  {
    id: '2026-09-28-queue',
    date: '28 septembre 2026',
    title: 'File d’attente',
    items: [
      '📋 Empile jusqu’à 3 actions à la suite : 3 constructions par planète, 3 recherches et 3 commandes de vaisseaux. Elles se lancent l’une après l’autre, payées tout de suite.',
      '🔓 Ce qui est en file compte pour les déblocages (ex. mine de métal niv. 2 en file → mine de cristal disponible).',
      '✕ Chaque action se retire (remboursée) ; la suite remonte, et ce qui en dépendait est annulé et remboursé aussi.',
    ],
  },
  {
    id: '2026-09-28-open',
    date: '28 septembre 2026',
    title: 'Ouverture à tous',
    items: [
      '🎉 L’Empire de Jimmy est ouvert à tous les joueurs : fondez votre empire depuis le menu 🪐 Empire !',
      '🤝 Échangez avec les autres, livrez le Portail de Jimmy et tenez le Bouclier face à la Nuée ensemble.',
      '🚀 Départ plus rapide : 1 500 🔩 · 1 000 💎 · 300 🔥 pour commencer, et production ×3 pendant les 48 premières heures de ton empire.',
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
  casino: { label: '🎰 Casino', notes: CASINO },
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
