const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, register, http, client } = require('./helpers');

const questions = (n = 5, difficulty = 'difficile') => Array.from({ length: n }, (_, i) => ({
  type: 'qcm', prompt: `Question ${i + 1} ?`, choices: ['oui', 'non'], answer: 0, difficulty,
}));
const quiz = (extra = {}) => ({
  name: 'Harry Potter', emoji: '⚡', description: 'Le monde des sorciers', keywords: 'magie, livres, Poudlard',
  questions: questions(), ...extra,
});

test('submission → superadmin review → playable, searchable, favoritable, with stats', async () => {
  const srv = await startServer({ superadmins: ['Tanguy'] });
  const clients = [];
  try {
    const bossCookie = await register(srv.base, 'Tanguy');
    const lucasCookie = await register(srv.base, 'Lucas');
    const boss = http(srv.base, bossCookie);
    const lucas = http(srv.base, lucasCookie);

    assert.equal((await boss('GET', '/api/me')).body.user.role, 'superadmin');
    assert.equal((await lucas('GET', '/api/me')).body.user.role, 'user');
    assert.equal((await lucas('GET', '/api/admin/themes')).status, 403);

    // validation
    assert.match((await lucas('POST', '/api/my-themes', quiz({ keywords: '' }))).body.error, /mot-clé/);
    const badLevel = questions();
    badLevel[0].difficulty = 'extrême';
    assert.match((await lucas('POST', '/api/my-themes', quiz({ questions: badLevel }))).body.error, /^Question 1 : Difficulté/);
    assert.match((await lucas('POST', '/api/my-themes', quiz({ questions: questions(2) }))).body.error, /au moins 5/);
    const bad = questions();
    bad[3] = { type: 'qcm', prompt: 'x', choices: ['a'], answer: 0 };
    assert.match((await lucas('POST', '/api/my-themes', quiz({ questions: bad }))).body.error, /^Question 4 :/);

    const created = await lucas('POST', '/api/my-themes', quiz());
    assert.equal(created.status, 201);
    const { theme } = created.body;
    assert.equal(theme.status, 'pending');
    assert.deepEqual(theme.keywords, ['magie', 'livres', 'poudlard']);

    // pending themes are not playable yet
    let catalog = (await lucas('GET', '/api/catalog')).body;
    assert.ok(!catalog.themes.some((t) => t.key === theme.key));
    assert.equal((await boss('GET', '/api/me')).body.pendingThemes, 1);

    // reject then resubmit then approve
    await boss('POST', `/api/admin/themes/${theme.id}/reject`, { note: 'Trop court' });
    const mine = (await lucas('GET', '/api/my-themes')).body.themes[0];
    assert.equal(mine.status, 'rejected');
    assert.equal(mine.reviewNote, 'Trop court');
    await lucas('PUT', `/api/my-themes/${theme.id}`, quiz({ questions: questions(6) }));
    assert.equal((await boss('GET', '/api/admin/themes?status=pending')).body.themes.length, 1);
    assert.equal((await boss('POST', `/api/admin/themes/${theme.id}/approve`)).status, 200);

    catalog = (await lucas('GET', '/api/catalog')).body;
    const entry = catalog.themes.find((t) => t.key === theme.key);
    assert.equal(entry.authorName, 'Lucas');
    assert.equal(entry.difficulty, 'difficile', 'quiz level = most common question level');
    assert.deepEqual(entry.levels, { facile: 0, moyen: 0, difficile: 6 });
    assert.equal(entry.count, 6);
    assert.equal(entry.questions, undefined, 'answers never leak through the catalog');

    // search by name, keyword and author pseudo; difficulty filter
    for (const q of ['harry', 'poudlard', 'lucas']) {
      assert.ok((await boss('GET', `/api/themes?q=${q}`)).body.themes.some((t) => t.key === theme.key), q);
    }
    assert.ok(!(await boss('GET', '/api/themes?difficulty=facile')).body.themes.some((t) => t.key === theme.key));

    // favorites
    assert.equal((await boss('PUT', `/api/favorites/${theme.key}`)).status, 200);
    const favs = (await boss('GET', '/api/themes?favorites=1')).body.themes;
    assert.deepEqual(favs.map((t) => t.key), [theme.key]);
    assert.equal((await boss('PUT', '/api/favorites/nope')).status, 404);

    // play the community quiz once, then check the stats
    const { code } = (await boss('POST', '/api/rooms')).body;
    const host = client(srv.base, bossCookie);
    const player = client(srv.base, lucasCookie);
    clients.push(host, player);
    await host.emit('room:join', { code });
    await player.emit('room:join', { code });
    await host.emit('room:settings', { themeId: theme.key, questionCount: 5, timeLimit: 0 });
    assert.deepEqual(await host.emit('game:start'), { ok: true });
    assert.equal((await player.waitFor((s) => s.phase === 'question')).theme.name, 'Harry Potter');
    assert.deepEqual(await host.emit('game:end'), { ok: true });
    // ending during the first question records nothing; play one question for real
    const { code: code2 } = (await boss('POST', '/api/rooms')).body;
    await host.emit('room:join', { code: code2 });
    await player.emit('room:join', { code: code2 });
    await host.emit('room:settings', { themeId: theme.key, questionCount: 5, timeLimit: 0 });
    await host.emit('game:start');
    await player.waitFor((s) => s.code === code2 && s.phase === 'question');
    await player.emit('game:answer', { value: 0 });
    await host.waitFor((s) => s.code === code2 && s.phase === 'reveal');
    await host.emit('game:end');
    await player.waitFor((s) => s.code === code2 && s.phase === 'finished' && s.gameId);

    const stats = (await lucas('GET', '/api/stats')).body;
    assert.equal(stats.stats.played, 1);
    assert.equal(stats.stats.wins, 1);
    assert.equal(stats.stats.points, 1);
    assert.equal(stats.quizzes.created, 1);
    assert.equal(stats.quizzes.totalPlays, 1);
    assert.equal(stats.quizzes.totalFavorites, 1);
    assert.equal(stats.quizzes.list[0].questionCount, 6);
    assert.equal((await boss('GET', '/api/stats')).body.stats.hosted, 1);
  } finally {
    for (const c of clients) c.socket.close();
    await srv.stop();
  }
});

