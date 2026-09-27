// Jimmy Blast — economy and progression rules (pure: no DOM, testable with node).
//
// Ships hit blocks; every point of damage earns money, breaking a block pays a
// bonus. Money buys level-ups (damage) per ship tier, new ships, and global
// upgrades. 10 ships of a tier merge into 1 ship of the next tier.

export const SAVE_VERSION = 1;

export const TIERS = [
  { name: 'Éclaireur', color: '#9fd3f5' },
  { name: 'Chasseur', color: '#a8e6b0' },
  { name: 'Frégate', color: '#f1cf93' },
  { name: 'Croiseur', color: '#ff9f6b' },
  { name: 'Destroyer', color: '#ff6b8b' },
  { name: 'Cuirassé', color: '#d88bff' },
  { name: 'Vaisseau-mère', color: '#8f7bff' },
  { name: 'Neutron', color: '#ffffff' },
];
export const MERGE_COST = 5; // ships of a tier needed for one ship of the next tier
export const MAX_SHIPS_PER_TIER = 60;

export const UPGRADES = {
  speed: { label: 'Réacteurs', emoji: '💨', desc: 'Vitesse des vaisseaux +8 %', base: 200, growth: 2.1, max: 25 },
  gain: { label: 'Aspirateur à crédits', emoji: '🧲', desc: 'Gains +15 %', base: 500, growth: 2.4, max: 40 },
  click: { label: 'Doigt de Jimmy', emoji: '👆', desc: 'Dégâts au toucher ×1,5', base: 50, growth: 1.9, max: 200 },
  crit: { label: 'Coups critiques', emoji: '💥', desc: '+3 % de chance de coup ×5', base: 1000, growth: 3, max: 15 },
  offline: { label: 'Pilote automatique', emoji: '🌙', desc: 'Gains hors ligne +10 % et +1 h', base: 5000, growth: 4, max: 5 },
};

export const BOOST = { duration: 15, cooldown: 60, factor: 2 };

// Prestige: start over from zero for 10M credits, every prestige adds +10 % damage (compounded).
export const PRESTIGE_COST = 10_000_000;
export const PRESTIGE_BONUS = 0.1;

export function newSave() {
  return {
    v: SAVE_VERSION,
    money: 0,
    totalEarned: 0,
    stage: 1,
    maxStage: 1,
    bought: 0, // tier-0 ships ever bought: slowly raises their price
    tiers: TIERS.map((_, i) => ({ count: i === 0 ? 1 : 0, level: 1 })),
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0])),
    prestige: 0, // resets done: damage ×1.1 each
    rate: 0, // average income per second while playing (for offline earnings)
    savedAt: Date.now(),
  };
}

/** Repairs a save read from storage or the server (older versions, tampering). */
export function normalizeSave(raw) {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : min);
  const s = { ...base };
  s.money = num(raw.money);
  s.totalEarned = num(raw.totalEarned);
  s.stage = Math.floor(num(raw.stage, 1));
  s.maxStage = Math.max(s.stage, Math.floor(num(raw.maxStage, 1)));
  s.bought = Math.floor(num(raw.bought));
  s.tiers = TIERS.map((_, i) => ({
    count: Math.min(MAX_SHIPS_PER_TIER, Math.floor(num(raw.tiers?.[i]?.count))),
    level: Math.floor(num(raw.tiers?.[i]?.level, 1)),
  }));
  if (!s.tiers.some((t) => t.count > 0)) s.tiers[0].count = 1;
  for (const k of Object.keys(UPGRADES)) s.upgrades[k] = Math.min(UPGRADES[k].max, Math.floor(num(raw.upgrades?.[k])));
  s.prestige = Math.floor(num(raw.prestige));
  s.rate = num(raw.rate);
  s.savedAt = num(raw.savedAt) || Date.now();
  return s;
}

// ---- ships ---------------------------------------------------------------------------

/** Damage of one hit from a ship of tier `t` at level `level` (×2 every 25 levels). */
export const shipDamage = (t, level) => 8 ** t * (1 + 0.3 * (level - 1)) * 2 ** Math.floor((level - 1) / 25);

/** Permanent damage multiplier earned with prestiges. */
export const prestigeFactor = (s) => (1 + PRESTIGE_BONUS) ** s.prestige;

/** Damage of one hit from a ship of the fleet (level and prestige included). */
export const fleetDamage = (s, t) => shipDamage(t, s.tiers[t].level) * prestigeFactor(s);

/** Price of the next `n` levels of a tier (geometric series). */
export function levelCost(t, level, n = 1) {
  const r = 1.13;
  const first = 10 * 25 ** t * r ** (level - 1);
  return n === 1 ? first : first * ((r ** n - 1) / (r - 1));
}

/** How many levels the money pays for (at least 0, at most `cap`). */
export function affordableLevels(t, level, money, cap = 1000) {
  let n = 0;
  while (n < cap && levelCost(t, level, n + 1) <= money) n += 1;
  return n;
}

/**
 * Price of the next tier-0 ship: it rises with the fleet (and drops again after a merge),
 * and slowly with every ship ever bought.
 */
