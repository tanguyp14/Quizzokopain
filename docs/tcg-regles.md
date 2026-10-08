# ⚔️ Le TCG de Neutron : règles du jeu (proposition)

Les cartes et leurs visuels sont décrits dans [`tcg-cartes.md`](tcg-cartes.md). Ce document est une **première version des règles**, à tester et à équilibrer.

**Le principe :** à chaque tour, chaque joueur empile **toute sa main** face cachée, dans l'ordre de son choix. Ensuite, les deux piles s'affrontent **carte contre carte** : la carte du dessus contre la carte du dessus, puis la suivante, etc. Une fois les deux piles résolues, **chacun reprend ses cartes en main**, pioche une carte de plus, et on recommence.

Dès le 2ᵉ tour, chacun **connaît donc les cartes de l'autre**. Tout le bluff porte sur **l'ordre** : où a-t-il mis son Contre cette fois ? Un contre bien placé annule une grosse attaque, un contre mal placé ne sert à rien.

---

## 1. Le matériel

- **6 couleurs**, chacune avec son style de jeu (voir § 4).
- **Champions** : 2 couleurs, **20 PV** de base (certains en ont plus), et un **pouvoir spécial** dont le rythme dépend du champion (toutes les 3, 4 ou 5 cartes jouées, toutes les 3 Attaques…). Il existe un champion par paire de couleurs, soit **15 champions** (voir § 5).
- **100 % bluff** : aucune carte ne fait appel au hasard. Le seul hasard du jeu vient de la pioche, et d'un seul champion, **Butch Pakovski**, qui joue aux dés.
- **Deck** : **20 cartes** des deux couleurs de son champion, **2 exemplaires maximum** d'une même carte. **Pas de cartes neutres** : chaque carte a une couleur.

---

## 2. Déroulement d'une partie

### Mise en place
1. Chaque joueur révèle son champion et prend ses PV (20 ou plus, selon le champion).
2. Chaque joueur mélange son deck de 20 cartes, face cachée, et **pioche 3 cartes** : c'est sa main de départ.

### Un tour de jeu
1. **Pioche** : chaque joueur pioche 1 carte. **Pas de pioche au 1ᵉʳ tour** : on joue les 3 cartes de départ. On ne pioche plus quand on a 10 cartes en main.
2. **Programmation** : en même temps, chaque joueur pose **toutes les cartes de sa main**, face cachée, en une pile, **dans l'ordre de son choix**.
3. **Résolution** : les deux joueurs retournent **en même temps** la carte du dessus de leur pile : c'est un **duel**. On le résout (voir § 3), puis on passe aux deux suivantes, jusqu'au bas des piles.
4. **Reprise** : chacun **reprend toutes ses cartes en main**. Le bouclier disparaît, sauf mention contraire.

La main grossit d'une carte par tour : 3 duels au tour 1, 4 au tour 2, 5 au tour 3, etc. La partie monte en puissance toute seule.

### Jusqu'à 10 contre 10
La main s'arrête à **10 cartes** : c'est atteint au tour 8 (3 cartes de départ + 7 pioches). À partir de là, on ne pioche plus, et chaque tour est un **affrontement de 10 cartes contre 10**, avec les mêmes cartes des deux côtés : il ne reste que l'ordre pour faire la différence.

### Défausse obligatoire à 5, 7 et 10 cartes
Quand la main atteint **5**, **7** puis **10 cartes** (aux tours 3, 5 et 8), chaque joueur, juste après sa pioche normale :
1. **défausse 1 carte** de sa main, au choix, **face cachée** ;
2. puis **pioche 1 carte** pour la remplacer.

La main garde donc sa taille, mais elle change : on se débarrasse de sa carte la plus faible, ou de celle que l'adversaire a trop bien lue. La défausse étant face cachée, l'adversaire ne sait plus exactement quelles cartes tu as : il connaît ta main **sauf 2 cartes**, celle de la pioche normale et celle de la défausse.

Une carte défaussée ne revient plus de la partie. Au total, chaque joueur pioche 13 cartes de son deck : 3 au départ, 7 pioches normales et 3 remplacements.

### Piles de tailles différentes
Si une carte a été détruite, une pile peut être plus longue que l'autre. Ses dernières cartes jouent alors **contre le vide** : une Attaque touche sans rien en face, un Contre ne fait rien.

