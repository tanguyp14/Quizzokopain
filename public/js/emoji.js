// Shows every emoji of the page as a 3D picture (Microsoft Fluent Emoji, MIT) so
// they look the same for everyone, whatever the device. Text stays the source of
// truth: the picture replaces the characters on screen only (alt = the emoji, so
// copy/paste and screen readers keep working). Emojis without a 3D version, or
// inside form fields, are left as text.

// One emoji "cluster": flags, keycaps, and pictographs with skin tones / ZWJ sequences.
const EMOJI_RE = /\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?(?:‍\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?)*/gu;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'TITLE', 'NOSCRIPT', 'CODE']);

let available = null; // Set of file names ("1f47d", "2764-fe0f"…)
const toHex = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join('-');

/** File name for an emoji, trying the usual variation-selector spellings. */
function fileFor(emoji) {
  const hex = toHex(emoji);
  if (available.has(hex)) return hex;
  const bare = hex.split('-').filter((p) => p !== 'fe0f').join('-');
  if (available.has(bare)) return bare;
  const parts = bare.split('-');
  const withVs = [parts[0], 'fe0f', ...parts.slice(1)].join('-');
  return available.has(withVs) ? withVs : null;
}

function imgFor(emoji, file) {
  const img = document.createElement('img');
  img.className = 'fe';
  img.src = `/emoji/${file}.webp`;
  img.alt = emoji;
  img.draggable = false;
  img.decoding = 'async';
  // Missing file: put the character back.
  img.addEventListener('error', () => img.replaceWith(document.createTextNode(emoji)), { once: true });
  return img;
}

function replaceIn(textNode) {
  const text = textNode.nodeValue;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return;
  EMOJI_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  let changed = false;
  for (const m of text.matchAll(EMOJI_RE)) {
    const file = fileFor(m[0]);
    if (!file) continue;
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    frag.appendChild(imgFor(m[0], file));
    last = m.index + m[0].length;
    changed = true;
  }
  if (!changed) return;
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  textNode.replaceWith(frag);
}

export function emojify(root) {
  if (!available || !root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement || SKIP.has(root.parentElement.tagName) || root.parentElement.closest('.no-fe')) return;
    replaceIn(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName) || root.closest?.('.no-fe')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (SKIP.has(n.parentElement?.tagName) || n.parentElement?.closest('.no-fe')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(replaceIn);
}

// Watch everything the app draws (pages, toasts, notifications…).
let pending = new Set();
let scheduled = false;
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'characterData') pending.add(m.target);
    for (const n of m.addedNodes) pending.add(n);
  }
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const nodes = pending;
      pending = new Set();
      nodes.forEach((n) => n.isConnected && emojify(n));
    });
  }
});

fetch('/emoji/index.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((names) => {
    available = new Set(names);
    emojify(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  })
  .catch(() => { /* keep the system emojis */ });
