import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoomPersistence, signalSessionExpiry } from "../../web/js/traders/room-persistence.js";
import { createBrainSaver, createRetainedSnapshot } from "../../web/js/traders/brain-save.js";

const life = () => ({ brain: Uint8Array.from([7, 8, 9]).buffer, trader: { retained: true } });
function fixture() {
  const f = { version: 1, owner: "original", expired: false, calls: [], errors: [], auth: 0, cached: [],
    heartbeatError: null, putError: null, releaseError: null, acquireBump: false, ambiguous: false,
    deferredHeartbeat: null, deferredCacheSave: null, deferredPut: null };
  const timers = new Map(); let timerId = 0, acquisitions = 0, token = "first";
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  f.client = createRoomPersistence({ mochiId: "pet", cacheSave: async value => { if (f.deferredCacheSave) await f.deferredCacheSave; f.cached.push(value); },
    setInterval: callback => { timers.set(++timerId, callback); return timerId; }, clearInterval: id => timers.delete(id),
    onLeaseError: error => f.errors.push(error), onSessionExpired: () => f.auth++,
    fetch: async (path, options) => {
      const method = options.method ?? "GET", body = options.body ? JSON.parse(options.body) : undefined;
      f.calls.push({ path, method, body });
      if (path.endsWith("/acquire")) {
        acquisitions++;
        if (acquisitions > 1 && !f.expired) return reply({ error: "Another room is active" }, 409);
        if (acquisitions > 1 && f.acquireBump) f.version++;
        token = acquisitions === 1 ? "first" : "replacement"; f.expired = false;
        return reply({ token, version: f.version });
      }
      if (path.endsWith("/heartbeat")) {
        if (f.deferredHeartbeat) { const deferred = f.deferredHeartbeat; f.deferredHeartbeat = null; return deferred; }
        if (f.heartbeatError) return reply({ error: "Session expired" }, f.heartbeatError);
        if (f.expired || body.token !== token) return reply({ error: "Lease expired" }, 409);
        return reply({ version: f.version });
      }
      if (path.endsWith("/release")) return f.releaseError ? reply({ error: "Session expired" }, f.releaseError) : reply({ released: true });
      if (method === "GET") return reply({ owner: f.owner, version: f.version, life: { brain: "BwgJ" } });
      if (method === "PUT") {
        if (f.deferredPut) await f.deferredPut;
        if (f.putError) return reply({ error: "Session expired" }, f.putError);
        if (body.version !== f.version || body.leaseToken !== token) return reply({ error: "Conflicting save" }, 409);
        f.version++;
        if (f.ambiguous) throw new Error("Response lost");
        return reply({ saved: true, version: f.version });
      }
      assert.fail("Unexpected request");
    },
  });
  f.tick = () => { assert.equal(timers.size, 1); return [...timers.values()][0](); };
  f.timers = timers;
  f.puts = () => f.calls.filter(call => call.method === "PUT");
  f.acquireCount = () => acquisitions;
  return f;
}

test("heartbeat authentication failure signals recovery, pauses, then safely reacquires a same-version lease", async () => {
  const f = fixture(); await f.client.loadRecord();
  f.heartbeatError = 401;
  await f.tick();
  assert.equal(f.auth, 1); assert.equal(f.timers.size, 0);
  f.heartbeatError = null; f.expired = true;
  const retained = life();
  assert.equal(await f.client.saveLife(retained), true);
  assert.equal(f.acquireCount(), 2); assert.equal(f.timers.size, 1);
  assert.equal(f.puts()[0].body.leaseToken, "replacement");
  assert.equal(f.puts()[0].body.version, 1);
  assert.equal(f.puts()[0].body.life.brain, "BwgJ");
  assert.equal(f.cached[0], retained);
});

test("same-owner active lease can resume without acquiring another room", async () => {
  const f = fixture(); await f.client.loadRecord();
  f.heartbeatError = 401; await f.tick(); f.heartbeatError = null;
  await f.client.saveLife(life());
  assert.equal(f.acquireCount(), 1); assert.equal(f.timers.size, 1);
});

