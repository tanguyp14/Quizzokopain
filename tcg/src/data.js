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
  'peu commune': { nom: 'Peu commune', symbole: '✦' },
  rare: { nom: 'Rare', symbole: '✶' },
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
  c('BL07', 15, 'Éclat de cristal', 'bleu', 'attaque', 3, 'Si la carte d’en face est une Garde : Gel.', 'commune', '💎', ['Gel']),
  c('BL08', 16, 'Prévoyance', 'bleu', 'tactique', null, 'Vision 2.', 'rare', '🔭', ['Vision']),
  // 🟢 Vert : endurance
  c('VE01', 17, 'Spores', 'vert', 'attaque', 1, 'Poison 2.', 'commune', '🍄', ['Poison']),
  c('VE02', 18, 'Régénération', 'vert', 'tactique', null, 'Soigne 2 PV.', 'commune', '🌿'),
  c('VE03', 19, 'Carapace', 'vert', 'garde', 2, '+1 par Garde que tu as déjà révélée ce tour.', 'commune', '🐢'),
  c('VE04', 20, 'Lianes', 'vert', 'tactique', null, 'La prochaine carte adverse a −2 de valeur.', 'peu commune', '🌱'),
  c('VE05', 21, 'Morsure de la Nuée', 'vert', 'attaque', 2, 'Vol de vie.', 'commune', '🐛', ['Vol de vie']),
  c('VE06', 22, 'Pollen', 'vert', 'contre', null, 'Annule une Attaque ; si c’est le cas, soigne 1 PV.', 'peu commune', '🌼'),
  c('VE07', 23, 'Essaim', 'vert', 'attaque', 2, 'Si annulée : Poison 2.', 'rare', '🐝', ['Si annulée', 'Poison']),
  c('VE08', 24, 'Floraison', 'vert', 'tactique', null, 'Soigne 1 PV par carte Verte que tu as déjà révélée ce tour.', 'rare', '🌸'),
  // 🟡 Jaune : forteresse
  c('JA01', 25, 'Bouclier solaire', 'jaune', 'garde', 3, '', 'commune', '☀️'),
  c('JA02', 26, 'Rempart', 'jaune', 'garde', 5, 'Le bouclier n’arrive qu’après les dégâts de ce duel.', 'peu commune', '🏰'),
  c('JA03', 27, 'Épines dorées', 'jaune', 'garde', 2, 'Épines 2 : si une Attaque adverse te touche pendant ce duel, son attaquant subit 2 dégâts.', 'commune', '🌵', ['Épines']),
  c('JA04', 28, 'Bouclier galactique', 'jaune', 'garde', 2, 'Ton bouclier ne disparaît pas à la fin du tour.', 'rare', '🌐'),
  c('JA05', 29, 'Éclat solaire', 'jaune', 'attaque', 'X', 'X = ton bouclier actuel (6 au plus). Le bouclier n’est pas dépensé.', 'commune', '🌞'),
  c('JA06', 30, 'Bénédiction', 'jaune', 'tactique', null, 'Double ton bouclier (10 au plus).', 'rare', '🙏'),
  c('JA07', 31, 'Garde galactique', 'jaune', 'contre', null, 'Annule une Attaque ; si c’est le cas, gagne 2 de bouclier.', 'commune', '💂'),
  c('JA08', 32, 'Aveuglement', 'jaune', 'tactique', null, 'La prochaine Attaque adverse fait −3.', 'peu commune', '😎'),
  // 🟣 Violet : manipulation
  c('VI01', 33, 'Télépathie', 'violet', 'tactique', null, 'Vision 2, puis tu peux échanger tes 2 prochaines cartes.', 'rare', '🧠', ['Vision', 'Échange']),
  c('VI02', 34, 'Tour de passe-passe', 'violet', 'tactique', null, 'Échange les 2 prochaines cartes de l’adversaire, puis Vision 2.', 'peu commune', '🎩', ['Échange', 'Vision']),
  c('VI03', 35, 'Rayon néon', 'violet', 'attaque', 3, '+2 si tu avais vu cette carte adverse grâce à une Vision.', 'commune', '🔦'),
  c('VI04', 36, 'Mirage', 'violet', 'contre', null, 'Annule une Attaque ou une Tactique.', 'peu commune', '🫥'),
  c('VI05', 37, 'Copie', 'violet', 'tactique', null, 'Devient une copie de la carte d’en face.', 'rare', '🪄'),
  c('VI06', 38, 'Chaos', 'violet', 'attaque', 2, 'Inverse l’ordre des 3 prochaines cartes de l’adversaire.', 'commune', '🌪️'),
  c('VI07', 39, 'Rayon miroir', 'violet', 'attaque', 3, '+2 si la carte d’en face est une Tactique.', 'commune', '💠'),
  c('VI08', 40, 'Déjà-vu', 'violet', 'tactique', null, 'Devient une copie de ta carte précédente.', 'commune', '🔁'),
  // ⚫ Noir : sacrifice
  c('NO01', 41, 'Lame des abysses', 'noir', 'attaque', 4, 'Perforant. Sacrifice 1.', 'commune', '🔪', ['Perforant', 'Sacrifice']),
  c('NO02', 42, 'Brise-bouclier', 'noir', 'tactique', null, 'Détruit tout le bouclier adverse.', 'commune', '🔨'),
  c('NO03', 43, 'Malédiction', 'noir', 'tactique', null, 'L’adversaire ne gagne ni bouclier ni PV pendant les 3 duels suivants.', 'peu commune', '💀'),
  c('NO04', 44, 'Pacte', 'noir', 'tactique', null, 'Sacrifice 2. Préparation : ta prochaine Attaque fait le double.', 'peu commune', '🩸', ['Sacrifice', 'Préparation']),
  c('NO05', 45, 'Exécution', 'noir', 'attaque', 2, 'Fait 8 si l’adversaire a 8 PV ou moins.', 'rare', '⚰️'),
  c('NO06', 46, 'Ombre', 'noir', 'contre', null, 'Annule la carte d’en face, quelle qu’elle soit. Sacrifice 1.', 'commune', '👤', ['Sacrifice']),
  c('NO07', 47, 'Trou noir', 'noir', 'tactique', null, 'Annule la carte d’en face et la détruit. Usage unique.', 'rare', '🕳️', ['Détruire', 'Usage unique']),
  c('NO08', 48, 'Âme sombre', 'noir', 'attaque', 2, '+1 par Sacrifice que tu as fait ce tour.', 'commune', '👻'),
];

