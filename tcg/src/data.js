// Toutes les cartes et tous les champions du jeu : la seule source de vérité.
// Le jeu (jeu.html), le CSV d'impression (cartes.csv) et la planche d'impression en sont tirés.
// Les effets sont codés dans engine.js, carte par carte (par leur id).

/** Nom de travail du jeu : à changer ici seulement. */
export const GAME_NAME = 'Collision';

export const COLORS = {
  rouge: { nom: 'Rouge', emoji: '🔴', minerai: '🌋 Obsidienne', style: 'Agression', hex: '#e2483d', dark: '#5c1410' },
  bleu: { nom: 'Bleu', emoji: '🔵', minerai: '🧊 Cristal de glace', style: 'Contrôle', hex: '#3fa9f5', dark: '#0d3558' },
  vert: { nom: 'Vert', emoji: '🟢', minerai: '🍄 Spore alien', style: 'Endurance', hex: '#43c46b', dark: '#0f3d1c' },
  jaune: { nom: 'Jaune', emoji: '🟡', minerai: '🌞 Pépite solaire', style: 'Forteresse', hex: '#f5c02e', dark: '#4d3a05' },
  violet: { nom: 'Violet', emoji: '🟣', minerai: '💠 Plasma néon', style: 'Manipulation', hex: '#a35cff', dark: '#2e1257' },
  noir: { nom: 'Noir', emoji: '⚫', minerai: '🐚 Perle abyssale', style: 'Sacrifice', hex: '#6b6f80', dark: '#14151c' },
};

export const TYPES = {
  attaque: { nom: 'Attaque', icone: '🗡️' },
  garde: { nom: 'Garde', icone: '🛡️' },
  contre: { nom: 'Contre', icone: '🌀' },
  tactique: { nom: 'Tactique', icone: '✨' },
};

export const RARITIES = {
  commune: { nom: 'Commune', symbole: '●' },
  'peu commune': { nom: 'Peu commune', symbole: '◆' },
  rare: { nom: 'Rare', symbole: '★' },
};

// valeur : nombre, 'X' (calculée) ou null (pas de valeur).
const c = (id, numero, nom, couleur, type, valeur, effet, rarete, art, motsCles = []) => ({
  id, numero, nom, couleur, type, valeur, effet, rarete, art, motsCles,
});

