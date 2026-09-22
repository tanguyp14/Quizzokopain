// Built-in question bank, grouped by theme. Each question follows the shapes
// described in questionTypes.js.

const qcm = (prompt, choices, answer, extra = {}) => ({ type: 'qcm', prompt, choices, answer, ...extra });
const vf = (prompt, answer, extra = {}) => ({ type: 'vraifaux', prompt, answer, ...extra });
const libre = (prompt, answer, accept = [], extra = {}) => ({ type: 'libre', prompt, answer, accept, ...extra });
const rebus = (emoji, answer, accept = [], extra = {}) => ({ type: 'rebus', prompt: 'Résous ce rébus !', media: { emoji }, answer, accept, ...extra });
const film = (emoji, answer, accept = []) => ({ type: 'image', prompt: 'Quel film se cache derrière ces emojis ?', media: { emoji }, answer, accept });
const emojiQ = (prompt, emoji, answer, accept = []) => ({ type: 'image', prompt, media: { emoji }, answer, accept });
const estim = (prompt, answer, unit, extra = {}) => ({ type: 'estimation', prompt, answer, ...(unit && { unit }), ...extra });

const LEVEL_CODES = { F: 'facile', M: 'moyen', D: 'difficile' };

const RAW_THEMES = [
  {
    id: 'cinema',
    name: 'Cinéma',
    emoji: '🎬',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFFMMMFFMMMMMMMFDDDD',
    keywords: ['films', 'acteurs', 'oscars', 'emojis'],
    questions: [
      film('🦁👑', 'Le Roi Lion', ['The Lion King']),
      film('🚢🧊💔', 'Titanic'),
      film('🦖🏝️🚙', 'Jurassic Park'),
      film('💍🌋🧙‍♂️', 'Le Seigneur des anneaux', ['Seigneur des anneaux', 'Lord of the Rings']),
      film('⏰🚗⚡', 'Retour vers le futur', ['Back to the Future']),
      film('👽🚲🌕', 'E.T.', ['ET', 'E.T. l’extra-terrestre', 'E.T. l\'extraterrestre']),
      film('🐀👨‍🍳🇫🇷', 'Ratatouille'),
      film('🐠🔍🌊', 'Le Monde de Nemo', ['Nemo', 'Finding Nemo']),
      film('🎈🏠👴', 'Là-haut', ['La haut', 'Up']),
      film('💊🕶️💻', 'Matrix', ['The Matrix']),
      film('🦈🏖️😱', 'Les Dents de la mer', ['Jaws']),
      film('🍫🏭🎩', 'Charlie et la Chocolaterie', ['Charlie et la chocolaterie', 'Willy Wonka']),
      qcm('Qui a réalisé « Pulp Fiction » ?', ['Martin Scorsese', 'Quentin Tarantino', 'Steven Spielberg', 'David Fincher'], 1),
      qcm('Quel film a remporté l’Oscar du meilleur film en 2020 ?', ['1917', 'Joker', 'Parasite', 'Once Upon a Time… in Hollywood'], 2),
      vf('« Le Fabuleux Destin d’Amélie Poulain » se déroule principalement à Montmartre.', true),
      libre('Quel acteur incarne Jack Sparrow dans « Pirates des Caraïbes » ?', 'Johnny Depp', ['Depp']),
      estim('En quelle année est sorti le premier film « Star Wars » ?', 1977),
      qcm('Qui a réalisé « 2001, l’Odyssée de l’espace » ?', ['Stanley Kubrick', 'Ridley Scott', 'George Lucas', 'Andreï Tarkovski'], 0),
      libre('Quel film d’Orson Welles (1941) tourne autour du mot « Rosebud » ?', 'Citizen Kane'),
      estim('En quelle année a eu lieu la première cérémonie des Oscars ?', 1929),
    ],
  },
  {
    id: 'musique',
    name: 'Musique',
    emoji: '🎵',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFMFMFFMFMMDDD',
    keywords: ['chanson', 'instruments', 'compositeurs'],
    questions: [
      qcm('Quel groupe a chanté « Bohemian Rhapsody » ?', ['The Beatles', 'Queen', 'Led Zeppelin', 'ABBA'], 1),
      qcm('Combien de cordes possède une guitare classique ?', ['4', '5', '6', '7'], 2),
      qcm('Qui a composé « Les Quatre Saisons » ?', ['Mozart', 'Bach', 'Vivaldi', 'Beethoven'], 2),
      vf('Stromae est belge.', true),
      vf('Le groupe Daft Punk était composé de trois membres.', false, { explanation: 'Deux : Thomas Bangalter et Guy-Manuel de Homem-Christo.' }),
      libre('Quel chanteur surnommé « le King » a interprété « Jailhouse Rock » ?', 'Elvis Presley', ['Elvis']),
      libre('Quelle chanteuse française a interprété « La Vie en rose » ?', 'Édith Piaf', ['Piaf', 'Edith Piaf']),
      emojiQ('Quelle chanson de Disney se cache derrière ces emojis ?', '👸❄️🏰🎶', 'Libérée, délivrée', ['Liberee delivree', 'Let it go']),
      emojiQ('Quel instrument est-ce ?', '🎹', 'Piano', ['Clavier', 'Synthétiseur']),
      rebus('🍞 + 🪣', 'Pinceau', [], { explanation: 'Pain + seau = pinceau (le peintre en a besoin… et le musicien ?)' }),
      estim('Combien de touches compte un piano standard ?', 88, 'touches'),
      estim('En quelle année Mozart est-il né ?', 1756),
      qcm('Combien de symphonies Beethoven a-t-il composées ?', ['5', '7', '9', '12'], 2),
      libre('Quel compositeur français a écrit le « Boléro » ?', 'Maurice Ravel', ['Ravel']),
    ],
  },
  {
    id: 'geographie',
    name: 'Géographie',
    emoji: '🌍',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'MFFFMFFFDMFMDDD',
    keywords: ['pays', 'capitales', 'drapeaux'],
    questions: [
      qcm('Quelle est la capitale de l’Australie ?', ['Sydney', 'Melbourne', 'Canberra', 'Perth'], 2),
      qcm('Quel est le plus long fleuve de France ?', ['La Seine', 'Le Rhône', 'La Garonne', 'La Loire'], 3),
      qcm('Dans quel pays se trouve le Machu Picchu ?', ['Mexique', 'Pérou', 'Chili', 'Bolivie'], 1),
      vf('Le mont Blanc est le plus haut sommet d’Europe occidentale.', true),
      vf('L’Islande fait partie de l’Union européenne.', false),
      emojiQ('De quel pays est-ce le drapeau ?', '🇯🇵', 'Japon'),
      emojiQ('De quel pays est-ce le drapeau ?', '🇧🇷', 'Brésil', ['Bresil']),
      emojiQ('De quel pays est-ce le drapeau ?', '🇨🇦', 'Canada'),
      emojiQ('De quel pays est-ce le drapeau ?', '🇰🇪', 'Kenya'),
      libre('Quelle est la capitale du Canada ?', 'Ottawa'),
      libre('Quel océan borde la côte ouest des États-Unis ?', 'Pacifique', ['Océan Pacifique']),
      estim('Combien de départements compte la France (outre-mer compris) ?', 101, 'départements'),
      estim('Quelle est l’altitude de l’Everest, en mètres ?', 8849, 'm'),
      qcm('Quelle est la capitale du Kazakhstan ?', ['Almaty', 'Astana', 'Bichkek', 'Tachkent'], 1),
      libre('Quel est le plus long fleuve d’Europe ?', 'Volga', ['La Volga']),
    ],
  },
  {
    id: 'histoire',
    name: 'Histoire',
    emoji: '🏛️',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FDMFMFFMFFFFDD',
    keywords: ['dates', 'rois', 'civilisations'],
    questions: [
      qcm('En quelle année a eu lieu la prise de la Bastille ?', ['1689', '1789', '1815', '1848'], 1),
      qcm('Qui était le premier empereur romain ?', ['Jules César', 'Néron', 'Auguste', 'Caligula'], 2),
      qcm('Quelle civilisation a construit Chichén Itzá ?', ['Les Aztèques', 'Les Mayas', 'Les Incas', 'Les Olmèques'], 1),
      vf('Napoléon Bonaparte est né en Corse.', true),
      vf('Le mur de Berlin est tombé en 1991.', false, { explanation: 'Il est tombé le 9 novembre 1989.' }),
      libre('Quel navigateur a atteint l’Amérique en 1492 ?', 'Christophe Colomb', ['Colomb', 'Christopher Columbus']),
      libre('Quelle reine de France a été guillotinée en 1793 ?', 'Marie-Antoinette', ['Marie Antoinette']),
      libre('Quel pharaon est célèbre pour son tombeau découvert intact en 1922 ?', 'Toutânkhamon', ['Toutankhamon', 'Tutankhamon']),
      emojiQ('Quel monument est représenté ?', '🗽', 'La statue de la Liberté', ['Statue de la Liberté', 'Statue of Liberty']),
      rebus('🐱 + 🪴', 'Chapeau', [], { explanation: 'Chat + pot = chapeau (le bicorne de Napoléon !)' }),
      estim('En quelle année l’Homme a-t-il marché sur la Lune pour la première fois ?', 1969),
      estim('En quelle année a débuté la Première Guerre mondiale ?', 1914),
      qcm('En quelle année le traité de Verdun a-t-il partagé l’empire de Charlemagne ?', ['800', '843', '987', '1066'], 1),
      libre('Quelle bataille François Ier a-t-il remportée en 1515 ?', 'Marignan', ['Bataille de Marignan']),
    ],
  },
  {
    id: 'sciences',
    name: 'Sciences',
    emoji: '🔬',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'MFMMFMFFMMFDDD',
    keywords: ['physique', 'chimie', 'espace'],
    questions: [
      qcm('Quel est le symbole chimique de l’or ?', ['Or', 'Au', 'Ag', 'Go'], 1),
      qcm('Quelle planète est la plus proche du Soleil ?', ['Vénus', 'Mars', 'Mercure', 'Terre'], 2),
      qcm('Combien d’os compte le squelette d’un adulte ?', ['186', '206', '226', '306'], 1),
      vf('Le son se propage plus vite dans l’eau que dans l’air.', true),
      vf('Les chauves-souris sont aveugles.', false, { explanation: 'Elles voient, mais utilisent aussi l’écholocation.' }),
      libre('Quel gaz les plantes absorbent-elles pour la photosynthèse ?', 'Dioxyde de carbone', ['CO2', 'Gaz carbonique']),
      libre('Qui a formulé la théorie de la relativité ?', 'Albert Einstein', ['Einstein']),
      emojiQ('Quelle planète est représentée ?', '🪐', 'Saturne', ['Saturn']),
      rebus('🍵 + 🥛 + 👁️', 'Télévision', ['Television', 'Télé'], { explanation: 'Thé + lait + vision = télévision' }),
      estim('Quelle est la vitesse de la lumière, en km/s (arrondie) ?', 300000, 'km/s'),
      estim('À quelle température (°C) l’eau bout-elle au niveau de la mer ?', 100, '°C'),
      qcm('Quel est l’élément chimique le plus abondant dans l’univers ?', ['Oxygène', 'Hélium', 'Hydrogène', 'Carbone'], 2),
      libre('Quelle particule de l’atome porte une charge électrique négative ?', 'Électron', ['Electron', 'Les électrons']),
      estim('Combien de chromosomes compte une cellule humaine (hors gamètes) ?', 46, 'chromosomes'),
    ],
  },
  {
    id: 'sport',
    name: 'Sport',
    emoji: '⚽',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFFMMFFFMFMMDMD',
    keywords: ['football', 'rugby', 'jeux olympiques'],
    questions: [
      qcm('Combien de joueurs compte une équipe de football sur le terrain ?', ['9', '10', '11', '12'], 2),
      qcm('Quel pays a remporté la Coupe du monde de football 2018 ?', ['Croatie', 'Brésil', 'Allemagne', 'France'], 3),
      qcm('Dans quel sport utilise-t-on un « volant » ?', ['Tennis', 'Badminton', 'Squash', 'Ping-pong'], 1),
      vf('Un marathon mesure 42,195 km.', true),
      vf('Le Tour de France a été créé après la Seconde Guerre mondiale.', false, { explanation: 'La première édition date de 1903.' }),
      libre('Quel joueur de tennis détient le record de victoires à Roland-Garros ?', 'Rafael Nadal', ['Nadal']),
      libre('Dans quelle ville se sont déroulés les Jeux olympiques d’été de 2024 ?', 'Paris'),
      emojiQ('Quel sport est représenté ?', '🏉', 'Rugby'),
      emojiQ('Quel sport est représenté ?', '🥌', 'Curling'),
      rebus('🐔 + 🥛', 'Poulet', [], { explanation: 'Poule + lait = poulet (pas vraiment sportif, on vous l’accorde)' }),
      estim('Combien de points vaut un essai transformé au rugby à XV ?', 7, 'points'),
      estim('Combien de trous compte un parcours de golf standard ?', 18, 'trous'),
      qcm('Dans quelle ville se sont tenus les premiers Jeux olympiques modernes, en 1896 ?', ['Paris', 'Londres', 'Athènes', 'Rome'], 2),
      libre('Quel pays a remporté le plus de Coupes du monde de football ?', 'Brésil', ['Bresil']),
      estim('Combien de joueurs par équipe sont dans l’eau au water-polo (gardien compris) ?', 7, 'joueurs'),
    ],
  },
  {
    id: 'jeuxvideo',
    name: 'Jeux vidéo',
    emoji: '🎮',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFMMMFFFMFDDD',
    keywords: ['nintendo', 'retro', 'consoles'],
    questions: [
      qcm('Quel est le nom du frère de Mario ?', ['Wario', 'Luigi', 'Toad', 'Yoshi'], 1),
      qcm('Quelle entreprise a créé la PlayStation ?', ['Nintendo', 'Sega', 'Sony', 'Microsoft'], 2),
      qcm('Dans « The Legend of Zelda », comment s’appelle le héros ?', ['Zelda', 'Link', 'Ganon', 'Epona'], 1),
      vf('Minecraft est le jeu vidéo le plus vendu de l’histoire.', true),
      vf('Pac-Man a été créé en France.', false, { explanation: 'Il a été créé au Japon par Namco en 1980.' }),
      libre('Quel Pokémon jaune est la mascotte de la franchise ?', 'Pikachu'),
      libre('Quel hérisson bleu est la mascotte de Sega ?', 'Sonic'),
      emojiQ('Quel jeu vidéo se cache derrière ces emojis ?', '🧱⛏️🐷', 'Minecraft'),
      emojiQ('Quel jeu vidéo se cache derrière ces emojis ?', '🟦🟥🟨🟩⬇️', 'Tetris'),
      emojiQ('Quel jeu vidéo se cache derrière ces emojis ?', '🍄👨‍🔧👸🏰', 'Super Mario', ['Mario', 'Super Mario Bros']),
      estim('En quelle année est sortie la première Game Boy ?', 1989),
      qcm('Quel studio a développé « The Witcher 3 » ?', ['BioWare', 'CD Projekt Red', 'Bethesda', 'Ubisoft'], 1),
      libre('Quel game designer de Nintendo a créé Mario et Zelda ?', 'Shigeru Miyamoto', ['Miyamoto']),
    ],
  },
  {
    id: 'cuisine',
    name: 'Cuisine',
    emoji: '🍳',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFMFMFMFFFMDDM',
    keywords: ['plats', 'fromages', 'gastronomie'],
    questions: [
      qcm('Quel fromage est traditionnellement utilisé dans une tartiflette ?', ['Comté', 'Reblochon', 'Camembert', 'Roquefort'], 1),
      qcm('De quel pays vient le guacamole ?', ['Espagne', 'Brésil', 'Mexique', 'Pérou'], 2),
      qcm('Quel est l’ingrédient principal du houmous ?', ['Lentilles', 'Pois chiches', 'Haricots blancs', 'Fèves'], 1),
      vf('La tomate est botaniquement un fruit.', true),
      vf('Le croissant est une invention française.', false, { explanation: 'Il descend du « kipferl » autrichien.' }),
      libre('Quelle ville est réputée pour sa moutarde ?', 'Dijon'),
      libre('Comment appelle-t-on les pâtes en forme de papillon ?', 'Farfalle'),
      emojiQ('Quel plat est-ce ?', '🥖🧀🍷🫕', 'Fondue', ['Fondue savoyarde']),
      rebus('🍎 + 🌍', 'Pomme de terre', ['Patate']),
      rebus('🥬 + 🌸', 'Chou-fleur', ['Chou fleur']),
      rebus('🧂 + 🍚', 'Céleri', ['Celeri'], { explanation: 'Sel + riz = céleri' }),
      estim('Combien de litres de lait faut-il environ pour faire 1 kg de comté ?', 12, 'litres'),
      qcm('Quelle épice est la plus chère au monde ?', ['Vanille', 'Safran', 'Cardamome', 'Poivre'], 1),
      libre('Quel fromage italien entre dans la recette du tiramisu ?', 'Mascarpone'),
    ],
  },
  {
    id: 'animaux',
    name: 'Animaux',
    emoji: '🦊',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFDDMFFFMDDM',
    keywords: ['nature', 'faune', 'zoologie'],
    questions: [
      qcm('Quel est le plus grand animal du monde ?', ['L’éléphant d’Afrique', 'Le requin-baleine', 'La baleine bleue', 'La girafe'], 2),
      qcm('Combien de pattes a une araignée ?', ['6', '8', '10', '12'], 1),
      qcm('Comment appelle-t-on le petit du lièvre ?', ['Le lapereau', 'Le levraut', 'Le faon', 'Le marcassin'], 1),
      vf('Le cœur d’une crevette se trouve dans sa tête.', true),
      vf('Les pieuvres ont deux cœurs.', false, { explanation: 'Elles en ont trois !' }),
      libre('Quel animal est le symbole du WWF ?', 'Panda', ['Panda géant']),
      libre('Quel est le mâle de la chèvre ?', 'Bouc'),
      emojiQ('Quel animal se cache derrière ces emojis ?', '🦓', 'Zèbre', ['Zebre']),
      rebus('🐀 + 💧', 'Radeau', [], { explanation: 'Rat + eau = radeau' }),
      rebus('🐶 + 🦷', 'Chiendent', [], { explanation: 'Chien + dent = chiendent' }),
      estim('Combien de temps (en jours) dure la gestation d’une éléphante ?', 640, 'jours'),
      estim('Jusqu’à quelle vitesse (km/h) un guépard peut-il courir ?', 110, 'km/h'),
    ],
  },
  {
    id: 'culture',
    name: 'Culture générale',
    emoji: '🧠',
    // Difficulty of each question, in order: F = facile, M = moyen, D = difficile.
    levels: 'FFFFMMFFFMMMDDD',
    keywords: ['littérature', 'art', 'rébus'],
    questions: [
      qcm('Qui a peint « La Joconde » ?', ['Michel-Ange', 'Raphaël', 'Léonard de Vinci', 'Botticelli'], 2),
      qcm('Quelle est la monnaie du Japon ?', ['Le yuan', 'Le won', 'Le yen', 'La roupie'], 2),
      qcm('Quel auteur a écrit « Les Misérables » ?', ['Émile Zola', 'Victor Hugo', 'Alexandre Dumas', 'Balzac'], 1),
      vf('Le français est une langue officielle au Canada.', true),
      vf('La Grande Muraille de Chine est visible à l’œil nu depuis la Lune.', false),
      libre('Quel est l’auteur du « Petit Prince » ?', 'Antoine de Saint-Exupéry', ['Saint-Exupéry', 'Saint Exupery']),
      libre('Combien de côtés a un hexagone ? (en toutes lettres ou en chiffres)', 'Six', ['6']),
      rebus('🏹 + ☁️', 'Arc-en-ciel', ['Arc en ciel']),
      rebus('🚪 + 🧥', 'Porte-manteau', ['Portemanteau', 'Porte manteau']),
      rebus('👊 + ☀️', 'Coup de soleil'),
      rebus('🍚 + 💧', 'Rideau', [], { explanation: 'Riz + eau = rideau' }),
      rebus('🏠 + 🥛', 'Toilette', ['Toilettes'], { explanation: 'Toit + lait = toilette' }),
      estim('Combien de pays sont membres de l’ONU ?', 193, 'pays'),
      qcm('Qui a écrit « À la recherche du temps perdu » ?', ['Marcel Proust', 'Gustave Flaubert', 'Honoré de Balzac', 'André Gide'], 0),
      libre('Quel peintre s’est coupé une partie de l’oreille en 1888 ?', 'Vincent van Gogh', ['Van Gogh']),
    ],
  },
];

// Attach each question's difficulty from the theme's `levels` string.
const THEMES = RAW_THEMES.map(({ levels, ...theme }) => {
  if (levels.length !== theme.questions.length) throw new Error(`questionBank: levels mismatch for ${theme.id}`);
  return { ...theme, questions: theme.questions.map((q, i) => ({ ...q, difficulty: LEVEL_CODES[levels[i]] })) };
});

module.exports = { THEMES };