// rythme.kind : 'cartes' (cartes jouées), 'attaques' (Attaques jouées), 'annulations' (cartes adverses annulées),
// 'tours' (tous les n tours), 'fois' (n utilisations par partie), 'aucun'.
const ch = (id, numero, nom, couleurs, pv, rythme, pouvoir, texte, art) => ({
  id, numero, nom, couleurs, pv, rythme, pouvoir, texte, art,
});

export const CHAMPIONS = [
  ch('jimmy', 101, 'Jimmy l’alien', ['violet', 'bleu'], 26, { kind: 'cartes', n: 3 }, 'Je sais tout', 'Regarde la prochaine carte adverse ; tu peux ensuite échanger tes 2 prochaines cartes.', '👽'),
  ch('butch', 102, 'Butch Pakovski', ['jaune', 'violet'], 20, { kind: 'cartes', n: 3 }, 'Le croupier', 'Lance un dé. 1 : rien · 2 : +2 bouclier · 3 : soigne 2 PV · 4 : inflige 2 dégâts · 5 : +4 bouclier · 6 : Jackpot, inflige 3 dégâts et +3 bouclier.', '🎲'),
  ch('reine', 103, 'Reine de la Nuée', ['vert', 'noir'], 22, { kind: 'cartes', n: 5 }, 'Ponte', 'L’adversaire subit Poison 2.', '🪲'),
  ch('pirate', 104, 'Capitaine pirate', ['rouge', 'noir'], 20, { kind: 'attaques', n: 3 }, 'Abordage', 'Ta prochaine Attaque fait +3.', '🏴‍☠️'),
  ch('neutron', 105, 'Le Neutron', ['rouge', 'jaune'], 18, { kind: 'cartes', n: 5 }, 'Réacteur chargé', 'Ta prochaine carte, si c’est une Attaque, fait le double.', '⚛️'),
  ch('garde', 106, 'Garde galactique', ['jaune', 'bleu'], 30, { kind: 'aucun' }, 'Aucun pouvoir', 'Le champion le plus solide du jeu.', '🛡️'),
  ch('phenix', 107, 'Phénix solaire', ['rouge', 'vert'], 18, { kind: 'fois', n: 1 }, 'Renaissance', 'Une fois par partie, quand tu tombes à 0 PV, reviens à 5 PV.', '🔥'),
  ch('meduse', 108, 'Méduse abyssale', ['bleu', 'noir'], 20, { kind: 'annulations', n: 2 }, 'Piqûre', 'L’adversaire subit 3 dégâts.', '🪼'),
  ch('chat', 109, 'Chat néon', ['violet', 'rouge'], 21, { kind: 'cartes', n: 3 }, 'Neuf vies', 'Tu ne subis aucun dégât au duel suivant.', '🐈'),
  ch('comete', 110, 'La Comète', ['rouge', 'bleu'], 18, { kind: 'cartes', n: 6 }, 'Passage', 'Inflige 2 dégâts Perforants.', '☄️'),
  ch('pingouin', 111, 'Pingouin cryogénique', ['bleu', 'vert'], 20, { kind: 'cartes', n: 7 }, 'Banquise', 'Gel : la prochaine carte adverse est annulée.', '🐧'),
  ch('explorateur', 112, 'L’Explorateur', ['vert', 'jaune'], 22, { kind: 'tours', n: 2 }, 'Prospection', 'Au début des tours 2, 4, 6…, après la pioche : soigne 1 PV, puis défausse jusqu’à 2 cartes et pioche autant.', '🧭'),
  ch('champignon', 113, 'Champignon dansant', ['vert', 'violet'], 24, { kind: 'cartes', n: 3 }, 'Spores hypnotiques', 'Échange les 2 prochaines cartes de l’adversaire et soigne 1 PV.', '🍄'),
  ch('glouton', 114, 'Le Glouton du trou noir', ['jaune', 'noir'], 24, { kind: 'cartes', n: 4 }, 'Festin', 'Inflige 1 dégât, puis vole tout le bouclier adverse (10 au plus pour toi).', '😋'),
  ch('empereur', 115, 'L’Empereur galactique', ['violet', 'noir'], 24, { kind: 'fois', n: 3 }, 'Décret impérial', 'Trois fois par partie, annule une carte adverse juste après sa révélation.', '👑'),
];

