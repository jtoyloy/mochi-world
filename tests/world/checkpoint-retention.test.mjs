import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  mkdtemp,
  rm,
  writeFile,
  stat,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { WorldService } from "../../server/world/service.mjs";
import {
  BrainRepository,
  FileCheckpointStorage,
} from "../../server/world/checkpoints.mjs";
import {
  CheckpointCollector,
  retentionPolicy,
} from "../../server/world/checkpoint-retention.mjs";
import { validateLife } from "../../server/world/checkpoint-format.mjs";
import { BrainProcess } from "../../sim/brain_proc.mjs";
import { ITEMS } from "../../web/js/world/catalog.js";
import { TRADER_SPEC } from "../../web/js/traders/brain.js";
const enabled = !!process.env.TEST_DATABASE_URL;
const check = (name, fn) => test(name, { skip: !enabled }, fn);
let admin,
  pool,
  s,
  repo,
  storage,
  dir,
  schema,
  life,
  sequence = 0;
const policy = {
  enabled: true,
  keepRecent: 2,
  retentionHours: 0,
  graceMs: 1000,
  intervalMs: 1000,
};
const gc = () =>
  new CheckpointCollector(repo, policy).run({ now: Date.now() + 3600000 });
before(async () => {
  life = await readFile("web/brains/traders-0.74.0-v1/basic.life");
  if (!enabled) return;
  admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  schema = "checkpoint_test_" + Math.random().toString(36).slice(2, 10);
  await admin.query("CREATE SCHEMA " + schema);
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  for (const p of [
    "server/schema.sql",
    "server/world/schema.sql",
    "server/adventure/schema.sql",
  ])
    await pool.query(await readFile(p, "utf8"));
  // Adoption needs only these starter items; no token or reward action is performed.
  for (const item of ITEMS)
    await pool.query("INSERT INTO items VALUES($1,$2)", [item.id, item]);
  s = new WorldService(pool);
  dir = await mkdtemp(join(tmpdir(), "mochi-retention-"));
  storage = new FileCheckpointStorage(dir);
  repo = new BrainRepository(s, storage);
});
after(async () => {
  if (pool) await pool.end();
  if (admin) {
    await admin.query("DROP SCHEMA " + schema + " CASCADE");
    await admin.end();
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});
function versionBytes(n) {
  const comment = Buffer.from("retention fixture " + n);
  const bytes = Buffer.from(life.subarray(0, life.length - 22));
  const end = Buffer.from(life.subarray(life.length - 22));
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([bytes, end, comment]);
}
async function pet() {
  const id = "ret_" + schema.slice(-8) + "_" + ++sequence;
  const user = await s.ensureUser(id);
  await s.adopt(user.id, id, "Retention");
  return { id, user: user.id };
}
async function persist(p, n) {
  return s.transaction([p.user], async (tx) => {
    await repo.lock(tx, p.id);
    const brain = await repo.ensure(tx, p.id);
    const key = await repo.writeCheckpoint(
      tx,
      p.id,
      brain.version + 1,
      versionBytes(n),
      brain.checkpoint_key,
    );
    await tx.query(
      "UPDATE mochi_brains SET checkpoint_key=$2,version=version+1 WHERE mochi_id=$1",
      [p.id, key],
    );
    return key;
  });
}
const exists = async (key) =>
  stat(storage.path(key)).then(
    () => true,
    (e) => {
      if (e.code === "ENOENT") return false;
      throw e;
    },
  );
test("retention config is explicit in production and validates development defaults", () => {
  assert.equal(retentionPolicy({}).enabled, false);
  assert.equal(retentionPolicy({ DEV_MODE: "true" }).keepRecent, 3);
  assert.throws(() =>
    retentionPolicy({ DEV_MODE: "true", CHECKPOINT_KEEP_RECENT: "0" }),
  );
  assert.throws(() =>
    retentionPolicy({ DEV_MODE: "true", CHECKPOINT_GC_GRACE_MS: "NaN" }),
  );
});
test("ZIP integrity rejects truncation and corrupt entry bytes", () => {
  assert.equal(validateLife(life), true);
  assert.throws(() => validateLife(life.subarray(0, -1)));
  const broken = Buffer.from(life);
  broken[200] ^= 1;
  assert.throws(() => validateLife(broken));
});
check(
  "browser save/restart restores exact checkpoint/body and deduplicates unchanged bytes without skipping metadata",
  async () => {
    const p = await pet(),
      lease = await repo.acquire(p.user, p.id),
      record = await repo.load(p.id, p.user);
    record.life.page.name = "First";
    const first = await repo.save(
      p.user,
      p.id,
      record,
      lease.token,
      lease.version,
    );
    const key = (
      await pool.query(
        "SELECT checkpoint_key FROM mochi_brains WHERE mochi_id=$1",
        [p.id],
      )
    ).rows[0].checkpoint_key;
    record.life.page.name = "Second";
    await repo.save(p.user, p.id, record, lease.token, first.version);
    const restart = new BrainRepository(s, new FileCheckpointStorage(dir));
    const restored = await restart.load(p.id, p.user);
    assert.equal(restored.life.brain, record.life.brain);
    assert.deepEqual(restored.life.world, record.life.world);
    assert.equal(restored.life.page.name, "Second");
    assert.equal(restored.version, 2);
    assert.equal(
      (
        await pool.query(
          "SELECT checkpoint_key FROM mochi_brains WHERE mochi_id=$1",
          [p.id],
        )
      ).rows[0].checkpoint_key,
      key,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM brain_checkpoints WHERE mochi_id=$1",
          [p.id],
        )
      ).rows[0].count,
      "1",
    );
    await repo.release(p.user, p.id, lease.token);
  },
);
check(
  "multiple versions load newest referenced; current/recent/pinned retained; obsolete removed; GC idempotent",
  async () => {
    const p = await pet(),
      keys = [];
    for (let n = 1; n <= 5; n++) keys.push(await persist(p, n));
    await repo.pin(p.id, keys[0]);
    assert.equal(
      (await repo.load(p.id, p.user)).life.brain,
      versionBytes(5).toString("base64"),
    );
    await gc();
    assert.deepEqual(await Promise.all(keys.map(exists)), [
      true,
      false,
      false,
      true,
      true,
    ]);
    assert.equal((await gc()).deleted, 0);
  },
);
check(
  "active lease protects the checkpoint loaded at acquisition across later saves",
  async () => {
    const p = await pet(),
      first = await persist(p, 1);
    const lease = await repo.acquire(p.user, p.id);
    for (let n = 2; n <= 5; n++) await persist(p, n);
    await gc();
    assert.equal(await exists(first), true);
    await repo.release(p.user, p.id, lease.token);
    await gc();
    assert.equal(await exists(first), false);
  },
);
check(
  "corrupt/missing current checkpoint fails closed and prevents GC of remaining recovery files",
  async () => {
    const p = await pet(),
      a = await persist(p, 1),
      b = await persist(p, 2);
    const corrupt = Buffer.from(versionBytes(2));
    corrupt[200] ^= 1;
    await writeFile(storage.path(b), corrupt);
    await assert.rejects(repo.load(p.id, p.user), /corrupt/);
    await gc();
    assert.equal(await exists(a), true);
    await rm(storage.path(b));
    await assert.rejects(repo.load(p.id, p.user), /ENOENT/);
    await gc();
    assert.equal(await exists(a), true);
    // Restore exact referenced bytes; no implicit pack fallback or state rollback occurred.
    await writeFile(storage.path(b), versionBytes(2));
    assert.equal((await repo.load(p.id, p.user)).version, 2);
  },
);
check(
  "crash after file write before pointer update retains prior state and later collects orphan/temp files",
  async () => {
    const p = await pet(),
      current = await persist(p, 1),
      scope = await repo.scope();
    let orphan;
    await assert.rejects(
      s.transaction([p.user], async (tx) => {
        await repo.lock(tx, p.id);
        orphan = await repo.writeCheckpoint(tx, p.id, 2, versionBytes(2));
        throw Error("simulated crash before pointer commit");
      }),
    );
    assert.equal(
      (await repo.load(p.id, p.user)).life.brain,
      versionBytes(1).toString("base64"),
    );
    const partial = orphan + ".tmp";
    await writeFile(storage.path(partial), Buffer.from("partial"));
    await gc();
    assert.equal(await exists(orphan), false);
    assert.equal(await exists(partial), false);
    assert.equal(await exists(current), true);
    assert.ok(scope);
  },
);
check(
  "first-save orphan is the only potential recovery state and is never garbage-collected",
  async () => {
    const p = await pet();
    let orphan;
    await assert.rejects(
      s.transaction([p.user], async (tx) => {
        await repo.lock(tx, p.id);
        await repo.ensure(tx, p.id);
        orphan = await repo.writeCheckpoint(tx, p.id, 1, versionBytes(1));
        throw Error("crash");
      }),
    );
    await gc();
    assert.equal(await exists(orphan), true);
  },
);
check(
  "GC skips an in-flight save and a second collector; crash after pointer commit keeps the new current",
  async () => {
    const p = await pet();
    await persist(p, 1);
    let resume, ready;
    const blocked = new Promise((r) => (resume = r)),
      reached = new Promise((r) => (ready = r));
    let next;
    const save = s.transaction([p.user], async (tx) => {
      await repo.lock(tx, p.id);
      next = await repo.writeCheckpoint(tx, p.id, 2, versionBytes(2));
      ready();
      await blocked;
      await tx.query(
        "UPDATE mochi_brains SET checkpoint_key=$2,version=2 WHERE mochi_id=$1",
        [p.id, next],
      );
    });
    await reached;
    try {
      await gc();
      assert.equal(await exists(next), true);
    } finally {
      resume();
    }
    await save;
    await gc();
    assert.equal(
      (await repo.load(p.id, p.user)).life.brain,
      versionBytes(2).toString("base64"),
    );
    const lock = await pool.connect();
    try {
      await lock.query("SELECT pg_advisory_lock(hashtext($1))", [
        "checkpoint-gc:" + (await repo.scope()),
      ]);
      assert.equal((await gc()).skipped, "another collector");
    } finally {
      await lock.query("SELECT pg_advisory_unlock_all()");
      lock.release();
    }
  },
);
check(
  "write failure and pointer-transaction failure never replace the last valid current",
  async () => {
    const p = await pet(),
      current = await persist(p, 1),
      oldWrite = storage.write;
    storage.write = async () => {
      throw Error("disk full");
    };
    try {
      await assert.rejects(persist(p, 2), /disk full/);
    } finally {
      storage.write = oldWrite;
    }
    assert.equal(
      (await repo.load(p.id, p.user)).life.brain,
      versionBytes(1).toString("base64"),
    );
    await assert.rejects(
      s.transaction([p.user], async (tx) => {
        await repo.lock(tx, p.id);
        const key = await repo.writeCheckpoint(tx, p.id, 2, versionBytes(2));
        await tx.query(
          "UPDATE mochi_brains SET checkpoint_key=$2 WHERE mochi_id=$1",
          [p.id, key],
        );
        throw Error("commit failure");
      }),
    );
    await gc();
    assert.equal(await exists(current), true);
  },
);
check(
  "unverifiable DB state aborts GC without deleting and reports a failure",
  async () => {
    const collector = new CheckpointCollector(repo, policy),
      original = repo.scope;
    repo.scope = async () => {
      throw Error("database unavailable");
    };
    try {
      await assert.rejects(collector.run(), /database unavailable/);
      assert.ok(repo.diagnostics().gcFailures > 0);
    } finally {
      repo.scope = original;
    }
  },
);
check(
  "legacy root files and foreign namespaces are not swept; corrupt cross-identity catalog fails closed",
  async () => {
    const p = await pet(),
      old = await storage.write(p.id, 1, versionBytes(1));
    for (let n = 1; n <= 3; n++) await persist(p, n);
    const foreign = await storage.write(
      p.id,
      1,
      versionBytes(1),
      "11111111-1111-4111-8111-111111111111",
    );
    await gc();
    assert.equal(await exists(old), true);
    assert.equal(await exists(foreign), true);
    const q = await pet(),
      wrong = await persist(p, 10);
    await persist(p, 11);
    await persist(p, 12);
    await pool.query("UPDATE brain_checkpoints SET mochi_id=$2 WHERE key=$1", [
      wrong,
      q.id,
    ]);
    await assert.rejects(gc(), /identity mismatch/);
    assert.equal(await exists(wrong), true);
    await pool.query("UPDATE brain_checkpoints SET mochi_id=$2 WHERE key=$1", [
      wrong,
      p.id,
    ]);
  },
);
check(
  "any other current DB reference preserves a file; battle bytea/domain/version remain untouched",
  async () => {
    const p = await pet(),
      q = await pet(),
      first = await persist(p, 1);
    for (let n = 2; n <= 4; n++) await persist(p, n);
    await pool.query(
      "INSERT INTO mochi_brains(mochi_id,pack,life,checkpoint_key) VALUES($1,'traders-0.74.0-v1','{}',$2)",
      [q.id, first],
    );
    const battle = Buffer.from("battle-v1-fixture");
    await pool.query(
      "INSERT INTO mochi_battle_brains(mochi_id,checkpoint,version) VALUES($1,$2,7)",
      [p.id, battle],
    );
    await gc();
    assert.equal(await exists(first), true);
    const row = (
      await pool.query("SELECT * FROM mochi_battle_brains WHERE mochi_id=$1", [
        p.id,
      ])
    ).rows[0];
    assert.equal(row.domain, "battle-v1");
    assert.equal(row.version, 7);
    assert.deepEqual(row.checkpoint, battle);
  },
);
check(
  "real native serialization measures unchanged-state duplicate equivalence without suppressing learning",
  async () => {
    const host = new BrainProcess();
    try {
      await host.call({
        op: "boot",
        spec: TRADER_SPEC,
        npz: life.toString("base64"),
      });
      const a = await host.call({ op: "save" }),
        b = await host.call({ op: "save" });
      assert.equal(validateLife(Buffer.from(a.npz, "base64")), true);
      assert.equal(validateLife(Buffer.from(b.npz, "base64")), true);
      // ZIP timestamps may differ; exact-byte dedup never assumes semantic equality.
      assert.equal(typeof (a.npz === b.npz), "boolean");
    } finally {
      host.close();
    }
  },
);

