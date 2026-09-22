const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http } = require('./helpers');
const { sanitizeQuestion } = require('../src/questionTypes');
const { createImageStore } = require('../src/imageStore');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('question images: uploaded, served, usable in a question; fake files refused', async () => {
  const srv = await startServer();
  try {
    const cookie = await register(srv.base, 'cineaste');
    const call = http(srv.base, cookie);
    assert.equal((await call('POST', '/api/images', { dataUrl: 'data:image/png;base64,aGVsbG8=' })).status, 400);
    const up = await call('POST', '/api/images', { dataUrl: PNG });
    assert.equal(up.status, 201);
    assert.match(up.body.url, /^\/api\/images\/\d+$/);
    const img = await fetch(srv.base + up.body.url, { headers: { cookie } });
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(srv.base + up.body.url)).status, 401, 'members only');
    const q = sanitizeQuestion({ type: 'image', prompt: 'Quel film ?', media: { imageUrl: up.body.url }, answer: 'Drive' });
    assert.equal(q.media.imageUrl, up.body.url);
    assert.throws(() => sanitizeQuestion({ type: 'image', media: { imageUrl: '/api/avatars/1' }, answer: 'x' }), /http/);
  } finally {
    await srv.stop();
  }
});

test('with an external image host (o2switch FTP), uploads return its public URL', async () => {
  const saved = [];
  const fakeFtp = { kind: 'ftp', save: async (owner, bytes, type) => { saved.push(type); return 'https://mon-site.fr/quiz-images/abc.png'; } };
  const srv = await startServer({ imageStore: fakeFtp });
  try {
    const call = http(srv.base, await register(srv.base, 'hebergeur'));
    const up = await call('POST', '/api/images', { dataUrl: PNG });
    assert.equal(up.body.url, 'https://mon-site.fr/quiz-images/abc.png');
    assert.deepEqual(saved, ['image/png']);
  } finally {
    await srv.stop();
  }
});

test('image store is picked from environment variables', () => {
  assert.equal(createImageStore({}, {}).kind, 'database');
  assert.equal(createImageStore({}, { IMAGES_FTP_HOST: 'ftp.example.fr', IMAGES_PUBLIC_URL: 'https://example.fr/img' }).kind, 'ftp');
  assert.equal(createImageStore({}, { IMAGES_FTP_HOST: 'ftp.example.fr' }).kind, 'database', 'needs the public URL too');
});

test('quiz music: raw upload (MP3/MP4 sniffed), byte-range serving, attached to a quiz and sent with the game', async () => {
  const srv = await startServer({ superadmins: ['Tanguy'] });
  const { client } = require('./helpers');
  const clients = [];
  try {
    const cookie = await register(srv.base, 'Tanguy');
    const upload = (body, type = 'application/octet-stream') => fetch(`${srv.base}/api/audio`, { method: 'POST', headers: { cookie, 'Content-Type': type }, body });
    assert.equal((await upload(Buffer.from('<html>not audio</html>'), 'audio/mpeg')).status, 400, 'content is checked, not the declared type');
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(200, 7)]);
    const res = await upload(mp4, 'video/mp4');
    assert.equal(res.status, 201);
    const { url } = await res.json();
    const full = await fetch(srv.base + url, { headers: { cookie } });
    assert.equal(full.headers.get('content-type'), 'audio/mp4');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const part = await fetch(srv.base + url, { headers: { cookie, range: 'bytes=4-11' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 4-11/${mp4.length}`);
    assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'ftypmp42');

    const call = http(srv.base, cookie);
    const questions = Array.from({ length: 5 }, (_, i) => ({ type: 'vraifaux', prompt: `Q${i}`, answer: true }));
    const created = await call('POST', '/api/my-themes', { name: 'Musical', emoji: '🎵', keywords: 'test', questions, music: { url, name: 'Ma musique.mp4' } });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.theme.music, { url, name: 'Ma musique.mp4' });
    assert.equal((await call('POST', '/api/my-themes', { name: 'X', emoji: '🎵', keywords: 'x', questions, music: { url: 'javascript:alert(1)' } })).status, 400);

    const { code } = (await call('POST', '/api/rooms', { hostPlays: true, themeId: created.body.theme.key })).body;
    const me = client(srv.base, cookie);
    clients.push(me);
    await me.emit('room:join', { code });
    await me.emit('game:start');
    const s = await me.waitFor((st) => st.phase === 'question');
    assert.equal(s.theme.music.url, url, 'players get the quiz music with the game');
  } finally {
    for (const c of clients) c.socket.close();
    await srv.stop();
  }
});