/** L'extension de ces cartes. */
export const EXTENSION = { nom: 'Premier Contact', code: 'PCO' };

/**
 * Illustrateur de chaque carte (colonne « Illustrateur » de l'export Figma). Par défaut DEFAULT_ILLUSTRATOR ;
 * pour une carte précise : ILLUSTRATORS.RO01 = '…', et pour sa version alternative : ILLUSTRATORS['RO01*'] = '…'.
 */
export const DEFAULT_ILLUSTRATOR = 'Tylt';
export const ILLUSTRATORS = {};

/**
 * Couleur de chaque type de carte (colonne « Couleur_type » de l'export Figma : bandeau du type, icône…).
 * Les personnages et les marqueurs ont aussi la leur.
 */
export const TYPE_COLORS = {
  Attaque: '#e5484d',
  Garde: '#d4a017',
  Contre: '#22b8cf',
  Tactique: '#9b6dff',
  Personnage: '#ffd36b',
  Marqueur: '#8b95a7',
};

/** Petites phrases d'ambiance (« Extra » sur la carte), par id de carte, de personnage ou de marqueur. */
export const FLAVOR = {
  RO01: 'Le plus vieux canon de la flotte. Il n’a jamais raté une occasion de faire du bruit.',
  RO02: 'Une salve, puis une autre. Jimmy appelle ça « dire bonjour ».',
  RO03: 'Attention à la tête… et aux pieds. Surtout aux pieds.',
  RO04: 'Le Destroyer ne frappe pas à la porte. Il passe à travers.',
  RO05: 'Quand le voyant devient rouge, c’est que tout va bien. Enfin, presque.',
  RO06: 'Même désamorcée, elle trouve toujours un moyen de faire boum.',
  RO07: 'Contrer ça ? Bonne chance. Il y en a partout.',
  RO08: 'Plus on la provoque, plus elle cogne fort.',
  BL01: 'Un pas de côté, un peu de givre, et l’attaque glisse.',
  BL02: 'Tu frappes le miroir ? C’est toi que tu frappes.',
  BL03: 'Le froid répond toujours. Un peu.',
  BL04: 'Plus rien ne bouge. Même pas tes plans.',
  BL05: 'Les petits coups se perdent dans la tempête.',
  BL06: 'Construit en une nuit par des pingouins très motivés.',
  BL07: 'Brillant, tranchant, et franchement vexant.',
  BL08: 'Jimmy voit loin. Méfiez-vous de Jimmy.',
  VE01: 'Ça gratte un peu. Puis beaucoup.',
  VE02: 'Un peu de sève, et ça repart.',
  VE03: 'Lente, têtue, et presque impossible à fendre.',
  VE04: 'Elles s’enroulent autour de tout ce qui bouge. Et de ce qui ne bouge pas.',
  VE05: 'La Nuée a toujours faim. Toujours.',
  VE06: 'Atchoum ! L’attaque est partie… ailleurs.',
  VE07: 'On en écrase un, il en arrive dix.',
  VE08: 'Au printemps de Spore, tout repousse. Même les blessures.',
  JA01: 'Le soleil protège ceux qui savent l’attendre.',
  JA02: 'Lent à monter. Impossible à faire tomber.',
  JA03: 'Touche-moi si tu l’oses. Vraiment, ose.',
  JA04: 'Le Bouclier tient depuis mille ans. Il tiendra bien un tour de plus.',
  JA05: 'Toute la lumière qu’il a gardée, il te la renvoie d’un coup.',
  JA06: 'Deux fois plus de lumière, deux fois plus de soucis pour toi.',
  JA07: 'Halte ! Plus personne ne passe.',
  JA08: 'Attention à la tête… et surtout aux yeux.',
  VI01: 'Jimmy sait ce que tu vas jouer. Jimmy sait tout.',
  VI02: 'Tu étais sûr de l’ordre de tes cartes ? Tu l’étais.',
  VI03: 'Il t’a vu venir. De très loin.',
  VI04: 'Tu frappes… du vide.',
  VI05: 'Ce que tu fais, je le fais. En mieux.',
  VI06: 'Tout ce que tu avais prévu ? À l’envers.',
  VI07: 'Les ruses se retournent toujours contre leur auteur.',
  VI08: 'Tu as l’impression d’avoir déjà vu cette carte ? Normal.',
  NO01: 'Chaque coup se paie. Celui-là en vaut la peine.',
  NO02: 'Plus de bouclier. Plus d’excuses.',
  NO03: 'Les abysses n’oublient jamais un affront.',
  NO04: 'Un peu de toi pour beaucoup de moi.',
  NO05: 'Quand la fin approche, elle frappe plus fort.',
  NO06: 'Ce qui se cache dans l’ombre efface tout. Même ta meilleure carte.',
  NO07: 'Ce qui entre n’en ressort jamais.',
  NO08: 'Plus tu souffres, plus elle grandit.',
  jimmy: 'Méfiez-vous de Jimmy. Il sait tout, et il le sait.',
  butch: '« À prendre ou à laisser. » Butch, à chaque lancer de dé.',
  reine: 'Elle ne se bat pas. Elle pond, et le reste suit.',
  pirate: 'Tout ce qui brille est à lui. Le reste aussi.',
  neutron: 'Le plus beau vaisseau de la flotte. Et le plus nerveux.',
  garde: 'Pas de pouvoir, pas de faiblesse. Juste un mur.',
  phenix: 'Tombé ? Pas pour longtemps.',
  meduse: 'Effleure-la, et tu le regretteras longtemps.',
  chat: 'Neuf vies, zéro regret.',
  comete: 'Elle ne passe qu’une fois… mais quelle fois.',
  pingouin: 'Il glisse, il gèle, il gagne.',
  explorateur: 'Toujours une nouvelle carte au fond du sac.',
  champignon: 'Il danse, tout le monde tourne. Attention à la tête.',
  glouton: 'Rien ne lui résiste. Pas même ton bouclier.',
  empereur: 'Par décret impérial, ta carte est annulée. Merci de votre compréhension.',
  MK01: 'Garde les comptes au chaud.',
  MK02: 'Pour compter à froid.',
  MK03: 'Ça pousse, ça descend, ça repousse.',
  MK04: 'Tes points de vie au soleil.',
  MK05: 'Compte en couleur, joue en douleur.',
  MK06: 'Au fond des abysses, on compte aussi.',
};

