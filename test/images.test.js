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
