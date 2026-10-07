# ⚔️ Le TCG de Neutron : règles du jeu (proposition)

Les cartes et leurs visuels sont décrits dans [`tcg-cartes.md`](tcg-cartes.md). Ce document est une **première version des règles**, à tester et à équilibrer.

**Le principe :** chaque joueur prépare en secret une **pile de cartes face cachée**, dans l'ordre de son choix. Ensuite, les deux piles s'affrontent **carte contre carte** : la carte du dessus contre la carte du dessus, puis la suivante, etc. Il faut deviner ce que l'adversaire va jouer à chaque position : un contre bien placé annule une grosse attaque, un contre mal placé ne sert à rien.

---

## 1. Le matériel

- **6 couleurs**, chacune avec son style de jeu (voir § 4).
- **Champions** : 2 couleurs, des PV et un pouvoir. Il existe un champion par paire de couleurs, soit **15 champions** (voir § 5).
- **Deck** : **20 cartes** des deux couleurs de son champion, **2 exemplaires maximum** d'une même carte.

---

## 2. Déroulement d'une partie

Une partie se joue en **2 manches**. Chaque manche utilise 10 cartes du deck : les 20 cartes servent donc exactement une fois.

### Mise en place
1. Chaque joueur révèle son champion et prend ses PV (en général 20).
2. Chaque joueur mélange son deck de 20 cartes, face cachée.

### Phase 1 : la programmation (10 tours)
À chaque tour, en même temps :
1. Chaque joueur **pioche 1 carte**.
2. Il la pose **face cachée dans sa pile, à l'endroit de son choix** : dessus, dessous ou entre deux cartes.
3. Chacun peut regarder sa propre pile à tout moment. De la pile adverse, on ne connaît que le nombre de cartes.

Au bout de 10 tours, chaque pile compte 10 cartes : on passe à la résolution.

> 💡 **Variante plus tactique (conseillée) :** pioche **2** cartes, place-en **1** dans ta pile, et remets l'autre sous ton deck. Tu choisis ainsi tes cartes, et pas seulement leur ordre. Il faut alors **3 tours de plus** pour finir la pile, et la manche 2 joue les cartes restantes.

### Phase 2 : la résolution (10 duels)
Les deux joueurs retournent **en même temps** la carte du dessus de leur pile : c'est un **duel**. On le résout (voir § 3), on défausse les deux cartes, puis on passe aux deux suivantes, jusqu'à la 10ᵉ.

### Fin de manche et victoire
- **Un champion à 0 PV perd la partie aussitôt.** Si les deux tombent à 0 dans le même duel, c'est une égalité, ou une victoire de celui qui a le moins de PV négatifs.
- Après le 10ᵉ duel, le **bouclier** des deux joueurs disparaît, sauf mention contraire. On rejoue une phase de programmation avec les 10 cartes restantes : c'est la **manche 2**.
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

1. **Révélation** des deux cartes, en même temps.
2. **Annulations** : Contres, Gel, etc. Une carte annulée n'a **aucun effet**, sauf ses effets « *Si annulée* ».
3. **Effets immédiats** : bouclier, soins, vision, échanges, bonus pour la carte suivante.
4. **Dégâts**, en même temps : dégâts de l'Attaque − réductions → le **bouclier** absorbe → le reste est retiré des **PV**.
5. **Effets d'après** : épines, vol de vie, poison, sacrifice.

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
| Plasma instable | 🗡️ | 1-6 | Dégâts tirés au hasard (un dé). |
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

| Champion | Couleurs | PV | Pouvoir |
|---|---|---|---|
| **Jimmy l'alien** | 🟣🔵 | 20 | Une fois par manche, avant un duel : Vision 1. |
| **Butch Pakovski** | 🟡🟣 | 22 | Commence chaque manche avec 2 de bouclier. |
| **Reine de la Nuée** | 🟢⚫ | 22 | Ton Poison dure 1 duel de plus. |
| **Capitaine pirate** | 🔴⚫ | 18 | Tes Sacrifices te coûtent 1 PV de moins. |
| **Le Neutron** | 🔴🟡 | 20 | Ta première Attaque de chaque manche est Perforante. |
| **Garde galactique** | 🟡🔵 | 24 | Chaque fois que tu annules une carte, tu gagnes 1 de bouclier. |
| **Phénix solaire** | 🔴🟢 | 16 | Une fois par partie, quand tu tombes à 0 PV, reviens à 6 PV. |
| **Méduse abyssale** | 🔵⚫ | 20 | Chaque fois que tu annules une carte adverse, l'adversaire subit 1 dégât. |
| **Chat néon** | 🟣🔴 | 19 | Tes Attaques qui suivent une Tactique font +1. |
| **La Comète** | 🔴🔵 | 19 | Chaque Gel que tu poses inflige aussi 1 dégât. |
| **Pingouin cryogénique** | 🔵🟢 | 21 | Tes soins te donnent aussi autant de bouclier (2 au plus). |
| **L'Explorateur** | 🟢🟡 | 21 | Gagne 1 PV après chaque duel où tu n'as subi aucun dégât. |
| **Champignon dansant** | 🟢🟣 | 20 | Chaque fois que tu échanges ou mélanges des cartes, soigne 1 PV. |
| **Le Glouton du trou noir** | 🟡⚫ | 21 | Quand tu détruis du bouclier adverse, tu en gagnes la moitié. |
| **Le SuperAdmin** | 🟣⚫ | 18 | Une fois par partie, annule n'importe quelle carte adverse quand elle est révélée. |

