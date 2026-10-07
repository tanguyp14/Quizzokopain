# ⚔️ Le TCG de Neutron : règles du jeu (proposition)

Les cartes et leurs visuels sont décrits dans [`tcg-cartes.md`](tcg-cartes.md). Ce document est une **première version des règles**, à tester et à équilibrer.

**Le principe :** à chaque tour, chaque joueur empile **toute sa main** face cachée, dans l'ordre de son choix. Ensuite, les deux piles s'affrontent **carte contre carte** : la carte du dessus contre la carte du dessus, puis la suivante, etc. Une fois les deux piles résolues, **chacun reprend ses cartes en main**, pioche une carte de plus, et on recommence.

Dès le 2ᵉ tour, chacun **connaît donc les cartes de l'autre**. Tout le bluff porte sur **l'ordre** : où a-t-il mis son Contre cette fois ? Un contre bien placé annule une grosse attaque, un contre mal placé ne sert à rien.

---

## 1. Le matériel

- **6 couleurs**, chacune avec son style de jeu (voir § 4).
- **Champions** : 2 couleurs, **20 PV** pour tous, et un **pouvoir spécial** qui se déclenche à un rythme connu (toutes les 4 cartes jouées, toutes les 3 Attaques…). Il existe un champion par paire de couleurs, soit **15 champions** (voir § 5).
- **100 % bluff** : aucune carte ne fait appel au hasard. Le seul hasard du jeu vient de la pioche, et d'un seul champion, **Butch Pakovski**, qui joue aux dés.
- **Deck** : **20 cartes** des deux couleurs de son champion, **2 exemplaires maximum** d'une même carte.

---

## 2. Déroulement d'une partie

### Mise en place
1. Chaque joueur révèle son champion : **20 PV**.
2. Chaque joueur mélange son deck de 20 cartes, face cachée, et **pioche 3 cartes** : c'est sa main de départ.

### Un tour de jeu
1. **Pioche** : chaque joueur pioche 1 carte. **Pas de pioche au 1ᵉʳ tour** : on joue les 3 cartes de départ.
2. **Programmation** : en même temps, chaque joueur pose **toutes les cartes de sa main**, face cachée, en une pile, **dans l'ordre de son choix**.
3. **Résolution** : les deux joueurs retournent **en même temps** la carte du dessus de leur pile : c'est un **duel**. On le résout (voir § 3), puis on passe aux deux suivantes, jusqu'au bas des piles.
4. **Reprise** : chacun **reprend toutes ses cartes en main**. Le bouclier disparaît, sauf mention contraire.

La main grossit d'une carte par tour : 3 duels au tour 1, 4 au tour 2, 5 au tour 3, etc. La partie monte en puissance toute seule.

### Main maximum : 7 cartes
Quand un joueur pioche une 8ᵉ carte, il **défausse** une carte de sa main de son choix. C'est l'occasion de remplacer une carte faible par une meilleure.

### Piles de tailles différentes
Si une carte a été détruite, une pile peut être plus longue que l'autre. Ses dernières cartes jouent alors **contre le vide** : une Attaque touche sans rien en face, un Contre ne fait rien.

### Victoire
- **Un champion à 0 PV perd la partie aussitôt.** Si les deux tombent à 0 dans le même duel, c'est une égalité.
- Une partie dure **4 à 6 tours**, soit 10 à 15 minutes.

---

## 3. Résoudre un duel

### Les 4 types de cartes

| Type | Icône | Ce qu'elle fait |
|---|---|---|
| **Attaque** | 🗡️ | Inflige des dégâts au champion adverse. |
| **Garde** | 🛡️ | Donne du **bouclier**, qui absorbe les dégâts avant les PV. Il reste d'un duel à l'autre, jusqu'à la fin du tour (maximum 10). |
| **Contre** | 🌀 | **Annule l'Attaque d'en face.** Contre une autre carte, il ne fait rien, sauf mention contraire. |
| **Tactique** | ✨ | Un effet spécial : soin, vision, gel, échange de cartes, bonus pour la carte suivante… |

