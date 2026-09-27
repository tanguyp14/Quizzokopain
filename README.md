# 👽 Neutron

*Jimmy, l'alien qui sait tout, te met au défi.*

Jimmy l'alien part à la conquête de l'univers : on l'aide en jouant au quiz entre amis dans des **rooms privées**, et en menant sa flotte de planète en planète dans **Jimmy Blast**. Les liens partagés (Discord, WhatsApp…) affichent une carte d'aperçu (`public/og/neutron.png`, régénérable avec `node scripts/og/render.js`).

Côté quiz : L'admin de la room choisit un thème (ou le laisse au hasard), lance les questions, et **valide lui-même les réponses libres**. Une bonne réponse = **1 point**.

## Fonctionnalités

- **Comptes** : inscription / connexion par pseudo + mot de passe (hash scrypt, cookie de session httpOnly).
- **Rooms privées** : code à 5 caractères + lien d'invitation. Il faut un compte et le code pour entrer.
- **Thèmes** : 10 thèmes intégrés (Cinéma, Musique, Géographie, Histoire, Sciences, Sport, Jeux vidéo, Cuisine, Animaux, Culture générale), plus 🎲 *Thème surprise* (tiré au sort au lancement), 🌀 *Grand mix* et ✍️ *Mes questions*.
- **Types de questions** :
  | Type | Correction |
  |---|---|
  | QCM | automatique |
  | Vrai / faux | automatique |
  | Réponse libre | **validée par l'admin** (pré-correction tolérante aux fautes) |
  | Rébus (emojis) | **validée par l'admin** |
  | Devine l'image / le film (emojis ou URL d'image) | **validée par l'admin** |
  | Réponse chiffrée | automatique : le nombre exact |
  | Classer dans l'ordre (2 à 8 éléments, texte et/ou image) | automatique : l'ordre complet, glisser-déposer ou ↑ ↓ |
