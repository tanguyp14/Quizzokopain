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
- **Questions perso** : l'admin peut ajouter ses propres questions dans le lobby (y compris avec une image via URL).
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

## Architecture

```
src/
  server.js        Express (API REST) + Socket.IO (jeu en temps réel)
  room.js          Logique d'une room : lobby → question → correction → révélation → fin
  questionTypes.js Types de questions, validation, correction
  questionBank.js  Banque de questions par thème
  selection.js     Tirage du thème et des questions
  matching.js      Comparaison tolérante des réponses libres
  auth.js          Comptes et sessions
  db.js            Schéma et requêtes SQLite
public/            Client web (HTML/CSS/JS vanilla, sans build)
test/              Tests (node:test)
```

Les rooms en cours vivent en mémoire ; seules les parties terminées sont enregistrées en base (historique). Un redémarrage du serveur coupe donc les parties en cours.

## Ajouter des questions à la banque

Éditer `src/questionBank.js` avec les helpers `qcm`, `vf`, `libre`, `rebus`, `film`, `emojiQ`, `estim`. Le test `every bank question passes validation` vérifie que chaque question est bien formée.