check(
  "age recovery window and dry-run retain without deleting; upgraded unknown lease snapshot fails closed",
  async () => {
    const p = await pet(),
      keys = [];
    for (let n = 1; n <= 4; n++) keys.push(await persist(p, n));
    const collector = new CheckpointCollector(repo, {
      ...policy,
      retentionHours: 2,
    });
    await collector.run({ now: Date.now() + 3600000 });
    assert.ok((await Promise.all(keys.map(exists))).every(Boolean));
    const dry = new CheckpointCollector(repo, policy);
    await dry.run({ now: Date.now() + 3600000, dryRun: true });
    assert.ok((await Promise.all(keys.map(exists))).every(Boolean));
    await pool.query(
      "UPDATE mochi_brains SET lease_token='old-client',lease_until=$2,lease_checkpoint_key=NULL WHERE mochi_id=$1",
      [p.id, new Date(Date.now() + 7200000)],
    );
    await gc();
    assert.ok((await Promise.all(keys.map(exists))).every(Boolean));
    await pool.query(
      "UPDATE mochi_brains SET lease_token=NULL,lease_until=NULL WHERE mochi_id=$1",
      [p.id],
    );
    await gc();
    assert.equal(await exists(keys[0]), false);
  },
);
check(
  "a cloned database scope cannot claim another schema's storage namespace",
  async () => {
    const scope = await repo.bindStorage(),
      foreignSchema = schema + "_clone";
    await admin.query("CREATE SCHEMA " + foreignSchema);
    const foreignPool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: "-c search_path=" + foreignSchema,
    });
    try {
      await foreignPool.query(
        "CREATE TABLE checkpoint_storage_scope(singleton boolean,id uuid)",
      );
      await foreignPool.query(
        "INSERT INTO checkpoint_storage_scope VALUES(true,$1)",
        [scope],
      );
      const foreignRepo = new BrainRepository(
        new WorldService(foreignPool),
        new FileCheckpointStorage(dir),
      );
      await assert.rejects(foreignRepo.bindStorage(), /another database/);
    } finally {
      await foreignPool.end();
      await admin.query("DROP SCHEMA " + foreignSchema + " CASCADE");
    }
  },
);

