import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import pg from 'pg';
import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { Multiplayer } from '../../server/social/multiplayer.mjs';
import { AccountAuth } from '../../server/world/auth.mjs';
import { WorldService } from '../../server/world/service.mjs';
import { ITEMS } from '../../web/js/world/catalog.js';
const enabled = !!process.env.TEST_DATABASE_URL;
let admin, pool, schema, auth, service, server, now = Date.now(), output = '';
const origin = 'http://127.0.0.1:8898';
const password = 'orchard-lantern-quiet';
const check = (name, fn) => test(name, { skip: !enabled }, fn);
const req = (cookie = '') => ({ headers: { cookie }, socket: { remoteAddress: '127.0.0.1' } });
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; } });
const cookie = (res) => res.headers['Set-Cookie'].split(';')[0];
async function call(path, data, session = '', suppliedOrigin = origin) {
  const r = await fetch(origin + path, { method: data ? 'POST' : 'GET', headers: { Cookie: session, Origin: suppliedOrigin, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0], rawCookie: r.headers.get('set-cookie') };
}
before(async () => {
  if (!enabled) return;
  admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  schema = 'auth_test_' + Math.random().toString(36).slice(2, 10);
  await admin.query('CREATE SCHEMA ' + schema);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  pool = new pg.Pool({ connectionString: url.href });
  for (const file of ['server/schema.sql', 'server/world/schema.sql', 'server/social/schema.sql', 'server/adventure/schema.sql', 'server/adventure/commerce-schema.sql']) await pool.query(await readFile(file, 'utf8'));
  for (const item of ITEMS) await pool.query('INSERT INTO items(id,data) VALUES($1,$2)', [item.id, item]);
  service = new WorldService(pool);
  auth = new AccountAuth(service, { now: () => now });
  server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, DATABASE_URL: url.href, HOST: '127.0.0.1', PORT: '8898', DEV_MODE: 'true', AUTH_REQUIRED: 'true', MOCK_TOKEN_MODE: 'true', MARKET_MODE: 'mock', CHECKPOINT_KEEP_RECENT: '3', CHECKPOINT_RETENTION_HOURS: '0', CHECKPOINT_GC_INTERVAL_MS: '60000', CHECKPOINT_GC_GRACE_MS: '600000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Auth test startup timeout: ' + output)), 10000);
    server.stdout.once('data', () => { clearTimeout(deadline); resolve(); });
    server.once('exit', code => { clearTimeout(deadline); reject(new Error('Auth test server exit ' + code + ': ' + output)); });
  });
});
after(async () => {
  if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
  await pool?.end();
  if (admin) { await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end(); }
});
check('account registration hashes passwords, stores hashed bearer tokens and never exposes credentials', async () => {
  const a = response(), b = response();
  await auth.register(req(), a, { username: 'alice_auth', password });
  await auth.register(req(), b, { username: 'bao_auth', password });
  const rows = (await pool.query("SELECT password_hash FROM users WHERE username IN('alice_auth','bao_auth')")).rows;
  assert.notEqual(rows[0].password_hash, rows[1].password_hash);
  assert(rows.every(row => row.password_hash.startsWith('scrypt-v1:') && !row.password_hash.includes(password)));
  assert.match(a.headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=604800; Secure/);
  const token = cookie(a).slice(14);
  assert.equal((await pool.query('SELECT id FROM game_sessions WHERE id=$1', [token])).rowCount, 0);
  assert.equal((await pool.query('SELECT id FROM game_sessions WHERE id=$1', [createHash('sha256').update(token).digest('hex')])).rowCount, 1);
  const userId = await auth.identify(req(cookie(a)));
  assert.equal(userId, 'user-alice_auth');
  assert(!('password_hash' in await service.account(userId)));
  await assert.rejects(auth.register(req(), response(), { username: 'alice_auth', password: 'different-long-password' }), error => error.status === 409);
});
check('concurrent account creation grants starter possessions once and cannot claim an existing development account', async () => {
  const results = await Promise.allSettled([auth.register(req(), response(), { username: 'race_auth', password }), auth.register(req(), response(), { username: 'race_auth', password })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await service.account('user-race_auth')).coins, 500);
  assert.equal((await pool.query("SELECT quantity FROM player_inventory WHERE user_id='user-race_auth' AND item_id='plain'")).rows[0].quantity, 3);
  await service.ensureUser('legacy_auth');
  await assert.rejects(auth.register(req(), response(), { username: 'legacy_auth', password }), error => error.status === 409);
  await assert.rejects(auth.login(req(), response(), { username: 'legacy_auth', password }), error => error.status === 401);
});
check('sign-in is generic for wrong/unknown accounts, validates lengths and revokes every session', async () => {
  for (const username of ['alice_auth', 'missing_auth']) await assert.rejects(auth.login(req(), response(), { username, password: 'incorrect-password' }), error => error.status === 401 && error.message === 'Username or password is incorrect.');
  await assert.rejects(auth.register(req(), response(), { username: 'short_auth', password: 'short' }), error => error.status === 400);
  const a = response(), b = response();
  await auth.login(req(), a, { username: 'alice_auth', password });
  await auth.login(req(), b, { username: 'alice_auth', password });
  await auth.logout(req(cookie(a)), response());
  assert.equal(await auth.identify(req(cookie(a))), null);
  assert.equal(await auth.identify(req(cookie(b))), null);
  assert.equal(await auth.identify(req('mochi_session=forged')), null);
});
check('authentication throttles expensive work and expires bounded rate entries', async () => {
  const limited = new AccountAuth(service, { now: () => now });
  for (let i = 0; i < 10; i++) limited.limit(req(), 'limited_auth');
  assert.throws(() => limited.limit(req(), 'limited_auth'), error => error.status === 429);
  now += 600001;
  limited.limit(req(), 'limited_auth');
  assert.equal(limited.attempts.get('user:limited_auth').count, 1);
  limited.activeHashes = 4;
  await assert.rejects(limited.key(password, 'salt'), error => error.status === 429);
});
check('required-auth HTTP registration/sign-in gates APIs and refuses development impersonation and cross-origin auth', async () => {
  assert.equal((await call('/api/config')).status, 401);
  assert.equal((await call('/api/auth/config')).body.required, true);
  assert.equal((await call('/api/auth/register', { username: 'http_auth', password }, '', 'https://foreign.invalid')).status, 403);
  const register = await call('/api/auth/register', { username: 'http_auth', password });
  assert.equal(register.status, 201);
  assert.match(register.rawCookie, /HttpOnly; SameSite=Strict/);
  const account = await call('/api/config', null, register.cookie);
  assert.equal(account.status, 200);
  assert.equal(account.body.development, false);
  assert.equal(account.body.user.username, 'http_auth');
  assert.equal((await call('/api/dev/login', { username: 'victim' }, register.cookie)).status, 403);
  const login = await call('/api/auth/login', { username: 'http_auth', password });
  assert.equal(login.status, 200);
  await pool.query("UPDATE game_sessions SET expires_at=now()-interval '1 second' WHERE user_id='user-http_auth'");
  assert.equal((await call('/api/config', null, login.cookie)).status, 401);
});
check('sign-out evicts live room presence and prevents an old bearer from reconnecting', async () => {
  const signed = await call('/api/auth/login', { username: 'http_auth', password });
  const ws = new WebSocket(origin.replace('http', 'ws') + '/socket', { headers: { Cookie: signed.cookie, Origin: origin } });
  await new Promise((resolve, reject) => { ws.once('message', resolve); ws.once('error', reject); });
  const closed = new Promise(resolve => ws.once('close', (code) => resolve(code)));
  const out = await call('/api/auth/logout', {}, signed.cookie);
  assert.equal(out.status, 200);
  assert.equal(await closed, 4003);
  assert.equal((await call('/api/config', null, signed.cookie)).status, 401);
  const refused = new WebSocket(origin.replace('http', 'ws') + '/socket', { headers: { Cookie: signed.cookie, Origin: origin } });
  refused.on('error', () => {});
  await new Promise(resolve => refused.once('unexpected-response', (_, response) => { assert.equal(response.statusCode, 401); response.resume(); refused.terminate(); resolve(); }));
});
check('live socket expires at the persisted session deadline without needing a reconnect', async () => {
  const signed = await call('/api/auth/login', { username: 'http_auth', password });
  await pool.query("UPDATE game_sessions SET expires_at=now()+interval '1 second' WHERE user_id='user-http_auth'");
  const ws = new WebSocket(origin.replace('http', 'ws') + '/socket', { headers: { Cookie: signed.cookie, Origin: origin } });
  const closed = new Promise((resolve, reject) => { ws.once('close', code => resolve(code)); ws.once('error', reject); });
  await new Promise((resolve, reject) => { ws.once('message', resolve); ws.once('error', reject); });
  assert.equal(await closed, 4003);
});
test('a delayed authentication SELECT cannot revive a session after revocation', async () => {
  let release, calls = 0;
  const delayed = new AccountAuth({ pool: { query() {
    calls++;
    return calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ rows: [] });
  } } });
  const check = delayed.session(req('mochi_session=' + 'a'.repeat(64)));
  delayed.revocationRevision++;
  release({ rows: [{ user_id: 'revoked', expires_at: new Date(Date.now() + 10000) }] });
  assert.equal(await check, null);
  assert.equal(calls, 2);
});
check('malformed account JSON never returns or logs credential fragments', async () => {
  const secret = 'fixture-password-fragment';
  const r = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"password":' + secret + '}' });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'Invalid JSON request.' });
  assert(!output.includes(secret));
  const large = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'a'.repeat(5000) }) });
  assert.equal(large.status, 413);
});
check('commerce retries cannot cross an authenticated account boundary', async () => {
  const signed = await call('/api/auth/login', { username: 'http_auth', password });
  const missing = await call('/api/adventure/commerce/buy', {
    id: 'cross-account-receipt', vendor: 'apothecary', itemId: 'small-potion', quantity: 1,
  }, signed.cookie);
  assert.equal(missing.status, 401);
  const wrong = await call('/api/adventure/commerce/buy', {
    id: 'cross-account-receipt', vendor: 'apothecary', itemId: 'small-potion', quantity: 1,
    expectedOwner: 'user-another-account',
  }, signed.cookie);
  assert.equal(wrong.status, 401);
});

