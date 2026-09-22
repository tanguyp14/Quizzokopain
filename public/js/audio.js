// Background music during a game: the quiz's own track (looped) or, when it has
// none, a soft ambient loop generated with the Web Audio API (no licensing issue).
// Each player chooses on/off and volume; the choice is remembered on the device.

const PREFS_KEY = 'qzk_music';
let prefs = { on: true, volume: 0.5 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { /* private mode */ }

let unlocked = false; // browsers only allow sound after a user gesture
let wanted = null; // URL, 'ambient', or null (silence)
let current = null;
let fileEl = null;
let ambient = null;
let ctx = null;

export const musicPrefs = () => ({ ...prefs });

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function setMusicOn(on) {
  prefs.on = on;
  savePrefs();
  apply();
}

export function setMusicVolume(volume) {
  prefs.volume = Math.min(1, Math.max(0, volume));
  savePrefs();
  if (prefs.volume > 0 && !prefs.on) prefs.on = true;
  apply();
}

/** Plays the quiz track (or the generated ambience when `url` is empty). */
export function playMusic(url) {
  wanted = url || 'ambient';
  apply();
}

export function stopMusic() {
  wanted = null;
  apply();
}

function apply() {
  if (!unlocked) return;
  const target = prefs.on && prefs.volume > 0 ? wanted : null;
  if (target === current) return updateVolume();
  stopCurrent();
  current = target;
  if (target === 'ambient') startAmbient();
  else if (target) startFile(target);
}

function updateVolume() {
  if (fileEl) fileEl.volume = prefs.volume * 0.7;
  if (ambient) ambient.setVolume(prefs.volume);
}

function stopCurrent() {
  if (fileEl) {
    fileEl.pause();
    fileEl.removeAttribute('src');
    fileEl.load();
    fileEl = null;
  }
  if (ambient) {
    ambient.stop();
    ambient = null;
  }
}

function startFile(url) {
  fileEl = new Audio(url);
  fileEl.loop = true;
  fileEl.volume = prefs.volume * 0.7;
  const el = fileEl;
  // Unreadable file (format, network): fall back to the ambience.
  el.addEventListener('error', () => {
    if (fileEl === el) { fileEl = null; current = 'ambient'; startAmbient(); }
  });
  el.play().catch(() => { /* blocked until the next gesture: retried by unlock() */ current = null; });
}

// ---- generated ambience ---------------------------------------------------------

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// Am7 – Fmaj7 – Cmaj7 – G6: calm, loopable, not distracting.
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

function startAmbient() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume?.();
  const master = ctx.createGain();
  const level = (v) => v * 0.35;
  master.gain.value = 0;
  master.gain.setTargetAtTime(level(prefs.volume), ctx.currentTime, 0.8); // fade in
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1600;
  const echo = ctx.createDelay();
  echo.delayTime.value = 0.36;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  tone.connect(master);
  tone.connect(echo);
  echo.connect(feedback);
  feedback.connect(echo);
  echo.connect(master);
  master.connect(ctx.destination);

  const note = (n, at, length, gain, type) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = midi(n);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.3, length / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env);
    env.connect(tone);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };

  const beat = 60 / 84;
  let step = 0;
  let next = ctx.currentTime + 0.15;
  // Look-ahead scheduler: notes are queued half a second in advance.
  const timer = setInterval(() => {
    while (next < ctx.currentTime + 0.5) {
      const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
      if (step % 16 === 0) {
        chord.forEach((n) => note(n, next, beat * 8, 0.035, 'sine')); // pad
        note(chord[0] - 12, next, beat * 7, 0.09, 'triangle'); // bass
      }
      if (step % 2 === 0 && Math.random() > 0.2) note(chord[ARP[(step / 2) % 8]] + 12, next, beat * 0.9, 0.05, 'triangle');
      step += 1;
      next += beat / 2;
    }
  }, 150);

  ambient = {
    setVolume(v) { master.gain.setTargetAtTime(level(v), ctx.currentTime, 0.1); },
    stop() {
      clearInterval(timer);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => master.disconnect(), 1500);
    },
  };
}

// First gesture on the page unlocks sound (autoplay policies); later ones retry a blocked play.
function unlock() {
  unlocked = true;
  ctx?.resume?.();
  apply();
}
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, unlock, { capture: true });
