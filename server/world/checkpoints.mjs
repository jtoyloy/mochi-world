import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { GameError } from "./service.mjs";
/** Checkpoint keys are opaque; paths never leave the server. Replace this adapter for S3/R2. */
export class FileCheckpointStorage {
  constructor(directory = resolve("data/checkpoints")) {
    this.directory = directory;
  }
  async write(mochiId, version, bytes) {
    await mkdir(this.directory, { recursive: true });
    const key =
      createHash("sha256").update(mochiId).digest("hex") +
      `-${version}-${randomUUID()}.life`;
    const tmp = resolve(this.directory, key + ".tmp");
    await writeFile(tmp, bytes);
    await rename(tmp, resolve(this.directory, key));
    return key;
  }
  async read(key) {
    if (!/^[a-f0-9]{64}-\d+-[a-f0-9-]+\.life$/.test(key))
      throw new Error("Invalid checkpoint key");
    return readFile(resolve(this.directory, key));
  }
}
export class BrainRepository {
  constructor(service, storage = new FileCheckpointStorage()) {
    this.service = service;
    this.pool = service.pool;
    this.storage = storage;
    this.mode = "PostgreSQL + checkpoint files";
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
        "UPDATE mochi_brains SET lease_token=$2,lease_until=$3 WHERE mochi_id=$1",
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
      await tx.query(
        "UPDATE mochi_brains SET lease_token=NULL,lease_until=NULL WHERE mochi_id=$1 AND lease_token=$2",
        [id, token],
      );
      return { released: true };
    });
  }
  async load(id, userId) {
    const pet = (
      await this.pool.query("SELECT * FROM mochis WHERE id=$1", [id])
    ).rows[0];
    if (!pet || pet.user_id !== userId)
      throw new GameError("This is not your Mochi", 403);
    const brain = (
      await this.pool.query("SELECT * FROM mochi_brains WHERE mochi_id=$1", [
        id,
      ])
    ).rows[0];
    const body = (
      await this.pool.query(
        "SELECT state FROM mochi_pet_state WHERE mochi_id=$1",
        [id],
      )
    ).rows[0].state;
    const state = {
      ...pet.state,
      economy: await this.service.economy(userId, id),
      homeSlots: pet.profile.homeSlots ?? {},
    };
    let encoded = brain?.checkpoint_key
      ? (await this.storage.read(brain.checkpoint_key)).toString("base64")
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
      const key = await this.storage.write(id, version + 1, bytes),
        metadata = { ...life };
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