### Victoire
- **Un champion à 0 PV perd la partie aussitôt.** Si les deux tombent à 0 dans le même duel, c'est une égalité.
- **Mort subite** : à partir du tour 10, chaque champion perd 2 PV au début du tour, puis 4 au tour 11, 6 au tour 12… La partie finit forcément.
- Une partie dure en général **3 à 8 tours**, soit 10 à 20 minutes (mesuré avec le prototype : 4 tours en médiane).

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

Chaque couleur reprend l'un des minerais de Jimmy Blast. Il n'y a **pas de cartes neutres** : chaque carte appartient à une des 6 couleurs.

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
| Carte | Type | Valeur | Effet | Rareté |
|---|---|---|---|---|
| Coup de canon | 🗡️ | 3 | — | ● Commune |
| Salve | 🗡️ | 2 | Enchaînement : +2 si ta carte précédente était une Attaque. | ● Commune |
| Rage de lave | 🗡️ | 5 | Tu subis 1 dégât. | ◆ Peu commune |
| Charge du Destroyer | 🗡️ | 3 | Perforant. | ◆ Peu commune |
| Surchauffe | ✨ | — | Préparation : ta prochaine Attaque fait +3. | ● Commune |
| Bombe | 🗡️ | 2 | Si annulée : inflige quand même 2 dégâts. | ● Commune |
| Feu de barrage | 🗡️ | 2 | Ne peut pas être annulée par un Contre. | ★ Rare |
| Furie | 🗡️ | X | X = nombre de tes Attaques déjà révélées ce tour (6 au plus). | ★ Rare |

#### 🔵 Bleu : contrôle
| Carte | Type | Valeur | Effet | Rareté |
|---|---|---|---|---|
| Parade glacée | 🌀 | — | Annule une Attaque. | ● Commune |
| Miroir de glace | 🌀 | — | Annule une Attaque et renvoie ses dégâts à l’attaquant. | ★ Rare |
| Contre-attaque glaciale | 🌀 | 1 | Annule une Attaque. Sinon, inflige 1 dégât. | ◆ Peu commune |
| Gel | ✨ | — | Gel : la prochaine carte adverse est annulée. | ◆ Peu commune |
| Blizzard | ✨ | — | Annule la carte d’en face si c’est une Attaque ou une Garde de valeur 2 ou moins. | ● Commune |
| Mur de givre | 🛡️ | 3 | — | ● Commune |
| Éclat de cristal | 🗡️ | 2 | Si la carte d’en face est une Garde : Gel. | ● Commune |
| Prévoyance | ✨ | — | Vision 2. | ★ Rare |

#### 🟢 Vert : endurance
| Carte | Type | Valeur | Effet | Rareté |
|---|---|---|---|---|
| Spores | 🗡️ | 1 | Poison 2. | ● Commune |
| Régénération | ✨ | — | Soigne 3 PV. | ● Commune |
| Carapace | 🛡️ | 2 | +1 par Garde que tu as déjà révélée ce tour. | ● Commune |
| Lianes | ✨ | — | La prochaine carte adverse a −2 de valeur. | ◆ Peu commune |
| Morsure de la Nuée | 🗡️ | 2 | Vol de vie. | ● Commune |
| Pollen | 🌀 | — | Annule une Attaque ; si c’est le cas, soigne 1 PV. | ◆ Peu commune |
| Essaim | 🗡️ | 2 | Si annulée : Poison 2. | ★ Rare |
| Floraison | ✨ | — | Soigne 1 PV par carte Verte que tu as déjà révélée ce tour. | ★ Rare |

#### 🟡 Jaune : forteresse
| Carte | Type | Valeur | Effet | Rareté |
|---|---|---|---|---|
| Bouclier solaire | 🛡️ | 3 | — | ● Commune |
| Rempart | 🛡️ | 5 | Le bouclier n’arrive qu’après les dégâts de ce duel. | ◆ Peu commune |
| Épines dorées | 🛡️ | 2 | Épines 2. | ● Commune |
| Bouclier galactique | 🛡️ | 2 | Ton bouclier ne disparaît pas à la fin du tour. | ★ Rare |
| Éclat solaire | 🗡️ | X | X = ton bouclier actuel (6 au plus). Le bouclier n’est pas dépensé. | ● Commune |
| Bénédiction | ✨ | — | Double ton bouclier (10 au plus). | ★ Rare |
| Garde galactique | 🌀 | — | Annule une Attaque ; si c’est le cas, gagne 2 de bouclier. | ● Commune |
| Aveuglement | ✨ | — | La prochaine Attaque adverse fait −3. | ◆ Peu commune |

