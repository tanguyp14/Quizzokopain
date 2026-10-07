# ⚔️ Le TCG de Neutron : règles du jeu (proposition)

Les cartes et leurs visuels sont décrits dans [`tcg-cartes.md`](tcg-cartes.md). Ce document est une **première version des règles**, à tester et à équilibrer.

**Le principe :** chaque joueur prépare en secret une **pile de cartes face cachée**, dans l'ordre de son choix. Ensuite, les deux piles s'affrontent **carte contre carte** : la carte du dessus contre la carte du dessus, puis la suivante, etc. Il faut deviner ce que l'adversaire va jouer à chaque position : un contre bien placé annule une grosse attaque, un contre mal placé ne sert à rien.

---

## 1. Le matériel

- **6 couleurs**, chacune avec son style de jeu (voir § 4).
- **Champions** : 2 couleurs, **20 PV** pour tous, et un **pouvoir spécial** qui se déclenche à un rythme connu (tous les 4 duels, toutes les 3 Attaques…). Il existe un champion par paire de couleurs, soit **15 champions** (voir § 5).
- **100 % bluff** : aucune carte ne fait appel au hasard. Le seul hasard du jeu vient de la pioche, et d'un seul champion, **Butch Pakovski**, qui joue aux dés.
- **Deck** : **20 cartes** des deux couleurs de son champion, **2 exemplaires maximum** d'une même carte.

---

## 2. Déroulement d'une partie

Une partie se joue en **2 manches**. Chaque manche utilise 10 cartes du deck : les 20 cartes servent donc exactement une fois.

### Mise en place
1. Chaque joueur révèle son champion : **20 PV**.
2. Chaque joueur mélange son deck de 20 cartes, face cachée, et **pioche 3 cartes** : c'est sa main de départ.

### Phase 1 : la programmation (10 tours)
À chaque tour, en même temps :
1. Chaque joueur **pioche 1 carte** : il a alors 4 cartes en main.
2. Il choisit **1 carte de sa main** et la pose **face cachée dans sa pile, à l'endroit de son choix** : dessus, dessous ou entre deux cartes.
3. Chacun peut regarder sa propre pile à tout moment. De la pile adverse, on ne connaît que le nombre de cartes.

La main reste donc à 3 cartes. On ne subit pas sa pioche : on choisit **quelles** cartes jouer **et** dans quel ordre, et on garde des cartes pour plus tard.

Au bout de 10 tours, chaque pile compte 10 cartes : on passe à la résolution.

### La manche 2
Les **3 cartes de la main sont gardées** pour la manche 2, et il reste 7 cartes dans le deck. On rejoue 10 tours de programmation : 7 tours normaux (pioche 1, pose 1), puis 3 tours **sans pioche**, où l'on pose les dernières cartes de sa main. Les 20 cartes du deck sont ainsi toutes jouées, une fois chacune.

### Phase 2 : la résolution (10 duels)
Les deux joueurs retournent **en même temps** la carte du dessus de leur pile : c'est un **duel**. On le résout (voir § 3), on défausse les deux cartes, puis on passe aux deux suivantes, jusqu'à la 10ᵉ.

### Fin de manche et victoire
- **Un champion à 0 PV perd la partie aussitôt.** Si les deux tombent à 0 dans le même duel, c'est une égalité, ou une victoire de celui qui a le moins de PV négatifs.
- Après le 10ᵉ duel, le **bouclier** des deux joueurs disparaît, sauf mention contraire, et on passe à la **manche 2**. Les compteurs des pouvoirs de champion repartent aussi à zéro.
- Si personne n'est à 0 PV à la fin de la manche 2, le joueur qui a **le plus de PV** gagne.

---

## 3. Résoudre un duel

### Les 4 types de cartes

| Type | Icône | Ce qu'elle fait |
|---|---|---|
| **Attaque** | 🗡️ | Inflige des dégâts au champion adverse. |
| **Garde** | 🛡️ | Donne du **bouclier**, qui absorbe les dégâts avant les PV. Il reste d'un duel à l'autre (maximum 10). |
| **Contre** | 🌀 | **Annule l'Attaque d'en face.** Contre une autre carte, il ne fait rien, sauf mention contraire. |
| **Tactique** | ✨ | Un effet spécial : soin, vision, gel, échange de cartes, bonus pour la carte suivante… |

