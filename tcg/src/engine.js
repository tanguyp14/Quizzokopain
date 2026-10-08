// Moteur du jeu : règles, duels et pouvoirs des champions. Aucune dépendance au navigateur :
// le même code sert au jeu, au bot (qui simule des tours) et aux tests.
import {
  CARD_BY_ID, CHAMPION_BY_ID, COLORS, DECK_SIZE,
} from './data.js';

export const START_HAND = 3;
export const HAND_MAX = 10;
export const DISCARD_AT = [5, 7, 10];
export const SHIELD_MAX = 10;
export const SUDDEN_DEATH_TURN = 10;
export const SUDDEN_DEATH_LOSS = 2;

const CONTRES_SIMPLES = ['BL01', 'BL02', 'BL03', 'VE06', 'JA07'];
const PERFORANT = ['RO04', 'NO01'];

// ---- hasard reproductible ------------------------------------------------------------

/** Tire un nombre dans [0, 1) et fait avancer la graine de la partie (mulberry32). */
export function rand(s) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function shuffle(s, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---- création -------------------------------------------------------------------------

/** Vérifie un deck : 20 cartes, 2 exemplaires au plus, des couleurs du champion. Renvoie la liste des problèmes. */
export function deckProblems(championId, cardIds) {
  const champion = CHAMPION_BY_ID[championId];
  if (!champion) return ['Champion inconnu.'];
  const problems = [];
  if (cardIds.length !== DECK_SIZE) problems.push(`Le deck doit compter ${DECK_SIZE} cartes (il en a ${cardIds.length}).`);
  const counts = {};
  for (const id of cardIds) {
    const card = CARD_BY_ID[id];
    if (!card) { problems.push(`Carte inconnue : ${id}.`); continue; }
    if (!champion.couleurs.includes(card.couleur)) problems.push(`${card.nom} n’est pas d’une couleur de ${champion.nom}.`);
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(counts)) if (n > 2) problems.push(`${CARD_BY_ID[id].nom} : ${n} exemplaires (2 au plus).`);
  return problems;
}

function newPlayer(s, idx, { championId, deck, name }) {
  const champion = CHAMPION_BY_ID[championId];
  const cards = deck.map((id, k) => ({ uid: `p${idx}-${k}`, id }));
  return {
    idx,
    name: name || champion.nom,
    championId,
    pv: champion.pv,
    maxPv: champion.pv,
    shield: 0,
    deck: shuffle(s, cards),
    hand: [],
    pile: [],
    played: [],
    discard: [],
    removed: [],
    programmed: false,
    charge: 0, // compteur du pouvoir
    uses: champion.rythme.kind === 'fois' ? champion.rythme.n : 0,
    thresholds: [], // tailles de main déjà passées par la défausse obligatoire
    known: [], // uid des cartes adverses déjà vues révélées
    seen: [], // uid des cartes adverses vues par une Vision (ce tour)
    flags: {
      attackBonus: 0, attackDouble: false, nextDouble: false, frozen: false, valueMinus: 0, blind: 0,
      curse: 0, curseFresh: false, poison: 0, noDamageNext: false, keepShield: false,
    },
    stats: newTurnStats(),
    tally: {}, // id -> nombre de fois révélée dans la partie
  };
}
const newTurnStats = () => ({ attacks: 0, gardes: 0, verts: 0, sacrifices: 0, prev: null });

/** Nouvelle partie. players : [{ championId, deck: [ids], name }, …] */
export function createGame({ players, seed = Date.now() }) {
  const s = {
    turn: 0, phase: 'upkeep', rng: seed | 0, duelIndex: 0, duel: null, upkeep: null,
    pending: [], deferred: [], log: [], winner: null, quiet: false, turnDuels: [],
  };
  s.players = players.map((p, i) => newPlayer(s, i, p));
  for (const p of s.players) for (let k = 0; k < START_HAND; k++) draw(s, p);
  return s;
}

const champ = (p) => CHAMPION_BY_ID[p.championId];
const other = (s, p) => s.players[1 - p.idx];
const def = (id) => CARD_BY_ID[id];
const typeOf = (id) => def(id).type;

function say(s, text, player = null) {
  if (s.quiet) return;
  const entry = { turn: s.turn, duel: s.duel ? s.duel.i + 1 : null, text, player };
  s.log.push(entry);
  if (s.duel) s.duel.events.push(entry);
}

function draw(s, p) {
  const card = p.deck.shift();
  if (card) p.hand.push(card);
  return card;
}

// ---- boucle de jeu ----------------------------------------------------------------------

/**
 * Fait avancer la partie jusqu'au prochain moment où il faut quelqu'un :
 * { type: 'decision' } (voir state.pending), 'program' (former les piles), 'duel' (un duel vient d'être joué),
 * 'turn-end' ou 'over'.
 */
export function advance(s) {
  for (;;) {
    if (s.phase === 'over') return { type: 'over' };
    if (s.pending.length) return { type: 'decision' };
    if (s.phase === 'upkeep') {
      upkeep(s);
      continue;
    }
    if (s.phase === 'program') {
      if (!s.players.every((p) => p.programmed)) return { type: 'program' };
      s.phase = 'resolve';
      s.duelIndex = 0;
      s.duel = null;
      s.preDone = false;
      continue;
    }
    if (s.phase === 'resolve') {
      const r = resolveStep(s);
      if (r === 'duel') return { type: 'duel', index: s.duelIndex - 1 };
      if (r === 'turn') { endTurn(s); return { type: 'turn-end' }; }
    }
  }
}

function upkeep(s) {
  if (!s.upkeep) {
    s.turn += 1;
    s.upkeep = { stage: 'discard' };
    s.turnDuels = [];
    say(s, `— Tour ${s.turn} —`);
    for (const p of s.players) {
      p.stats = newTurnStats();
      p.pile = [];
      p.programmed = false;
      p.seen = [];
    }
    if (s.turn >= SUDDEN_DEATH_TURN) {
      const loss = SUDDEN_DEATH_LOSS * (s.turn - SUDDEN_DEATH_TURN + 1);
      for (const p of s.players) {
        p.pv -= loss;
        say(s, `Mort subite : ${p.name} perd ${loss} PV.`, p.idx);
      }
      if (checkKo(s)) return;
    }
    for (const p of s.players) {
      if (s.turn > 1 && p.hand.length < HAND_MAX) draw(s, p);
      const n = p.hand.length;
      if (DISCARD_AT.includes(n) && !p.thresholds.includes(n) && p.deck.length) {
        p.thresholds.push(n);
        s.pending.push({ player: p.idx, kind: 'discard', count: 1 });
      }
    }
    return;
  }
  if (s.upkeep.stage === 'discard') {
    s.upkeep.stage = 'prospect';
    for (const p of s.players) {
      if (champ(p).id === 'explorateur' && s.turn % 3 === 0 && p.hand.length && p.deck.length) {
        s.pending.push({ player: p.idx, kind: 'prospect', max: Math.min(2, p.deck.length) });
      }
    }
    return;
  }
  s.upkeep = null;
  s.phase = 'program';
}

/** Pose toute la main en pile, dans l'ordre donné (liste d'uid). */
export function program(s, playerIdx, order) {
  const p = s.players[playerIdx];
  if (s.phase !== 'program' || p.programmed) throw new Error('Ce n’est pas le moment de former sa pile.');
  const byUid = new Map(p.hand.map((x) => [x.uid, x]));
  if (order.length !== p.hand.length || new Set(order).size !== order.length || !order.every((u) => byUid.has(u))) {
    throw new Error('La pile doit contenir toute la main, une fois chaque carte.');
  }
  p.pile = order.map((u) => byUid.get(u));
  p.hand = [];
  p.programmed = true;
}

/** Répond à une décision en attente (voir state.pending). */
export function answer(s, playerIdx, value) {
  const k = s.pending.findIndex((d) => d.player === playerIdx);
  if (k < 0) throw new Error('Aucune décision en attente pour ce joueur.');
  const d = s.pending.splice(k, 1)[0];
  const p = s.players[playerIdx];
  const o = other(s, p);
  switch (d.kind) {
    case 'discard':
    case 'prospect': {
      const uids = (Array.isArray(value) ? value : []).slice(0, d.kind === 'discard' ? d.count : d.max);
      if (d.kind === 'discard' && uids.length !== d.count) { s.pending.splice(k, 0, d); throw new Error('Choisis la carte à défausser.'); }
      for (const uid of uids) {
        const i = p.hand.findIndex((x) => x.uid === uid);
        if (i < 0) continue;
        p.discard.push(p.hand.splice(i, 1)[0]);
        draw(s, p);
      }
      say(s, uids.length ? `${p.name} défausse ${uids.length} carte${uids.length > 1 ? 's' : ''} face cachée et en pioche autant.` : `${p.name} garde sa main.`, p.idx);
      break;
    }
    case 'ban': {
      if (value && p.uses > 0 && s.duel && !s.duel.cancelled[o.idx]) {
        p.uses -= 1;
        cancel(s, o.idx, p.idx, 'Ban');
        say(s, `👑 ${p.name} bannit ${def(s.duel.eff[o.idx]).nom} !`, p.idx);
      }
      break;
    }
    case 'swap': {
      if (value && p.pile[d.at + 1]) {
        [p.pile[d.at], p.pile[d.at + 1]] = [p.pile[d.at + 1], p.pile[d.at]];
        say(s, `${p.name} échange ses 2 prochaines cartes.`, p.idx);
      }
      break;
    }
    default: break;
  }
}

function endTurn(s) {
  for (const p of s.players) {
    p.hand = p.played.filter((x) => !p.removed.includes(x));
    p.played = [];
    p.pile = [];
    if (!p.flags.keepShield) p.shield = 0;
    p.flags.keepShield = false;
    p.seen = [];
  }
  s.phase = 'upkeep';
}

// ---- résolution d'un duel -------------------------------------------------------------------

const STAGES = ['reveal', 'ban', 'cancel', 'immediate', 'damage', 'after', 'powers', 'end'];

function resolveStep(s) {
  if (!s.duel) {
    if (!s.preDone) {
      s.preDone = true;
      runDeferred(s);
      if (s.pending.length) return 'wait';
    }
    const n = Math.max(...s.players.map((p) => p.pile.length));
    if (s.duelIndex >= n) return 'turn';
    s.duel = {
      i: s.duelIndex, stage: 'reveal', events: [], cards: [null, null], eff: [null, null],
      cancelled: [false, false], cancelBy: [null, null], counter: [null, null], glacial: [false, false],
      mods: [{}, {}], thorns: [0, 0], noDamage: [false, false], before: [null, null], removed: [false, false],
    };
  }
  while (s.duel) {
    if (s.pending.length) return 'wait';
    if (s.phase === 'over') return 'wait';
    const stage = s.duel.stage;
    s.duel.stage = STAGES[STAGES.indexOf(stage) + 1];
    STAGE_FN[stage](s);
    if (stage === 'end') {
      const d = s.duel;
      s.turnDuels.push({
        i: d.i, cards: d.cards.map((x) => x && x.uid), eff: [...d.eff], cancelled: [...d.cancelled], cancelBy: [...d.cancelBy],
      });
      s.duelIndex += 1;
      s.duel = null;
      return 'duel';
    }
  }
  return 'wait';
}

function active(s, side) {
  return !!s.duel.cards[side] && !s.duel.cancelled[side];
}

function cancel(s, side, bySide, cause) {
  const d = s.duel;
  if (d.cancelled[side]) return;
  d.cancelled[side] = true;
  d.cancelBy[side] = cause;
  const by = s.players[bySide];
  if (champ(by).rythme.kind === 'annulations') by.charge += 1;
}

const STAGE_FN = {
  reveal(s) {
    const d = s.duel;
    for (const p of s.players) d.cards[p.idx] = p.pile[d.i] || null;
    // Déjà-vu devient ta carte précédente, puis Copie devient la carte d'en face.
    for (const p of s.players) {
      const card = d.cards[p.idx];
      if (!card) continue;
      d.eff[p.idx] = card.id === 'VI08' && p.stats.prev ? p.stats.prev : card.id;
    }
    const base = [...d.eff];
    for (const p of s.players) {
      if (d.eff[p.idx] === 'VI05' && base[1 - p.idx] && base[1 - p.idx] !== 'VI05') d.eff[p.idx] = base[1 - p.idx];
    }
    for (const p of s.players) {
      const card = d.cards[p.idx];
      if (!card) continue;
      const o = other(s, p);
      p.played.push(card);
      p.tally[card.id] = (p.tally[card.id] || 0) + 1;
      if (!o.known.includes(card.uid)) o.known.push(card.uid);
      const e = d.eff[p.idx];
      const t = typeOf(e);
      d.before[p.idx] = { ...p.stats };
      const r = champ(p).rythme.kind;
      if (r === 'cartes' || (r === 'attaques' && t === 'attaque')) p.charge += 1;
      if (t === 'attaque') p.stats.attacks += 1;
      // Bonus et malus qui attendaient cette carte.
      const f = p.flags;
      const m = { minus: f.valueMinus, bonus: 0, double: false, blind: 0 };
      f.valueMinus = 0;
      if (t === 'attaque') {
        m.bonus = f.attackBonus;
        m.double = f.attackDouble || f.nextDouble;
        m.blind = f.blind;
        f.attackBonus = 0;
        f.attackDouble = false;
        f.blind = 0;
      }
      f.nextDouble = false;
      d.mods[p.idx] = m;
      d.noDamage[p.idx] = f.noDamageNext;
      f.noDamageNext = false;
      const shown = e !== card.id ? `${def(card.id).nom} (copie de ${def(e).nom})` : def(e).nom;
      say(s, `${p.name} révèle ${shown}.`, p.idx);
    }
    for (const p of s.players) {
      if (d.cards[p.idx] && p.flags.frozen) {
        p.flags.frozen = false;
        cancel(s, p.idx, 1 - p.idx, 'Gel');
        say(s, `🥶 ${def(d.eff[p.idx]).nom} est gelée : annulée.`, p.idx);
      }
    }
  },

  ban(s) {
    const d = s.duel;
    for (const p of s.players) {
      const o = other(s, p);
      if (champ(p).id === 'superadmin' && p.uses > 0 && d.cards[o.idx] && !d.cancelled[o.idx]) {
        s.pending.push({ player: p.idx, kind: 'ban', uid: d.cards[o.idx].uid, id: d.eff[o.idx] });
      }
    }
  },

  cancel(s) {
    const d = s.duel;
    const results = [];
    for (const p of s.players) {
      const side = p.idx;
      if (!active(s, side)) continue;
      const o = 1 - side;
      const e = d.eff[side];
      const oe = d.cards[o] && !d.cancelled[o] ? d.eff[o] : null;
      const ot = oe && typeOf(oe);
      const unstoppable = oe === 'RO07';
      let hit = false;
      if (CONTRES_SIMPLES.includes(e)) hit = ot === 'attaque' && !unstoppable;
      else if (e === 'VI04') hit = (ot === 'attaque' && !unstoppable) || ot === 'tactique';
      else if (e === 'NO06') hit = !!oe && !unstoppable;
      else if (e === 'BL05') hit = (ot === 'attaque' || ot === 'garde') && typeof def(oe).valeur === 'number' && def(oe).valeur <= 2;
      else if (e === 'NO07') hit = !!oe;
      else continue;
      results.push({ side, hit, e, oe });
    }
    for (const r of results) {
      if (r.hit) {
        cancel(s, 1 - r.side, r.side, def(r.e).nom);
        d.counter[r.side] = r.e;
        say(s, `${def(r.e).nom} annule ${def(r.oe).nom}.`, r.side);
        if (r.e === 'NO07') {
          const target = d.cards[1 - r.side];
          s.players[1 - r.side].removed.push(target);
          say(s, `🕳️ ${def(target.id).nom} est détruite : elle ne reviendra pas.`, 1 - r.side);
        }
      } else if (r.e === 'BL03') d.glacial[r.side] = true;
    }
  },

  immediate(s) {
    const d = s.duel;
    const act = s.players.filter((p) => active(s, p.idx));
    // 1. Bouclier et soins.
    for (const p of act) {
      const e = d.eff[p.idx];
      const minus = d.mods[p.idx].minus;
      const g = (n) => gainShield(s, p, Math.max(0, n - minus));
      switch (e) {
        case 'BL06': case 'JA01': g(3); break;
        case 'VE03': g(2 + d.before[p.idx].gardes); break;
        case 'JA03': g(2); d.thorns[p.idx] = 2; break;
        case 'JA04': g(2); p.flags.keepShield = true; break;
        case 'VE02': heal(s, p, 3); break;
        case 'VE08': heal(s, p, d.before[p.idx].verts); break;
        default: break;
      }
      if (d.counter[p.idx] === 'VE06') heal(s, p, 1);
      if (d.counter[p.idx] === 'JA07') gainShield(s, p, 2);
    }
    // 2. Bénédiction, puis Brise-bouclier.
    for (const p of act) if (d.eff[p.idx] === 'JA06') gainShield(s, p, p.shield);
    for (const p of act) {
      if (d.eff[p.idx] === 'NO02') {
        const o = other(s, p);
        if (o.shield) say(s, `🔨 Le bouclier de ${o.name} vole en éclats (${o.shield}).`, p.idx);
        o.shield = 0;
      }
    }
    // 3. Effets pour la suite.
    for (const p of act) {
      const o = other(s, p);
      const e = d.eff[p.idx];
      const next = d.i + 1;
      switch (e) {
        case 'RO05': p.flags.attackBonus += 3; break;
        case 'BL04': o.flags.frozen = true; say(s, `🥶 La prochaine carte de ${o.name} sera gelée.`, p.idx); break;
        case 'BL07':
          if (d.cards[o.idx] && typeOf(d.eff[o.idx]) === 'garde') { o.flags.frozen = true; say(s, `🥶 La prochaine carte de ${o.name} sera gelée.`, p.idx); }
          break;
        case 'VE04': o.flags.valueMinus = 2; break;
        case 'JA08': o.flags.blind += 3; break;
        case 'NO03': o.flags.curse = 3; o.flags.curseFresh = true; say(s, `💀 ${o.name} est maudit : ni bouclier ni soin pendant 3 duels.`, p.idx); break;
        case 'NO04': p.flags.attackDouble = true; break;
        case 'BL08': vision(s, p, next, 2); break;
        case 'VI01':
          vision(s, p, next, 1);
          if (p.pile[next] && p.pile[next + 1]) s.pending.push({ player: p.idx, kind: 'swap', at: next, source: 'Télépathie' });
          break;
        case 'VI02': swapPile(s, o, next, 'Tour de passe-passe'); break;
        case 'VI06': {
          const part = o.pile.slice(next, next + 3);
          if (part.length > 1) { o.pile.splice(next, part.length, ...part.reverse()); say(s, `🌪️ Les ${part.length} prochaines cartes de ${o.name} sont inversées.`, p.idx); }
          break;
        }
        default: break;
      }
    }
  },

  damage(s) {
    const d = s.duel;
    const packets = [];
    for (const p of s.players) {
      const o = other(s, p);
      const e = d.cards[p.idx] && d.eff[p.idx];
      if (!e) continue;
      if (active(s, p.idx) && typeOf(e) === 'attaque') {
        packets.push({ from: p.idx, to: o.idx, amount: attackValue(s, p.idx), perforant: PERFORANT.includes(e), attack: true, src: def(e).nom });
      }
      if (d.counter[p.idx] === 'BL02' && d.cards[o.idx]) {
        packets.push({ from: p.idx, to: o.idx, amount: attackValue(s, o.idx), src: 'Miroir de glace' });
      }
      if (d.cancelled[p.idx] && e === 'RO06') packets.push({ from: p.idx, to: o.idx, amount: 2, src: 'Bombe' });
      if (active(s, p.idx) && d.glacial[p.idx]) packets.push({ from: p.idx, to: o.idx, amount: 1, src: 'Contre-attaque glaciale' });
      if (active(s, p.idx) && e === 'RO03') packets.push({ from: p.idx, to: p.idx, amount: 1, src: 'Rage de lave' });
    }
    const thornsUsed = [false, false];
    for (let k = 0; k < packets.length; k++) {
      const pk = packets[k];
      const lost = hurt(s, s.players[pk.to], pk.amount, { perforant: pk.perforant, src: pk.src });
      if (pk.attack && pk.amount > 0 && d.thorns[pk.to] && !thornsUsed[pk.to]) {
        thornsUsed[pk.to] = true;
        packets.push({ from: pk.to, to: pk.from, amount: d.thorns[pk.to], src: 'Épines' });
      }
      if (pk.attack && d.eff[pk.from] === 'VE05' && lost > 0) heal(s, s.players[pk.from], lost);
    }
  },

  after(s) {
    const d = s.duel;
    for (const p of s.players) {
      const e = d.eff[p.idx];
      if (!e) continue;
      if (active(s, p.idx)) {
        if (e === 'JA02') gainShield(s, p, Math.max(0, 5 - d.mods[p.idx].minus));
        const sac = { NO01: 1, NO04: 3, NO06: 2 }[e];
        if (sac) {
          p.pv -= sac;
          p.stats.sacrifices += 1;
          say(s, `🩸 ${p.name} se sacrifie : −${sac} PV.`, p.idx);
        }
        if (e === 'NO07') { p.removed.push(d.cards[p.idx]); say(s, `${def(e).nom} est à usage unique : défaussée.`, p.idx); }
      }
    }
    // Le poison déjà en place agit, puis le nouveau s'installe.
    for (const p of s.players) {
      if (p.flags.poison > 0) {
        p.flags.poison -= 1;
        p.pv -= 1;
        say(s, `☠️ Poison : ${p.name} perd 1 PV.`, p.idx);
      }
    }
    for (const p of s.players) {
      const e = d.eff[p.idx];
      if (!e) continue;
      const o = other(s, p);
      if ((active(s, p.idx) && e === 'VE01') || (d.cancelled[p.idx] && e === 'VE07')) {
        o.flags.poison += 2;
        say(s, `☠️ ${o.name} est empoisonné (Poison 2).`, p.idx);
      }
    }
    for (const p of s.players) {
      if (p.flags.curse > 0) {
        if (p.flags.curseFresh) p.flags.curseFresh = false;
        else p.flags.curse -= 1;
      }
      const card = d.cards[p.idx];
      if (!card) continue;
      const t = typeOf(d.eff[p.idx]);
      if (t === 'garde') p.stats.gardes += 1;
      if (def(card.id).couleur === 'vert') p.stats.verts += 1;
      p.stats.prev = d.eff[p.idx];
    }
  },

  powers(s) {
    for (const p of s.players) {
      const c = champ(p);
      if (!['cartes', 'attaques', 'annulations'].includes(c.rythme.kind)) continue;
      while (p.charge >= c.rythme.n) {
        p.charge -= c.rythme.n;
        triggerPower(s, p);
      }
    }
  },

  end(s) {
    checkKo(s);
  },
};

function vision(s, p, from, count) {
  const o = other(s, p);
  const cards = o.pile.slice(from, from + count);
  for (const card of cards) if (!p.seen.includes(card.uid)) p.seen.push(card.uid);
  if (cards.length) say(s, `👁️ ${p.name} regarde ${cards.length > 1 ? `les ${cards.length} prochaines cartes` : 'la prochaine carte'} de ${o.name}.`, p.idx);
}

function swapPile(s, target, at, src) {
  if (!target.pile[at] || !target.pile[at + 1]) return false;
  [target.pile[at], target.pile[at + 1]] = [target.pile[at + 1], target.pile[at]];
  say(s, `🔀 ${src} : les 2 prochaines cartes de ${target.name} sont échangées.`);
  return true;
}

function gainShield(s, p, n) {
  if (n <= 0) return;
  if (p.flags.curse > 0 && !p.flags.curseFresh) { say(s, `💀 ${p.name} est maudit : pas de bouclier.`, p.idx); return; }
  const before = p.shield;
  p.shield = Math.min(SHIELD_MAX, p.shield + n);
  if (p.shield > before) say(s, `🛡️ ${p.name} gagne ${p.shield - before} de bouclier.`, p.idx);
}

function heal(s, p, n) {
  if (n <= 0) return;
  if (p.flags.curse > 0 && !p.flags.curseFresh) { say(s, `💀 ${p.name} est maudit : pas de soin.`, p.idx); return; }
  const before = p.pv;
  p.pv = Math.min(p.maxPv, p.pv + n);
  if (p.pv > before) say(s, `💚 ${p.name} récupère ${p.pv - before} PV.`, p.idx);
}

/** Inflige des dégâts : le bouclier absorbe d'abord (sauf Perforant). Renvoie les PV retirés. */
function hurt(s, target, amount, { perforant = false, src = '' } = {}) {
  if (amount <= 0) return 0;
  if (s.duel && s.duel.noDamage[target.idx]) { say(s, `🐈 Neuf vies : ${target.name} ne subit pas les ${amount} dégâts de ${src}.`, target.idx); return 0; }
  let rest = amount;
  if (!perforant && target.shield) {
    const absorbed = Math.min(target.shield, rest);
    target.shield -= absorbed;
    rest -= absorbed;
  }
  target.pv -= rest;
  say(s, `💥 ${src} : ${target.name} subit ${amount} dégât${amount > 1 ? 's' : ''}${perforant ? ' (Perforant)' : ''}${rest !== amount ? `, dont ${amount - rest} absorbés par le bouclier` : ''}.`, target.idx);
  return rest;
}

/** Dégâts d'une Attaque, avec tous ses bonus et malus. */
export function attackValue(s, side) {
  const d = s.duel;
  const p = s.players[side];
  const o = s.players[1 - side];
  const e = d.eff[side];
  const before = d.before[side];
  const oe = d.cards[o.idx] ? d.eff[o.idx] : null;
  let v;
  switch (e) {
    case 'RO02': v = 2 + (before.prev && typeOf(before.prev) === 'attaque' ? 2 : 0); break;
    case 'RO08': v = Math.min(6, before.attacks); break;
    case 'JA05': v = Math.min(6, p.shield); break;
    case 'VI03': v = 3 + (d.cards[o.idx] && p.seen.includes(d.cards[o.idx].uid) ? 2 : 0); break;
    case 'VI07': v = 2 + (oe && typeOf(oe) === 'tactique' ? 2 : 0); break;
    case 'NO05': v = o.pv <= 6 ? 8 : 2; break;
    case 'NO08': v = 2 + p.stats.sacrifices; break;
    default: v = typeof def(e).valeur === 'number' ? def(e).valeur : 0;
  }
  const m = d.mods[side];
  v = Math.max(0, v - (m.minus || 0)) + (m.bonus || 0);
  if (m.double) v *= 2;
  return Math.max(0, v - (m.blind || 0));
}

function triggerPower(s, p) {
  const o = other(s, p);
  const c = champ(p);
  const d = s.duel;
  const next = d ? d.i + 1 : 0;
  say(s, `${c.art} ${c.pouvoir} !`, p.idx);
  switch (c.id) {
    case 'jimmy':
      if (!o.pile[next]) { s.deferred.push({ player: p.idx, kind: 'jimmy' }); say(s, 'Il agira au début du prochain tour.', p.idx); break; }
      vision(s, p, next, 1);
      if (p.pile[next] && p.pile[next + 1]) s.pending.push({ player: p.idx, kind: 'swap', at: next, source: c.pouvoir });
      break;
    case 'butch': {
      const roll = 1 + Math.floor(rand(s) * 6);
      say(s, `🎲 Le dé de Butch fait ${roll}.`, p.idx);
      if (roll === 2) gainShield(s, p, 2);
      if (roll === 3) heal(s, p, 2);
      if (roll === 4) hurt(s, o, 2, { src: 'Dé de Butch' });
      if (roll === 5) gainShield(s, p, 4);
      if (roll === 6) { hurt(s, o, 3, { src: 'Jackpot' }); gainShield(s, p, 3); }
      break;
    }
    case 'reine': o.flags.poison += 2; say(s, `☠️ ${o.name} est empoisonné (Poison 2).`, p.idx); break;
    case 'pirate': p.flags.attackBonus += 3; break;
    case 'neutron': p.flags.nextDouble = true; break;
    case 'meduse': hurt(s, o, 3, { src: 'Piqûre' }); break;
    case 'chat': p.flags.noDamageNext = true; break;
    case 'comete': hurt(s, o, 2, { perforant: true, src: 'Passage de la Comète' }); break;
    case 'pingouin': o.flags.frozen = true; say(s, `🥶 La prochaine carte de ${o.name} sera gelée.`, p.idx); break;
    case 'champignon':
      if (!o.pile[next + 1]) { s.deferred.push({ player: p.idx, kind: 'champignon' }); say(s, 'Il agira au début du prochain tour.', p.idx); break; }
      swapPile(s, o, next, c.pouvoir);
      break;
    case 'glouton': {
      const stolen = o.shield;
      o.shield = 0;
      if (stolen) { say(s, `😋 ${p.name} dévore ${stolen} de bouclier.`, p.idx); gainShield(s, p, stolen); }
      break;
    }
    default: break;
  }
}

/** Effets reportés (pouvoir déclenché sur la dernière carte du tour) : ils agissent avant le 1er duel. */
function runDeferred(s) {
  const list = s.deferred;
  s.deferred = [];
  for (const item of list) {
    const p = s.players[item.player];
    const o = other(s, p);
    if (item.kind === 'jimmy') {
      vision(s, p, 0, 1);
      if (p.pile[0] && p.pile[1]) s.pending.push({ player: p.idx, kind: 'swap', at: 0, source: 'Je sais tout' });
    }
    if (item.kind === 'champignon') swapPile(s, o, 0, 'Spores hypnotiques');
  }
}

function checkKo(s) {
  for (const p of s.players) {
    if (p.pv <= 0 && champ(p).id === 'phenix' && p.uses > 0) {
      p.uses -= 1;
      p.pv = 3;
      say(s, `🔥 Renaissance : ${p.name} revient à 3 PV !`, p.idx);
    }
  }
  const down = s.players.filter((p) => p.pv <= 0);
  if (!down.length) return false;
  s.phase = 'over';
  s.winner = down.length === 2 ? 'draw' : 1 - down[0].idx;
  s.pending = [];
  say(s, s.winner === 'draw' ? 'Égalité : les deux champions tombent ensemble.' : `🏆 ${s.players[s.winner].name} gagne la partie !`);
  return true;
}

/** Couleurs CSS d'un champion (pour le champ de bataille). */
export const championColors = (championId) => CHAMPION_BY_ID[championId].couleurs.map((k) => COLORS[k].hex);