#### 🟣 Violet : manipulation
| Carte | Type | Valeur | Effet | Rareté |
|---|---|---|---|---|
| Télépathie | ✨ | — | Vision 1, puis tu peux échanger tes 2 prochaines cartes. | ★ Rare |
| Tour de passe-passe | ✨ | — | Échange les 2 prochaines cartes de l’adversaire. | ◆ Peu commune |
| Rayon néon | 🗡️ | 3 | +2 si tu avais vu cette carte adverse grâce à une Vision. | ● Commune |
| Mirage | 🌀 | — | Annule une Attaque ou une Tactique. | ◆ Peu commune |
| Copie | ✨ | — | Devient une copie de la carte d’en face. | ★ Rare |
| Chaos | ✨ | — | Inverse l’ordre des 3 prochaines cartes de l’adversaire. | ● Commune |
| Rayon miroir | 🗡️ | 2 | +2 si la carte d’en face est une Tactique. | ● Commune |
| Déjà-vu | ✨ | — | Devient une copie de ta carte précédente. | ● Commune |

#### ⚫ Noir : sacrifice
| Carte | Type | Valeur | Effet | Rareté |
|---|---|---|---|---|
| Lame des abysses | 🗡️ | 4 | Perforant. Sacrifice 1. | ● Commune |
| Brise-bouclier | ✨ | — | Détruit tout le bouclier adverse. | ● Commune |
| Malédiction | ✨ | — | L’adversaire ne gagne ni bouclier ni PV pendant les 3 duels suivants. | ◆ Peu commune |
| Pacte | ✨ | — | Sacrifice 3. Préparation : ta prochaine Attaque fait le double. | ◆ Peu commune |
| Exécution | 🗡️ | 2 | Fait 8 si l’adversaire a 6 PV ou moins. | ★ Rare |
| Ombre | 🌀 | — | Annule la carte d’en face, quelle qu’elle soit. Sacrifice 2. | ● Commune |
| Trou noir | ✨ | — | Annule la carte d’en face et la détruit. Usage unique. | ★ Rare |
| Âme sombre | 🗡️ | 2 | +1 par Sacrifice que tu as fait ce tour. | ● Commune |

Les cartes sans valeur (—) n'ont pas de nombre en gros. Les effets sont détaillés et testés dans le prototype (`tcg/src/engine.js`).

Avec 8 cartes par couleur, un deck à 2 couleurs a le choix entre 16 cartes différentes. À 2 exemplaires maximum, il faut en prendre au moins 10.

Comme les cartes reviennent en main, **Détruire** est l'effet le plus fort du jeu : il enlève une carte à l'adversaire pour le reste de la partie. Il reste donc rare et souvent à usage unique.

---

## 5. Les 15 champions

Chaque champion a son **rythme** et ses **PV**. La règle d'équilibre : **plus un champion a de PV, plus son pouvoir est lent ou faible**. La base est de 20 PV ; un champion au pouvoir très fort descend à 18, un champion solide monte jusqu'à 26.

### Les compteurs
La plupart des pouvoirs se chargent avec un **compteur** : « toutes les 4 cartes jouées », « toutes les 3 Attaques jouées »… Une carte compte dès qu'elle est **révélée**, même si elle est annulée.

- Le compteur se suit avec des jetons sur la carte du champion (par exemple 4 cases).
- Il **continue d'un tour à l'autre** : s'il en est à 3/4 à la fin du tour 1, le pouvoir se déclenche après la 1ʳᵉ carte du tour 2.
- Quand il est plein, le pouvoir se déclenche à la fin du duel, et le compteur repart à zéro.
- Un effet qui vise « la prochaine carte » s'applique au duel suivant, ou au 1ᵉʳ duel du tour suivant.

**Tout est public.** Les deux joueurs voient les compteurs, et savent donc à quelle position de la pile un pouvoir va tomber. C'est une source de bluff de plus. Si l'adversaire sait que ta 3ᵉ carte sera doublée, il y placera sûrement un Contre… alors tu y mets une Garde et tu gardes ton Attaque pour la suivante.

Les pouvoirs ✋ se déclenchent quand on veut, un nombre limité de fois. Un champion peut aussi n'avoir **aucun pouvoir**, avec beaucoup de PV en échange.

### Les champions

