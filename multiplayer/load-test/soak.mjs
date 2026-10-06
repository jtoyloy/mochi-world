import { resolve } from "node:path";
import { maximum, percentile } from "./stats.mjs";
import { processTree } from "./process-tree.mjs";
import { fork } from "node:child_process";
import { readFile, writeFile, appendFile, mkdir, rm } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID, createHash } from "node:crypto";
import os from "node:os";
import pg from "pg";
import WebSocket from "ws";
import {
  ITEMS,
  SHOPS,
  TROPHIES,
  ACHIEVEMENTS,
} from "../../web/js/world/catalog.js";
import { NavigationService } from "../../web/js/game/NavigationService.js";
import { beastArchetype } from "../../web/js/isoworld/projection.js";
import { SPAWNS } from "../../web/js/game/adventure.js";
import { ROOMS, roomSpec, walkable } from "../../web/js/game/model.js";
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [
      "multiplayer/load-test/soak.mjs",
      "server/index.mjs",
      "server/social/multiplayer.mjs",
      "server/world/runtime-metrics.mjs",
      "server/world/checkpoints.mjs",
      "server/adventure/service.mjs",
      "web/js/game/NavigationService.js",
      "web/js/game/CompanionFollowController.js",
    ].map(async (path) => [
      path,
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    ]),
  ),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const counts = (args.users ?? "10,25,40,75,150").split(",").map(Number);
const duration = Number(
  args.seconds ??
    { smoke: 300, test: 1800, soak: 14400 }[args.profile ?? "smoke"],
);
const capacity = Number(args.capacity ?? 40),
  port = Number(args.port ?? 8898);
if (!process.env.TEST_DATABASE_URL)
  throw Error(
    "TEST_DATABASE_URL required; only an isolated disposable schema is used",
  );
if (
  counts.some((n) => !Number.isInteger(n) || n < 1) ||
  !Number.isFinite(duration) ||
  duration < 1
)
  throw Error("Invalid load arguments");
let seed = Number(args.seed ?? 42) >>> 0;
const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = `http://127.0.0.1:${port}`;
const rooms = (
  args.rooms ?? "town,town,town,forest,lake,market,exchange"
).split(",");
const movementProbability = Number(args.move ?? 0.45),
  stopProbability = Number(args.stop ?? 0.15),
  emoteProbability = Number(args.emote ?? 0.035),
  interactionProbability = Number(args.interact ?? 0.025);
const transitionProbability = Number(args.transition ?? 0.025),
  reconnectProbability = Number(args.reconnect ?? 0.002);
if (
  ![
    transitionProbability,
    reconnectProbability,
    movementProbability,
    stopProbability,
    emoteProbability,
    interactionProbability,
  ].every((p) => Number.isFinite(p) && p >= 0 && p <= 1)
)
  throw Error("Probabilities must be between zero and one");

