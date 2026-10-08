// Export CSV de toutes les cartes et de tous les champions (pour l'impression, Excel, un outil de mise en page…).
import {
  CARDS, CHAMPIONS, MARKERS, COLORS, TYPES, RARITIES, CARD_BY_ID, CHAMPION_BY_ID, MARKER_BY_ID, EXTENSION, FLAVOR, FLAVOR_ALT, KEYWORDS, DEFAULT_ILLUSTRATOR, ILLUSTRATORS, TYPE_COLORS,
  rhythmLabel,
} from './data.js';
import { cardDropRate, percent, printQuantities } from './booster.js';

const CSV_COLUMNS = [
  'numero', 'categorie', 'id', 'nom', 'couleur', 'couleur_2', 'type', 'valeur', 'effet', 'mots_cles', 'rarete',
  'pv', 'rythme', 'pouvoir', 'texte_pouvoir', 'emoji', 'fichier_image', 'exemplaires_a_imprimer',
  'taux_par_booster', 'taux_alternative',
];

/** Les deux colonnes de taux de drop (édition papier) : chance par booster, en version normale et alternative. */
const drop = (kind, id) => {
  const r = cardDropRate(kind, id);
  return [percent(r.taux), r.alt ? percent(r.alt) : ''];
};

function csvCell(v) {
  const text = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Le CSV complet (séparateur « ; », encodage UTF-8 avec BOM pour qu'Excel lise les accents). */
export function cardsCsv() {
  const rows = [CSV_COLUMNS];
  for (const card of CARDS) {
    rows.push([
      String(card.numero).padStart(3, '0'), 'Carte', card.id, card.nom, COLORS[card.couleur].nom, '',
      TYPES[card.type].nom, card.valeur ?? '', card.effet, card.motsCles.join(', '), RARITIES[card.rarete].nom,
      '', '', '', '', card.art, '', 2, ...drop('card', card.id),
    ]);
  }
  for (const champion of CHAMPIONS) {
    rows.push([
      `C${String(champion.numero - 100).padStart(2, '0')}`, 'Personnage', champion.id, champion.nom,
      COLORS[champion.couleurs[0]].nom, COLORS[champion.couleurs[1]].nom, '', '', '', '', 'Personnage',
      champion.pv, rhythmLabel(champion.rythme), champion.pouvoir, champion.texte, champion.art, '', 1, ...drop('champion', champion.id),
    ]);
  }
  for (const m of MARKERS) {
    rows.push([
      `M${String(m.numero - 200).padStart(2, '0')}`, 'Marqueur', m.id, m.nom, COLORS[m.couleur].nom, '', '', '',
      'Suivi des PV (0 à 29), de l’armure (0 à 10) et du tour (1 à 12).', '', '', '', '', '', '', m.art, '', 1, ...drop('marker', m.id),
    ]);
  }
  return `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

// ---- commande imprimeur -------------------------------------------------------------------------

const toCsv = (rows) => `\ufeff${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;

/** Numéro, catégorie, nom et rareté d'une carte de booster, pour les fichiers de l'imprimeur. */
function describe(kind, id) {
  if (kind === 'champion') {
    const c = CHAMPION_BY_ID[id];
    return { numero: `C${String(c.numero - 100).padStart(2, '0')}`, categorie: 'Personnage', nom: c.nom, rarete: 'Personnage' };
  }
  if (kind === 'marker') {
    const m = MARKER_BY_ID[id];
    return { numero: `M${String(m.numero - 200).padStart(2, '0')}`, categorie: 'Marqueur', nom: m.nom, rarete: 'Marqueur' };
  }
  const c = CARD_BY_ID[id];
  return { numero: String(c.numero).padStart(3, '0'), categorie: 'Carte', nom: c.nom, rarete: RARITIES[c.rarete].nom };
}

/** Ce que l'imprimeur doit imprimer : une ligne par carte et par version, avec la quantité. */
export function quantitiesCsv(boosters) {
  const rows = [['numero', 'categorie', 'id', 'nom', 'rarete', 'version', 'quantite', 'fichier_image']];
  let total = 0;
  for (const r of printQuantities(boosters)) {
    const d = describe(r.kind, r.id);
    rows.push([d.numero, d.categorie, r.id, d.nom, d.rarete, r.version === 'alternative' ? 'Alternative ❖' : 'Normale', r.quantite, '']);
    total += r.quantite;
  }
  rows.push(['', '', '', 'TOTAL', '', '', total, '']);
  return toCsv(rows);
}

/** Ce qu'il faut mettre dans chaque booster, carte par carte, dans l'ordre (la rare en dernier). */
export function compositionCsv(boosters) {
  const rows = [['booster', 'position', 'emplacement', 'numero', 'categorie', 'id', 'nom', 'rarete', 'version']];
  boosters.forEach((pack, b) => pack.forEach((x, k) => {
    const d = describe(x.kind, x.id);
    rows.push([b + 1, k + 1, x.slot, d.numero, d.categorie, x.id, d.nom, d.rarete, x.version === 'alternative' ? 'Alternative ❖' : 'Normale']);
  }));
  return toCsv(rows);
}

/** Le résumé à envoyer à l'imprimeur. */
export function orderSummary(boosters, { seed = null, gameName = '' } = {}) {
  const n = boosters.length;
  const cards = boosters.flat();
  const by = (pred) => cards.filter(pred).length;
  const alt = (pred) => cards.filter((x) => pred(x) && x.version === 'alternative').length;
  const rarity = (r) => (x) => x.kind === 'card' && CARD_BY_ID[x.id].rarete === r;
  const fmt = (v) => v.toLocaleString('fr-FR');
  const line = (label, pred) => `- ${label} : ${fmt(by(pred))}${alt(pred) ? ` (dont ${fmt(alt(pred))} en version alternative ❖)` : ''}`;
  const refs = printQuantities(boosters).length;
  return [
    `Commande ${gameName ? `${gameName} ` : ''}: ${fmt(n)} booster${n > 1 ? 's' : ''}`,
    '',
    `Chaque booster contient 11 cartes : 10 cartes de jeu + 1 carte marqueur, soit ${fmt(cards.length)} cartes à imprimer au total, sur ${fmt(refs)} visuels différents.`,
    'Format des cartes : 63 × 88 mm (format carte à jouer standard), recto + dos commun.',
    '',
    'Répartition :',
    line('Marqueurs', (x) => x.kind === 'marker'),
    line('Personnages', (x) => x.kind === 'champion'),
    line('Communes', rarity('commune')),
    line('Peu communes', rarity('peu commune')),
    line('Rares', rarity('rare')),
    `- Boosters avec au moins une version alternative : ${fmt(boosters.filter((p) => p.some((x) => x.version === 'alternative')).length)}`,
    '',
    'Fichiers joints :',
    '- impression-quantites.csv : quoi imprimer et en combien d’exemplaires (une ligne par carte et par version).',
    '- boosters-composition.csv : le contenu de chaque booster, carte par carte, dans l’ordre (marqueur, personnage, communes, peu communes, puis la rare en dernier).',
    '',
    'Les quantités respectent exactement les taux de drop : chaque carte d’une même rareté est imprimée le même nombre de fois (à une près), et un booster ne contient jamais deux fois la même carte.',
    seed !== null ? `Graine de tirage : ${seed} (relancer avec la même graine redonne exactement les mêmes boosters).` : '',
  ].filter((l, k, a) => l !== '' || a[k - 1] !== '').join('\n');
}


// ---- export Figma ---------------------------------------------------------------------------------

/**
 * Ajoute la définition des mots-clés entre parenthèses, à leur première apparition :
 * « Perforant. » → « Perforant (ignore le bouclier). ». Un mot-clé déjà suivi de « : » est laissé tel quel.
 */
export function explainKeywords(text) {
  let out = text;
  for (const [kw, definition] of Object.entries(KEYWORDS)) {
    const re = new RegExp(`(${kw}s?(?: \\d+)?)(?![\\wÀ-ÿ])(?! ?\\d)(?! ?:)(?! \\()`);
    out = out.replace(re, `$1 (${definition})`);
  }
  return out;
}

const FIGMA_COLUMNS = [
  'Numero', 'Numero_set', 'Extension', 'Code_extension', 'Categorie', 'Version', 'Rarete', 'Symbole_rarete', 'Nom', 'Type',
  'Icone_type', 'Couleur_type', 'Valeur', 'PV', 'Pouvoir', 'Rythme', 'Couleur', 'Couleur_hex', 'Couleur2', 'Couleur2_hex', 'Description',
  'Extra', 'Mots_cles', 'Illustrateur', 'Fichier_image',
];

/**
 * Une ligne par carte à dessiner : chaque carte, personnage et marqueur, en version normale puis alternative
 * (numéro suivi de « * », ex. 001*). Les colonnes portent les noms des calques à remplir dans Figma.
 */
export function figmaRows() {
  const rows = [];
  const color = (k) => (k ? [COLORS[k].nom, COLORS[k].hex] : ['', '']);
  const both = (id, base, numero, total) => {
    for (const alt of [false, true]) {
      const n = `${numero}${alt ? '*' : ''}`;
      rows.push({
        Extra: (alt ? FLAVOR_ALT[id] : FLAVOR[id]) || '',
        Illustrateur: (alt && ILLUSTRATORS[`${id}*`]) || ILLUSTRATORS[id] || DEFAULT_ILLUSTRATOR,
        Numero: n,
        Numero_set: total,
        Extension: EXTENSION.nom,
        Code_extension: EXTENSION.code,
        Version: alt ? 'Alternative' : 'Normale',
        Fichier_image: `${numero}${alt ? '-alt' : ''}.png`,
        ...base,
      });
    }
  };
  const pad = (n, w = 3) => String(n).padStart(w, '0');
  for (const x of CARDS) {
    const [c, hex] = color(x.couleur);
    both(x.id, {
      Categorie: 'Carte', Rarete: RARITIES[x.rarete].nom, Symbole_rarete: RARITIES[x.rarete].symbole, Nom: x.nom,
      Type: TYPES[x.type].nom, Icone_type: TYPES[x.type].icone, Valeur: x.valeur ?? '', PV: '', Pouvoir: '', Rythme: '',
      Couleur: c, Couleur_hex: hex, Couleur2: '', Couleur2_hex: '', Description: explainKeywords(x.effet),
      Mots_cles: x.motsCles.join(', '),
    }, pad(x.numero), pad(CARDS.length));
  }
  for (const x of CHAMPIONS) {
    const [c, hex] = color(x.couleurs[0]);
    const [c2, hex2] = color(x.couleurs[1]);
    both(x.id, {
      Categorie: 'Personnage', Rarete: 'Personnage', Symbole_rarete: '👤', Nom: x.nom, Type: 'Personnage', Icone_type: '👤',
      Valeur: '', PV: x.pv, Pouvoir: x.pouvoir, Rythme: rhythmLabel(x.rythme), Couleur: c, Couleur_hex: hex, Couleur2: c2,
      Couleur2_hex: hex2, Description: explainKeywords(x.texte), Mots_cles: '',
    }, `C${pad(x.numero - 100, 2)}`, `C${pad(CHAMPIONS.length, 2)}`);
  }
  for (const x of MARKERS) {
    const [c, hex] = color(x.couleur);
    both(x.id, {
      Categorie: 'Marqueur', Rarete: 'Marqueur', Symbole_rarete: '🎯', Nom: x.nom, Type: 'Marqueur', Icone_type: '🎯',
      Valeur: '', PV: '', Pouvoir: '', Rythme: '', Couleur: c, Couleur_hex: hex, Couleur2: '', Couleur2_hex: '',
      Description: 'Suivi des PV (0 à 29), de l’armure (0 à 10) et du tour (1 à 12).', Mots_cles: '',
    }, `M${pad(x.numero - 200, 2)}`, `M${pad(MARKERS.length, 2)}`);
  }
  return rows.map((r) => Object.fromEntries(FIGMA_COLUMNS.map((k) => [k, k === 'Couleur_type' ? TYPE_COLORS[r.Type] || '' : r[k] ?? ''])));
}

const figmaCell = (v) => {
  const text = String(v ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toFigmaCsv = (columns, rows) => `${[columns, ...rows.map((r) => columns.map((k) => r[k]))].map((r) => r.map(figmaCell).join(',')).join('\n')}\n`;

/** Le CSV pour Figma, tout en un : séparateur virgule, UTF-8 sans BOM (le format attendu par les plugins d'import). */
export function figmaCsv() {
  return toFigmaCsv(FIGMA_COLUMNS, figmaRows());
}

/** Les colonnes utiles à chaque modèle de carte dans Figma. */
const FIGMA_SPLIT = {
  cartes: ['Numero', 'Numero_set', 'Extension', 'Code_extension', 'Version', 'Rarete', 'Symbole_rarete', 'Nom', 'Type', 'Icone_type',
    'Couleur_type', 'Valeur', 'Couleur', 'Couleur_hex', 'Description', 'Extra', 'Mots_cles', 'Illustrateur', 'Fichier_image'],
  personnages: ['Numero', 'Numero_set', 'Extension', 'Code_extension', 'Version', 'Nom', 'Type', 'Couleur_type', 'PV', 'Pouvoir', 'Rythme',
    'Couleur', 'Couleur_hex', 'Couleur2', 'Couleur2_hex', 'Description', 'Extra', 'Illustrateur', 'Fichier_image'],
  marqueurs: ['Numero', 'Numero_set', 'Extension', 'Code_extension', 'Version', 'Nom', 'Type', 'Couleur_type', 'Couleur', 'Couleur_hex',
    'Description', 'Extra', 'Illustrateur', 'Fichier_image'],
};
const SPLIT_CATEGORY = { cartes: 'Carte', personnages: 'Personnage', marqueurs: 'Marqueur' };

/** Trois CSV pour Figma, un par modèle : { cartes, personnages, marqueurs }. */
export function figmaSplitCsv() {
  const rows = figmaRows();
  return Object.fromEntries(Object.entries(FIGMA_SPLIT)
    .map(([k, columns]) => [k, toFigmaCsv(columns, rows.filter((r) => r.Categorie === SPLIT_CATEGORY[k]))]));
}

/** Les trois tableaux pour Figma (onglets Cartes, Personnages, Marqueurs), en lignes de texte avec en-têtes. */
export function figmaSheets() {
  const rows = figmaRows();
  const label = { cartes: 'Cartes', personnages: 'Personnages', marqueurs: 'Marqueurs' };
  return Object.entries(FIGMA_SPLIT).map(([k, columns]) => ({
    name: label[k],
    rows: [columns, ...rows.filter((r) => r.Categorie === SPLIT_CATEGORY[k]).map((r) => columns.map((c) => String(r[c] ?? '')))],
  }));
}