test('superadmin manages accounts: ban, password reset, delete; cannot touch superadmins', async () => {
  const srv = await startServer({ superadmins: ['Tanguy'] });
  try {
    const boss = http(srv.base, await register(srv.base, 'Tanguy'));
    const troll = http(srv.base, await register(srv.base, 'Troll'));
    const users = (await boss('GET', '/api/admin/users?q=tro')).body.users;
    assert.deepEqual(users.map((u) => u.username), ['Troll']);
    const trollId = users[0].id;
    const bossId = (await boss('GET', '/api/me')).body.user.id;

    assert.equal((await troll('POST', `/api/admin/users/${bossId}/ban`)).status, 403);
    assert.equal((await boss('POST', `/api/admin/users/${bossId}/ban`)).status, 403);

    await boss('POST', `/api/admin/users/${trollId}/ban`, { banned: true });
    assert.equal((await troll('GET', '/api/me')).status, 401, 'sessions are revoked');
    const login = await http(srv.base)('POST', '/api/login', { username: 'Troll', password: 'secret123' });
    assert.equal(login.status, 403);

    await boss('POST', `/api/admin/users/${trollId}/ban`, { banned: false });
    await boss('POST', `/api/admin/users/${trollId}/password`, { password: 'nouveau-mdp' });
    assert.equal((await http(srv.base)('POST', '/api/login', { username: 'Troll', password: 'nouveau-mdp' })).status, 200);

    assert.equal((await boss('DELETE', `/api/admin/users/${trollId}`)).status, 200);
    assert.equal((await http(srv.base)('POST', '/api/login', { username: 'Troll', password: 'nouveau-mdp' })).status, 401);
  } finally {
    await srv.stop();
  }
});

test('direct invitation reaches the invited player in real time', async () => {
  const srv = await startServer();
  const clients = [];
  try {
    const hostCookie = await register(srv.base, 'hote');
    const guestCookie = await register(srv.base, 'invitee');
    const { code } = (await http(srv.base, hostCookie)('POST', '/api/rooms')).body;
    const host = client(srv.base, hostCookie);
    const guest = client(srv.base, guestCookie);
    clients.push(host, guest);
    await host.emit('room:join', { code });
    if (!guest.socket.connected) await new Promise((r) => guest.socket.once('connect', r));

    assert.match((await host.emit('room:invite', { username: 'personne' })).error, /Aucun joueur/);
    assert.deepEqual(await host.emit('room:invite', { username: 'INVITEE' }), { ok: true, invited: 'invitee' });
    const invite = await guest.waitEvent('invite:new');
    assert.equal(invite.code, code);
    assert.equal(invite.from, 'hote');

    const pending = await http(srv.base, guestCookie)('GET', '/api/invitations');
    assert.equal(pending.body.invitations.length, 1);
    await guest.emit('room:join', { code });
    assert.equal((await http(srv.base, guestCookie)('GET', '/api/invitations')).body.invitations.length, 0, 'joining clears the invite');

    const redirect = await fetch(`${srv.base}/r/${code.toLowerCase()}`, { redirect: 'manual' });
    assert.equal(redirect.headers.get('location'), `/#/room/${code}`);
  } finally {
    for (const c of clients) c.socket.close();
    await srv.stop();
  }
});

test('profile picture: upload, served as an image, shown in the room, removable by superadmin', async () => {
  const srv = await startServer({ superadmins: ['Tanguy'] });
  const clients = [];
  try {
    const bossCookie = await register(srv.base, 'Tanguy');
    const zoeCookie = await register(srv.base, 'Zoe');
    const zoe = http(srv.base, zoeCookie);
    // 1x1 PNG
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.equal((await zoe('PUT', '/api/me/avatar', { dataUrl: 'data:image/png;base64,aGVsbG8=' })).status, 400, 'not a real PNG');
    assert.equal((await zoe('PUT', '/api/me/avatar', { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400);

    const { code } = (await http(srv.base, bossCookie)('POST', '/api/rooms')).body;
    const host = client(srv.base, bossCookie);
    const player = client(srv.base, zoeCookie);
    clients.push(host, player);
    await host.emit('room:join', { code });
    await player.emit('room:join', { code });

    const up = await zoe('PUT', '/api/me/avatar', { dataUrl: `data:image/png;base64,${png}` });
    assert.equal(up.status, 200);
    assert.match(up.body.avatar, /^\/api\/avatars\/\d+\?v=\d+$/);
    const s = await host.waitFor((st) => st.players[0]?.avatar === up.body.avatar);
    assert.ok(s, 'room members see the new picture live');

    const img = await fetch(srv.base + up.body.avatar, { headers: { cookie: bossCookie } });
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal((await zoe('GET', '/api/me')).body.user.avatar, up.body.avatar);

    const zoeId = (await zoe('GET', '/api/me')).body.user.id;
    await http(srv.base, bossCookie)('DELETE', `/api/admin/users/${zoeId}/avatar`);
    await host.waitFor((st) => st.players[0]?.avatar === null);
    assert.equal((await zoe('GET', '/api/me')).body.user.avatar, null);
  } finally {
    for (const c of clients) c.socket.close();
    await srv.stop();
  }
});