Le cœur du bluff :
- 🗡️ **Attaque** : elle fait mal, mais un 🌀 Contre l'annule (et la punit parfois).
- 🌀 **Contre** : il gagne gros face à une Attaque, mais **ne sert à rien** face au reste.
- 🛡️ **Garde** : c'est le choix sûr. Jamais perdue, mais lente : le bouclier n'inflige aucun dégât.
- ✨ **Tactique** : elle prépare la suite, mais si l'adversaire attaque pendant ce temps, tu encaisses.

### Ordre de résolution
Pour chaque duel, dans cet ordre :

0. **Pouvoirs « avant le duel »** des champions (ceux qui se déclenchent à ce duel).
1. **Révélation** des deux cartes, en même temps.
2. **Annulations** : Contres, Gel, etc. Une carte annulée n'a **aucun effet**, sauf ses effets « *Si annulée* ».
3. **Effets immédiats** : bouclier, soins, vision, échanges, bonus pour la carte suivante.
4. **Dégâts**, en même temps : dégâts de l'Attaque − réductions → le **bouclier** absorbe → le reste est retiré des **PV**.
5. **Effets d'après** : épines, vol de vie, poison, sacrifice.
6. **Pouvoirs « après le duel »** des champions, et mise à jour de leurs compteurs.

Deux Attaques face à face se touchent **toutes les deux**. Deux Contres face à face ne font **rien**.

### Mots-clés

