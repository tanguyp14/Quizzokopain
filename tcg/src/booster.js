// Ouverture des boosters et taux de drop.
import {
  BOOSTER, CARDS, CHAMPIONS, MARKERS,
} from './data.js';

const pickFrom = (list, random) => list[Math.floor(random() * list.length)];

/**
 * Ouvre un booster. Renvoie les 11 cartes dans l'ordre où on les découvre :
 * le marqueur, le personnage, les communes, les peu communes, puis la rare.
 * Chaque carte : { kind: 'marker' | 'champion' | 'card', id, version: 'normale' | 'alternative', slot }.
 */
export function openBooster(random = Math.random) {
  const out = [{ kind: 'marker', id: pickFrom(MARKERS, random).id, version: 'normale', slot: BOOSTER.bonus.label }];
  for (const slot of BOOSTER.slots) {
    let id;
    if (slot.kind === 'champion') id = pickFrom(CHAMPIONS, random).id;
    else {
      const rarete = slot.upgrade && random() < slot.upgrade ? 'rare' : slot.rarete;
      id = pickFrom(CARDS.filter((x) => x.rarete === rarete), random).id;
    }
    out.push({ kind: slot.kind, id, version: random() < slot.alt ? 'alternative' : 'normale', slot: slot.label });
  }
  return out;
}

/** Les taux de drop, calculés à partir de BOOSTER (pour les afficher et les documenter). */
export function dropRates() {
  const pct = (x) => `${Math.round(x * 1000) / 10} %`;
  const slots = BOOSTER.slots;
  const rares = slots.reduce((n, s) => n + (s.rarete === 'rare' ? 1 : s.upgrade || 0), 0);
  const noAlt = slots.reduce((p, s) => p * (1 - s.alt), 1);
  const count = (label) => slots.filter((s) => s.label === label).length;
  const slot = (label) => slots.find((s) => s.label === label);
  return [
    { label: '👤 Personnage', value: `1 par booster (version alternative : ${pct(slot('Personnage').alt)})` },
    { label: '● Communes', value: `${count('Commune')} par booster (alternative : ${pct(slot('Commune').alt)} chacune)` },
    { label: '◆ Peu communes', value: `${count('Peu commune')} par booster, chacune a ${pct(slot('Peu commune').upgrade)} de chances d’être une rare` },
    { label: '★ Rare', value: `1 garantie, en dernière carte (alternative : ${pct(slot('Rare').alt)})` },
    { label: '★ Rares par booster', value: `${Math.round(rares * 100) / 100} en moyenne` },
    { label: '✦ Au moins une alternative', value: `${pct(1 - noAlt)} des boosters` },
    { label: '🎯 Marqueur', value: '1 par booster, en plus des 10 cartes (PV, armure, tour)' },
  ];
}

/**
 * Taux de drop d'une carte précise : nombre moyen d'exemplaires par booster (taux) et en version alternative (alt).
 * kind : 'card' | 'champion' | 'marker'.
 */
export function cardDropRate(kind, id) {
  if (kind === 'marker') return { taux: 1 / MARKERS.length, alt: 0 };
  if (kind === 'champion') {
    const slot = BOOSTER.slots.find((x) => x.kind === 'champion');
    return { taux: 1 / CHAMPIONS.length, alt: slot.alt / CHAMPIONS.length };
  }
  const rarete = CARDS.find((x) => x.id === id).rarete;
  const sameRarity = CARDS.filter((x) => x.rarete === rarete).length;
  let taux = 0;
  let alt = 0;
  for (const slot of BOOSTER.slots.filter((x) => x.kind === 'card')) {
    const up = slot.upgrade || 0;
    const p = slot.rarete === rarete ? 1 - up : rarete === 'rare' ? up : 0;
    taux += p / sameRarity;
    alt += (p / sameRarity) * slot.alt;
  }
  return { taux, alt };
}

/** « 25 % », « 0,25 % »… */
export const percent = (x) => `${(Math.round(x * 10000) / 100).toLocaleString('fr-FR')} %`;