Le cœur du bluff :
- 🗡️ **Attaque** : elle fait mal, mais un 🌀 Contre l'annule (et la punit parfois).
- 🌀 **Contre** : il gagne gros face à une Attaque, mais **ne sert à rien** face au reste.
- 🛡️ **Garde** : c'est le choix sûr. Jamais perdue, mais lente : le bouclier n'inflige aucun dégât.
- ✨ **Tactique** : elle prépare la suite, mais si l'adversaire attaque pendant ce temps, tu encaisses.

### Ordre de résolution
Pour chaque duel, dans cet ordre :

1. **Révélation** des deux cartes, en même temps.
2. **Annulations** : Contres, Gel, etc. Une carte annulée n'a **aucun effet**, sauf ses effets « *Si annulée* ».
3. **Effets immédiats** : bouclier, soins, vision, échanges, bonus pour la carte suivante.
4. **Dégâts**, en même temps : dégâts de l'Attaque − réductions → le **bouclier** absorbe → le reste est retiré des **PV**.
5. **Effets d'après** : épines, vol de vie, poison, sacrifice.
6. **Pouvoirs des champions** : on met à jour leurs compteurs, et ceux qui sont pleins se déclenchent.

Deux Attaques face à face se touchent **toutes les deux**. Deux Contres face à face ne font **rien**.

### Mots-clés