export class Actor {
  constructor(cookie, room, petId, randomFn = random) {
    Object.assign(this, {
      cookie,
      room,
      petId,
      random: randomFn,
      seq: 0,
      waiters: [],
      sampleIndex: 0,
      wrongCompanions: 0,
      updates: new Map(),
      latencies: [],
      gaps: [],
      errors: {},
      reconnects: 0,
      disconnects: 0,
      late: 0,
      companions: 0,
    });
  }
  async connect() {
    this.ws = new WebSocket(origin.replace("http", "ws") + "/socket", {
      headers: { Cookie: this.cookie, Origin: origin },
    });
    this.ws.on("error", (e) => {
      this.errors[e.message] = (this.errors[e.message] ?? 0) + 1;
    });
    this.ws.on("close", () => this.disconnects++);
    this.ws.on("message", (raw) => {
      const e = JSON.parse(raw),
        now = Date.now();
      this.lastMessage = { type: e.type, moveSeq: e.data?.moveSeq };
      if (e.type === "roomSnapshot") {
        this.snapshot = e.data;
        this.selfId = e.data.selfId;
        this.self = e.data.players.find((p) => p.userId === this.selfId);
        this.updates.clear();
      }
      if (e.type === "playerMoved") {
        const previous = this.updates.get(e.data.userId);
        if (previous && e.data.serverTime < previous.serverTime) this.late++;
        if (previous)
          this.gaps[this.sampleIndex % 10000] = now - previous.receivedAt;
        this.updates.set(e.data.userId, { ...e.data, receivedAt: now });
        this.latencies[this.sampleIndex++ % 10000] = now - e.data.serverTime;
        if (e.data.companion) this.companions++;
        if (e.data.userId === this.selfId) {
          if (e.data.companion?.id !== this.petId) this.wrongCompanions++;
          this.self = e.data;
          if (this.trace) this.trace.push(e.data);
        }
      }
      if (e.type === "playerLeft") this.updates.delete(e.data.userId);
      if (["error", "moveRejected"].includes(e.type)) {
        if (e.type === "moveRejected") this.rejections ??= [];
        if (e.type === "moveRejected")
          this.rejections.push({
            room: this.room,
            requested: this.pendingDestination,
            authoritative: e.data,
          });
        this.errors[e.data.message] = (this.errors[e.data.message] ?? 0) + 1;
        if (e.type === "moveRejected")
          for (const w of [...this.waiters])
            if (w.type === "moveAccepted") {
              clearTimeout(w.timer);
              this.waiters.splice(this.waiters.indexOf(w), 1);
              w.reject(Error(e.data.message));
            }
      }
      for (const w of [...this.waiters])
        if (w.type === e.type && w.predicate(e.data)) {
          clearTimeout(w.timer);
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(e.data);
        }
    });
    const ready = await this.wait("ready");
    this.selfId = ready.userId;
    await this.join(this.room);
    this.keepalive = setInterval(
      () => this.send("ping", { clientTime: Date.now() }),
      10000,
    );
    this.keepalive.unref();
  }
  wait(type, predicate = () => true, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const w = { type, predicate, resolve, reject };
      w.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(
          Error(
            "Timeout " +
              type +
              " " +
              JSON.stringify({
                room: this.room,
                seq: this.seq,
                selfId: this.selfId,
                errors: this.errors,
                self: this.self,
                lastMessage: this.lastMessage,
              }),
          ),
        );
      }, timeout);
      this.waiters.push(w);
    });
  }
  send(type, data) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ type, data }));
  }
  async join(room) {
    await this.beforeJoin?.(room);
    const pending = this.wait("roomSnapshot");
    this.send("joinRoom", { roomId: room });
    await pending;
    this.room = room;
    this.seq = Math.max(this.seq, this.self?.moveSeq ?? 0);
  }
  async move(x, y) {
    this.pendingDestination = { x, y };
    const seq = ++this.seq,
      pending = this.wait("moveAccepted", (d) => d.moveSeq === seq);
    this.send("move", { x, y, seq, roomId: this.room, clientTime: Date.now() });
    return pending;
  }
  async close() {
    clearInterval(this.keepalive);
    if (this.ws.readyState === 3) return;
    const closed = once(this.ws, "close");
    this.ws.close();
    await closed;
  }
}
async function api(path, data, cookie) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok) throw Error(JSON.stringify(result));
  return { result, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
async function follow(actor, species) {
  await actor.join("town");
  await sleep(250);
  const samples = [];
  actor.trace = [];
  const capture = (label) =>
    samples.push({
      label,
      room: actor.room,
      owner: {
        x: actor.self.x,
        y: actor.self.y,
        moving: actor.self.moving,
        rotation: actor.self.rotation,
      },
      companion: actor.self.companion,
    });
  capture("spawn");
  for (const [label, x, y] of [
    ["walk", 750, 840],
    ["turn", 750, 640],
    ["resume", 950, 640],
  ]) {
    await actor.move(x, y);
    const stopped = actor.wait(
      "playerMoved",
      (d) => d.userId === actor.selfId && d.moveSeq === actor.seq && !d.moving,
    );
    await sleep(700);
    capture(label);
    await stopped;
    await sleep(2000);
    capture(label + "-settled");
  }
  await actor.join("yard");
  await actor.move(750, 590);
  await actor.wait(
    "playerMoved",
    (d) => d.userId === actor.selfId && d.moveSeq === actor.seq && !d.moving,
  );
  await sleep(2000);
  capture("transition-settled");
  const distance = (s) =>
    Math.hypot(s.owner.x - s.companion.x, s.owner.y - s.companion.y);
  const passed =
    samples.every(
      (s) =>
        beastArchetype(s.companion) ===
        (species === "Moonfox" ? "moonfox" : "woodland-deer"),
    ) &&
    samples
      .filter((s) => ["walk", "turn", "resume"].includes(s.label))
      .every((s) => s.owner.moving) &&
    samples.every((s) => s.companion?.id === actor.petId) &&
    samples
      .filter((s) => s.label.endsWith("settled"))
      .every(
        (s) =>
          !s.owner.moving && distance(s) < 180 && s.companion.followSpeed < 5,
      ) &&
    Math.hypot(
      samples[2].companion.x - samples[0].companion.x,
      samples[2].companion.y - samples[0].companion.y,
    ) > 80;
  const trace = actor.trace;
  actor.trace = null;
  return { species, passed, samples, trace };
}
async function run(users) {
  const schema = "soak_" + randomUUID().replaceAll("-", ""),
    admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await mkdir("data", { recursive: true });
  const usernamePrefix = "soak_" + schema.slice(5, 13);
  const checkpointDirectory = resolve("data", schema + "-checkpoints");
  const progressFile = `data/multiplayer-${users}-${duration}s-${schema}-windows.jsonl`;
  await writeFile(progressFile, "");
  let telemetryWrites = Promise.resolve();
  let pool,
    child,
    interval,
    actors = [],
    samples = [],
    errors = [],
    serverErrors = [],
    processSamples = [];
  const db = new URL(process.env.TEST_DATABASE_URL);
  db.searchParams.set("options", "-c search_path=" + schema);
  try {
    await admin.query("CREATE SCHEMA " + schema);
    pool = new pg.Pool({ connectionString: db.href });
    for (const path of [
      "server/schema.sql",
      "server/world/schema.sql",
      "server/social/schema.sql",
      "server/adventure/schema.sql",
    ])
      await pool.query(await readFile(path, "utf8"));
    for (const item of ITEMS)
      await pool.query("INSERT INTO items(id,data) VALUES($1,$2)", [
        item.id,
        item,
      ]);
    for (const room of ROOMS)
      await pool.query(
        "INSERT INTO world_rooms(id,name,data) VALUES($1,$2,$3)",
        [room.id, room.name, room],
      );
    for (const shop of SHOPS)
      await pool.query("INSERT INTO shops(id,slug,data) VALUES($1,$2,$3)", [
        shop.id,
        shop.slug,
        shop,
      ]);
    for (const trophy of TROPHIES)
      await pool.query("INSERT INTO trophies(id,data) VALUES($1,$2)", [
        trophy.id,
        trophy,
      ]);
    for (const definition of ACHIEVEMENTS)
      await pool.query(
        "INSERT INTO achievement_definitions(id,data) VALUES($1,$2)",
        [definition.id, definition],
      );
    child = fork("server/index.mjs", [], {
      env: {
        ...process.env,
        DATABASE_URL: db.href,
        DEV_MODE: "true",
        MOCK_TOKEN_MODE: "true",
        MARKET_MODE: "mock",
        PORT: String(port),
        HOST: "127.0.0.1",
        MAX_PLAYERS_PER_ROOM: String(capacity),
        MULTIPLAYER_METRICS: "true",
        CHECKPOINT_DIRECTORY: checkpointDirectory,
        MOVEMENT_HZ: "10",
        MULTIPLAYER_STORAGE: "memory",
      },
      silent: true,
    });
    child.stderr.on("data", (b) => serverErrors.push(b.toString()));
    child.on("message", (m) => {
      if (m.runtimeMetrics) {
        const sample = { at: Date.now(), ...m.runtimeMetrics };
        samples.push(sample);
        telemetryWrites = telemetryWrites
          .then(() => appendFile(progressFile, JSON.stringify(sample) + "\n"))
          .catch((error) => errors.push(error.message));
      }
    });
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error("Server startup failed: " + serverErrors.join(""));
      }),
    ]);
    child.stdout.on("data", () => {});
    for (let i = 0; i < users; i++) {
      const username = usernamePrefix + "_" + i;
      if (stopping) throw Error("Interrupted during setup");
      const login = await api("/api/dev/login", { username });
      const pet = await api(
        "/api/adopt",
        { name: i === 0 ? "Momo" : "Soak " + i },
        login.cookie,
      );
      const species = i % 2 ? "Woodland Deer" : "Moonfox";
      await pool.query(
        "UPDATE mochis SET profile=profile || $2::jsonb WHERE id=$1",
        [
          pet.result.id,
          JSON.stringify({
            variant: species,
            beast: { archetype: i % 2 ? "woodland-deer" : "moonfox" },
          }),
        ],
      );
      await pool.query(
        "INSERT INTO player_avatars(user_id,display_name,current_room_id,last_x,last_y) SELECT id,display_name,'forest',100,640 FROM users WHERE username=$1 ON CONFLICT(user_id) DO UPDATE SET current_room_id='forest',last_x=100,last_y=640",
        [username],
      );
      if (i === 0)
        await pool.query(
          "UPDATE player_avatars SET current_room_id='town',last_x=1309.38,last_y=964.55 WHERE user_id=(SELECT id FROM users WHERE username=$1)",
          [username],
        );
      const actor = new Actor(
        login.cookie,
        rooms[i % rooms.length],
        pet.result.id,
      );
      actor.beforeJoin = async (room) => {
        if (actor.snapshot && ["forest", "lake"].includes(room)) {
          await pool.query(
            "UPDATE player_avatars SET current_room_id=$2,last_x=100,last_y=640 WHERE user_id=$1",
            [actor.selfId, room],
          );
          await api("/api/active", { mochiId: actor.petId }, actor.cookie);
        }
      };
      actors.push(actor);
      await actor.connect();
      if (["forest", "lake"].includes(actor.room)) {
        await actor.move(100, 640);
        await actor.wait(
          "playerMoved",
          (d) => d.userId === actor.selfId && !d.moving,
        );
      }
    }
    const followResults =
      args.follow === "false"
        ? []
        : [
            await follow(actors[0], "Moonfox"),
            ...(users > 1 ? [await follow(actors[1], "Woodland Deer")] : []),
          ];
    // Return scripted acceptance actors to the distribution before measuring.
    for (let i = 0; i < Math.min(2, users); i++)
      await actors[i].join(rooms[i % rooms.length]);
    for (const a of actors) {
      a.errors = {};
      a.latencies = [];
      a.gaps = [];
      a.disconnects = 0;
      a.reconnects = 0;
      a.companions = 0;
    }
    samples = [];
    child.send("runtimeMetrics");
    await sleep(200);
    samples = [];
    await sleep(Number(args.warmup ?? 0) * 1000);
    const start = Date.now();
    const goals = new Map();
    for (const room of new Set(rooms)) {
      const nav = new NavigationService(room);
      nav.grid();
      const points = [];
      for (let y = 400; y <= 880; y += 120)
        for (let x = 100; x <= 1400; x += 150)
          if (
            walkable(room, x, y) &&
            SPAWNS.filter((s) => s.room === room).every((s) =>
              s.cells.every(([sx, sy]) => Math.hypot(x - sx, y - sy) > 310),
            )
          )
            points.push({ x, y });
      goals.set(room, points);
    }
    processSamples.push(await processTree(child.pid));
    interval = setInterval(() => {
      child.send("runtimeMetrics");
      processTree(child.pid)
        .then((s) => processSamples.push(s))
        .catch((e) => errors.push(e.message));
    }, 5000);
    while (!stopping && Date.now() - start < duration * 1000) {
      await Promise.all(
        actors.map(async (a) => {
          try {
            if (a.ws.readyState !== 1 || random() < reconnectProbability) {
              await a.close();
              a.reconnects++;
              await a.connect();
            } else if (random() < transitionProbability) {
              await a.join(rooms[Math.floor(random() * rooms.length)]);
              if (["forest", "lake"].includes(a.room)) await a.move(100, 640);
            } else if (random() < emoteProbability) {
              if (Date.now() - (a.emoteAt ?? 0) >= 1600) {
                a.send("emote", { emote: "wave" });
                a.emoteAt = Date.now();
              }
            } else if (random() < interactionProbability) {
              const prop = roomSpec(a.room).props.find(
                (p) =>
                  Math.hypot(
                    a.self.x - p[2],
                    a.self.y - Math.max(370, p[3] + 140),
                  ) <= 190,
              );
              if (prop) a.send("interact", { propId: prop[0] });
            } else if (random() < movementProbability) {
              const nav = new NavigationService(a.room);
              for (let attempt = 0; attempt < 5; attempt++) {
                const p = goals.get(a.room)[
                  Math.floor(random() * goals.get(a.room).length)
                ];
                if (nav.findPath(a.self, p)?.length) {
                  await a.move(p.x, p.y);
                  break;
                }
              }
            } else if (random() < stopProbability && a.self) {
              const point = a.self.seated?.approach ?? a.self;
              await a.move(point.x, point.y);
            }
            a.send("ping", { clientTime: Date.now() });
          } catch (e) {
            errors.push(e.message);
          }
        }),
      );
      await sleep(1000);
    }
    const loadDurationSeconds = (Date.now() - start) / 1000;
    clearInterval(interval);
    interval = null;
    child.send("runtimeMetrics");
    await sleep(200);
    const steady = samples.length > 1 ? samples.slice(1) : samples.slice(),
      totals = {};
    for (const s of steady)
      for (const [k, v] of Object.entries(s.counts))
        totals[k] = (totals[k] ?? 0) + v;
    const seconds = steady.reduce((n, s) => n + s.elapsed, 0),
      rates = Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, v / seconds]),
      );
    const timing = {};
    for (const s of steady)
      for (const [k, v] of Object.entries(s.timings)) {
        const t = (timing[k] ??= {
          count: 0,
          sum: 0,
          max: 0,
          buckets: Array(12).fill(0),
        });
        t.count += v.count;
        t.sum += v.sum;
        t.max = Math.max(t.max, v.max);
        v.buckets.forEach((n, i) => (t.buckets[i] += n));
      }
    for (const t of Object.values(timing)) {
      t.mean = t.sum / t.count;
      let n = 0;
      t.p95UpperMs = null;
      for (let i = 0; i < 12; i++) {
        n += t.buckets[i];
        if (n >= t.count * 0.95) {
          t.p95UpperMs = i === 11 ? null : 2 ** (i - 3);
          break;
        }
      }
    }
    const clients = {
      rejections: actors.flatMap((a) => a.rejections ?? []),
      wrongCompanions: actors.reduce((n, a) => n + a.wrongCompanions, 0),
      errors: actors.map((a) => a.errors),
      unexpectedDisconnects: actors.reduce(
        (n, a) => n + Math.max(0, a.disconnects - a.reconnects),
        0,
      ),
      reconnects: actors.reduce((n, a) => n + a.reconnects, 0),
      lateUpdates: actors.reduce((n, a) => n + a.late, 0),
      snapshotLatencyP95Ms: percentile(
        actors.flatMap((a) => a.latencies),
        0.95,
      ),
      arrivalGapP95Ms: percentile(
        actors.flatMap((a) => a.gaps),
        0.95,
      ),
      arrivalGapMaxMs: maximum(actors.flatMap((a) => a.gaps)),
      companionMessages: actors.reduce((n, a) => n + a.companions, 0),
      missingCompanions: actors.filter((a) => a.self?.companion?.id !== a.petId)
        .length,
    };
    await Promise.all(actors.map((a) => a.close()));
    await sleep(5000);
    child.send("runtimeMetrics");
    await sleep(200);
    const cleanup = samples.at(-1);
    const treeCpu = processSamples
      .slice(1)
      .map(
        (s, i) =>
          Math.max(0, s.cpuSeconds - processSamples[i].cpuSeconds) /
          ((s.at - processSamples[i].at) / 1000),
      );
    const result = {
      sourceHashes,
      processSamples,
      users,
      durationSeconds: loadDurationSeconds,
      capacity,
      rooms,
      distribution: rooms.reduce(
        (o, r) => ({ ...o, [r]: (o[r] ?? 0) + 1 }),
        {},
      ),
      host: {
        platform: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        logicalCpus: os.cpus().length,
        node: process.version,
      },
      configuration: {
        transitionProbability,
        reconnectProbability,
        movementProbability,
        stopProbability,
        emoteProbability,
        interactionProbability,
        movementHz: 10,
        seed: Number(args.seed ?? 42),
      },
      summary: {
        observedPlayersMin: Math.min(...steady.map((s) => s.players)),
        observedPlayersMax: Math.max(...steady.map((s) => s.players)),
        processTreeCpuMeanCores:
          treeCpu.reduce((n, v) => n + v, 0) / treeCpu.length,
        processTreeCpuP95Cores: percentile(treeCpu, 0.95),
        processTreeRssMaxBytes: Math.max(
          ...processSamples.map((s) => s.rssBytes),
        ),
        cpuMeanCores:
          steady.reduce((n, s) => n + s.cpuCores * s.elapsed, 0) / seconds,
        cpuP95Cores: percentile(
          steady.map((s) => s.cpuCores),
          0.95,
        ),
        rssMaxBytes: Math.max(...steady.map((s) => s.rss)),
        heapMaxBytes: Math.max(...steady.map((s) => s.heapUsed)),
        heapStartBytes: steady[0]?.heapUsed,
        heapEndBytes: steady.at(-1)?.heapUsed,
        eventLoopP99MaxMs: Math.max(...steady.map((s) => s.eventLoopP99Ms)),
        rates,
        timing,
      },
      clients,
      follow: followResults,
      cleanup,
      errors,
      serverErrors,
      samples,
    };
    result.interrupted = stopping;
    result.passed =
      !stopping &&
      !errors.length &&
      !serverErrors.length &&
      !clients.unexpectedDisconnects &&
      !clients.missingCompanions &&
      !clients.wrongCompanions &&
      !clients.lateUpdates &&
      !cleanup.players &&
      !cleanup.rooms &&
      !cleanup.connections &&
      !cleanup.companions &&
      followResults.every((r) => r.passed) &&
      !cleanup.adventureStates &&
      !cleanup.adventureInstances &&
      timing.tickDurationMs.max < 100 &&
      steady.every(
        (s) => s.players === users && s.companions === users && !s.staleActors,
      ) &&
      !(totals.backpressureDrops ?? 0);
    if (!result.passed) process.exitCode = 1;
    await mkdir("assays", { recursive: true });
    const file = `assays/multiplayer-${users}-${duration}s.json`;
    await writeFile(file, JSON.stringify(result, null, 2) + "\n");
    console.log(
      JSON.stringify({
        file,
        passed: result.passed,
        summary: result.summary,
        clients,
        cleanup: {
          players: cleanup.players,
          rooms: cleanup.rooms,
          connections: cleanup.connections,
          adventureStates: cleanup.adventureStates,
        },
      }),
    );
  } catch (error) {
    process.exitCode = 1;
    await mkdir("assays", { recursive: true });
    const file = `assays/multiplayer-${users}-${duration}s-failure-${Date.now()}.json`;
    await writeFile(
      file,
      JSON.stringify(
        {
          users,
          durationRequestedSeconds: duration,
          passed: false,
          error: error.stack,
          sourceHashes,
          samples,
          serverErrors,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.error(JSON.stringify({ file, error: error.message }));
  } finally {
    clearInterval(interval);
    await Promise.allSettled(actors.map((a) => a.close()));
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await telemetryWrites;
    await rm(checkpointDirectory, { recursive: true, force: true });
    await pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    await admin.end();
  }
}
for (const users of counts) {
  if (stopping) break;
  await run(users);
}
