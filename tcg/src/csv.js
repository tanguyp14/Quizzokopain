// Export CSV de toutes les cartes et de tous les champions (pour l'impression, Excel, un outil de mise en page…).
import {
  CARDS, CHAMPIONS, MARKERS, COLORS, TYPES, RARITIES, CARD_BY_ID, CHAMPION_BY_ID, MARKER_BY_ID, rhythmLabel,
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
    rows.push([d.numero, d.categorie, r.id, d.nom, d.rarete, r.version === 'alternative' ? 'Alternative ✦' : 'Normale', r.quantite, '']);
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
    rows.push([b + 1, k + 1, x.slot, d.numero, d.categorie, x.id, d.nom, d.rarete, x.version === 'alternative' ? 'Alternative ✦' : 'Normale']);
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
  const line = (label, pred) => `- ${label} : ${fmt(by(pred))}${alt(pred) ? ` (dont ${fmt(alt(pred))} en version alternative ✦)` : ''}`;
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


/** CSV simplifié pour la mise en page des visuels : numéro, rareté, nom, effet, type (et la valeur). */
export function simpleCsv() {
  const rows = [['Numero', 'Rarete', 'Nom', 'Effet', 'Type', 'Valeur']];
  for (const card of CARDS) {
    rows.push([String(card.numero).padStart(3, '0'), RARITIES[card.rarete].nom, card.nom, card.effet, TYPES[card.type].nom, card.valeur ?? '']);
  }
  for (const c of CHAMPIONS) {
    rows.push([`C${String(c.numero - 100).padStart(2, '0')}`, 'Personnage', c.nom, `${c.pouvoir} (${rhythmLabel(c.rythme)}) : ${c.texte}`, 'Personnage', `${c.pv} PV`]);
  }
  for (const m of MARKERS) {
    rows.push([`M${String(m.numero - 200).padStart(2, '0')}`, 'Marqueur', m.nom, 'Suivi des PV (0 à 29), de l’armure (0 à 10) et du tour (1 à 12).', 'Marqueur', '']);
  }
  return toCsv(rows);
}