test("changed cloud version or owner refuses recovery without PUT or local replacement", async () => {
  for (const changed of ["version", "owner"]) {
    const f = fixture(); await f.client.loadRecord();
    f.heartbeatError = 401; await f.tick(); f.heartbeatError = null;
    if (changed === "version") f.version++; else f.owner = "different";
    await assert.rejects(f.client.saveLife(life()), /unsaved brain is retained/);
    assert.equal(f.puts().length, 0); assert.equal(f.acquireCount(), 1);
    assert.equal(f.cached.length, 0); assert.equal(f.timers.size, 0);
  }
});

test("a version changed between inspection and acquisition releases the candidate lease and preserves state", async () => {
  const f = fixture(); await f.client.loadRecord();
  f.expired = true; await f.tick(); f.acquireBump = true;
  await assert.rejects(f.client.saveLife(life()), /cloud brain changed/);
  assert.equal(f.puts().length, 0); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.calls.find(call => call.path.endsWith("/release")).body, { mochiId: "pet", token: "replacement" });
  assert.equal(f.client.roomToken(), "first");
});

test("PUT authentication failure signals recovery and retains the version for a safe retry", async () => {
  const f = fixture(); await f.client.loadRecord(); f.putError = 401;
  await assert.rejects(f.client.saveLife(life()), error => error.status === 401);
  assert.equal(f.auth, 1); assert.equal(f.cached.length, 0); assert.equal(f.timers.size, 0);
  f.putError = null; await f.client.saveLife(life());
  assert.equal(f.puts()[1].body.version, 1); assert.equal(f.timers.size, 1);
});

test("ambiguous committed save cannot overwrite its newer cloud version on retry", async () => {
  const f = fixture(); await f.client.loadRecord(); f.ambiguous = true;
  await assert.rejects(f.client.saveLife(life()), /Response lost/);
  f.ambiguous = false;
  await assert.rejects(f.client.saveLife(life()), /cloud brain changed/);
  assert.equal(f.puts().length, 1); assert.equal(f.cached.length, 0);
});

test("heartbeat response predating a successful save does not falsely pause its newer version", async () => {
  const f = fixture(); await f.client.loadRecord();
  let resolve;
  f.deferredHeartbeat = new Promise(done => { resolve = done; });
  const heartbeat = f.tick();
  await f.client.saveLife(life());
  resolve({ ok: true, status: 200, json: async () => ({ version: 1 }) });
  await heartbeat;
  assert.equal(f.errors.length, 0); assert.equal(f.timers.size, 1);
});

test("late heartbeat failure from an older lease cannot stop the safely recovered heartbeat", async () => {
  const f = fixture(); await f.client.loadRecord();
  let resolve;
  f.deferredHeartbeat = new Promise(done => { resolve = done; });
  const oldHeartbeat = f.tick();
  f.putError = 401; await assert.rejects(f.client.saveLife(life()));
  f.putError = null; f.expired = true; await f.client.saveLife(life());
  const errors = f.errors.length, auth = f.auth;
  resolve({ ok: false, status: 401, json: async () => ({ error: "Old session expired" }) });
  await oldHeartbeat;
  assert.equal(f.errors.length, errors); assert.equal(f.timers.size, 1); assert.equal(f.auth, auth);
});

test("a newer heartbeat pause during PUT or browser caching remains paused after a confirmed save", async () => {
  for (const phase of ["deferredPut", "deferredCacheSave"]) {
    const f = fixture(); await f.client.loadRecord();
    let release;
    f[phase] = new Promise(done => { release = done; });
    const saving = f.client.saveLife(life());
    // Wait until the PUT is actually entered; it either awaits delivery or its
    // successful response is awaiting browser-cache completion.
    while (!f.puts().length) await Promise.resolve();
    f.heartbeatError = 401; await f.tick();
    assert.equal(f.client.roomReady(), false);
    release(); await saving;
    assert.equal(f.client.roomReady(), false); assert.equal(f.timers.size, 0);
    f.heartbeatError = null; f[phase] = null;
    await f.client.saveLife(life());
    assert.equal(f.client.roomReady(), true); assert.equal(f.timers.size, 1);
  }
});

test("auth expiry is delivered only to the outermost accessible same-origin window", () => {
  const calls = [];
  const top = { location: { origin: "https://mochi.test" }, dispatchEvent: e => calls.push(["top", e.type]) }; top.parent = top;
  const middle = { location: top.location, parent: top, dispatchEvent: () => assert.fail("nested gate") };
  const room = { location: top.location, parent: middle, dispatchEvent: () => assert.fail("room gate") };
  signalSessionExpiry(room);
  assert.deepEqual(calls, [["top", "mochi:session-expired"]]);
});