| Champion | Couleurs | PV | Rythme | Pouvoir |
|---|---|---|---|---|
| **Jimmy l’alien** | 🟣🔵 | 20 | Toutes les 3 cartes jouées | **Je sais tout** : Regarde la prochaine carte adverse ; tu peux ensuite échanger tes 2 prochaines cartes. |
| **Butch Pakovski** 🎲 | 🟡🟣 | 20 | Toutes les 3 cartes jouées | **Le croupier** : Lance un dé. ⚀ rien · ⚁ +2 bouclier · ⚂ soigne 2 PV · ⚃ inflige 2 dégâts · ⚄ +4 bouclier · ⚅ Jackpot : inflige 3 dégâts et +3 bouclier. |
| **Reine de la Nuée** | 🟢⚫ | 22 | Toutes les 5 cartes jouées | **Ponte** : L’adversaire subit Poison 2. |
| **Capitaine pirate** | 🔴⚫ | 20 | Toutes les 3 Attaques jouées | **Abordage** : Ta prochaine Attaque fait +3. |
| **Le Neutron** | 🔴🟡 | 20 | Toutes les 5 cartes jouées | **Réacteur chargé** : Ta prochaine carte, si c’est une Attaque, fait le double. |
| **Garde galactique** | 🟡🔵 | 26 | Aucun pouvoir | **Aucun pouvoir** : Le champion le plus solide du jeu. |
| **Phénix solaire** | 🔴🟢 | 18 | Une fois par partie | **Renaissance** : Une fois par partie, quand tu tombes à 0 PV, reviens à 3 PV. |
| **Méduse abyssale** | 🔵⚫ | 22 | Toutes les 2 cartes adverses annulées | **Piqûre** : L’adversaire subit 3 dégâts. |
| **Chat néon** | 🟣🔴 | 20 | Toutes les 4 cartes jouées | **Neuf vies** : Tu ne subis aucun dégât au duel suivant. |
| **La Comète** | 🔴🔵 | 20 | Toutes les 5 cartes jouées | **Passage** : Inflige 2 dégâts Perforants. |
| **Pingouin cryogénique** | 🔵🟢 | 22 | Toutes les 6 cartes jouées | **Banquise** : Gel : la prochaine carte adverse est annulée. |
| **L’Explorateur** | 🟢🟡 | 22 | Tous les 3 tours | **Prospection** : Au début des tours 3, 6, 9…, après la pioche : défausse jusqu’à 2 cartes et pioche autant. |
| **Champignon dansant** | 🟢🟣 | 22 | Toutes les 3 cartes jouées | **Spores hypnotiques** : Échange les 2 prochaines cartes de l’adversaire. |
| **Le Glouton du trou noir** | 🟡⚫ | 24 | Toutes les 4 cartes jouées | **Festin** : Vole tout le bouclier adverse (10 au plus pour toi). |
| **Le SuperAdmin** | 🟣⚫ | 20 | 3 fois par partie | **Ban** : Trois fois par partie, annule une carte adverse juste après sa révélation. |

Ces valeurs viennent d'une première passe d'équilibrage avec le prototype (voir § 7).

Butch est le seul champion qui laisse une part au hasard. Son dé rapporte en moyenne un peu moins qu'un pouvoir fixe, mais son ⚅ peut renverser une partie.

---

## 6. Exemple de partie

**Jimmy** (🟣🔵, 20 PV, pouvoir toutes les 3 cartes) affronte le **Capitaine pirate** (🔴⚫, 20 PV, pouvoir toutes les 3 Attaques).

### Tour 1 : 3 cartes chacun, on ne sait rien de l'autre
- Main de Jimmy : Prévoyance, Mirage, Rayon néon.
- Main du Pirate : Coup de canon, Pacte, Lame des abysses.

| Duel | Jimmy | Pirate | Ce qui se passe |
|---|---|---|---|
| 1 | 🌀 Mirage | 🗡️ Coup de canon (3) | **Mirage annule le Coup de canon.** *(Abordage 1/3.)* |
| 2 | ✨ Prévoyance | ✨ Pacte | Jimmy fait Vision 2 et voit la **Lame des abysses**, la dernière carte du Pirate. Le Pirate fait Sacrifice 3 : **Pirate 17**. Sa prochaine Attaque fera le double. |
| 3 | 🗡️ Rayon néon (3 +2) | 🗡️ Lame des abysses (4 ×2 = 8) | Le Rayon fait +2 car Jimmy a vu la Lame. Deux Attaques : **Jimmy 12**, **Pirate 11** (5 dégâts, puis 1 de Sacrifice). *(Abordage 2/3.)* Jimmy a joué 3 cartes : son pouvoir se déclenche, mais le tour est fini, il agira au début du tour 2. |

