const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/server');

async function startServer(opts = {}) {
  const ctx = createApp({ dbFile: ':memory:', ...opts });
  await new Promise((resolve) => ctx.server.listen(0, resolve));
  const base = `http://127.0.0.1:${ctx.server.address().port}`;
  return { ...ctx, base, stop: () => new Promise((r) => { ctx.close(); ctx.server.close(r); }) };
}

async function register(base, username, password = 'secret123') {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie').split(';')[0];
}

/** Small fetch wrapper: returns { status, body }. */
function http(base, cookie) {
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(cookie && { cookie }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

function client(base, cookie) {
  const socket = connect(base, { extraHeaders: { cookie }, transports: ['websocket'], forceNew: true });
  const states = [];
  const events = [];
  socket.on('room:state', (s) => states.push(s));
  socket.onAny((name, payload) => events.push([name, payload]));
  const emit = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
  const until = async (fn) => {
    for (let i = 0; i < 300; i++) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('condition never met');
  };
  const waitFor = (pred) => until(() => { const s = states.at(-1); return s && pred(s) ? s : null; });
  const waitEvent = (name) => until(() => events.find((e) => e[0] === name)?.[1]);
  return { socket, emit, waitFor, waitEvent, last: () => states.at(-1) };
}

module.exports = { startServer, register, http, client };
