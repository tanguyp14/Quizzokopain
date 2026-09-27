# 👽 Neutron

*Jimmy, l'alien qui sait tout, te met au défi.*

Des quiz gratuits entre amis dans des **rooms privées**. L'admin de la room choisit un thème (ou le laisse au hasard), lance les questions, et **valide lui-même les réponses libres**. Une bonne réponse = **1 point**.

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
  - **Flotte** : chaque rang de vaisseau se monte en niveau (dégâts), et 5 vaisseaux d'un rang fusionnent en 1 du rang supérieur (8 rangs). Les rangs élevés ont un pouvoir : perforation (Frégate, dégâts en continu pendant la traversée), visée (Croiseur), onde de choc (Destroyer), bombardement (Cuirassé), drones (Vaisseau-mère), rayon qui touche tout le secteur (Neutron).
  - **Blocs spéciaux** : blocs dorés (gains ×10) et 💣 bombes, qui explosent sur leurs voisins en cassant.
  - **Planètes 🪐 tous les 10 secteurs** : une planète (nommée, avec anneaux fins, bandes et cratères) à conquérir en 30 s. En cas d'échec, retour au secteur précédent, et on retente au prochain passage. Le compteur 🚩 montre les planètes conquises, aussi affiché au classement.
  - **Soucoupe de Jimmy 🛸** : elle traverse l'écran toutes les 45 à 90 s. La toucher donne des crédits, une accélération offerte ou des dégâts ×3 pendant 30 s.
  - **Zones** : la palette des blocs et du fond change tous les 10 secteurs (Nébuleuse, Glace, Lave, Trésor, Jungle alien, Abysses, Néon).
  - **Améliorations** : vitesse, gains, toucher, coups critiques, gains hors ligne. Accélération ×2 pendant 15 s, rechargée en 60 s.
  - **⭐ Prestige** : contre 10M crédits (puis ×3 à chaque prestige : 30M, 90M…), on repart de zéro avec +10 % de dégâts pour toujours, cumulés (×1,1, ×1,21…). On gagne aussi des étoiles : 1, plus 1 par tranche de 10 secteurs atteints.
  - **🌌 Arbre des étoiles** : bonus permanents achetés avec les étoiles (dégâts, flotte et crédits de départ, turbo, fusion à 4, blocs dorés, radar à soucoupes, temps pour conquérir une planète).
  - **🎯 Missions du jour** : 3 missions, les mêmes pour tout le monde et renouvelées à minuit. Chacune rapporte 10 min de gains, et les 3 réunies 1 étoile.
  - **Bonus quiz → Blast 🎁** : une partie de quiz avec des points rapporte 3 min de gains dans Blast ; une victoire contre d'autres joueurs, 15 min et une accélération. Au plus 10 bonus par 24 h.
  - **Classement** : par prestiges, puis par meilleur secteur. Les stats de Blast (blocs, planètes conquises, soucoupes, temps de jeu…) sont sur la page 📊 Stats. Gains hors ligne à collecter au retour.
  - Terrain carré de taille fixe (1000 × 1000), simplement mis à l'échelle : même terrain pour tout le monde, quel que soit l'écran.
  - Sauvegarde par compte : locale toutes les 5 s, sur le serveur toutes les 30 s et en quittant la page.
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