Chacun reprend ses 3 cartes et pioche 1 carte : Jimmy pioche **Parade glacée**, le Pirate pioche **Bombe**.

### Tour 2 : 4 cartes chacun, et on connaît 3 des cartes de l'autre
Jimmy empile : Parade glacée, Prévoyance, Mirage, Rayon néon. Le Pirate : Pacte, Coup de canon, Lame des abysses, Bombe.

**Avant le 1ᵉʳ duel, le pouvoir de Jimmy** : il voit la 1ʳᵉ carte du Pirate, un **Pacte**. Sa Parade ne servirait à rien contre une Tactique : il échange ses 2 premières cartes et ouvre avec Prévoyance.

| Duel | Jimmy | Pirate | Ce qui se passe |
|---|---|---|---|
| 1 | ✨ Prévoyance | ✨ Pacte | Sacrifice 3 : **Pirate 8**, et sa prochaine Attaque fera le double. Vision 2 : Jimmy voit le **Coup de canon** et la **Lame**. |
| 2 | 🌀 Parade glacée | 🗡️ Coup de canon (3 ×2) | **Annulé**, et le bonus du Pacte est perdu. *(Abordage 3/3 : la prochaine Attaque du Pirate fera +3.)* |
| 3 | 🌀 Mirage | 🗡️ Lame des abysses (4 +3) | **Annulée** aussi : Jimmy l'avait vue venir. Pas de Sacrifice. Jimmy a joué 3 cartes ce tour : il voit la dernière carte du Pirate, une **Bombe**. |
| 4 | 🗡️ Rayon néon (3 +2) | 🗡️ Bombe (2) | Le Rayon fait +2 grâce à la Vision : **Pirate 3**, **Jimmy 10**. |

Au tour 3, le Pirate sait que Jimmy a 2 Contres : il va devoir deviner où ils sont… et Jimmy sait que le Pirate le sait.

---

## 7. Points à surveiller pour l'équilibre

- **Bouclier trop fort ?** Deux joueurs qui ne font que des Gardes bloquent la partie. D'où le maximum de 10, le bouclier remis à zéro à chaque tour, et le Noir qui le brise.
- **Contre trop sûr ?** Un Contre ne doit annuler que les Attaques, sinon il n'y a plus de risque. Les Contres qui annulent tout (Ombre) coûtent des PV.
- **Vision trop forte ?** Elle annule le bluff, surtout quand on connaît déjà les cartes adverses. Garde-la rare : une ou deux cartes par couleur au plus.
- **Sacrifice qui revient à chaque tour** : les cartes reviennent en main, donc un Pacte (Sacrifice 3) coûte 3 PV à **chaque** tour. C'est son vrai prix.
- **Détruire** : c'est l'effet le plus fort du jeu, puisqu'il enlève une carte pour toujours. À garder rare et à usage unique.
- **Deck de 20 cartes** : avec les défausses, on en pioche 13 dans une partie complète, et 9 ou 10 dans une partie de 5 tours. L'Explorateur peut en voir plus. Le deck sert donc à varier les parties : on ne sait jamais quelles cartes on aura.
- **Défausse face cachée** : c'est elle qui relance le bluff aux tours 3, 5 et 8. Si elle brouille trop la lecture, on peut la faire face visible.
- **PV contre pouvoir** : c'est le principal réglage des champions. Si un champion gagne trop souvent, on lui retire 2 PV ou on ralentit son rythme d'une carte.
- **Mesures du prototype** (onglet 📊 Équilibrage, bots « Normal », decks automatiques) : les champions **Rouge** et **Bleu** gagnent trop (la Comète environ 85 %, le Neutron et le Pingouin environ 70 %), les champions **Violets** pas assez (Jimmy, le Champignon et le SuperAdmin entre 20 et 35 %). Le déséquilibre vient surtout des **cartes** : il faut renforcer les Violettes (Chaos, Déjà-vu, Tour de passe-passe) avant de retoucher les champions. Attention, le bot joue mal les pouvoirs d'information, ce qui désavantage aussi Jimmy.
- **Mort subite** : elle a été ajoutée parce que certaines parties défensives duraient plus de 60 tours. Elle est progressive (−2, −4, −6… à partir du tour 10).

---

## 8. Choix validés