export const CARDS = [
  // 🔴 Rouge : agression
  c('RO01', 1, 'Coup de canon', 'rouge', 'attaque', 3, '', 'commune', '💥'),
  c('RO02', 2, 'Salve', 'rouge', 'attaque', 2, 'Enchaînement : +2 si ta carte précédente était une Attaque.', 'commune', '🎯', ['Enchaînement']),
  c('RO03', 3, 'Rage de lave', 'rouge', 'attaque', 5, 'Tu subis 1 dégât.', 'peu commune', '🌋'),
  c('RO04', 4, 'Charge du Destroyer', 'rouge', 'attaque', 3, 'Perforant.', 'peu commune', '🚀', ['Perforant']),
  c('RO05', 5, 'Surchauffe', 'rouge', 'tactique', null, 'Préparation : ta prochaine Attaque fait +3.', 'commune', '🔥', ['Préparation']),
  c('RO06', 6, 'Bombe', 'rouge', 'attaque', 2, 'Si annulée : inflige quand même 2 dégâts.', 'commune', '💣', ['Si annulée']),
  c('RO07', 7, 'Feu de barrage', 'rouge', 'attaque', 2, 'Ne peut pas être annulée par un Contre.', 'rare', '🎆'),
  c('RO08', 8, 'Furie', 'rouge', 'attaque', 'X', 'X = nombre de tes Attaques déjà révélées ce tour (6 au plus).', 'rare', '😤'),
  // 🔵 Bleu : contrôle
  c('BL01', 9, 'Parade glacée', 'bleu', 'contre', null, 'Annule une Attaque.', 'commune', '🧊'),
  c('BL02', 10, 'Miroir de glace', 'bleu', 'contre', null, 'Annule une Attaque et renvoie ses dégâts à l’attaquant.', 'rare', '🪞'),
  c('BL03', 11, 'Contre-attaque glaciale', 'bleu', 'contre', 1, 'Annule une Attaque. Sinon, inflige 1 dégât.', 'peu commune', '❄️'),
  c('BL04', 12, 'Gel', 'bleu', 'tactique', null, 'Gel : la prochaine carte adverse est annulée.', 'peu commune', '🥶', ['Gel']),
  c('BL05', 13, 'Blizzard', 'bleu', 'tactique', null, 'Annule la carte d’en face si c’est une Attaque ou une Garde de valeur 2 ou moins.', 'commune', '🌨️'),
  c('BL06', 14, 'Mur de givre', 'bleu', 'garde', 3, '', 'commune', '🧱'),
  c('BL07', 15, 'Éclat de cristal', 'bleu', 'attaque', 2, 'Si la carte d’en face est une Garde : Gel.', 'commune', '💎', ['Gel']),
  c('BL08', 16, 'Prévoyance', 'bleu', 'tactique', null, 'Vision 2.', 'rare', '🔭', ['Vision']),
  // 🟢 Vert : endurance
  c('VE01', 17, 'Spores', 'vert', 'attaque', 1, 'Poison 2.', 'commune', '🍄', ['Poison']),
  c('VE02', 18, 'Régénération', 'vert', 'tactique', null, 'Soigne 3 PV.', 'commune', '🌿'),
  c('VE03', 19, 'Carapace', 'vert', 'garde', 2, '+1 par Garde que tu as déjà révélée ce tour.', 'commune', '🐢'),
  c('VE04', 20, 'Lianes', 'vert', 'tactique', null, 'La prochaine carte adverse a −2 de valeur.', 'peu commune', '🌱'),
  c('VE05', 21, 'Morsure de la Nuée', 'vert', 'attaque', 2, 'Vol de vie.', 'commune', '🐛', ['Vol de vie']),
  c('VE06', 22, 'Pollen', 'vert', 'contre', null, 'Annule une Attaque ; si c’est le cas, soigne 1 PV.', 'peu commune', '🌼'),
  c('VE07', 23, 'Essaim', 'vert', 'attaque', 2, 'Si annulée : Poison 2.', 'rare', '🐝', ['Si annulée', 'Poison']),
  c('VE08', 24, 'Floraison', 'vert', 'tactique', null, 'Soigne 1 PV par carte Verte que tu as déjà révélée ce tour.', 'rare', '🌸'),
  // 🟡 Jaune : forteresse
  c('JA01', 25, 'Bouclier solaire', 'jaune', 'garde', 3, '', 'commune', '☀️'),
  c('JA02', 26, 'Rempart', 'jaune', 'garde', 5, 'Le bouclier n’arrive qu’après les dégâts de ce duel.', 'peu commune', '🏰'),
  c('JA03', 27, 'Épines dorées', 'jaune', 'garde', 2, 'Épines 2.', 'commune', '🌵', ['Épines']),
  c('JA04', 28, 'Bouclier galactique', 'jaune', 'garde', 2, 'Ton bouclier ne disparaît pas à la fin du tour.', 'rare', '🌐'),
  c('JA05', 29, 'Éclat solaire', 'jaune', 'attaque', 'X', 'X = ton bouclier actuel (6 au plus). Le bouclier n’est pas dépensé.', 'commune', '🌞'),
  c('JA06', 30, 'Bénédiction', 'jaune', 'tactique', null, 'Double ton bouclier (10 au plus).', 'rare', '🙏'),
  c('JA07', 31, 'Garde galactique', 'jaune', 'contre', null, 'Annule une Attaque ; si c’est le cas, gagne 2 de bouclier.', 'commune', '💂'),
  c('JA08', 32, 'Aveuglement', 'jaune', 'tactique', null, 'La prochaine Attaque adverse fait −3.', 'peu commune', '😎'),
  // 🟣 Violet : manipulation
  c('VI01', 33, 'Télépathie', 'violet', 'tactique', null, 'Vision 1, puis tu peux échanger tes 2 prochaines cartes.', 'rare', '🧠', ['Vision', 'Échange']),
  c('VI02', 34, 'Tour de passe-passe', 'violet', 'tactique', null, 'Échange les 2 prochaines cartes de l’adversaire.', 'peu commune', '🎩', ['Échange']),
  c('VI03', 35, 'Rayon néon', 'violet', 'attaque', 3, '+2 si tu avais vu cette carte adverse grâce à une Vision.', 'commune', '🔦'),
  c('VI04', 36, 'Mirage', 'violet', 'contre', null, 'Annule une Attaque ou une Tactique.', 'peu commune', '🫥'),
  c('VI05', 37, 'Copie', 'violet', 'tactique', null, 'Devient une copie de la carte d’en face.', 'rare', '🪄'),
  c('VI06', 38, 'Chaos', 'violet', 'tactique', null, 'Inverse l’ordre des 3 prochaines cartes de l’adversaire.', 'commune', '🌪️'),
  c('VI07', 39, 'Rayon miroir', 'violet', 'attaque', 2, '+2 si la carte d’en face est une Tactique.', 'commune', '💠'),
  c('VI08', 40, 'Déjà-vu', 'violet', 'tactique', null, 'Devient une copie de ta carte précédente.', 'commune', '🔁'),
  // ⚫ Noir : sacrifice
  c('NO01', 41, 'Lame des abysses', 'noir', 'attaque', 4, 'Perforant. Sacrifice 1.', 'commune', '🔪', ['Perforant', 'Sacrifice']),
  c('NO02', 42, 'Brise-bouclier', 'noir', 'tactique', null, 'Détruit tout le bouclier adverse.', 'commune', '🔨'),
  c('NO03', 43, 'Malédiction', 'noir', 'tactique', null, 'L’adversaire ne gagne ni bouclier ni PV pendant les 3 duels suivants.', 'peu commune', '💀'),
  c('NO04', 44, 'Pacte', 'noir', 'tactique', null, 'Sacrifice 3. Préparation : ta prochaine Attaque fait le double.', 'peu commune', '🩸', ['Sacrifice', 'Préparation']),
  c('NO05', 45, 'Exécution', 'noir', 'attaque', 2, 'Fait 8 si l’adversaire a 6 PV ou moins.', 'rare', '⚰️'),
  c('NO06', 46, 'Ombre', 'noir', 'contre', null, 'Annule la carte d’en face, quelle qu’elle soit. Sacrifice 2.', 'commune', '👤', ['Sacrifice']),
  c('NO07', 47, 'Trou noir', 'noir', 'tactique', null, 'Annule la carte d’en face et la détruit. Usage unique.', 'rare', '🕳️', ['Détruire', 'Usage unique']),
  c('NO08', 48, 'Âme sombre', 'noir', 'attaque', 2, '+1 par Sacrifice que tu as fait ce tour.', 'commune', '👻'),
];

