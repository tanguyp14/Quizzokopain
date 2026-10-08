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
    { label: '✦ Peu communes', value: `${count('Peu commune')} par booster, chacune a ${pct(slot('Peu commune').upgrade)} de chances d’être une rare` },
    { label: '✶ Rare', value: `1 garantie, en dernière carte (alternative : ${pct(slot('Rare').alt)})` },
    { label: '✶ Rares par booster', value: `${Math.round(rares * 100) / 100} en moyenne` },
    { label: '❖ Au moins une alternative', value: `${pct(1 - noAlt)} des boosters` },
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


// ---- commande imprimeur -------------------------------------------------------------------------

/** Hasard reproductible : la même graine redonne exactement les mêmes boosters. */
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `total` cartes réparties le plus également possible entre `ids` (les restes tombent au hasard), mélangées. */
function spread(ids, total, random) {
  const out = [];
  const base = Math.floor(total / ids.length);
  for (const id of ids) for (let k = 0; k < base; k++) out.push(id);
  for (const id of shuffled(ids, random).slice(0, total - out.length)) out.push(id);
  return shuffled(out, random);
}

/** Marque `round(n × taux)` cartes du lot comme versions alternatives, au hasard. */
function withVersions(ids, rate, random) {
  const alts = new Set(shuffled([...ids.keys()], random).slice(0, Math.round(ids.length * rate)));
  return ids.map((id, k) => ({ id, version: alts.has(k) ? 'alternative' : 'normale' }));
}

/**
 * Prépare `n` boosters pour l'impression, en respectant exactement les taux de BOOSTER (pas au hasard pur) :
 * chaque carte d'une même rareté est imprimée le même nombre de fois (à 1 près), les versions alternatives
 * tombent au bon taux, et un booster ne contient jamais deux fois la même carte.
 * Renvoie la liste des boosters ; chaque booster = 11 cartes dans l'ordre (marqueur, personnage… la rare en dernier).
 */
export function planBoosters(n, random = Math.random) {
  const slotOf = (label) => BOOSTER.slots.filter((x) => x.label === label);
  const ids = (rarete) => CARDS.filter((x) => x.rarete === rarete).map((x) => x.id);
  const [champ] = slotOf('Personnage');
  const communes = slotOf('Commune');
  const pcs = slotOf('Peu commune');
  const [rare] = slotOf('Rare');
  const upgrades = Math.round(n * pcs.length * (pcs[0].upgrade || 0));
  const rares = spread(ids('rare'), n + upgrades, random);
  const lots = {
    marker: withVersions(spread(MARKERS.map((x) => x.id), n, random), 0, random),
    champion: withVersions(spread(CHAMPIONS.map((x) => x.id), n, random), champ.alt, random),
    commune: withVersions(spread(ids('commune'), n * communes.length, random), communes[0].alt, random),
    pc: withVersions(shuffled([...spread(ids('peu commune'), n * pcs.length - upgrades, random), ...rares.slice(n)], random), pcs[0].alt, random),
    rare: withVersions(rares.slice(0, n), rare.alt, random),
  };
  const take = (lot, k) => lots[lot].splice(0, k);
  const boosters = [];
  for (let b = 0; b < n; b++) {
    boosters.push([
      ...take('marker', 1).map((x) => ({ ...x, kind: 'marker', group: 'marker', slot: BOOSTER.bonus.label })),
      ...take('champion', 1).map((x) => ({ ...x, kind: 'champion', group: 'champion', slot: champ.label })),
      ...take('commune', communes.length).map((x) => ({ ...x, kind: 'card', group: 'commune', slot: communes[0].label })),
      ...take('pc', pcs.length).map((x) => ({ ...x, kind: 'card', group: 'pc', slot: pcs[0].label })),
      ...take('rare', 1).map((x) => ({ ...x, kind: 'card', group: 'rare', slot: rare.label })),
    ]);
  }
  // Pas de doublon dans un même booster : on échange avec une carte du même emplacement d'un autre booster.
  const cardIds = (pack, except = null) => pack.filter((x) => x.kind === 'card' && x !== except).map((x) => x.id);
  for (let pass = 0; pass < 20; pass++) {
    let fixed = true;
    for (const pack of boosters) {
      for (const entry of pack) {
        if (entry.kind !== 'card' || !cardIds(pack, entry).includes(entry.id)) continue;
        fixed = false;
        const swap = shuffled(boosters, random).flatMap((other) => other.map((x) => [other, x]))
          .find(([other, x]) => other !== pack && x.group === entry.group && x.id !== entry.id
            && !cardIds(pack, entry).includes(x.id) && !cardIds(other, x).includes(entry.id));
        if (swap) {
          const [, x] = swap;
          [entry.id, x.id] = [x.id, entry.id];
          [entry.version, x.version] = [x.version, entry.version];
        }
      }
    }
    if (fixed) break;
  }
  return boosters.map((pack) => pack.map(({ group, ...x }) => x));
}

/** Les quantités à imprimer pour une liste de boosters : [{ kind, id, version, quantite }], dans l'ordre du catalogue. */
export function printQuantities(boosters) {
  const counts = new Map();
  for (const pack of boosters) {
    for (const x of pack) {
      const key = `${x.kind}|${x.id}|${x.version}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const order = [...CARDS.map((x) => ['card', x.id]), ...CHAMPIONS.map((x) => ['champion', x.id]), ...MARKERS.map((x) => ['marker', x.id])];
  const rows = [];
  for (const [kind, id] of order) {
    for (const version of ['normale', 'alternative']) {
      const quantite = counts.get(`${kind}|${id}|${version}`);
      if (quantite) rows.push({ kind, id, version, quantite });
    }
  }
  return rows;
}
