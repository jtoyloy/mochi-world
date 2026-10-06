import { test } from "node:test";
import assert from "node:assert/strict";
import { Multiplayer } from "../../server/social/multiplayer.mjs";
import { walkable } from "../../web/js/game/model.js";
import { RuntimeMetrics } from "../../server/world/runtime-metrics.mjs";
import { AdventureService } from "../../server/adventure/service.mjs";

test("Momo captured spawn is blocked; join and refresh place companion on a reachable floor", async () => {
  const avatar = { current_room_id: "town", last_x: 1309.38, last_y: 964.55 };
  const messages = [];
  const m = new Multiplayer({
    world: {
      friends: async () => ({ friends: [] }),
      pool: { query: async () => ({ rows: [] }) },
    },
    avatars: {
      get: async () => avatar,
      companion: async () => ({
        id: "momo",
        profile: { beast: { archetype: "moonfox" } },
      }),
    },
  });
  const p = {
    userId: "owner",
    username: "owner",
    avatar,
    ws: {
      readyState: 1,
      bufferedAmount: 0,
      send: (s) => messages.push(JSON.parse(s)),
      close() {},
    },
    lastSeen: Date.now(),
  };
  m.store.players.set(p.userId, p);
  try {
    assert.equal(walkable("town", 1214.38, 1004.55), false);
    await m.join(p, "town");
    assert(walkable("town", p.companion.x, p.companion.y));
    await m.refresh(p.userId);
    assert(walkable("town", p.companion.x, p.companion.y));
    await m.handle(p, {
      type: "move",
      data: { x: 1066.24, y: 392.76, seq: 1 },
    });
    const start = { ...p.companion };
    m.tickAt = Date.now() - 100;
    for (let i = 0; i < 100; i++) {
      m.tickAt = Date.now() - 100;
      m.tick();
    }
    assert(Math.hypot(p.companion.x - start.x, p.companion.y - start.y) > 100);
    assert.equal(p.companion.id, "momo");
  } finally {
    m.close();
  }
});

test("broadcast serializes once and exposes payload bytes and backpressure drops", () => {
  const counts = {},
    metrics = { count: (k, n = 1) => (counts[k] = (counts[k] ?? 0) + n) };
  const m = new Multiplayer({ metrics });
  const output = [];
  m.store.rooms.set("town-1", {
    players: new Map([
      [
        "a",
        {
          ws: { readyState: 1, bufferedAmount: 0, send: (s) => output.push(s) },
        },
      ],
      [
        "b",
        {
          ws: {
            readyState: 1,
            bufferedAmount: 200001,
            send() {
              throw Error("backpressure");
            },
          },
        },
      ],
    ]),
  });
  let serializations = 0;
  try {
    m.broadcast("town-1", "probe", {
      toJSON() {
        serializations++;
        return { x: 1 };
      },
    });
    assert.equal(serializations, 1);
    assert.equal(counts.outboundBytes, Buffer.byteLength(output[0]));
    assert.equal(counts.droppedUpdates, 1);
    assert.equal(counts.backpressureDrops, 1);
    m.sendEncoded({ ws: { readyState: 3 } }, "closed");
    assert.equal(counts.closedSocketSkips, 1);
    assert.equal(counts.backpressureDrops, 1);
  } finally {
    m.close();
  }
});

test("query instrumentation covers callback pool internals and direct transaction clients exactly once", async () => {
  const client = { query: async () => ({ rows: [] }) };
  const pool = {
    connect(callback) {
      if (callback) {
        callback(null, client, () => {});
        return;
      }
      return Promise.resolve(client);
    },
    query() {
      return new Promise((resolve) =>
        this.connect(async (e, c) => resolve(await c.query("select"))),
      );
    },
  };
  const metrics = new RuntimeMetrics(pool);
  try {
    await pool.query("select");
    const tx = await pool.connect();
    await tx.query("begin");
    await pool.query("select");
    assert.equal(metrics.counts.databaseQueries, 3);
  } finally {
    metrics.close();
  }
});

test("adventure tick evicts persisted disconnected idle states while retaining pending combat settlement", async () => {
  const saved = [];
  const a = new AdventureService(
    { pool: {}, now: () => 1000 },
    { brains: {}, rewards: {} },
  );
  a.multiplayer = { store: { rooms: new Map(), players: new Map() } };
  a.save = async (id) => saved.push(id);
  a.states.set("idle", { inBattle: false });
  a.states.set("settling", { inBattle: true });
  a.instances.set("empty", {});
  await a.tick();
  assert.deepEqual(saved, ["idle"]);
  assert.equal(a.states.has("idle"), false);
  assert.equal(a.states.has("settling"), true);
  assert.equal(a.instances.size, 0);
});

test("a socket closed during account loading cannot register a ghost", async () => {
  const ws = { readyState: 1, close() {}, send() {} };
  const m = new Multiplayer({
    world: { account: async () => ({ username: "owner" }) },
    avatars: {
      get: async () => {
        ws.readyState = 3;
        return {};
      },
    },
  });
  try {
    await m.connect(ws, "owner");
    assert.equal(m.store.players.size, 0);
  } finally {
    m.close();
  }
});

test("disconnect during asynchronous companion loading does not retain an empty instance", async () => {
  let release;
  const loading = new Promise((resolve) => (release = resolve));
  const m = new Multiplayer({
    world: {
      friends: async () => ({ friends: [] }),
      pool: { query: async () => ({ rows: [] }) },
    },
    avatars: { companion: () => loading },
  });
  const p = {
    userId: "owner",
    username: "owner",
    avatar: {},
    ws: { readyState: 1, bufferedAmount: 0, send() {}, close() {} },
  };
  m.store.players.set(p.userId, p);
  try {
    const joining = m.join(p, "town");
    await new Promise((resolve) => setImmediate(resolve));
    m.disconnect(p);
    release({ id: "pet" });
    await joining;
    assert.equal(m.store.rooms.size, 0);
    assert.equal(m.store.players.size, 0);
  } finally {
    m.close();
  }
});

test("capacity sample aggregation handles more values than the engine argument limit", async () => {
  const { maximum, percentile } =
    await import("../../multiplayer/load-test/stats.mjs");
  const samples = Array.from({ length: 200001 }, (_, i) => i);
  assert.equal(maximum(samples), 200000);
  assert.equal(percentile(samples, 0.95), 190000);
  assert.equal(percentile([], 0.95), null);
});

test("soak checkpoint directory is configurable without altering published packs", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { FileCheckpointStorage } =
    await import("../../server/world/checkpoints.mjs");
  const directory = await mkdtemp(join(tmpdir(), "mochi-soak-checkpoints-"));
  const previous = process.env.CHECKPOINT_DIRECTORY;
  process.env.CHECKPOINT_DIRECTORY = directory;
  try {
    const storage = new FileCheckpointStorage();
    const bytes = Buffer.from("test life");
    const key = await storage.write("test-soak-pet", 1, bytes);
    assert.equal(storage.directory, directory);
    assert.deepEqual(await storage.read(key), bytes);
  } finally {
    if (previous === undefined) delete process.env.CHECKPOINT_DIRECTORY;
    else process.env.CHECKPOINT_DIRECTORY = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