| Mot-clé | Effet |
|---|---|
| **Enchaînement** | Bonus si **ta carte précédente** remplit une condition (ex. : c'était une Attaque). C'est ce qui rend l'ordre de la pile important. |
| **Préparation** | L'effet s'applique à **ta prochaine carte** (ou à ta prochaine Attaque, si la carte le dit). Si cette carte est annulée, le bonus est perdu. |
| **Perforant** | Ignore le bouclier. |
| **Épines X** | Si une Attaque te touche, l'attaquant subit X dégâts. |
| **Poison X** | L'adversaire perd 1 PV à la fin de chacun des X prochains duels. |
| **Gel** | La **prochaine** carte adverse est annulée. |
| **Vision X** | Regarde les X prochaines cartes de la pile adverse. |
| **Échange** | Échange deux cartes non révélées (les tiennes ou celles de l'adversaire, selon la carte). |
| **Sacrifice X** | Tu perds X PV (le bouclier n'absorbe pas cette perte). |
| **Vol de vie** | Tu regagnes les PV que cette carte a retirés à l'adversaire. |
| **Si annulée** | Effet qui s'applique quand cette carte est annulée. |

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
| Furie | 🗡️ | X | X = nombre de tes Attaques déjà révélées cette manche (6 au plus). |

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
| Carapace | 🛡️ | 2 | +1 par Garde que tu as déjà révélée cette manche. |
| Lianes | ✨ | — | La prochaine carte adverse a −2 de valeur. |
| Morsure de la Nuée | 🗡️ | 2 | Vol de vie. |
| Pollen | 🌀 | — | Annule une Attaque et soigne 1 PV. |
| Essaim | 🗡️ | 1 ×3 | Trois coups de 1. |
| Floraison | ✨ | — | Soigne 1 PV par carte Verte que tu as déjà révélée cette manche. |

#### 🟡 Jaune : forteresse
| Carte | Type | Valeur | Effet |
|---|---|---|---|
| Bouclier solaire | 🛡️ | 3 | — |
| Rempart | 🛡️ | 5 | Le bouclier n'arrive qu'**après** les dégâts de ce duel. |
| Épines dorées | 🛡️ | 2 | Épines 2. |
| Bouclier galactique | 🛡️ | 2 | Ton bouclier ne disparaît pas à la fin de la manche. |
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
| Trou noir | ✨ | — | Annule la carte d'en face **et** ta prochaine carte. |
| Âme sombre | 🗡️ | 2 | +1 par Sacrifice que tu as fait cette manche. |

Avec 8 cartes par couleur, un deck à 2 couleurs a le choix entre 16 cartes différentes. À 2 exemplaires maximum, il faut en prendre au moins 10.

---

## 5. Les 15 champions

Tous les champions ont **20 PV**. Ce qui les distingue, c'est leur **pouvoir spécial**.

### Les 3 façons de déclencher un pouvoir

| Déclencheur | Icône | Exemple | Sur la carte |
|---|---|---|---|
| **Rythme** | ⏱️ | « Tous les 4 duels » : aux duels 4 et 8 de chaque manche. | Une frise de 10 cases avec les duels marqués. |
| **Compteur** | 🔁 | « Toutes les 3 Attaques que tu révèles » | 3 cases à cocher avec des jetons, remises à zéro après le déclenchement. |
| **Une fois** | ✋ | « Une fois par manche » / « une fois par partie » | Un jeton à retourner. |

**Tout est public.** Les deux joueurs savent quand un pouvoir va se déclencher, et c'est une source de bluff de plus. Si l'adversaire sait que ton Attaque du duel 4 sera doublée, il y placera sûrement un Contre… alors tu y mets une Garde, et ton Attaque passe au duel 5.

Une carte annulée **compte quand même** pour les compteurs (« révéler » une Attaque, c'est la retourner, même si elle est annulée).

### Les champions

| Champion | Couleurs | Pouvoir |
|---|---|---|
| **Jimmy l'alien** | 🟣🔵 | ⏱️ **Je sais tout** : avant les duels 4 et 8, regarde la prochaine carte adverse ; tu peux ensuite échanger tes 2 prochaines cartes. |
| **Butch Pakovski** 🎲 | 🟡🟣 | ⏱️ **Le croupier** (le champion du hasard) : après les duels 3, 6 et 9, lance un dé. ⚀ rien · ⚁ +2 bouclier · ⚂ soigne 2 PV · ⚃ inflige 2 dégâts · ⚄ +4 bouclier · ⚅ **Jackpot** : inflige 3 dégâts et +3 bouclier. |
| **Reine de la Nuée** | 🟢⚫ | ⏱️ **Ponte** : après les duels 4 et 8, l'adversaire subit Poison 2. |
| **Capitaine pirate** | 🔴⚫ | 🔁 **Abordage** : toutes les 3 Attaques que tu révèles, ta prochaine Attaque fait +3. |
| **Le Neutron** | 🔴🟡 | ⏱️ **Réacteur chargé** : aux duels 4 et 8, si ta carte est une Attaque, elle fait le double. |
| **Garde galactique** | 🟡🔵 | ⏱️ **Bouclier du centre** : avant les duels 4 et 8, gagne 3 de bouclier. |
| **Phénix solaire** | 🔴🟢 | ✋ **Renaissance** : une fois par partie, quand tu tombes à 0 PV, reviens à 5 PV. |
| **Méduse abyssale** | 🔵⚫ | 🔁 **Piqûre** : toutes les 2 cartes adverses que tu annules, l'adversaire subit 3 dégâts. |
| **Chat néon** | 🟣🔴 | ⏱️ **Neuf vies** : aux duels 4 et 8, tu ne subis aucun dégât. |
| **La Comète** | 🔴🔵 | ⏱️ **Passage** : après les duels 5 et 10, inflige 3 dégâts Perforants. |
| **Pingouin cryogénique** | 🔵🟢 | ⏱️ **Banquise** : après les duels 3 et 7, Gel (la carte adverse suivante est annulée). |
| **L'Explorateur** | 🟢🟡 | 🔁 **Ravitaillement** : toutes les 3 Gardes que tu révèles, soigne 3 PV. |
| **Champignon dansant** | 🟢🟣 | ⏱️ **Spores hypnotiques** : avant les duels 4 et 8, mélange les 2 prochaines cartes de l'adversaire (sans les regarder). |
| **Le Glouton du trou noir** | 🟡⚫ | ⏱️ **Festin** : après les duels 4 et 8, vole tout le bouclier adverse (10 au plus pour toi). |
| **Le SuperAdmin** | 🟣⚫ | ✋ **Ban** : une fois par manche, annule une carte adverse juste après sa révélation. |

Butch est le seul champion qui laisse une part au hasard. Son dé rapporte en moyenne un peu moins qu'un pouvoir fixe, mais son ⚅ peut renverser une partie.

---

## 6. Exemple de résolution

**Jimmy** (🟣🔵) affronte le **Capitaine pirate** (🔴⚫). Les deux ont 20 PV. Voici les 5 premiers duels de la manche 1 :

| Duel | Jimmy | Pirate | Ce qui se passe |
|---|---|---|---|
| 1 | ✨ Prévoyance | 🗡️ Coup de canon (3) | Jimmy fait Vision 2 et voit **Pacte** puis **Lame des abysses**. Le Pirate lui inflige 3 dégâts : **Jimmy 17**, Pirate 20. *(Abordage : 1/3.)* |
| 2 | ✨ Télépathie | ✨ Pacte | Jimmy fait Vision 1 (il revoit la Lame) et échange ses 2 prochaines cartes pour mettre son Contre en face de la Lame. Le Pirate fait Sacrifice 3 : Jimmy 17, **Pirate 17**. Sa prochaine Attaque fera le double. |
| 3 | 🌀 Mirage | 🗡️ Lame des abysses (4 ×2 = 8) | **Mirage annule la Lame** : ni dégâts, ni Sacrifice, et le Pacte est gaspillé. *(Abordage : 2/3, car une carte annulée compte.)* |
| 4 | 🗡️ Rayon néon (3 +2) | 🗡️ Bombe (2) | **Pouvoir de Jimmy** avant le duel : il voit la Bombe et garde son Rayon néon, qui fait +2 puisqu'il a vu la carte. Deux Attaques : **Jimmy 15**, **Pirate 12**. *(Abordage : 3/3, déclenché : la prochaine Attaque du Pirate fera +3.)* |
| 5 | ? | ? | Les deux joueurs savent que la prochaine Attaque du Pirate fera +3. Jimmy a intérêt à placer un Contre… et le Pirate le sait, alors il retarde peut-être son Attaque d'un duel. |

C'est tout l'intérêt du jeu : une **lecture** de la pile adverse (Vision), un **placement** (Échange) et des pouvoirs **connus de tous** transforment chaque duel en partie de poker.

---

## 7. Points à surveiller pour l'équilibre

- **Bouclier trop fort ?** Deux joueurs qui ne font que des Gardes bloquent la partie. D'où le maximum de 10, le bouclier remis à zéro entre les manches, et le Noir qui le brise.
- **Contre trop sûr ?** Un Contre ne doit annuler que les Attaques, sinon il n'y a plus de risque. Les Contres qui annulent tout (Ombre) coûtent des PV.
- **Vision trop forte ?** Elle annule le bluff. Garde-la rare : une ou deux cartes par couleur au plus, et le pouvoir de Jimmy limité aux duels 4 et 8.
- **Pouvoirs à rythme fixe** : comme tout le monde sait quand ils tombent, l'adversaire peut placer une carte faible en face. C'est voulu. Mais un pouvoir qui touche à coup sûr (dégâts Perforants de la Comète, vol de bouclier du Glouton) doit rester modeste.
- **Main de 3 cartes** : on peut garder une carte forte jusqu'à la fin, voire jusqu'à la manche 2. À surveiller : si c'est trop fort, on peut limiter la main gardée à 2 cartes.
- **Durée** : 2 manches de 10 duels font 20 duels. Une partie devrait durer 10 à 15 minutes. Pour la raccourcir : piles de 6 cartes et deck de 12.

---

## 8. Questions ouvertes

1. **Ta propre pile** : peut-on la réorganiser pendant la programmation, ou une carte posée est-elle définitive ? Définitive, c'est plus dur et plus tendu.
2. **Révélation** : en même temps (c'est ce que je propose) ou chacun son tour ?
3. **Cartes neutres** : faut-il autoriser quelques cartes sans couleur dans tous les decks ?
4. **Rythme des pouvoirs** : les duels 4 et 8 te conviennent, ou préfères-tu « tous les 3 duels » (3, 6, 9), plus fréquent mais plus faible ?
5. **Deux manches** : on garde 2 manches de 10 duels, ou une seule manche de 20 cartes, plus longue ?

---

## 9. Pour tester vite

- **En vrai :** imprime 2 decks sur du papier (par exemple Jimmy contre le Capitaine pirate) et joue quelques parties. C'est le moyen le plus rapide de voir ce qui est trop fort.
- **Sur le site :** une fois les règles stables, un prototype jouable contre un bot (puis contre un ami, dans une room comme au quiz) permettra de lancer des centaines de parties pour l'équilibrage.