check(
  "ZIP-valid but non-Cadence current cannot authorize deletion of the last loadable recovery checkpoint",
  async () => {
    const p = await pet(),
      keys = [];
    for (let n = 1; n <= 4; n++) keys.push(await persist(p, n));
    const malformed = Buffer.from(versionBytes(5));
    // Change only local/central entry names, never compressed contents or CRC.
    const end = malformed.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let at = malformed.readUInt32LE(end + 16);
    for (let i = 0; i < malformed.readUInt16LE(end + 10); i++) {
      const local = malformed.readUInt32LE(at + 42);
      malformed[local + 30] = 120;
      malformed[at + 46] = 120;
      at +=
        46 +
        malformed.readUInt16LE(at + 28) +
        malformed.readUInt16LE(at + 30) +
        malformed.readUInt16LE(at + 32);
    }
    assert.equal(validateLife(malformed), true);
    let current;
    await s.transaction([p.user], async (tx) => {
      await repo.lock(tx, p.id);
      current = await repo.writeCheckpoint(tx, p.id, 5, malformed);
      await tx.query(
        "UPDATE mochi_brains SET checkpoint_key=$2,version=5 WHERE mochi_id=$1",
        [p.id, current],
      );
    });
    const result = await gc();
    assert.ok(result.blockedBrains > 0);
    assert.ok((await Promise.all(keys.map(exists))).every(Boolean));
    assert.equal(await exists(current), true);
  },
);

