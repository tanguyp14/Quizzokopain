# Prompt Cowork : générer un quiz Neutron

Copie le bloc ci-dessous dans Cowork, remplace le **thème** (et le nombre de questions si besoin), puis joins `exemple-quiz.neutron.json` comme modèle.
Le fichier obtenu s'importe dans Neutron via **Mes quiz → ⬆️ Importer un quiz** : il s'ouvre dans l'éditeur pour vérification avant l'envoi.

---

```text
Tu vas créer un quiz pour l'application Neutron sur le thème : <<< THÈME ICI >>>.
Nombre de questions : 20 (minimum 5, maximum 100).

Rends UNIQUEMENT un fichier JSON valide nommé "<nom-du-quiz>.neutron.json", au format exact du fichier d'exemple joint :

{
  "format": "neutron-quiz",
  "version": 1,
  "quiz": {
    "name": "…",            // 2 à 40 caractères
    "emoji": "…",           // UN emoji représentant le quiz
    "description": "…",     // une phrase, 200 caractères max
    "keywords": ["…"],      // 1 à 8 mots-clés en minuscules
    "questions": [ … ]
  }
}

Chaque question a ces champs communs :
- "type" : "qcm" | "vraifaux" | "libre" | "rebus" | "image" | "estimation" | "ordre"
- "prompt" : l'énoncé (clair, court, sans ambiguïté)
- "difficulty" : "facile" | "moyen" | "difficile"
- "timeLimit" : 10 | 15 | 20 | 30 (secondes ; 30 pour les classements)
- "explanation" (optionnel) : une anecdote amusante et VRAIE, affichée après la réponse
- "source" (optionnel) : { "name": "…", "url": "https://…" }

Champs propres à chaque type :
- qcm : "choices" = 2 à 6 propositions (4 idéalement, plausibles) ; "answer" = INDEX de la bonne réponse, à partir de 0.
- vraifaux : "answer" = true ou false (booléen, pas de texte).
- libre : "answer" = réponse attendue (courte : un nom, un mot) ; "accept" = variantes acceptées
  (orthographes, avec/sans article, noms anglais…). Majuscules et accents sont ignorés automatiquement.
- rebus : "media": { "emoji": "…" } = une suite d'emojis à décoder (film, expression, personnage…) ; "answer" + "accept" comme libre.
- image : "media": { "imageUrl": "https://…" } = URL directe d'une image (jpg/png/webp) qui existe vraiment ;
  "answer" + "accept" comme libre. Si tu n'es pas sûr qu'une URL existe, n'utilise PAS ce type.
- estimation : "answer" = un NOMBRE exact (pas de texte), "unit" optionnelle. Il faut la réponse exacte :
  choisis des nombres que l'on peut connaître (dates, quantités précises), pas des approximations.
- ordre : "items" = 2 à 8 éléments { "text": "…" } écrits DANS LE BON ORDRE (ils seront mélangés pour les joueurs) ;
  l'énoncé dit le critère (« du plus petit au plus grand », « du plus ancien au plus récent »).
  Un élément peut avoir une image : { "text": "…", "imageUrl": "https://…" }.

Règles :
- Varie les types : environ 40 % qcm, 15 % vraifaux, 15 % libre, 10 % rebus, 10 % estimation, 10 % ordre.
- Répartis les difficultés : environ 1/3 facile, 1/3 moyen, 1/3 difficile.
- Vérifie chaque réponse : aucune erreur factuelle, une seule bonne réponse possible.
- Pas de question dont la réponse est dans l'énoncé ; pas de doublons.
- Écris en français, avec des guillemets droits " pour le JSON, sans commentaires ni virgule finale.
```

---

## Variante tableur (CSV)

`exemple-quiz.csv` contient les mêmes questions, une par ligne (séparateur `;`, ouvrable dans Excel / Google Sheets).
Le modèle vierge est aussi téléchargeable depuis **Mes quiz → 📄 télécharger le modèle CSV**.

| Colonne | Contenu |
|---|---|
| `type` | qcm, vraifaux, libre, rebus, image, estimation, ordre |
| `question` | l'énoncé |
| `reponse` | QCM : texte du bon choix (ou A-F, ou 1-6) · vrai/faux · texte · nombre |
| `choix1` … `choix6` | propositions du QCM |
| `elements` | classement : éléments dans le bon ordre, séparés par ` \| ` (image : `texte {https://…}`) |
| `accepte` | autres réponses acceptées, séparées par ` \| ` |
| `unite` | unité (estimation) |
| `difficulte` | facile, moyen, difficile |
| `delai` | 10, 15, 20 ou 30 |
| `emoji` | emojis du rébus |
| `image` | URL de l'image |
| `anecdote` | anecdote de Jimmy l'alien |
| `source` | nom ou lien de la source |

Le CSV ne contient que les questions : nom, emoji et mots-clés du quiz se remplissent dans l'éditeur après l'import.