test("release authentication failure retains the token and permits a same-owner confirmed-save retry", async () => {
  const f = fixture(); await f.client.loadRecord(); await f.client.saveLife(life());
  f.releaseError = 401;
  await assert.rejects(f.client.releaseRoom(), error => error.status === 401);
  assert.equal(f.auth, 1); assert.equal(f.client.roomToken(), "first"); assert.equal(f.timers.size, 0);
  f.releaseError = null; await f.client.saveLife(life());
  assert.equal(f.puts()[1].body.version, 2); assert.equal(f.timers.size, 1);
  await f.client.releaseRoom();
  assert.equal(f.client.roomToken(), undefined); assert.equal(f.timers.size, 0);
});

test("export waits for the existing decision and freezes the body until the worker snapshot completes", async () => {
  let initialized = true, frozen = 0, decisionFinished, workerFinished, brainReads = 0;
  const wait = new Promise(done => { decisionFinished = done; });
  const worker = new Promise(done => { workerFinished = done; });
  const snapshot = createRetainedSnapshot({ initialized: () => initialized,
    begin: () => frozen++, end: () => frozen--, waitForDecision: () => wait,
    readBrain: async () => { brainReads++; assert.equal(frozen, 1); return worker; },
    readState: () => { assert.equal(frozen, 1); return { world: "retained" }; },
  });
  const pending = snapshot();
  assert.equal(frozen, 1); assert.equal(brainReads, 0);
  decisionFinished(); await Promise.resolve();
  assert.equal(brainReads, 1); assert.equal(frozen, 1);
  const brain = Uint8Array.from([4]).buffer;
  workerFinished(brain);
  assert.deepEqual(await pending, { world: "retained", brain });
  assert.equal(frozen, 0);
  initialized = false;
  await assert.rejects(snapshot(), /not initialized/);
  assert.equal(frozen, 0);
});

test("failed worker export always releases the snapshot freeze without discarding state", async () => {
  let frozen = false;
  const snapshot = createRetainedSnapshot({ initialized: () => true, begin: () => { frozen = true; }, end: () => { frozen = false; },
    waitForDecision: async () => {}, readBrain: async () => { throw new Error("Worker unavailable"); },
    readState: () => assert.fail("failed export must not read replacement state"),
  });
  await assert.rejects(snapshot(), /Worker unavailable/);
  assert.equal(frozen, false);
});

test("uninitialized and refused saves explicitly return false; a retained lease-paused brain can retry", async () => {
  const state = { initialized: false, ready: false, leasePaused: false };
  let fail = true, confirmed = true, snapshots = 0, starts = 0, ends = 0, saved = 0;
  const errors = [];
  const save = createBrainSaver({ state: () => state, snapshot: async () => { snapshots++; return life(); },
    persist: async () => { if (fail) throw new Error("Cloud conflict; retained"); return confirmed; },
    begin: () => starts++, end: () => ends++, saved: () => saved++, failed: error => errors.push(error.message),
  });
  assert.equal(await save(false), false); assert.equal(snapshots, 0);
  state.initialized = true; state.leasePaused = true;
  assert.equal(await save(false), false);
  assert.deepEqual(errors, ["Cloud conflict; retained"]); assert.equal(saved, 0);
  fail = false;
  confirmed = false;
  assert.equal(await save(false), false); assert.equal(saved, 0);
  confirmed = true;
  assert.equal(await save(false), true);
  assert.equal(saved, 1); assert.equal(starts, 3); assert.equal(ends, 3);
});

test("overlapping panel save attempts share one retained snapshot and confirmed save", async () => {
  let release, snapshots = 0, writes = 0;
  const save = createBrainSaver({ state: () => ({ initialized: true, ready: false, leasePaused: true }),
    snapshot: async () => { snapshots++; return life(); }, persist: async () => { writes++; await new Promise(done => { release = done; }); return true; },
    begin() {}, saved() {}, failed() {}, end() {},
  });
  const one = save(false), two = save(false);
  await Promise.resolve(); release();
  assert.deepEqual(await Promise.all([one, two]), [true, true]);
  assert.equal(snapshots, 1); assert.equal(writes, 1);
});