export const buyCost = (count, bought = 0) => 10 * 1.35 ** count * 1.02 ** bought;
export const shipCost = (s) => buyCost(s.tiers[0].count, s.bought);

/** Price of the next `n` tier-0 ships. */
export function buyCostN(s, n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += buyCost(s.tiers[0].count + i, s.bought + i);
  return total;
}
export function affordableShips(s, cap = MAX_SHIPS_PER_TIER) {
  let n = 0;
  let total = 0;
  while (n < cap && s.tiers[0].count + n < MAX_SHIPS_PER_TIER) {
    total += buyCost(s.tiers[0].count + n, s.bought + n);
    if (total > s.money) break;
    n += 1;
  }
  return n;
}

export const canBuy = (s, n = 1) => n >= 1 && s.tiers[0].count + n <= MAX_SHIPS_PER_TIER && s.money >= buyCostN(s, n);
export const canMerge = (s, t) => t > 0 && s.tiers[t - 1].count >= MERGE_COST && s.tiers[t].count < MAX_SHIPS_PER_TIER;
/** A tier is shown once the player owns (or could merge into) it. */
export const tierVisible = (s, t) => t === 0 || s.tiers[t].count > 0 || s.tiers[t - 1].count > 0 || s.tiers[t].level > 1;

export function buyShip(s, n = 1) {
  if (!canBuy(s, n)) return false;
  s.money -= buyCostN(s, n);
  s.tiers[0].count += n;
  s.bought += n;
  return true;
}

export function mergeShips(s, t) {
  if (!canMerge(s, t)) return false;
  s.tiers[t - 1].count -= MERGE_COST;
  s.tiers[t].count += 1;
  return true;
}

export function levelUp(s, t, n = 1) {
  if (n < 1) return false;
  const cost = levelCost(t, s.tiers[t].level, n);
  if (s.money < cost) return false;
  s.money -= cost;
  s.tiers[t].level += n;
  return true;
}

// ---- upgrades --------------------------------------------------------------------------

export const upgradeCost = (k, lvl) => UPGRADES[k].base * UPGRADES[k].growth ** lvl;
export const canUpgrade = (s, k) => s.upgrades[k] < UPGRADES[k].max && s.money >= upgradeCost(k, s.upgrades[k]);

export function buyUpgrade(s, k) {
  if (!canUpgrade(s, k)) return false;
  s.money -= upgradeCost(k, s.upgrades[k]);
  s.upgrades[k] += 1;
  return true;
}

export const speedFactor = (s) => 1 + 0.08 * s.upgrades.speed;
export const gainFactor = (s) => 1.15 ** s.upgrades.gain;
export const critChance = (s) => 0.03 * s.upgrades.crit;
export const CRIT_FACTOR = 5;

/** Tapping a block: grows with upgrades and follows the best ship so it stays useful. */
export function clickDamage(s) {
  let best = 0;
  s.tiers.forEach((tier, t) => { if (tier.count > 0) best = Math.max(best, fleetDamage(s, t)); });
  return Math.max(1, best * 0.5) * 1.5 ** s.upgrades.click;
}

// ---- prestige ------------------------------------------------------------------------------

export const canPrestige = (s) => s.money >= PRESTIGE_COST;

/** Back to secteur 1 with an empty fleet; keeps the prestige count, the record and lifetime earnings. */
export function doPrestige(s) {
  if (!canPrestige(s)) return false;
  const keep = { prestige: s.prestige + 1, maxStage: s.maxStage, totalEarned: s.totalEarned };
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, newSave(), keep);
  return true;
}

// ---- stages ------------------------------------------------------------------------------

/** Total HP of all the blocks of a stage. */
export const stageHp = (stage) => 150 * 1.35 ** (stage - 1);
/** Bonus paid when a block breaks, relative to its HP. */
export const BREAK_BONUS = 0.5;
/** Bonus paid when the whole stage is cleared. */
export const stageClearBonus = (stage) => stageHp(stage) * 0.25;

// ---- money --------------------------------------------------------------------------------

export function earn(s, amount) {
  const gained = amount * gainFactor(s);
  s.money += gained;
  s.totalEarned += gained;
  return gained;
}

/** Money earned while away: a share of the income rate, for a capped time. */
export function offlineEarnings(s, now = Date.now()) {
  const seconds = Math.max(0, (now - s.savedAt) / 1000);
  const cap = (2 + s.upgrades.offline) * 3600;
  const share = 0.1 + 0.1 * s.upgrades.offline;
  return { amount: s.rate * Math.min(seconds, cap) * share, seconds: Math.min(seconds, cap), away: seconds };
}

// ---- display --------------------------------------------------------------------------------

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1,234 · 12.3K · 4.56M … then scientific notation. */
export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1).replace('.', ',') : String(Math.floor(n));
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '').replace('.', ',');
  const v = n / 1000 ** tier;
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const num = (Math.floor(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.?0+$/, (m) => (m.startsWith('.') || digits ? '' : m));
  return `${num.replace('.', ',')}${SUFFIXES[tier]}`;
}
