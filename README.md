# 🥖 Quizzokopain

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
  | Estimation | le plus proche marque le point |
- **Quiz créés par les joueurs** : chaque compte peut créer un quiz (nom, emoji, mots-clés, difficulté facile / moyen / difficile, description, questions). Le pseudo du créateur est affiché sous le nom. Le quiz est **soumis au SuperAdmin**, qui le valide ou le refuse avec un motif ; une fois validé, il apparaît dans la liste des quiz. Toute modification par l'auteur repasse en validation.
- **Recherche & favoris** : recherche par nom, mot-clé ou pseudo du créateur, filtre par difficulté, ⭐ favoris par compte (affichés en premier dans le lobby).
- **Stats** : parties jouées, victoires, points, taux de bonnes réponses, parties animées ; pour chaque quiz créé : nombre de questions, nombre de parties jouées, nombre de favoris.
- **Photo de profil** : recadrée en carré dans le navigateur, affichée dans les rooms, classements et podium.
- **Invitations** : lien court `/r/CODE`, ou invitation directe d'un joueur par son pseudo (notification en temps réel, même en cours de partie).
- **SuperAdmin** : validation des quiz, gestion des comptes (suspension, nouveau mot de passe, suppression, retrait de photo), fermeture des rooms.
- **Questions perso** : l'admin d'une room peut aussi ajouter des questions juste pour la partie (y compris avec une image via URL).
- **Réglages** : nombre de questions, chrono par question (ou illimité), types de questions autorisés.
- **Temps réel** (Socket.IO) : la question se ferme automatiquement quand tout le monde a répondu ou à la fin du chrono ; reconnexion transparente en cas de rechargement de la page.
- **Historique** : les dernières parties sur l'accueil, et le détail de chaque partie (questions, bonnes réponses, réponses de chaque joueur).
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
  questionBank.js  Banque de questions par thème
  selection.js     Tirage du thème et des questions
  matching.js      Comparaison tolérante des réponses libres
  auth.js          Comptes et sessions
  db.js            Schéma et requêtes SQLite
public/            Client web (HTML/CSS + modules JS natifs, sans build)
  js/main.js       Routeur, socket, navigation
  js/pages/        Une page par fichier (room, quiz, éditeur, stats, profil, admin…)
test/              Tests (node:test)
```

Les rooms en cours vivent en mémoire ; seules les parties terminées sont enregistrées en base (historique). Un redémarrage du serveur coupe donc les parties en cours.

## Déploiement (Railway)

Service Node unique + un **volume** monté sur `/data` pour la base SQLite. Variables : `DB_FILE=/data/quizzokopain.db`, `SECURE_COOKIES=1`, `SUPERADMIN=<ton pseudo>`. Healthcheck : `/healthz`.

## Ajouter des questions à la banque

Éditer `src/questionBank.js` avec les helpers `qcm`, `vf`, `libre`, `rebus`, `film`, `emojiQ`, `estim`. Le test `every bank question passes validation` vérifie que chaque question est bien formée.