/** Phrases d'ambiance des versions alternatives ❖ (une autre facette de la même carte). */
export const FLAVOR_ALT = {
  RO01: 'Repeint en doré pour les grandes occasions. Le bruit, lui, n’a pas changé.',
  RO02: 'Jimmy a demandé « une seule salve ». Personne ne l’a écouté.',
  RO03: 'On a voulu l’éteindre avec un seau d’eau. On cherche encore le seau.',
  RO04: 'Version collector : même trou dans le mur, en plus brillant.',
  RO05: 'Le voyant rouge clignote en rythme. C’est presque joli.',
  RO06: 'Emballée dans du papier cadeau. Ne pas secouer.',
  RO07: 'Un feu d’artifice, mais vraiment, vraiment trop près.',
  RO08: 'Ne lui dis jamais « calme-toi ». Jamais.',
  BL01: 'Glisser avec élégance, c’est tout un art.',
  BL02: 'Miroir, mon beau miroir… qui va encore se faire mal ?',
  BL03: 'Un coup de froid, avec un petit supplément.',
  BL04: 'Même les étoiles s’arrêtent pour regarder.',
  BL05: 'Dehors, il fait −200°. Dedans aussi.',
  BL06: 'Les pingouins l’ont décoré. Ils en sont très fiers.',
  BL07: 'Taillé à la main par un artisan des glaces. Très, très pointu.',
  BL08: 'Jimmy a vu ta carte avant toi. Et il sourit.',
  VE01: 'Ne pas respirer. Surtout ne pas respirer.',
  VE02: 'Une tisane de spores, et tout va mieux.',
  VE03: 'Elle a vu passer trois empires. Elle les a tous enterrés.',
  VE04: 'Elles ont poussé pendant que tu réfléchissais.',
  VE05: 'Une bouchée, juste une petite bouchée.',
  VE06: 'Rhume des foins galactique : ne pas approcher.',
  VE07: 'Le bourdonnement s’entend à trois planètes de distance.',
  VE08: 'Les fleurs de Spore chantent. Faux, mais avec cœur.',
  JA01: 'Un lever de soleil sur un bouclier. Rien de plus beau.',
  JA02: 'Il a fallu mille ans pour le construire, et une seconde pour le regretter de l’autre côté.',
  JA03: 'Jolie, dorée et piquante. Ne pas caresser.',
  JA04: 'Sa lumière se voit depuis l’autre bout de la galaxie.',
  JA05: 'Il a stocké le soleil tout l’été pour ce moment.',
  JA06: 'Les anciens disent qu’elle porte bonheur. Aux autres, pas à toi.',
  JA07: 'Il n’a pas bougé depuis cent ans. Ce n’est pas aujourd’hui qu’il va bouger.',
  JA08: 'Attention à la tête… et prévois des lunettes de soleil.',
  VI01: 'Jimmy lit dans tes pensées. Elles sont… intéressantes.',
  VI02: 'Abracadabra. Tes plans ont disparu.',
  VI03: 'Il brille dans le noir. Et toi, tu n’y vois plus rien.',
  VI04: 'Tu es sûr d’avoir frappé quelque chose ?',
  VI05: 'Il y a deux cartes identiques. L’une d’elles ment.',
  VI06: 'Haut, bas, gauche, droite : plus rien ne veut rien dire.',
  VI07: 'Ta ruse t’a fait un clin d’œil, puis elle t’a frappé.',
  VI08: 'Cette phrase, tu l’as déjà lue. Ou pas ?',
  NO01: 'Forgée au fond des abysses, là où même la lumière a peur.',
  NO02: 'Il frappe, et ton bouclier n’est plus qu’un souvenir.',
  NO03: 'Tu entends ce murmure ? C’est ton bouclier qui s’en va.',
  NO04: 'Signe ici. Et ici. Et là aussi. Avec ton sang, bien sûr.',
  NO05: 'Le dernier visage que voient les champions fatigués.',
  NO06: 'Tu crois être seul ? Regarde derrière toi.',
  NO07: 'Il a avalé une flotte entière. Il a encore un peu faim.',
  NO08: 'Elle se nourrit de chaque sacrifice. Elle n’est jamais rassasiée.',
  jimmy: 'Version dorée : Jimmy sait tout, et maintenant il brille.',
  butch: 'Butch a gagné à son propre casino. Personne ne sait comment.',
  reine: 'Sa couronne est faite de mille ailes. Ne demande pas d’où elles viennent.',
  pirate: 'Le trésor le plus précieux ? Ta dernière carte.',
  neutron: 'Le réacteur chauffe. Attention à la tête.',
  garde: 'En service depuis toujours. En congé jamais.',
  phenix: 'Chaque fois qu’il tombe, il revient plus brillant.',
  meduse: 'Elle danse dans les abysses. Ne regarde pas trop longtemps.',
  chat: 'Huit vies déjà dépensées. Il garde la dernière pour toi.',
  comete: 'Fais un vœu. Vite.',
  pingouin: 'Il ne glisse pas, il patine. Nuance.',
  explorateur: 'Son sac contient tout. Même ce que tu cherches.',
  champignon: 'La fête ne s’arrête jamais sur la planète Spore.',
  glouton: 'Il a mangé une étoile au petit-déjeuner.',
  empereur: 'Un décret, une signature, et ta carte n’existe plus.',
  MK01: 'Pour compter les PV au coin du feu.',
  MK02: 'Pour garder la tête froide.',
  MK03: 'Pour voir tes PV repousser.',
  MK04: 'Pour compter sous le soleil.',
  MK05: 'Pour compter en couleur.',
  MK06: 'Pour compter dans le noir.',
};

/** Définition courte de chaque mot-clé, ajoutée entre parenthèses dans les descriptions. */
export const KEYWORDS = {
  'Perforant': 'ignore le bouclier',
  'Gel': 'la prochaine carte adverse est annulée',
  'Vision': 'regarde les prochaines cartes de la pile adverse',
  'Poison': 'l’adversaire perd 1 PV à la fin de chacun des prochains duels',
  'Épines': 'si une Attaque adverse te touche pendant ce duel, son attaquant subit ces dégâts',
  'Sacrifice': 'tu perds ces PV, le bouclier ne les absorbe pas',
  'Vol de vie': 'tu regagnes les PV infligés',
  'Enchaînement': 'bonus selon ta carte précédente',
  'Préparation': 'l’effet s’applique à ta prochaine carte',
  'Usage unique': 'défaussée après usage',
  'Si annulée': 'même si la carte est annulée',
};

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
  alternative: { nom: 'Alternative', symbole: '❖' },
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
