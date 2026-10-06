import {
  mkdir,
  readFile,
  open,
  rename,
  readdir,
  lstat,
  unlink,
  link,
} from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { validateLife } from "./checkpoint-format.mjs";
import { GameError } from "./service.mjs";
/** Checkpoint keys are opaque; paths never leave the server. Replace this adapter for S3/R2. */
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const filePattern = /^[a-f0-9]{64}-\d+-[a-f0-9-]+\.life(?:\.tmp)?$/;
const scopePattern = /^managed-[a-f0-9-]{36}$/;
export class FileCheckpointStorage {
  constructor(
    directory = process.env.CHECKPOINT_DIRECTORY ?? resolve("data/checkpoints"),
  ) {
    this.directory = directory;
  }
  path(key) {
    const parts = key.split("/");
    if (
      !(parts.length === 1 && filePattern.test(parts[0])) &&
      !(
        parts.length === 2 &&
        scopePattern.test(parts[0]) &&
        filePattern.test(parts[1])
      )
    )
      throw new Error("Invalid checkpoint key");
    return resolve(this.directory, key);
  }
  async bind(scope, owner) {
    const folder = "managed-" + scope;
    if (!scopePattern.test(folder)) throw Error("Invalid storage scope");
    const directory = resolve(this.directory, folder);
    await mkdir(directory, { recursive: true });
    if (!(await lstat(directory)).isDirectory())
      throw Error("Checkpoint namespace must be a directory");
    const marker = resolve(directory, ".owner.json");
    let saved;
    try {
      saved = JSON.parse(await readFile(marker, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT")
        throw Error("Checkpoint namespace ownership cannot be verified");
      const files = await readdir(directory);
      if (files.some((x) => filePattern.test(x)))
        throw Error("Unbound nonempty checkpoint namespace; retained");
      const tmp = resolve(directory, ".owner-" + randomUUID() + ".tmp");
      const handle = await open(tmp, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(owner));
        await handle.sync();
        await handle.close();
        try {
          await link(tmp, marker);
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
        }
      } finally {
        await handle.close().catch(() => {});
        await unlink(tmp).catch(() => {});
      }
      const dirHandle = await open(directory, "r");
      try {
        await dirHandle.sync();
      } finally {
        await dirHandle.close();
      }
      saved = JSON.parse(await readFile(marker, "utf8"));
    }
    if (JSON.stringify(saved) !== JSON.stringify(owner))
      throw Error("Checkpoint namespace belongs to another database; retained");
  }
  async write(mochiId, version, bytes, scope = null) {
    const folder = scope ? "managed-" + scope : "";
    if (scope && !scopePattern.test(folder))
      throw Error("Invalid storage scope");
    const directory = resolve(this.directory, folder);
    await mkdir(directory, { recursive: true });
    if (!(await lstat(directory)).isDirectory())
      throw Error("Checkpoint namespace must be a directory");
    if (scope) {
      const root = await open(this.directory, "r");
      try {
        await root.sync();
      } finally {
        await root.close();
      }
    }
    // Domain is part of managed identity; battle never uses this adapter.
    const key =
      (folder ? folder + "/" : "") +
      digest(Buffer.from(scope ? "trading:" + mochiId : mochiId)) +
      `-${version}-${randomUUID()}.life`;
    const handle = await open(this.path(key + ".tmp"), "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(this.path(key + ".tmp"), this.path(key));
    // Confirm the rename durably before allowing the PostgreSQL pointer commit.
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    return key;
  }
  async read(key) {
    return readFile(this.path(key));
  }
  async list(scope = null) {
    const folder = scope ? "managed-" + scope : "";
    if (scope && !scopePattern.test(folder))
      throw Error("Invalid storage scope");
    let names;
    try {
      const folderPath = resolve(this.directory, folder);
      if (!(await lstat(folderPath)).isDirectory())
        throw Error("Checkpoint namespace must be a directory");
      names = await readdir(folderPath);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    const files = [];
    for (const name of names) {
      if (!filePattern.test(name)) continue;
      const key = (folder ? folder + "/" : "") + name;
      const info = await lstat(this.path(key));
      if (!info.isFile())
        throw Error("Non-regular checkpoint file; GC refused");
      files.push({
        key,
        bytes: info.size,
        at: info.mtimeMs,
        identity: name.slice(0, 64),
        version: Number(name.split("-")[1]),
        temporary: name.endsWith(".tmp"),
      });
    }
    return files;
  }
  async remove(key) {
    await unlink(this.path(key));
  }
}
export class BrainRepository {
  constructor(service, storage = new FileCheckpointStorage()) {
    this.service = service;
    this.pool = service.pool;
    this.storage = storage;
    this.mode = "PostgreSQL + checkpoint files";
    this.checkpointMetrics = {
      saves: [],
      writes: [],
      deleted: [],
      deduplicated: 0,
      gcFailures: 0,
      perBrain: {},
    };
  }
  async scope(tx = this.pool) {
    const row = (
      await tx.query(
        "SELECT id FROM checkpoint_storage_scope WHERE singleton=true",
      )
    ).rows[0];
    if (!row) throw Error("Checkpoint lifecycle migration required");
    return row.id;
  }
  async bindStorage(tx = this.pool) {
    const scope = await this.scope(tx);
    const owner = (
      await tx.query(
        "SELECT current_database() AS database, current_schema() AS schema, inet_server_addr()::text AS server, current_setting('port') AS port",
      )
    ).rows[0];
    await this.storage.bind(scope, owner);
    return scope;
  }
  async readVerified(tx, key) {
    const meta = (
      await tx.query("SELECT * FROM brain_checkpoints WHERE key=$1", [key])
    ).rows[0];
    const bytes = await this.storage.read(key);
    if (
      meta &&
      (digest(bytes) !== meta.sha256 || bytes.length !== Number(meta.bytes))
    )
      throw new GameError(
        "Referenced checkpoint is corrupt; restore a verified backup",
        503,
      );
    if (bytes.length < 1000 || bytes[0] !== 80 || bytes[1] !== 75)
      throw new GameError(
        "Referenced checkpoint is corrupt; restore a verified backup",
        503,
      );
    if (!meta) validateLife(bytes);
    return bytes;
  }
  async writeCheckpoint(
    tx,
    id,
    version,
    bytes,
    previousKey = null,
    { nativeVerified = false } = {},
  ) {
    // Callers hold brain:id until authoritative pointer/state transaction commits.
    const metricsAt = Date.now();
    this.checkpointMetrics.saves = this.checkpointMetrics.saves.filter(
      (x) => metricsAt - x.at < 3600000,
    );
    this.checkpointMetrics.saves.push({ at: metricsAt, id });
    if (!previousKey) {
      const prior = (
        await tx.query(
          "SELECT life,version FROM mochi_brains WHERE mochi_id=$1",
          [id],
        )
      ).rows[0];
      if (typeof prior?.life?.brain === "string") {
        // Preserve an inline legacy recovery anchor before replacing its only DB bytes.
        validateLife(bytes);
        previousKey = await this.createCheckpoint(
          tx,
          id,
          prior.version,
          Buffer.from(prior.life.brain, "base64"),
          { pinned: true },
        );
      }
    }
    const hash = digest(bytes);
    if (previousKey) {
      const previous = (
        await tx.query(
          "SELECT sha256 FROM brain_checkpoints WHERE key=$1 AND mochi_id=$2 AND domain='trading'",
          [previousKey, id],
        )
      ).rows[0];
      if (previous?.sha256 === hash) {
        // Never reuse a missing/corrupt file even if its old catalog digest matches.
        await this.readVerified(tx, previousKey);
        this.checkpointMetrics.deduplicated++;
        return previousKey;
      }
    }
    return this.createCheckpoint(tx, id, version, bytes, { nativeVerified });
  }
  async createCheckpoint(
    tx,
    id,
    version,
    bytes,
    { nativeVerified = false, pinned = false } = {},
  ) {
    validateLife(bytes);
    const key = await this.storage.write(
      id,
      version,
      bytes,
      await this.bindStorage(tx),
    );
    const now = Date.now();
    this.checkpointMetrics.writes = this.checkpointMetrics.writes.filter(
      (x) => now - x.at < 3600000,
    );
    this.checkpointMetrics.writes.push({ at: now, bytes: bytes.length });
    this.checkpointMetrics.perBrain[id] =
      (this.checkpointMetrics.perBrain[id] ?? 0) + 1;
    await tx.query(
      "INSERT INTO brain_checkpoints(key,mochi_id,version,sha256,bytes,host_verified,pinned) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [key, id, version, digest(bytes), bytes.length, nativeVerified, pinned],
    );
    return key;
  }
  async pin(id, key, pinned = true) {
    return this.service.transaction([], async (tx) => {
      await this.lock(tx, id);
      if (pinned) await this.readVerified(tx, key);
      const row = await tx.query(
        "UPDATE brain_checkpoints SET pinned=$3 WHERE mochi_id=$1 AND key=$2 RETURNING key",
        [id, key, pinned],
      );
      if (!row.rows.length) throw Error("Unknown checkpoint identity");
    });
  }
  diagnostics() {
    const now = Date.now(),
      m = this.checkpointMetrics;
    m.writes = m.writes.filter((x) => now - x.at < 3600000);
    m.deleted = m.deleted.filter((x) => now - x.at < 3600000);
    m.saves = m.saves.filter((x) => now - x.at < 3600000);
    return {
      ...this.inventory,
      bytesWrittenLastHour: m.writes.reduce((n, x) => n + x.bytes, 0),
      checkpointsCreatedLastHour: m.writes.length,
      checkpointsDeletedLastHour: m.deleted.length,
      bytesDeletedLastHour: m.deleted.reduce((n, x) => n + x.bytes, 0),
      identicalWritesAvoided: m.deduplicated,
      gcFailures: m.gcFailures,
      validationFailures: m.validationFailures ?? 0,
      validationLastError: m.validationLastError ?? null,
      perBrainCreated: { ...m.perBrain },
      perBrainSaveAttemptsLastHour: m.saves.reduce((n, x) => {
        n[x.id] = (n[x.id] ?? 0) + 1;
        return n;
      }, {}),
      gcDurationMs: m.gcDurationMs,
      gcLastError: m.gcLastError ?? null,
      policy: this.retentionPolicy,
    };
  }
  async lock(tx, id) {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "brain:" + id,
    ]);
  }
  async ensure(tx, id) {
    await tx.query(
      "INSERT INTO mochi_brains(mochi_id,pack,life) VALUES($1,'traders-0.74.0-v1','{}') ON CONFLICT DO NOTHING",
      [id],
    );
    return (
      await tx.query(
        "SELECT * FROM mochi_brains WHERE mochi_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
  }
  async acquire(userId, id) {
    await this.service.pet(id);
    return this.service.transaction([userId], async (tx) => {
      await this.service.owner(tx, userId, id);
      await this.lock(tx, id);
      const brain = await this.ensure(tx, id);
      if (
        brain.lease_until &&
        new Date(brain.lease_until).getTime() > this.service.now()
      )
        throw new GameError(
          "This Mochi is already active in another room. Close that room or wait two minutes.",
          409,
        );
      const token = randomUUID();
      await tx.query(
        "UPDATE mochi_brains SET lease_token=$2,lease_until=$3,lease_checkpoint_key=checkpoint_key,lease_checkpoint_known=true WHERE mochi_id=$1",
        [id, token, new Date(this.service.now() + 120000)],
      );
      return { token, version: brain.version };
    });
  }
  async heartbeat(userId, id, token) {
    return this.service.transaction([userId], async (tx) => {
      await this.service.owner(tx, userId, id);
      const result = await tx.query(
        "UPDATE mochi_brains SET lease_until=$3 WHERE mochi_id=$1 AND lease_token=$2 AND lease_until>$4 RETURNING version",
        [
          id,
          token,
          new Date(this.service.now() + 120000),
          new Date(this.service.now()),
        ],
      );
      if (!result.rows.length)
        throw new GameError("Room lease expired. Reload the room.", 409);
      return { version: result.rows[0].version };
    });
  }
  async release(userId, id, token) {
    return this.service.transaction([userId], async (tx) => {
      await this.service.owner(tx, userId, id);
      await this.lock(tx, id);
      await tx.query(
        "UPDATE mochi_brains SET lease_token=NULL,lease_until=NULL,lease_checkpoint_key=NULL,lease_checkpoint_known=false WHERE mochi_id=$1 AND lease_token=$2",
        [id, token],
      );
      return { released: true };
    });
  }
  async load(id, userId, tx = null) {
    if (!tx)
      return this.service.transaction([userId], async (client) => {
        await this.lock(client, id);
        return this.load(id, userId, client);
      });
    const pet = (await tx.query("SELECT * FROM mochis WHERE id=$1", [id]))
      .rows[0];
    if (!pet || pet.user_id !== userId)
      throw new GameError("This is not your Mochi", 403);
    const brain = (
      await tx.query("SELECT * FROM mochi_brains WHERE mochi_id=$1", [id])
    ).rows[0];
    const body = (
      await tx.query("SELECT state FROM mochi_pet_state WHERE mochi_id=$1", [
        id,
      ])
    ).rows[0].state;
    const state = {
      ...pet.state,
      economy: await this.service.economy(userId, id, tx),
      homeSlots: pet.profile.homeSlots ?? {},
    };
    let encoded = brain?.checkpoint_key
      ? (await this.readVerified(tx, brain.checkpoint_key)).toString("base64")
      : brain?.life?.brain;
    if (!encoded)
      encoded = (
        await readFile("web/brains/traders-0.74.0-v1/basic.life")
      ).toString("base64");
    const life = {
      version: "mochi-traders-page/1",
      pack: brain?.pack ?? "traders-0.74.0-v1",
      at: Date.now(),
      world: body.world,
      arousal: brain?.life?.arousal,
      page: brain?.life?.page ?? { name: pet.name },
      trader: state,
      brain: encoded,
    };
    return { owner: userId, state, life, version: brain?.version ?? 0 };
  }
  async save(userId, id, record, token, version) {
    return this.service.transaction([userId], async (tx) => {
      const pet = await this.service.owner(tx, userId, id);
      await this.lock(tx, id);
      const brain = await this.ensure(tx, id);
      if (
        !token ||
        brain.lease_token !== token ||
        new Date(brain.lease_until).getTime() <= this.service.now() ||
        brain.version !== version
      )
        throw new GameError(
          "Another session updated this brain. Reload to continue safely.",
          409,
        );
      const life = record.life;
      if (
        life?.pack !== brain.pack ||
        life?.version !== "mochi-traders-page/1" ||
        record.state?.mochiId !== id
      )
        throw new GameError("Checkpoint identity or pack mismatch");
      if (typeof life.brain !== "string" || life.brain.length > 24000000)
        throw new GameError("Invalid brain checkpoint");
      const bytes = Buffer.from(life.brain, "base64");
      if (bytes.length < 1000 || bytes[0] !== 80 || bytes[1] !== 75)
        throw new GameError("Invalid Cadence life format");
      const metadata = { ...life };
      delete metadata.brain;
      delete metadata.trader;
      // Client economy, awards, public profile and portfolio results are never accepted.
      pet.state.personality = {
        ...pet.state.personality,
        ...record.state.personality,
      };
      pet.state.name = String(life.page?.name ?? pet.name).slice(0, 24);
      if (!life.world?.m?.needs) throw new GameError("Missing room state");
      for (const v of Object.values(life.world.m.needs))
        if (!Number.isFinite(v) || v < 0 || v > 1)
          throw new GameError("Invalid pet need");
      const key = await this.writeCheckpoint(
        tx,
        id,
        version + 1,
        bytes,
        brain.checkpoint_key,
      );
      await tx.query("UPDATE mochi_pet_state SET state=$2 WHERE mochi_id=$1", [
        id,
        { world: life.world, personality: pet.state.personality },
      ]);
      await tx.query(
        "UPDATE mochis SET name=$2,state=$3,last_pet_tick=$4,updated_at=now() WHERE id=$1",
        [id, pet.state.name, pet.state, this.service.now()],
      );
      await tx.query(
        "UPDATE mochi_brains SET checkpoint_key=$2,life=$3,version=version+1,updated_at=now(),lease_until=$4 WHERE mochi_id=$1",
        [id, key, metadata, new Date(this.service.now() + 120000)],
      );
      return { saved: true, version: version + 1 };
    });
  }
}