- **Main** : 3 cartes au départ, pas de pioche au 1ᵉʳ tour, puis 1 pioche par tour, jusqu'à 10 cartes (affrontement de 10 contre 10).
- **Deck** : 20 cartes, 2 exemplaires maximum, sans cartes neutres.
- **Chaque tour** : toute la main est jouée en pile face cachée, puis reprise après la résolution.
- **Révélation** : en même temps.
- **Hasard** : aucun dans les cartes ; seul Butch Pakovski joue aux dés.
- **Défausse** : obligatoire à 5, 7 et 10 cartes en main (défausse 1, puis pioche 1). L'Explorateur peut en plus défausser tous les 3 tours.
- **Champions** : 20 PV de base, avec un rythme et des PV propres à chacun.
- **Boosters** (édition papier seulement) : 10 cartes (1 personnage obligatoire, les rares à la fin) + 1 carte marqueur (voir § 9). En ligne, toutes les cartes sont accessibles.

---

## 9. Boosters (édition papier)

**En ligne, toutes les cartes sont accessibles** : pas de boosters ni de collection à débloquer. Les boosters et les taux de drop concernent l'**édition papier** ; le CSV donne le taux de chaque carte (colonnes `taux_par_booster` et `taux_alternative`).

Un booster contient **10 cartes, plus 1 carte marqueur**, découvertes dans cet ordre :

| Ordre | Carte | Taux |
|---|---|---|
| bonus | 🎯 **Marqueur** (un des 6, un par couleur) | 1 par booster |
| 1 | 👤 **Personnage** (champion) | 1 par booster, obligatoire · version alternative 5 % |
| 2 à 7 | ● 6 **communes** | alternative 1 % chacune |
| 8 et 9 | ◆ 2 **peu communes** | chacune a 15 % de chances d'être une rare · alternative 2 % |
| 10 | ★ 1 **rare**, toujours en dernier | alternative 10 % |

Soit **1,3 rare** par booster en moyenne, et une **version alternative ✦** dans environ **23 %** des boosters.

Pour une carte précise, les chances par booster sont : **25 %** pour une commune, **14,17 %** pour une peu commune, **10,83 %** pour une rare, **6,67 %** pour un personnage et **16,67 %** pour un marqueur.

- **Versions alternatives ✦** : la même carte, avec une autre illustration et un effet holographique (le Labo Holo sert à les préparer). En partie, elle compte comme la carte normale.
- **Marqueur** : une carte pour suivre en partie réelle ses **PV** (0 à 29), son **armure** (0 à 10) et le **tour** (1 à 12), avec un jeton ou un trombone. Il en existe 6, un par couleur.
- **Personnages** : il faut posséder le personnage d'un deck pour le jouer, d'où un personnage dans chaque booster.
- L'onglet 🖨️ du prototype simule l'ouverture d'un booster papier, pour se faire une idée.

Tous ces taux se règlent à un seul endroit : `BOOSTER` dans `tcg/src/data.js`.

---

## 10. Nom du jeu

Le prototype s'appelle **Collision** pour l'instant (une seule ligne à changer : `GAME_NAME` dans `tcg/src/data.js`). Les pistes :

| Nom | Pourquoi |
|---|---|
| **Collision** ⭐ | Les deux piles entrent en collision carte par carte, comme des particules dans un accélérateur. Ça reste dans le monde de Neutron, et c'est court. |
| **Pile ou Farce** | Jeu de mots sur « pile ou face » : on joue une **pile** et on fait une **farce** (du bluff). Drôle, très français. |
| **Superposition** | Comme en physique quantique, une carte face cachée est « tout à la fois » jusqu'à ce qu'on la révèle. |
| **Face Cachée** | Simple et clair : tout le jeu se passe face cachée. |
| **Isotopes** | La même carte en versions différentes (normale, alternative), comme un atome avec plus ou moins de neutrons. |
| **Neutrino** | Le petit frère de Neutron. |

---

## 11. Pour tester

- **Le prototype** : `tcg/jeu.html` s'ouvre sans serveur (double-clic). On y trouve : partie contre le bot (3 niveaux), toutes les cartes, création de decks, impression des cartes, CSV (avec les taux de drop), simulation d'un booster papier et équilibrage automatique. Pour le modifier : les sources sont dans `tcg/src/`, puis `node tcg/build.js` reconstruit `jeu.html` et `cartes.csv`. Les règles sont testées dans `test/tcg.test.js`.
- **En vrai :** imprime 2 decks depuis l'onglet 🖨️ (63 × 88 mm, 9 cartes par page A4) avec 2 marqueurs, et joue quelques parties.
- **Sur le site, plus tard :** la même logique (`engine.js`) pourra servir aux parties entre amis dans des rooms, comme au quiz.
