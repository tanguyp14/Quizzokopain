// Neutron : test d'hébergement o2switch (Setup Node.js App).
// Vérifie la version de Node, node:sqlite, les WebSockets de Socket.IO (et leur latence),
// et si l'application tourne en un seul processus qui reste allumé.
const http = require('node:http');
const { Server } = require('socket.io');

const startedAt = Date.now();
let sqlite = 'non testé';
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (v INTEGER)');
  db.prepare('INSERT INTO t VALUES (?)').run(42);
  sqlite = db.prepare('SELECT v FROM t').get().v === 42 ? 'OK' : 'réponse inattendue';
} catch (err) {
  sqlite = `ÉCHEC : ${err.message}`;
}

const info = () => ({
  node: process.version, sqlite, pid: process.pid,
  uptime: Math.round((Date.now() - startedAt) / 1000), memoryMb: Math.round(process.memoryUsage().rss / 1048576),
});

const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test o2switch</title><style>
body{font-family:system-ui,sans-serif;background:#0d0a24;color:#f7f5ff;max-width:640px;margin:0 auto;padding:20px}
.row{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;margin:8px 0;border-radius:12px;background:rgba(255,255,255,.08)}
.ok{color:#7dffb3}.ko{color:#ff8fa3}.wait{color:#ffb938}b{font-weight:700}small{color:#c4bce8}
</style></head><body>
<h1>🧪 Test o2switch pour Neutron</h1>
<div id="out"><p class="wait">Tests en cours…</p></div>
<p><small>Recharge la page plusieurs fois, à quelques minutes d'écart : si le « processus » change à chaque fois ou que la « durée de vie » repart à zéro, l'application est relancée ou multipliée.</small></p>
<script src="socket.io/socket.io.js"></script>
<script>
const out = document.getElementById('out');
const row = (label, value, cls) => '<div class="row"><span>' + label + '</span><b class="' + cls + '">' + value + '</b></div>';
(async () => {
  const base = location.pathname.replace(/\\/$/, '');
  const info = await (await fetch(base + '/info')).json();
  let html = row('Version de Node', info.node, parseInt(info.node.slice(1)) >= 22 ? 'ok' : 'ko')
    + row('node:sqlite', info.sqlite, info.sqlite === 'OK' ? 'ok' : 'ko')
    + row('Processus (pid)', info.pid, 'wait')
    + row('Durée de vie du processus', info.uptime + ' s', 'wait')
    + row('Mémoire utilisée', info.memoryMb + ' Mo', 'ok');
  out.innerHTML = html + row('WebSocket', 'connexion…', 'wait');
  const socket = io({ path: base + '/socket.io', transports: ['websocket'], reconnection: false, timeout: 8000 });
  socket.on('connect_error', (e) => { out.innerHTML = html + row('WebSocket', 'ÉCHEC : ' + e.message, 'ko'); });
  socket.on('connect', async () => {
    const pings = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      await new Promise((r) => socket.emit('ping-test', r));
      pings.push(performance.now() - t);
    }
    pings.sort((a, b) => a - b);
    const med = Math.round(pings[10]);
    html += row('WebSocket', 'OK (' + socket.io.engine.transport.name + ')', 'ok')
      + row('Latence médiane (20 allers-retours)', med + ' ms', med < 80 ? 'ok' : med < 200 ? 'wait' : 'ko')
      + row('Latence la pire', Math.round(pings[19]) + ' ms', 'wait');
    // Rafale façon Bomber : 20 messages par seconde pendant 3 s.
    let got = 0;
    socket.on('burst', () => { got++; });
    socket.emit('burst-test');
    await new Promise((r) => setTimeout(r, 3500));
    html += row('Rafale 20 msg/s pendant 3 s', got + ' / 60 reçus', got >= 57 ? 'ok' : 'ko');
    out.innerHTML = html;
  });
})();
</script></body></html>`;

const server = http.createServer();
const io = new Server(server, { path: '/socket.io' });

// Passenger may mount the app under a folder: /folder/socket.io/... is handled as /socket.io/...
const strip = (req) => { const i = req.url.indexOf('/socket.io/'); if (i > 0) req.url = req.url.slice(i); };
server.prependListener('upgrade', strip);
server.prependListener('request', (req, res) => {
  strip(req);
  if (req.url.startsWith('/socket.io/')) return; // Socket.IO answers
  const url = req.url.split('?')[0];
  if (url.endsWith('/info')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(info())); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page);
});
io.on('connection', (socket) => {
  socket.on('ping-test', (ack) => ack());
  socket.on('burst-test', () => {
    let n = 0;
    const t = setInterval(() => { socket.emit('burst', n); if (++n >= 60) clearInterval(t); }, 50);
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Test o2switch prêt'));