| Mot-clé | Effet |
|---|---|
| **Enchaînement** | Bonus si **ta carte précédente** remplit une condition (ex. : c'était une Attaque). C'est ce qui rend l'ordre de la pile important. |
| **Préparation** | L'effet s'applique à **ta prochaine carte** (ou à ta prochaine Attaque, si la carte le dit). Si cette carte est annulée, le bonus est perdu. |
| **Perforant** | Ignore le bouclier. |
| **Épines X** | Si une Attaque te touche, l'attaquant subit X dégâts. |
| **Poison X** | L'adversaire perd 1 PV à la fin de chacun des X prochains duels. |
| **Gel** | La **prochaine** carte adverse est annulée (au tour suivant, si c'était la dernière carte de la pile). |
| **Vision X** | Regarde les X prochaines cartes de la pile adverse. |
| **Échange** | Échange deux cartes non révélées (les tiennes ou celles de l'adversaire, selon la carte). |
| **Sacrifice X** | Tu perds X PV (le bouclier n'absorbe pas cette perte). |
| **Vol de vie** | Tu regagnes les PV que cette carte a retirés à l'adversaire. |
| **Si annulée** | Effet qui s'applique quand cette carte est annulée. |
| **Détruire** | La carte visée est **défaussée** : elle ne revient pas dans la main de son joueur. |
| **Usage unique** | Après sa résolution, cette carte est défaussée au lieu de revenir en main. |

---

## 4. Les 6 couleurs

Chaque couleur reprend l'un des minerais de Jimmy Blast. La poussière d'étoile ✨ devient la couleur des cartes **neutres**, à ajouter plus tard si besoin.

| Couleur | Minerai | Style | Fort en | Faible en |
|---|---|---|---|---|
| 🔴 **Rouge** | 🌋 Obsidienne | Agression | Gros dégâts, enchaînements | Défense, se fait contrer |
| 🔵 **Bleu** | 🧊 Cristal de glace | Contrôle | Contres, gel, annulations | Peu de dégâts |
| 🟢 **Vert** | 🍄 Spore alien | Endurance | Soins, poison, croissance | Lent |
| 🟡 **Jaune** | 🌞 Pépite solaire | Forteresse | Bouclier, épines | Peu de dégâts directs |
| 🟣 **Violet** | 💠 Plasma néon | Manipulation | Vision, échange de cartes, copie | Effets faibles seuls |
| ⚫ **Noir** | 🐚 Perle abyssale | Sacrifice | Briser le bouclier, exécuter | Se blesse soi-même |

### Cartes de départ (8 par couleur)

La **valeur** est le nombre en gros sur la carte (dégâts ou bouclier).

#### 🔴 Rouge : agression
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Coup de canon | 🗡️ | 3 | — |
| Salve | 🗡️ | 2 | Enchaînement : +2 si ta carte précédente était une Attaque. |
| Rage de lave | 🗡️ | 5 | Tu subis 1 dégât. |
| Charge du Destroyer | 🗡️ | 3 | Perforant. |
| Surchauffe | ✨ | — | Préparation : ta prochaine Attaque fait +3. |
| Bombe | 🗡️ | 2 | Si annulée : inflige quand même 2 dégâts. |
| Feu de barrage | 🗡️ | 1 ×3 | Trois coups de 1 (le bouclier les absorbe un par un). |
| Furie | 🗡️ | X | X = nombre de tes Attaques déjà révélées ce tour (6 au plus). |

#### 🔵 Bleu : contrôle
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Parade glacée | 🌀 | — | Annule une Attaque. |
| Miroir de glace | 🌀 | — | Annule une Attaque et renvoie ses dégâts à l'attaquant. |
| Contre-attaque glaciale | 🌀 | 1 | Annule une Attaque. Sinon, inflige 1 dégât. |
| Gel | ✨ | — | Gel : la prochaine carte adverse est annulée. |
| Blizzard | ✨ | — | Annule la carte d'en face si sa valeur est de 2 ou moins. |
| Mur de givre | 🛡️ | 3 | — |
| Éclat de cristal | 🗡️ | 2 | Si la carte d'en face est une Garde : Gel. |
| Prévoyance | ✨ | — | Vision 2. |

#### 🟢 Vert : endurance
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Spores | 🗡️ | 1 | Poison 2. |
| Régénération | ✨ | — | Soigne 3 PV. |
| Carapace | 🛡️ | 2 | +1 par Garde que tu as déjà révélée ce tour. |
| Lianes | ✨ | — | La prochaine carte adverse a −2 de valeur. |
| Morsure de la Nuée | 🗡️ | 2 | Vol de vie. |
| Pollen | 🌀 | — | Annule une Attaque et soigne 1 PV. |
| Essaim | 🗡️ | 1 ×3 | Trois coups de 1. |
| Floraison | ✨ | — | Soigne 1 PV par carte Verte que tu as déjà révélée ce tour. |

#### 🟡 Jaune : forteresse
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Bouclier solaire | 🛡️ | 3 | — |
| Rempart | 🛡️ | 5 | Le bouclier n'arrive qu'**après** les dégâts de ce duel. |
| Épines dorées | 🛡️ | 2 | Épines 2. |
| Bouclier galactique | 🛡️ | 2 | Ton bouclier ne disparaît pas à la fin du tour. |
| Éclat solaire | 🗡️ | X | X = ton bouclier actuel (6 au plus). Le bouclier n'est pas dépensé. |
| Bénédiction | ✨ | — | Double ton bouclier (10 au plus). |
| Garde galactique | 🌀 | — | Annule une Attaque et te donne 2 de bouclier. |
| Aveuglement | ✨ | — | La prochaine Attaque adverse fait −3. |

#### 🟣 Violet : manipulation
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Télépathie | ✨ | — | Vision 1, puis tu peux échanger tes 2 prochaines cartes. |
| Tour de passe-passe | ✨ | — | Échange les 2 prochaines cartes de l'adversaire. |
| Rayon néon | 🗡️ | 3 | +2 si tu avais vu cette carte adverse grâce à une Vision. |
| Mirage | 🌀 | — | Annule une Attaque **ou** une Tactique. |
| Copie | ✨ | — | Tu profites aussi de l'effet de la carte d'en face. |
| Chaos | ✨ | — | Mélange les 3 prochaines cartes de l'adversaire. |
| Rayon miroir | 🗡️ | 2 | +2 si la carte d'en face est une Tactique. |
| Déjà-vu | ✨ | — | Rejoue l'effet de ta carte précédente. |

#### ⚫ Noir : sacrifice
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Lame des abysses | 🗡️ | 4 | Perforant. Sacrifice 1. |
| Brise-bouclier | ✨ | — | Détruit tout le bouclier adverse. |
| Malédiction | ✨ | — | L'adversaire ne gagne ni bouclier ni PV pendant 3 duels. |
| Pacte | ✨ | — | Sacrifice 3. Préparation : ta prochaine Attaque fait le double. |
| Exécution | 🗡️ | 2 | Fait 8 si l'adversaire a 6 PV ou moins. |
| Ombre | 🌀 | — | Annule la carte d'en face, **quelle qu'elle soit**. Sacrifice 2. |
| Trou noir | ✨ | — | Annule la carte d'en face et la **détruit**. **Usage unique.** |
| Âme sombre | 🗡️ | 2 | +1 par Sacrifice que tu as fait ce tour. |

Avec 8 cartes par couleur, un deck à 2 couleurs a le choix entre 16 cartes différentes. À 2 exemplaires maximum, il faut en prendre au moins 10.

Comme les cartes reviennent en main, **Détruire** est l'effet le plus fort du jeu : il enlève une carte à l'adversaire pour le reste de la partie. Il reste donc rare et souvent à usage unique.

---

## 5. Les 15 champions

Tous les champions ont **20 PV**. Ce qui les distingue, c'est leur **pouvoir spécial**.

### Les compteurs
La plupart des pouvoirs se chargent avec un **compteur** : « toutes les 4 cartes jouées », « toutes les 3 Attaques jouées »… Une carte compte dès qu'elle est **révélée**, même si elle est annulée.

- Le compteur se suit avec des jetons sur la carte du champion (par exemple 4 cases).
- Il **continue d'un tour à l'autre** : s'il en est à 3/4 à la fin du tour 1, le pouvoir se déclenche après la 1ʳᵉ carte du tour 2.
- Quand il est plein, le pouvoir se déclenche à la fin du duel, et le compteur repart à zéro.
- Un effet qui vise « la prochaine carte » s'applique au duel suivant, ou au 1ᵉʳ duel du tour suivant.

**Tout est public.** Les deux joueurs voient les compteurs, et savent donc à quelle position de la pile un pouvoir va tomber. C'est une source de bluff de plus. Si l'adversaire sait que ta 3ᵉ carte sera doublée, il y placera sûrement un Contre… alors tu y mets une Garde et tu gardes ton Attaque pour la suivante.

Les pouvoirs ✋ se déclenchent quand on veut, un nombre limité de fois.

### Les champions

| Champion | Couleurs | Pouvoir |
|---|---|---|
| **Jimmy l'alien** | 🟣🔵 | 🔁 **Je sais tout** : toutes les 4 cartes jouées, regarde la prochaine carte adverse ; tu peux ensuite échanger tes 2 prochaines cartes. |
| **Butch Pakovski** 🎲 | 🟡🟣 | 🔁 **Le croupier** (le champion du hasard) : toutes les 3 cartes jouées, lance un dé. ⚀ rien · ⚁ +2 bouclier · ⚂ soigne 2 PV · ⚃ inflige 2 dégâts · ⚄ +4 bouclier · ⚅ **Jackpot** : inflige 3 dégâts et +3 bouclier. |
| **Reine de la Nuée** | 🟢⚫ | 🔁 **Ponte** : toutes les 4 cartes jouées, l'adversaire subit Poison 2. |
| **Capitaine pirate** | 🔴⚫ | 🔁 **Abordage** : toutes les 3 Attaques jouées, ta prochaine Attaque fait +3. |
| **Le Neutron** | 🔴🟡 | 🔁 **Réacteur chargé** : toutes les 4 cartes jouées, ta prochaine carte, si c'est une Attaque, fait le double. |
| **Garde galactique** | 🟡🔵 | 🔁 **Bouclier du centre** : toutes les 4 cartes jouées, gagne 3 de bouclier. |
| **Phénix solaire** | 🔴🟢 | ✋ **Renaissance** : une fois par partie, quand tu tombes à 0 PV, reviens à 5 PV. |
| **Méduse abyssale** | 🔵⚫ | 🔁 **Piqûre** : toutes les 2 cartes adverses que tu annules, l'adversaire subit 3 dégâts. |
| **Chat néon** | 🟣🔴 | 🔁 **Neuf vies** : toutes les 4 cartes jouées, tu ne subis aucun dégât au duel suivant. |
| **La Comète** | 🔴🔵 | 🔁 **Passage** : toutes les 5 cartes jouées, inflige 3 dégâts Perforants. |
| **Pingouin cryogénique** | 🔵🟢 | 🔁 **Banquise** : toutes les 4 cartes jouées, Gel (la prochaine carte adverse est annulée). |
| **L'Explorateur** | 🟢🟡 | 🔁 **Ravitaillement** : toutes les 3 Gardes jouées, soigne 3 PV. |
| **Champignon dansant** | 🟢🟣 | 🔁 **Spores hypnotiques** : toutes les 4 cartes jouées, mélange les 2 prochaines cartes de l'adversaire (sans les regarder). |
| **Le Glouton du trou noir** | 🟡⚫ | 🔁 **Festin** : toutes les 4 cartes jouées, vole tout le bouclier adverse (10 au plus pour toi). |
| **Le SuperAdmin** | 🟣⚫ | ✋ **Ban** : deux fois par partie, annule une carte adverse juste après sa révélation. |

Butch est le seul champion qui laisse une part au hasard. Son dé rapporte en moyenne un peu moins qu'un pouvoir fixe, mais son ⚅ peut renverser une partie.

---

## 6. Exemple de partie

**Jimmy** (🟣🔵) affronte le **Capitaine pirate** (🔴⚫). Les deux ont 20 PV.

### Tour 1 : 3 cartes chacun, on ne sait rien de l'autre
- Main de Jimmy : Prévoyance, Mirage, Rayon néon.
- Main du Pirate : Coup de canon, Pacte, Lame des abysses.

| Duel | Jimmy | Pirate | Ce qui se passe |
|---|---|---|---|
| 1 | 🌀 Mirage | 🗡️ Coup de canon (3) | **Mirage annule le Coup de canon.** *(Abordage 1/3.)* |
| 2 | ✨ Prévoyance | ✨ Pacte | Jimmy fait Vision 2 et voit la **Lame des abysses**, la dernière carte du Pirate. Le Pirate fait Sacrifice 3 : **Pirate 17**. Sa prochaine Attaque fera le double. |
| 3 | 🗡️ Rayon néon (3 +2) | 🗡️ Lame des abysses (4 ×2 = 8) | Le Rayon fait +2 car Jimmy a vu la Lame. Deux Attaques : **Jimmy 12**, **Pirate 11** (5 dégâts, puis 1 de Sacrifice). *(Abordage 2/3.)* |

Chacun reprend ses 3 cartes et pioche 1 carte : Jimmy pioche **Parade glacée**, le Pirate pioche **Bombe**.

### Tour 2 : 4 cartes chacun, et on connaît 3 des cartes de l'autre
Jimmy sait que le Pirate a Coup de canon, Pacte, Lame + 1 carte inconnue. Il sait aussi que l'Abordage est à 2/3 : **la 2ᵉ Attaque** du Pirate ce tour-ci fera +3. Le Pirate sait que Jimmy a déjà joué 3 cartes : son pouvoir (toutes les 4 cartes) se déclenchera **après le 1ᵉʳ duel**.

| Duel | Jimmy | Pirate | Ce qui se passe |
|---|---|---|---|
| 1 | 🌀 Parade glacée | ✨ Pacte | Le Pirate a deviné que Jimmy ouvrirait par un Contre : la Parade ne sert à rien. Sacrifice 3 : **Pirate 8**. **Pouvoir de Jimmy** (4ᵉ carte) : il voit la carte suivante du Pirate, un **Coup de canon**, et échange ses 2 prochaines cartes pour mettre Mirage en face. |
| 2 | 🌀 Mirage | 🗡️ Coup de canon (3 ×2) | **Annulé**, et le bonus du Pacte est perdu. *(Abordage 3/3 : la prochaine Attaque du Pirate fera +3.)* |
| 3 | ✨ Prévoyance | 🗡️ Lame des abysses (4 +3 = 7) | Jimmy encaisse 7 dégâts Perforants : **Jimmy 5**. Sacrifice 1 : **Pirate 7**. Vision 2 : Jimmy voit la dernière carte, une **Bombe**. |
| 4 | 🗡️ Rayon néon (3 +2) | 🗡️ Bombe (2) | **Jimmy 3**, **Pirate 2**. |

Au tour 3, chacun connaît les 4 cartes de l'autre, plus une nouvelle carte inconnue. Celui qui devinera le mieux l'ordre adverse gagnera.

---

## 7. Points à surveiller pour l'équilibre

- **Bouclier trop fort ?** Deux joueurs qui ne font que des Gardes bloquent la partie. D'où le maximum de 10, le bouclier remis à zéro à chaque tour, et le Noir qui le brise.
- **Contre trop sûr ?** Un Contre ne doit annuler que les Attaques, sinon il n'y a plus de risque. Les Contres qui annulent tout (Ombre) coûtent des PV.
- **Vision trop forte ?** Elle annule le bluff, surtout quand on connaît déjà les cartes adverses. Garde-la rare : une ou deux cartes par couleur au plus.
- **Sacrifice qui revient à chaque tour** : les cartes reviennent en main, donc un Pacte (Sacrifice 3) coûte 3 PV à **chaque** tour. C'est son vrai prix.
- **Détruire** : c'est l'effet le plus fort du jeu, puisqu'il enlève une carte pour toujours. À garder rare et à usage unique.
- **Deck de 20 cartes (validé)** : avec 3 cartes au départ et 1 par tour, une partie de 5 tours n'utilise que 7 ou 8 cartes du deck. Le deck sert donc à varier les parties : on ne sait jamais quelles cartes on aura. Si les parties sont trop répétitives, on peut piocher 2 cartes et en garder 1.
- **Parties trop longues ?** À partir du tour 6, on peut ajouter une **mort subite** : chaque champion perd 2 PV au début de chaque tour.

---

## 8. Questions ouvertes

1. **Main maximum de 7 cartes** : ça te va ? Sans limite, le tour 10 ferait 12 duels.
2. **Révélation** : en même temps (c'est ce que je propose) ou chacun son tour ?
3. **Cartes neutres** : faut-il autoriser quelques cartes sans couleur dans tous les decks ?
4. **Rythme des pouvoirs** : « toutes les 4 cartes jouées » te convient, ou préfères-tu 3 (plus fréquent, mais plus faible) ?

---

## 9. Pour tester vite

- **En vrai :** imprime 2 decks sur du papier (par exemple Jimmy contre le Capitaine pirate) et joue quelques parties. C'est le moyen le plus rapide de voir ce qui est trop fort.
- **Sur le site :** une fois les règles stables, un prototype jouable contre un bot (puis contre un ami, dans une room comme au quiz) permettra de lancer des centaines de parties pour l'équilibrage.
