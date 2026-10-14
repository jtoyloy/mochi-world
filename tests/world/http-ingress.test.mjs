import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { HttpIngress } from "../../server/world/http-ingress.mjs";
import { GameError } from "../../server/world/service.mjs";

function request({ method = "POST", headers = {}, chunks = [Buffer.from("{}")] } = {}) {
  const req = Readable.from(chunks);
  req.method = method;
  req.headers = { host: "game.test", ...headers };
  return req;
}
const status = expected => error => error.status === expected;

test("unauthenticated protected requests and static mutations refuse before reading a body", async () => {
  const ingress = new HttpIngress();
  for (const path of ["/api/buy", "/api/unknown", "/api/mochis/owned"]) {
    const req = request({ method: path.includes("mochis") ? "PUT" : "POST" });
    await assert.rejects(ingress.prepare(req, path, async () => {
      assert.equal(req.readableDidRead, false);
      throw new GameError("Sign in", 401);
    }), status(401));
    assert.equal(req.readableDidRead, false);
    assert.equal(ingress.readers, 0);
    req.destroy();
  }
  const req = request();
  await assert.rejects(ingress.prepare(req, "/home", () => assert.fail("static auth")), status(405));
  assert.equal(req.readableDidRead, false);
  req.destroy();
});

test("account origin and small declared-size checks precede body parsing", async () => {
  const ingress = new HttpIngress();
  for (const headers of [{}, {origin: "https://foreign.test"}]) {
    const req = request({headers});
    await assert.rejects(ingress.prepare(req, "/api/auth/login", () => assert.fail("account auth")), status(403));
    assert.equal(req.readableDidRead, false);
    req.destroy();
  }
  const req = request({ headers: {origin: "https://game.test", "content-length": "4097"} });
  await assert.rejects(ingress.prepare(req, "/api/auth/login", () => assert.fail("account auth")), status(413));
  assert.equal(req.readableDidRead, false);
  req.destroy();
});

test("ordinary actions stay small while authenticated checkpoint PUT keeps its existing large limit", async () => {
  const ingress = new HttpIngress();
  const data = Buffer.from(JSON.stringify({life: "x".repeat(70000)}));
  await assert.rejects(ingress.prepare(request({chunks: [data]}), "/api/buy", async () => "owner"), status(413));
  const saved = await ingress.prepare(request({method: "PUT", chunks: [data]}), "/api/mochis/owned", async () => "owner");
  assert.equal(saved.user, "owner");
  assert.equal(saved.body.life.length, 70000);
  assert.equal(ingress.bytes, 30000000);
  saved.release();
  assert.equal(ingress.bytes, 0);
});

test("handler lifetime reservations bound readers and aggregate bytes and release exactly once", async () => {
  const ingress = new HttpIngress({maximumReaders: 2, maximumBytes: 30065536});
  const first = await ingress.prepare(request({method: "PUT"}), "/api/mochis/owned", async () => "owner");
  const refused = request({method: "PUT"});
  await assert.rejects(ingress.prepare(refused, "/api/mochis/other", () => assert.fail("budget must precede auth")), status(503));
  refused.destroy();
  const second = await ingress.prepare(request(), "/api/buy", async () => "owner");
  await assert.rejects(ingress.prepare(request(), "/api/buy", async () => "owner"), status(503));
  first.release(); first.release(); second.release();
  assert.equal(ingress.readers, 0);
  assert.equal(ingress.bytes, 0);
  const retry = await ingress.prepare(request(), "/api/buy", async () => "owner");
  retry.release();
});

test("invalid JSON, streamed oversize and body timeout release their admission", async () => {
  const ingress = new HttpIngress({timeoutMs: 5});
  await assert.rejects(ingress.prepare(request({chunks: [Buffer.from("{")]}), "/api/buy", async () => "owner"), status(400));
  await assert.rejects(ingress.prepare(request({chunks: [Buffer.alloc(4097)]}), "/api/adventure/commerce/buy", async () => "owner"), status(413));
  const slow = new Readable({read() {}});
  slow.method = "POST"; slow.headers = {host: "game.test"};
  // A real incoming request's socket keeps the event loop live during a read.
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(ingress.prepare(slow, "/api/buy", async () => "owner"), status(408)); }
  finally { clearTimeout(keepAlive); }
  assert.equal(slow.destroyed, true);
  assert.equal(ingress.readers, 0);
  assert.equal(ingress.bytes, 0);
});

test("public config and same-origin account body preserve their unauthenticated paths", async () => {
  const ingress = new HttpIngress();
  const config = await ingress.prepare(request({method: "GET", chunks: []}), "/api/auth/config", () => assert.fail("public config"));
  config.release();
  const login = await ingress.prepare(request({headers: {origin: "https://game.test"}}), "/api/auth/login", () => assert.fail("login needs no session"));
  assert.deepEqual(login.body, {});
  assert.equal(login.user, null);
  login.release();
});
