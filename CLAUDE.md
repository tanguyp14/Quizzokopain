# Neutron (Quizzokopain)

Quiz entre amis en rooms privées + mini-jeux autour de Jimmy l'alien. Node ≥ 22.13, Express 5, Socket.IO,
SQLite intégré (`node:sqlite`), client web sans build (modules JS natifs). Description complète : `README.md`.

## Commandes

```bash
npm install
npm start      # http://localhost:3000 (DB_FILE, SUPERADMIN, SECURE_COOKIES : voir README)
npm run dev    # rechargement auto
npm test       # node:test, tests unitaires + intégration (les tests ont besoin de npm install)
```

## Où est quoi

- `src/server.js` : Express + Socket.IO, rooms temps réel, invitations. `createApp()` est exportée (tests).
- `src/routes.js` : API (quiz, stats, SuperAdmin, Empire, Territoire, Poker, Blackjack…). `src/db.js` : schéma et requêtes.
- `src/room.js` : cycle d'une room (lobby → question → correction → révélation → fin). Les rooms vivent **en mémoire**.
- `public/js/games/<jeu>/logic.js` : règles et économie, **pures et testées sous node**. `engine.js` : simulation/rendu canvas.
- `public/js/pages/<page>.js` : une page par fichier. `public/js/main.js` : routeur, socket, navigation.

## Les jeux

| Jeu | Code | Notes |
|---|---|---|
| Quiz (rooms) | `src/room.js`, `questionTypes.js`, `quizFormat.js`, `public/js/pages/room.js` | 7 types de questions, quiz créés par les joueurs, validation SuperAdmin |
| Jimmy Blast | `public/js/games/blast/` | incrémental, prestige, atelier, forge ; économie dans `logic.js` |
| L'Empire de Jimmy | `public/js/games/empire/logic.js`, `docs/empire-de-jimmy.md` | gestion coopérative sans PvP, marché, Portail, Nuée, expéditions ; le serveur applique les règles |
| Territoire | `public/js/games/territoire/` | arcade façon Qix ; record vérifié par le serveur ; `TERRITOIRE_RULES` dans `src/db.js` |
| Bomber | `src/bomber.js`, `public/js/games/bomber/` | temps réel, parties en mémoire |
| Poker / Blackjack (Casino spatial) | `public/js/games/poker/`, `blackjack/`, routes dans `src/routes.js` | le serveur distribue, le joueur choisit |

Idées en réserve : `docs/idees-jeux.md`.

## Production : o2switch (depuis le 14/10/2026, plus Railway)

- Site : `https://www.neutron-games.net` (l'apex redirige vers `www`). Hébergement mutualisé o2switch, cPanel,
  « Setup Node.js App » (Phusion Passenger), Node 24.21.0, mode Production.
- Application cPanel : `neutron-www`, racine `~/neutron-www`, URL `neutron-games.net`, démarrage `src/server.js`.
- Variables : `DB_FILE=/home/rqlt0328/neutron-data/quizzokopain.db`, `SUPERADMIN=Tanguy`, `SECURE_COOKIES=1`.
- **Base** : `~/neutron-data/quizzokopain.db`, hors du code, en mode WAL. La **sauvegarder avant toute opération**.
  Pour la copier : `VACUUM INTO` (node:sqlite), jamais le fichier `.db` seul.
- Le serveur démarre sous Passenger grâce à `PASSENGER_APP_ENV` (voir fin de `src/server.js`).
- Accès : cPanel > Terminal (SSH inutile). DNS géré par o2switch (zone `neutron-games.net`).

### Mettre à jour la prod

1. Cloner `main` dans un dossier temporaire, copier `src/`, `public/`, `quiz-sources/` dans `~/neutron-www`.
2. Si `package.json` change : « Run NPM Install » dans Setup Node.js App.
3. Redémarrer : `touch ~/neutron-www/tmp/restart.txt`. Vérifier `https://www.neutron-games.net/` (200).

### Pièges connus

- **WebSockets non transmis** par le proxy o2switch : Socket.IO fonctionne en polling (~50 ms). Jeu de base fluide,
  Bomber et arènes dégradés. Le client doit tolérer le repli polling (ne pas forcer `transports: ['websocket']`).
- **Ne jamais mettre `PassengerMaxPoolSize` dans le `.htaccess`** (500 immédiat). Un seul processus est souhaitable
  (rooms en mémoire) mais non garanti par la config.
- cPanel ne permet **pas de modifier la racine ni l'URL** d'une application Node existante (erreur, parfois application
  cassée) : détruire puis recréer.
- Ne pas laisser deux applications pointer vers la même base SQLite.
- Un redémarrage coupe les parties en cours (rooms en mémoire).
- Let's Encrypt via cPanel > Let's Encrypt SSL (« AutoSSL » n'a pas de bouton manuel). dns-01 possible car le DNS est chez o2switch.
- Le commit de PASSENGER_APP_ENV est l'état du dépôt ; les anciennes instructions « src/server.js sans correctif » ne marchaient pas.

## Conventions

- Français pour les textes d'interface, les commits et les docs.
- Règles de jeu dans `logic.js` (pures, testées), pas dans les pages ni les routes.
- Ajouter des questions : `src/questionBank.js` (helpers `qcm`, `vf`, `libre`, `rebus`, `film`, `emojiQ`, `estim`) ; le test
  « every bank question passes validation » les contrôle.
- Les secrets (mots de passe FTP, etc.) ne vont jamais dans le dépôt : variables d'environnement cPanel.
