// Tolerant comparison of free-text answers, used to *suggest* a verdict that the
// session admin can then confirm or override.

const STOPWORDS = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'the', 'a', 'an']);

function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** True when `given` is close enough to one of the `expected` strings. */
function isCloseMatch(given, expected) {
  const g = normalize(given);
  if (!g) return false;
  return expected.some((candidate) => {
    const e = normalize(candidate);
    if (!e) return false;
    if (g === e) return true;
    const tolerance = e.length <= 4 ? 0 : e.length <= 8 ? 1 : 2;
    return levenshtein(g.replace(/ /g, ''), e.replace(/ /g, '')) <= tolerance;
  });
}

module.exports = { normalize, levenshtein, isCloseMatch };
