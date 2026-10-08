// Export CSV de toutes les cartes et de tous les champions (pour l'impression, Excel, un outil de mise en page…).
import {
  CARDS, CHAMPIONS, MARKERS, COLORS, TYPES, RARITIES, rhythmLabel,
} from './data.js';
import { cardDropRate, percent } from './booster.js';

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
