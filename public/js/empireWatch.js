// Empire notifications on every page: when a building, a research or ships are finished, a
// « 🪐 Empire » notification shows up (also in the background, with the system notifications on).
// The jobs finished while the site was closed are told once at the next visit.
import { api, state, notify } from './core.js';
import { BUILDINGS, RESEARCH, SHIPS } from './games/empire/logic.js';

const SEEN_KEY = 'empire-notified';
const seen = new Set((() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } })());
let timers = [];

const jobKey = (q) => [q.kind, q.planet ?? '', q.key, q.level ?? q.count, q.endsAt].join('|');

/** What a finished job says: « Construction terminée : ⛏️ Mine de métal niv. 5 sur Glaxxo b ». */
function jobText(e, q) {
  const where = q.planet != null && e?.planets?.[q.planet] ? ` sur ${e.planets[q.planet].name}` : '';
  if (q.kind === 'building') return `Construction terminée : ${BUILDINGS[q.key]?.emoji || '🏗️'} ${BUILDINGS[q.key]?.name || q.key} niv. ${q.level}${where}`;
  if (q.kind === 'research') return `Recherche terminée : ${RESEARCH[q.key]?.emoji || '🔬'} ${RESEARCH[q.key]?.name || q.key} niv. ${q.level}`;
  const ship = SHIPS[q.key];
  return `Vaisseaux prêts : ${ship?.emoji || '🛰️'} ${q.count} × ${ship?.name || q.key}${where}`;
}

/** Tells a finished job once (a job can be seen by a timer, then again by the server's list). */
export function announceJob(e, q) {
  const key = jobKey(q);
  if (seen.has(key)) return;
  seen.add(key);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-80))); } catch { /* private mode */ }
  notify('empire', `✅ ${jobText(e, q)}`);
}

/** Arms a timer for every job of the queue (server times: `offset` = server − client clock). */
export function watchEmpire(e, offset = 0) {
  for (const t of timers) clearTimeout(t);
  timers = [];
  if (!e?.queue) return;
  for (const q of e.queue) {
    const delay = q.endsAt - (Date.now() + offset);
    if (delay <= 0 || delay > 2 ** 31 - 1) continue;
    timers.push(setTimeout(() => announceJob(e, q), delay + 300));
  }
}

/** At the start of a visit: what finished meanwhile, then the timers for what is still running. */
export async function startEmpireWatch() {
  if (!state.me) return;
  try {
    const r = await api('/api/empire');
    if (!r.empire) return;
    for (const d of r.done || []) announceJob(r.empire, d);
    watchEmpire(r.empire, r.now - Date.now());
  } catch { /* no empire page for this account, or offline */ }
}