class TestSocket extends EventEmitter {
  readyState = 1; sent = [];
  send(value) { this.sent.push(value); }
  close(code) { this.code = code; this.readyState = 3; }
}
test('a connection loading an avatar cannot publish presence after its account was revoked', async () => {
  let release;
  const multiplayer = new Multiplayer({ world: { account: async () => ({ username: 'pending' }) }, avatars: { get: () => new Promise(resolve => { release = resolve; }) }, dialogue: {} });
  const ws = new TestSocket();
  ws.revalidateSession = async () => { throw new Error('Revoked'); };
  const connecting = multiplayer.connect(ws, 'pending');
  await Promise.resolve();
  release({});
  await assert.rejects(connecting, /Revoked/);
  assert.equal(multiplayer.store.players.size, 0);
  assert.equal(ws.sent.length, 0);
  multiplayer.close();
});
test('session deadline removes a live actor before movement even if its heartbeat stays current', async () => {
  let time = 1000;
  const multiplayer = new Multiplayer({ now: () => time, world: { account: async () => ({ username: 'expires' }) }, avatars: { get: async () => ({}) }, dialogue: {} });
  const ws = new TestSocket();
  ws.sessionExpiresAt = 1100;
  await multiplayer.connect(ws, 'expires');
  const actor = multiplayer.store.players.get('expires');
  actor.lastSeen = time = 1200;
  multiplayer.tick();
  assert.equal(ws.code, 4003);
  assert.equal(multiplayer.store.players.size, 0);
  multiplayer.close();
});