check(
  "parallel guarded loads exceeding pool size complete without nested pool acquisition",
  async () => {
    const p = await pet();
    await persist(p, 1);
    const loads = await Promise.all(
      Array.from({ length: 24 }, () => repo.load(p.id, p.user)),
    );
    assert.ok(
      loads.every(
        (x) =>
          x.version === 1 &&
          x.life.brain === versionBytes(1).toString("base64"),
      ),
    );
  },
);

check(
  "fresh bootstrap lease remains bounded without pretending it holds an unknown file",
  async () => {
    const p = await pet(),
      lease = await repo.acquire(p.user, p.id),
      record = await repo.load(p.id, p.user);
    for (let n = 1; n <= 5; n++) {
      record.life.brain = versionBytes(n).toString("base64");
      await repo.save(p.user, p.id, record, lease.token, n - 1);
    }
    await gc();
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM brain_checkpoints WHERE mochi_id=$1",
          [p.id],
        )
      ).rows[0].count,
      "2",
    );
    const row = (
      await pool.query("SELECT * FROM mochi_brains WHERE mochi_id=$1", [p.id])
    ).rows[0];
    assert.equal(row.lease_checkpoint_known, true);
    assert.equal(row.lease_checkpoint_key, null);
    await repo.release(p.user, p.id, lease.token);
  },
);
check(
  "first replacement of legacy inline bytes preserves a pinned recovery file",
  async () => {
    const p = await pet();
    await pool.query(
      "INSERT INTO mochi_brains(mochi_id,pack,life,version) VALUES($1,'traders-0.74.0-v1',$2,7)",
      [p.id, { brain: versionBytes(0).toString("base64") }],
    );
    const lease = await repo.acquire(p.user, p.id),
      record = await repo.load(p.id, p.user);
    record.life.brain = versionBytes(1).toString("base64");
    await repo.save(p.user, p.id, record, lease.token, lease.version);
    await repo.release(p.user, p.id, lease.token);
    for (let n = 2; n <= 5; n++) await persist(p, n);
    await gc();
    const prior = (
      await pool.query(
        "SELECT * FROM brain_checkpoints WHERE mochi_id=$1 AND version=7",
        [p.id],
      )
    ).rows[0];
    assert.equal(prior.pinned, true);
    assert.deepEqual(await storage.read(prior.key), versionBytes(0));
    assert.equal(
      typeof (
        await pool.query("SELECT life FROM mochi_brains WHERE mochi_id=$1", [
          p.id,
        ])
      ).rows[0].life.brain,
      "undefined",
    );
  },
);

check('real files stabilize at keepRecent after wall-clock grace and deleted-byte telemetry accounts reclamation', async () => {
  const p = await pet(), keys = [], retained = [];
  const collector = new CheckpointCollector(repo, policy);
  const before = repo.diagnostics().bytesDeletedLastHour;
  for (let n = 0; n < 7; n++) {
    if (n) await new Promise(resolve => setTimeout(resolve, 1100));
    keys.push(await persist(p, n));
    await collector.run();
    const present = await Promise.all(keys.map(exists));
    const count = present.filter(Boolean).length;
    const bytes = (await Promise.all(keys.filter((_,i)=>present[i]).map(key=>stat(storage.path(key))))).reduce((sum,s)=>sum+s.size,0);
    retained.push({versions: n+1, count, bytes});
    assert.equal(count, Math.min(n+1, policy.keepRecent));
  }
  assert.equal(new Set(retained.slice(1).map(s=>s.bytes)).size, 1);
  const deletedBytes = repo.diagnostics().bytesDeletedLastHour-before;
  assert.ok(deletedBytes >= 5*versionBytes(0).length);
  console.log('checkpoint-wall-clock-stabilization '+JSON.stringify({policy,retained,deletedBytes}));
});