- **Difficulté par question** (🟢 facile / 🟠 moyen / 🔴 difficile). Chaque quiz affiche sa répartition. Dans le lobby, choisir une difficulté ne pioche que les questions de ce niveau, y compris en *Thème surprise* et *Grand mix* (toutes thématiques confondues).
- **Quiz créés par les joueurs** : chaque compte peut créer un quiz (nom, emoji, mots-clés, description, questions avec leur difficulté). Le pseudo du créateur est affiché sous le nom. Le quiz est **soumis au SuperAdmin**, qui le valide ou le refuse avec un motif ; une fois validé, il apparaît dans la liste des quiz. Toute modification par l'auteur repasse en validation.
- **Export / import** : chaque quiz s'exporte en **JSON** (`.neutron.json`, complet et réimportable, liens d'images absolus) ou en **CSV** (une question par ligne, séparateur `;`, ouvrable dans Excel). « ⬆️ Importer un quiz » accepte ces deux formats et les fichiers OpenQuizzDB : le quiz s'ouvre dans l'éditeur pour vérification, puis suit la validation habituelle. Modèle CSV vierge : `/api/quiz-template.csv`. Exemple avec tous les types et prompt pour générer un quiz avec une IA : [`docs/`](docs/prompt-cowork.md).
- **Recherche & favoris** : recherche par nom, mot-clé ou pseudo du créateur, filtre par difficulté, ⭐ favoris par compte (affichés en premier dans le lobby).
- **Stats** : parties jouées, victoires, points, taux de bonnes réponses, parties animées ; pour chaque quiz créé : nombre de questions, nombre de parties jouées, nombre de favoris.
- **Photo de profil** : recadrée en carré dans le navigateur, affichée dans les rooms, classements et podium.
- **Invitations** : lien court `/r/CODE`, ou invitation directe d'un joueur par son pseudo (notification en temps réel, même en cours de partie).
- **SuperAdmin** : validation des quiz, gestion des comptes (suspension, nouveau mot de passe, suppression, retrait de photo), fermeture des rooms.
- **Questions perso** : l'admin d'une room peut aussi ajouter des questions juste pour la partie (y compris avec une image via URL).
- **Une bonne réponse = 1 point, sinon rien** (pas de « le plus proche gagne »). Option « ✅ Je valide toutes les réponses » : l'admin corrige aussi les QCM, vrai/faux et réponses chiffrées, à partir de la correction automatique.
- **Musique pendant la partie** : le créateur d'un quiz peut joindre une musique (MP3, MP4, M4A, OGG, WAV — 15 Mo max, jouée en boucle) ; sinon une ambiance est générée par l'app (Web Audio). Chaque joueur a 🔊/🔇 et un volume, mémorisés sur son appareil.
- **Bonne réponse** : confettis, et le fond de particules passe au vert pendant 2 secondes.
- **Mode solo / l'admin joue aussi** : bouton « 🎯 Jouer en solo » (ou case « Je joue aussi » dans le lobby). L'admin répond comme les autres, ne voit pas la réponse tant que la question est ouverte, et valide lui-même ses réponses libres en solo.
- **Réglages** : nombre de questions, chrono par défaut (ou illimité), difficulté, types de questions autorisés.
- **Délai par question** : chaque question peut imposer son propre délai (10 / 15 / 20 / 30 s), prioritaire sur le chrono de la room.
- **Temps réel** (Socket.IO) : la question se ferme automatiquement quand tout le monde a répondu ou à la fin du chrono ; reconnexion transparente en cas de rechargement de la page.
- **Historique** : les dernières parties sur l'accueil, et le détail de chaque partie (questions, bonnes réponses, réponses de chaque joueur).
- **🚀 Blast** (menu) — *Jimmy Blast*, jeu incrémental : la flotte de Jimmy part à la conquête de l'univers, planète par planète. Les vaisseaux foncent sur des blocs de formes aléatoires : chaque dégât rapporte des crédits, et chaque bloc cassé un bonus. Un secteur vidé fait passer au suivant, avec des blocs plus solides.
  - **Flotte** : chaque rang de vaisseau se monte en niveau (dégâts +30 % par niveau et ×2 tous les 10 niveaux ; le prix des niveaux est ×25 par rang jusqu’à la Frégate, puis seulement ×3, pour que monter les gros vaisseaux vaille le coup), avec ses dégâts réels par seconde en temps réel (total du rang et par vaisseau, moyenne sur les 15 dernières secondes), et 5 vaisseaux d’un rang fusionnent en 1 du rang supérieur (4 destroyers pour un cuirassé, 3 cuirassés pour un vaisseau-mère, 3 vaisseaux-mères pour un Neutron) (8 rangs, sans limite de vaisseaux par rang : au-delà de 60, le terrain en montre 60 qui frappent pour toute la flotte ; fusion ×1, ×10 ou Max comme les achats ; on ne peut monter le niveau d'un rang qu'une fois un vaisseau obtenu). Les rangs élevés ont un pouvoir : perforation (Frégate, dégâts en continu pendant la traversée), visée (Croiseur), onde de choc (Destroyer), marquage (Cuirassé : le bloc touché prend +50 % de dégâts de toute la flotte pendant 4 s et perd son blindage), drones et aura (Vaisseau-mère : 2 drones d’escorte et un cercle autour de lui où les coups de la flotte font +10 %), rayon qui touche tout le secteur (Neutron).
  - **🌟 Ascension** (une fois l'atelier débloqué, sinon ni plafond ni bouton ; l'ascension n demande l'🔩 Alliage niveau n de ce vaisseau dans la Forge) : les niveaux d'un vaisseau sont plafonnés à 100, puis 200, 300… Pour passer le plafond, on paie une ascension : environ 200 niveaux de crédits, plus un peu de 2 minerais de la zone du vaisseau une fois la Forge ouverte (25 et 12 à la première ascension), avec un prix au carré du numéro d'ascension. Chaque ascension multiplie les dégâts du rang par 5. Un prestige remet les ascensions à zéro avec la flotte.
  - **Blocs spéciaux** : blocs dorés (gains ×10) et 💣 bombes, qui explosent sur leurs voisins en cassant. Blocs 🛡️ blindés dès le secteur 11 (20 % des dégâts seulement, sauf perçage et coups critiques) et 💚 régénérants dès le secteur 21 (+5 % de vie par seconde quand on ne les touche plus). Dès le secteur 31, un secteur sur trois environ a un bloc 🔒 scellé (contour en pointillés et vaisseau à la couleur du type demandé) : seul ce type de vaisseau l’abîme (coups, perçage, onde de choc, rayon, drones), les autres passent au travers et le toucher n’y fait rien. Il **bloque le secteur** tant que la flotte n’a pas ce type (un badge « 🔒 il faut un Croiseur » s’affiche) : il faut fusionner pour l’obtenir, ou changer de secteur avec le voyage interspatial. Pour rester raisonnable, le type demandé suit la progression : Éclaireur au début, Chasseur possible dès le secteur 40, Frégate dès 80… Neutron dès 280. Il rapporte ×3 en cassant. Un secteur sur cinq (8, 13, 18…) est un ☄️ essaim de nombreux petits blocs, idéal pour les dégâts de zone.
  - **Une flotte variée** : chaque zone favorise deux types de vaisseaux (💥 ×3 dégâts) et résiste à un autre (🛡️ ×0,5). L'info s'affiche sous la barre de progression et sur les cartes (« ×3 ici »). 🎖️ **Escadrille** : +15 % de dégâts pour toute la flotte par type en service, c'est-à-dire avec 10 vaisseaux, ou 1 vaisseau au niveau 50.
  - **Planètes 🪐 tous les 10 secteurs** : une planète (nommée, avec anneaux fins, bandes et cratères) à conquérir en 30 s. En cas d'échec, retour au secteur précédent, et on retente au prochain passage. Ses points de vie (❤️ PV restants / total) s'affichent sous la barre. Le compteur 🚩 montre les planètes conquises, aussi affiché au classement.
  - **Soucoupe de Jimmy 🛸** : elle traverse l'écran toutes les 45 à 90 s. La toucher donne des crédits, une accélération offerte ou des dégâts ×3 pendant 30 s.
  - **Zones** : la palette des blocs et du fond change tous les 10 secteurs (Nébuleuse, Glace, Lave, Trésor, Jungle alien, Abysses, Néon).
  - **Améliorations** : vitesse, gains, toucher, coups critiques, gains hors ligne. Le toucher reste secondaire : il vaut 1 % des dégâts par seconde de toute la flotte, +0,3 % par niveau de « Doigt de Jimmy » (10 % au maximum). Accélération ×2 pendant 15 s, rechargée en 60 s.
  - **⭐ Prestige** : contre 10M crédits (puis +10M à chaque prestige : 20M, 30M, 40M…) et une fois un secteur atteint dans la partie (20, puis +5 par prestige : 25, 30…, au plus 75 % de son record), on repart de zéro avec +10 % de dégâts pour toujours, cumulés (×1,1, ×1,21…). On gagne aussi 10 🔷 points d'atelier et des étoiles : 1, plus 1 par tranche de 10 secteurs atteints.
  - **🛠️ Atelier des vaisseaux** (onglet qui apparaît à 10 🔷 points de prestige gagnés, payé en 🔷 points, gardé pour toujours ; les parties en cours reçoivent 10 points par prestige déjà fait) :
    - par vaisseau (l'atelier ne donne pas de dégâts, c'est le rôle de la Forge) : 💰 soute à butin (+10 % de crédits sur ses coups par niveau, sans limite ; le prix monte à chaque niveau et avec le rang du vaisseau) et un module spécial par vaisseau : essaim (éclaireurs plus rapides), double tir (chasseurs), foreuse (frégates), lunette (croiseurs : critiques à 200 %, ×10 au lieu de ×5), onde amplifiée (destroyers), obus lourds (cuirassés), hangar (vaisseaux-mères : 4 drones et une aura plus grande), rayon focalisé (Neutrons) ;
    - le doigt de Jimmy : calibre (+10 % de dégâts au toucher par niveau), ongle affûté (critiques), pichenette sismique (dégâts de zone) et doigt automatique (2 touches par seconde).
  - **⚒️ Forge** (onglet visible à partir du prestige 5, débloquée pour 15 🔷 points) :
    - chaque zone de 10 secteurs a son minerai : ✨ poussière d'étoile (1–10), 🧊 cristal de glace (11–20), 🌋 obsidienne (21–30), 🌞 pépite solaire (31–40), 🍄 spore alien (41–50), 🐚 perle abyssale (51–60), 💠 plasma néon (61–70), puis le cycle recommence ;
    - une fois la forge ouverte, 10 % des blocs contiennent le minerai de la zone (blocs brillants) et chaque planète conquise en donne 5 ;
    - on forge des améliorations avancées par vaisseau, sans limite de niveau, avec des recettes de minerais au coût exponentiel (×1,9 par niveau). Plus le niveau monte, plus il faut de minerais différents : 2, puis 3 (niv. 3), 4 (niv. 6), 5 (niv. 11), 6 (niv. 16), puis les 7 (niv. 21). Alliage : +15 % de dégâts par niveau. Stabilisateurs : rebonds plus courts, donc plus de coups (−8 % par niveau jusqu'au 5, puis de moins en moins, 20 % au minimum ; pour les frégates, qui ne rebondissent pas, c'est leur perçage qui accélère) ;
    - les rangs élevés demandent des minerais de zones plus lointaines ; minerais et améliorations sont gardés pour toujours.
    - ⚗️ **Alambic** (à partir du prestige 5, débloqué pour 40 ⭐ + 25 🔷) : transforme les minerais en surplus. Il faut 3 minerais pour 1 minerai de la zone suivante (×3 par zone d'écart), et 1 pour 1 vers une zone plus proche. Quantité ×1, ×10 ou Max.
    - 🏺 **Reliques de Jimmy** (contenu de fin de partie : à partir du prestige 10, débloquées pour 150 ⭐ + 80 🔷) : bonus globaux sans limite de niveau. Chaque niveau demande les 7 minerais en énormes quantités (400 à 1 000 de chaque au départ, ×2,5 par niveau). Les 4 reliques :
      - 🗿 Totem des planètes : +5 s et +50 % de minerai par planète ;
      - 🔮 Orbe de la soucoupe : soucoupe plus fréquente et bonus plus longs ;
      - 🧭 Astrolabe : +0,5 % de dégâts par secteur du record ;
      - 👑 Couronne de Jimmy : +25 % d'étoiles et +2 🔷 par prestige.
  - **🌌 Voyage interspatial** (dans l'arbre des étoiles, à partir du prestige 5, 20 ⭐) : ouvre l'onglet 🧭 Secteurs. On y choisit dans une liste cliquable un secteur déjà atteint dans la partie, et la flotte y reste : chaque secteur vidé revient avec de nouveaux blocs, pratique pour récolter un minerai ou refaire une planète. Le bouton « Continuer à conquérir » reprend la progression classique au meilleur secteur. Un prestige met fin au voyage.
  - **🛡️ Réserve de flotte** (dans l'arbre des étoiles, 30 ⭐) : sur chaque vaisseau, un réglage « Réserve » (−5, −1, +1, +5) fixe un minimum de vaisseaux de ce type. Les fusions, manuelles ou automatiques, ne touchent jamais à ces vaisseaux. Le réglage est gardé après un prestige.
  - **🔭 Télescope** (arbre des étoiles, 100 ⭐ puis 110, 120…) : des **blocs étoile** (contour doré scintillant, ⭐ au centre) apparaissent dans les secteurs (hors planètes) ; le casser rapporte 1 ⭐. La chance qu’un secteur en cache un monte de 0,1 % par secteur (1 % au secteur 10, 10 % au 100…) jusqu’à un plafond : 20 % avec le 1er niveau, puis +1 % par niveau (21 %, 22 %… 50 % au plus). Compteur « étoiles trouvées » sur la page 📊 Stats.
  - **🔧 Ingénieur de bord** (arbre des étoiles, 40 ⭐) : un bouton « Auto » (on/off) sur chaque ligne de l’onglet Améliorations. L’amélioration est achetée dès que les crédits le permettent, avant les achats du chantier automatique. Les réglages sont gardés au prestige.
  - **🚀 Départ lancé** (onglet Prestige, demande la Forge) : pour chaque vaisseau, ses parties commencent au niveau 25, 50, 75, 100, 125… sans limite. Chaque palier coûte des ⭐ et deux minerais de ses zones, de plus en plus chers et plus chers pour les gros vaisseaux ; l’achat relève aussi tout de suite le niveau actuel. Au-delà de 100, le départ inclut les ascensions (niveau 125 → ascension 1, 225 → ascension 2…) et chaque palier qui passe un cap demande l’🔩 Alliage de ce vaisseau au niveau requis pour l’ascension.
  - **🤖 Chantier automatique** (dans l'arbre des étoiles, à partir du prestige 7, 25 ⭐) : un bouton « Auto » (on/off) sur chaque vaisseau. Il achète les éclaireurs et fusionne dès que les crédits ou les vaisseaux sont disponibles. Activer un rang active aussi ceux d'en dessous ; couper un rang coupe aussi ceux d'au-dessus.
  - **🌌 Arbre des étoiles** : ♾️ bonus infinis, sans limite de niveau et au prix exponentiel, pour qu'il reste toujours de quoi dépenser ses étoiles : noyau de neutron (+25 % de dégâts), gains cosmiques (+10 % de crédits), hyperpropulsion (vitesse, jusqu'à +50 %), constellation (+10 % d'étoiles au prestige), académie des pilotes (+1 🔷 par prestige), chantier naval (éclaireurs −5 %), géologue (+0,5 % de blocs de minerai, 30 % max), longue veille (+1 h de gains hors ligne). Et des bonus spéciaux, achetés avec les étoiles (dégâts, flotte de départ (+5 éclaireurs par niveau, sans limite), crédits de départ, turbo, fusion compacte (un vaisseau de moins par fusion), blocs dorés, radar à soucoupes, temps pour conquérir une planète).
  - **🎯 Missions du jour** : 3 missions, les mêmes pour tout le monde et renouvelées à minuit. Chacune rapporte 10 min de gains et disparaît de la liste une fois récupérée ; les 3 réunies rapportent deux fois ton nombre de prestiges en étoiles (90 ⭐ au prestige 45 ; 1 avant le premier prestige).
  - **🔬 Améliorations avancées** (onglet Améliorations) : débloquées pour toujours avec des étoiles en deux paliers, puis achetées avec des crédits à chaque partie comme les autres. Palier 1 (50 ⭐) : ⚡ réaction en chaîne (un bloc qui casse inflige 5 % de sa vie max à ses voisins par niveau), 🪐 siège planétaire (+20 % de dégâts contre les planètes), 🛡️ obus perforants (+8 % de dégâts sur les blocs blindés). Palier 2 (150 ⭐) : 🔥 plasma (chaque coup fait brûler le bloc, +3 % de ses dégâts par seconde qui s’éteignent en ~3 s, contour orange) et 🎖️ escadrille d’élite (+3 % au bonus d’escadrille par type en service).
  - **🙈 Masquer les débloqués** : un bouton dans l’onglet Améliorations, au-dessus des bonus spéciaux de l’arbre des étoiles et à côté du Doigt de Jimmy (atelier) cache ce qui est déjà au maximum ou installé ; le choix est retenu sur l’appareil.
  - **🗺️ Plan d’attaque** (sous les missions) : 44 objectifs fixes, gardés au prestige, en 6 catégories (conquête, prestige, flotte, destruction, exploration, fortune). Un objectif atteint est noté tout de suite (même s’il ne tient qu’un instant, comme avoir un Neutron) et sa récompense se récupère à la main, selon la difficulté : facile 5 ⭐ (10 points), moyen 15 🔷 (25 points), difficile 30 ⭐ (50 points), légendaire 60 ⭐ + 40 🔷 (100 points). Et 13 chaînes de ♾️ **légendes sans fin**, puisque le jeu n’a pas de fin : conquête (secteur 750, 1 000, 1 250…), planètes, prestiges, ascensions, crédits, blocs, blocs dorés, soucoupes, étoiles trouvées, niveaux de Forge, reliques, paliers de Départ lancé, temps de jeu ; chaque niveau (I, II, III…) est légendaire et, une fois atteint, le suivant apparaît avec un objectif plus haut. La carte montre les 3 prochains objectifs ; « 📋 Tout le plan d’attaque » ouvre une surcouche avec la progression de chacun.
  - **Bonus quiz → Blast 🎁** : une partie de quiz avec des points rapporte 3 min de gains dans Blast ; une victoire contre d'autres joueurs, 15 min et une accélération. Au plus 10 bonus par 24 h.
  - **Top et missions** : sur grand écran, le Top est dans une colonne à gauche et les missions dans une colonne à droite ; sur mobile et écrans plus étroits, les deux passent sous le jeu. Le Top se met à jour à heures fixes toutes les 10 minutes (12:00, 12:10, 12:20…) et se trie au choix avec un sélecteur en haut : 🏅 Objectifs (points du plan d’attaque, puis meilleur secteur) ou 🚩 Secteur (meilleur secteur, puis prestiges) ; le choix est retenu sur l’appareil. Les stats de Blast (blocs, planètes conquises, soucoupes, temps de jeu…) sont sur la page 📊 Stats. Gains hors ligne à collecter au retour.
  - Terrain carré de taille fixe (1000 × 1000), simplement mis à l'échelle : même terrain pour tout le monde, quel que soit l'écran.
  - Sauvegarde par compte : locale toutes les 5 s, sur le serveur toutes les 30 s et en quittant la page. Plusieurs appareils : seul le dernier appareil utilisé sauvegarde. Le serveur refuse une sauvegarde basée sur une version dépassée (409) au lieu d'écraser ; en revenant sur un onglet, la version la plus récente est rechargée, et un appareil dépassé affiche « Partie ouverte sur un autre appareil » avec un bouton « Reprendre ici ».
- **Interface** : glassmorphism sur un fond de particules animé, responsive mobile.

## Lancer en local

Prérequis : **Node.js ≥ 22.13** (utilise le module SQLite intégré `node:sqlite`, aucune dépendance native).

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # avec rechargement auto
npm test           # tests unitaires + intégration
```

Variables d'environnement :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `DB_FILE` | `data/quizzokopain.db` | Fichier SQLite (comptes + historique) |
| `SECURE_COOKIES` | — | Mettre `1` derrière HTTPS |
| `SUPERADMIN` | — | Pseudo(s) SuperAdmin, séparés par des virgules. ⚠️ Crée ton compte avec ce pseudo dès le premier déploiement. |

## Architecture

```
src/
  server.js        Express + Socket.IO (jeu en temps réel, invitations)
  routes.js        API quiz, favoris, stats, photos, espace SuperAdmin
  themes.js        Catalogue (quiz intégrés + quiz validés), validation des soumissions
  room.js          Logique d'une room : lobby → question → correction → révélation → fin
  questionTypes.js Types de questions, validation, correction
  quizFormat.js    Export / import des quiz (JSON neutron-quiz, CSV, OpenQuizzDB)
  questionBank.js  Banque de questions par thème
  selection.js     Tirage du thème et des questions
  matching.js      Comparaison tolérante des réponses libres
  auth.js          Comptes et sessions
  db.js            Schéma et requêtes SQLite
public/            Client web (HTML/CSS + modules JS natifs, sans build)
  js/games/blast/  Jimmy Blast : règles et économie (logic.js, testées sous node), simulation et rendu canvas (engine.js)
  js/main.js       Routeur, socket, navigation
  js/pages/        Une page par fichier (room, quiz, éditeur, stats, profil, admin…)
test/              Tests (node:test)
```

Les rooms en cours vivent en mémoire ; seules les parties terminées sont enregistrées en base (historique). Un redémarrage du serveur coupe donc les parties en cours.

## Sources et licences des questions

- Questions intégrées (`src/questionBank.js`) : rédigées pour Neutron.
- **OpenQuizzDB** : dépose les fichiers JSON téléchargés sur [openquizzdb.org](https://www.openquizzdb.org)
  dans `quiz-sources/openquizzdb/` (voir le README du dossier). Ils sont chargés au démarrage,
  niveaux débutant / confirmé / expert → facile / moyen / difficile. Contenu sous licence
  **CC BY-SA** : l'attribution (OpenQuizzDB, rédacteur, licence) est affichée sur chaque question,
  sur la carte du quiz et dans l'historique.
- Chaque question (quiz des joueurs, questions perso) peut indiquer sa **source** (nom ou lien).

## Polices

- **Space Grotesk** (variable, SIL OFL) — `public/fonts/OFL-SpaceGrotesk.txt`.
- **Twemoji Country Flags** ([country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill), code MIT, dessins
  [Twemoji](https://github.com/jdecked/twemoji) sous CC-BY 4.0) : affiche les drapeaux sur Windows, qui n'en a pas.
  Voir `public/fonts/LICENSE-TwemojiCountryFlags.md`.

## Emojis 3D et illustrations

- **Emojis 3D** : [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (licence MIT), via le paquet npm
  [`@lobehub/fluent-emoji-3d`](https://github.com/lobehub/fluent-emoji) (MIT), servis par l'app sur `/emoji/<code>.webp`.
  Tout emoji affiché dans l'interface est remplacé à l'écran par sa version 3D (`public/js/emoji.js`) ; le texte
  reste l'emoji (copier-coller, lecteurs d'écran). Ceux qui n'existent pas en 3D restent en texte.

## Images des questions

Dans l'éditeur, chaque question peut recevoir une image : **📷 Importer une image** (redimensionnée dans
le navigateur, ≤ 1200 px), ou une URL. **Quiz d'images en un clic** : sélectionne plusieurs images, chacune
devient une question « De quel film s'agit-il ? » dont la réponse est le nom du fichier
(`pulp-fiction.jpg` → « Pulp fiction »), à corriger ensuite avec ✏️ si besoin.

Stockage :
- par défaut, dans la base SQLite (servies par `/api/images/:id`, réservées aux comptes connectés) ;
- **sur ton hébergement (ex. o2switch)** : les images sont envoyées par FTP chiffré (FTPS) dans un dossier
  public de ton site, et les questions pointent vers leur URL publique. Variables à définir sur Railway :

| Variable | Exemple o2switch |
|---|---|
| `IMAGES_FTP_HOST` | `ftp.mon-domaine.fr` (ou le nom du serveur o2switch) |
| `IMAGES_FTP_USER` | un **compte FTP dédié** créé dans cPanel, limité au dossier des images |
| `IMAGES_FTP_PASSWORD` | son mot de passe |
| `IMAGES_FTP_DIR` | `/` si le compte FTP est limité au dossier, sinon `/public_html/quizzokopain-images` |
| `IMAGES_PUBLIC_URL` | `https://mon-domaine.fr/quizzokopain-images` |
| `IMAGES_FTP_PORT` | `21` (défaut) |

Les noms de fichiers sont aléatoires ; les images envoyées sur ton site sont publiques.

## Déploiement (Railway)

Service Node unique + un **volume** monté sur `/data` pour la base SQLite. Variables : `DB_FILE=/data/quizzokopain.db`, `SECURE_COOKIES=1`, `SUPERADMIN=<ton pseudo>`. Healthcheck : `/healthz`.

## Ajouter des questions à la banque

Éditer `src/questionBank.js` avec les helpers `qcm`, `vf`, `libre`, `rebus`, `film`, `emojiQ`, `estim`. Le test `every bank question passes validation` vérifie que chaque question est bien formée.