// rythme.kind : 'cartes' (cartes jouées), 'attaques' (Attaques jouées), 'annulations' (cartes adverses annulées),
// 'tours' (tous les n tours), 'fois' (n utilisations par partie), 'aucun'.
const ch = (id, numero, nom, couleurs, pv, rythme, pouvoir, texte, art) => ({
  id, numero, nom, couleurs, pv, rythme, pouvoir, texte, art,
});

export const CHAMPIONS = [
  ch('jimmy', 101, 'Jimmy l’alien', ['violet', 'bleu'], 20, { kind: 'cartes', n: 3 }, 'Je sais tout', 'Regarde la prochaine carte adverse ; tu peux ensuite échanger tes 2 prochaines cartes.', '👽'),
  ch('butch', 102, 'Butch Pakovski', ['jaune', 'violet'], 20, { kind: 'cartes', n: 3 }, 'Le croupier', 'Lance un dé. ⚀ rien · ⚁ +2 bouclier · ⚂ soigne 2 PV · ⚃ inflige 2 dégâts · ⚄ +4 bouclier · ⚅ Jackpot : inflige 3 dégâts et +3 bouclier.', '🎲'),
  ch('reine', 103, 'Reine de la Nuée', ['vert', 'noir'], 22, { kind: 'cartes', n: 5 }, 'Ponte', 'L’adversaire subit Poison 2.', '🪲'),
  ch('pirate', 104, 'Capitaine pirate', ['rouge', 'noir'], 20, { kind: 'attaques', n: 3 }, 'Abordage', 'Ta prochaine Attaque fait +3.', '🏴‍☠️'),
  ch('neutron', 105, 'Le Neutron', ['rouge', 'jaune'], 20, { kind: 'cartes', n: 5 }, 'Réacteur chargé', 'Ta prochaine carte, si c’est une Attaque, fait le double.', '⚛️'),
  ch('garde', 106, 'Garde galactique', ['jaune', 'bleu'], 26, { kind: 'aucun' }, 'Aucun pouvoir', 'Le champion le plus solide du jeu.', '🛡️'),
  ch('phenix', 107, 'Phénix solaire', ['rouge', 'vert'], 18, { kind: 'fois', n: 1 }, 'Renaissance', 'Une fois par partie, quand tu tombes à 0 PV, reviens à 3 PV.', '🔥'),
  ch('meduse', 108, 'Méduse abyssale', ['bleu', 'noir'], 22, { kind: 'annulations', n: 2 }, 'Piqûre', 'L’adversaire subit 3 dégâts.', '🪼'),
  ch('chat', 109, 'Chat néon', ['violet', 'rouge'], 20, { kind: 'cartes', n: 4 }, 'Neuf vies', 'Tu ne subis aucun dégât au duel suivant.', '🐈'),
  ch('comete', 110, 'La Comète', ['rouge', 'bleu'], 20, { kind: 'cartes', n: 5 }, 'Passage', 'Inflige 2 dégâts Perforants.', '☄️'),
  ch('pingouin', 111, 'Pingouin cryogénique', ['bleu', 'vert'], 22, { kind: 'cartes', n: 6 }, 'Banquise', 'Gel : la prochaine carte adverse est annulée.', '🐧'),
  ch('explorateur', 112, 'L’Explorateur', ['vert', 'jaune'], 22, { kind: 'tours', n: 3 }, 'Prospection', 'Au début des tours 3, 6, 9…, après la pioche : défausse jusqu’à 2 cartes et pioche autant.', '🧭'),
  ch('champignon', 113, 'Champignon dansant', ['vert', 'violet'], 22, { kind: 'cartes', n: 3 }, 'Spores hypnotiques', 'Échange les 2 prochaines cartes de l’adversaire.', '🍄'),
  ch('glouton', 114, 'Le Glouton du trou noir', ['jaune', 'noir'], 24, { kind: 'cartes', n: 4 }, 'Festin', 'Vole tout le bouclier adverse (10 au plus pour toi).', '😋'),
  ch('superadmin', 115, 'Le SuperAdmin', ['violet', 'noir'], 20, { kind: 'fois', n: 3 }, 'Ban', 'Trois fois par partie, annule une carte adverse juste après sa révélation.', '👑'),
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((x) => [x.id, x]));
export const CHAMPION_BY_ID = Object.fromEntries(CHAMPIONS.map((x) => [x.id, x]));