Les champions solides (plus de PV) ont un pouvoir discret. Ceux qui ont un pouvoir fort ont peu de PV.

---

## 6. Exemple de résolution

**Jimmy** (🟣🔵, 20 PV) affronte le **Capitaine pirate** (🔴⚫, 18 PV). Voici les 4 premières cartes de chaque pile :

| Duel | Jimmy | Pirate | Ce qui se passe |
|---|---|---|---|
| 1 | ✨ Prévoyance | 🗡️ Coup de canon (3) | Jimmy fait Vision 2 et voit **Pacte** puis **Lame des abysses**. Le Pirate lui inflige 3 dégâts : **Jimmy 17**, Pirate 18. |
| 2 | ✨ Télépathie | ✨ Pacte | Jimmy fait Vision 1 (il revoit la Lame) et échange ses 2 prochaines cartes pour mettre son Contre en face de la Lame. Le Pirate fait Sacrifice 3, réduit à 2 par son pouvoir : Jimmy 17, **Pirate 16**. Sa prochaine Attaque fera le double. |
| 3 | 🌀 Mirage | 🗡️ Lame des abysses (4 ×2 = 8) | **Mirage annule la Lame** : ni dégâts, ni Sacrifice. Le Pacte du Pirate est gaspillé. |
| 4 | 🗡️ Rayon néon (3) | 🗡️ Bombe (2) | Deux Attaques : elles touchent toutes les deux. Jimmy n'avait pas vu cette carte, donc pas de +2 pour le Rayon. **Jimmy 15**, **Pirate 13**. |

C'est tout l'intérêt du jeu : une **lecture** de la pile adverse (Vision) et un **placement** (Échange) ont transformé l'énorme attaque de l'adversaire en coup dans le vide.

---

## 7. Points à surveiller pour l'équilibre

- **Bouclier trop fort ?** Deux joueurs qui ne font que des Gardes bloquent la partie. D'où le maximum de 10, le bouclier remis à zéro entre les manches, et le Noir qui le brise.
- **Contre trop sûr ?** Un Contre ne doit annuler que les Attaques, sinon il n'y a plus de risque. Les Contres qui annulent tout (Ombre) coûtent des PV.
- **Vision trop forte ?** Elle annule le bluff. Garde-la rare : une ou deux cartes par couleur au plus, et le pouvoir de Jimmy une fois par manche.
- **Hasard de la pioche** : avec la règle de base (pioche 1), on subit son deck. La variante « pioche 2, garde 1 » donne plus de contrôle.
- **Durée** : 2 manches de 10 duels font 20 duels. Une partie devrait durer 10 à 15 minutes. Pour la raccourcir : piles de 6 cartes et deck de 12.

---

## 8. Questions ouvertes

1. **La pile de 10 cartes** : j'ai compris « pioche 1 carte par tour et place-la où tu veux dans ta pile, jusqu'à 10 cartes, puis résolution ». Ou voulais-tu dire : pioche 10 cartes d'un coup, puis range-les ?
2. **Ta propre pile** : peut-on la regarder et la réorganiser pendant la programmation, ou une carte posée est-elle définitive ? Définitive, c'est plus dur et plus tendu.
3. **Révélation** : en même temps (c'est ce que je propose) ou chacun son tour ?
4. **Cartes neutres** : faut-il autoriser quelques cartes sans couleur dans tous les decks ?
5. **Hasard** : faut-il garder des effets aléatoires comme Plasma instable, ou un jeu 100 % lecture et bluff ?

---

## 9. Pour tester vite

- **En vrai :** imprime 2 decks sur du papier (par exemple Jimmy contre le Capitaine pirate) et joue quelques parties. C'est le moyen le plus rapide de voir ce qui est trop fort.
- **Sur le site :** une fois les règles stables, un prototype jouable contre un bot (puis contre un ami, dans une room comme au quiz) permettra de lancer des centaines de parties pour l'équilibrage.