// Cartes marqueurs : une par booster, pour suivre les PV, l'armure (bouclier) et le tour en partie réelle.
const mk = (id, numero, couleur, nom, art) => ({ id, numero, couleur, nom, art });
export const MARKERS = [
  mk('MK01', 201, 'rouge', 'Marqueur Obsidienne', '🌋'),
  mk('MK02', 202, 'bleu', 'Marqueur Cristal', '🧊'),
  mk('MK03', 203, 'vert', 'Marqueur Spore', '🍄'),
  mk('MK04', 204, 'jaune', 'Marqueur Solaire', '🌞'),
  mk('MK05', 205, 'violet', 'Marqueur Néon', '💠'),
  mk('MK06', 206, 'noir', 'Marqueur Abyssal', '🐚'),
];
export const MARKER_BY_ID = Object.fromEntries(MARKERS.map((x) => [x.id, x]));

/** Les versions d'une carte : la normale, et l'alternative (rare, holographique, illustration différente). */
export const VERSIONS = {
  normale: { nom: 'Normale', symbole: '' },
  alternative: { nom: 'Alternative', symbole: '✦' },
};

/**
 * Contenu d'un booster : 10 cartes dans cet ordre (les rares à la fin), plus 1 carte marqueur.
 * alt : chance que la carte soit en version alternative. upgrade : chance qu'une peu commune devienne rare.
 */
export const BOOSTER = {
  slots: [
    { label: 'Personnage', kind: 'champion', alt: 0.05 },
    ...Array.from({ length: 6 }, () => ({ label: 'Commune', kind: 'card', rarete: 'commune', alt: 0.01 })),
    ...Array.from({ length: 2 }, () => ({ label: 'Peu commune', kind: 'card', rarete: 'peu commune', upgrade: 0.15, alt: 0.02 })),
    { label: 'Rare', kind: 'card', rarete: 'rare', alt: 0.10 },
  ],
  bonus: { label: 'Marqueur', kind: 'marker' },
};

export const DECK_SIZE = 20;
export const MAX_COPIES = 2;

/** « toutes les 4 cartes jouées », « 2 fois par partie »… */
export function rhythmLabel(r) {
  switch (r.kind) {
    case 'cartes': return `Toutes les ${r.n} cartes jouées`;
    case 'attaques': return `Toutes les ${r.n} Attaques jouées`;
    case 'annulations': return `Toutes les ${r.n} cartes adverses annulées`;
    case 'tours': return `Tous les ${r.n} tours`;
    case 'fois': return r.n === 1 ? 'Une fois par partie' : `${r.n} fois par partie`;
    default: return 'Aucun pouvoir';
  }
}

/** Les cartes jouables par un champion : celles de ses deux couleurs. */
export const cardsForChampion = (champion) => CARDS.filter((x) => champion.couleurs.includes(x.couleur));
