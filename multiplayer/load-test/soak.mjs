import { recordDisconnect } from "./disconnects.mjs";
import https from "node:https";
import { ImpairedTransport } from "./transport.mjs";
import { TOWN_INTERACTIONS, TOWN_RESIDENTS, residentAvailable, residentPosition } from "../../web/js/game/town.js";
import { SnapshotDecoder } from "../../web/js/game/network/snapshots.js";
import { resolve } from "node:path";
import { maximum, percentile } from "./stats.mjs";
import { processTree } from "./process-tree.mjs";
import { fork } from "node:child_process";
import { readFile, writeFile, appendFile, mkdir, rm, statfs, readdir, stat } from "node:fs/promises";
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
import { SPAWNS, RESOURCE_NODES } from "../../web/js/game/adventure.js";
import { ROOMS, roomSpec, walkable } from "../../web/js/game/model.js";
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [
      "multiplayer/load-test/soak.mjs",
      "multiplayer/load-test/transport.mjs",
      "multiplayer/load-test/disconnects.mjs",
      "server/index.mjs",
      "server/social/multiplayer.mjs",
      "server/world/runtime-metrics.mjs",
      "server/world/checkpoints.mjs",
      "server/world/checkpoint-retention.mjs",
      "server/world/checkpoint-format.mjs",
      "server/adventure/service.mjs",
      "web/js/game/NavigationService.js",
      "server/social/snapshots.mjs",
      "web/js/game/network/snapshots.js",
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
if (![Number(args.rtt ?? 0), Number(args.jitter ?? 0)].every(n=>Number.isFinite(n)&&n>=0&&n<=10000) || !Number.isFinite(Number(args.loss ?? 0)) || Number(args.loss ?? 0)<0 || Number(args.loss ?? 0)>1) throw Error("Invalid impairment arguments");
let seed = Number(args.seed ?? 42) >>> 0;
const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = args.origin ?? `http://127.0.0.1:${port}`;
if (args.origin && !["https://127.0.0.1:8899"].includes(args.origin)) throw Error("Only the local certification proxy is supported");
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
    this.transport = new ImpairedTransport({rtt: Number(args.rtt ?? 0), jitter: Number(args.jitter ?? 0), loss: Number(args.loss ?? 0), burst: args.burst === "true", random: this.random});
    this.ws = new WebSocket(origin.replace("http", "ws") + "/socket", {
      headers: { Cookie: this.cookie, Origin: origin },
      rejectUnauthorized: args.origin ? false : true,
    });
    const socket = this.ws;
    this.ws.on("error", (e) => {
      this.errors[e.message] = (this.errors[e.message] ?? 0) + 1;
    });
    this.ws.on("close", (code, reason) => recordDisconnect(this, socket, code, reason));
    const decoder = new SnapshotDecoder();
    this.ws.on("message", (raw) => {
      this.transport.schedule("in", () => { for (const e of decoder.consume(JSON.parse(raw))) this.receive(e); });
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
  receive(e) {
      if (e.type === "adventureRoom") this.adventureRoom = e.data;
      if (e.type === "battleDecision") { this.battleDecisions ??= []; this.battleDecisions.push(e.data); }
      const now = Date.now();
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
    if (this.ws.readyState === 1) { const socket = this.ws; this.transport.schedule("out", () => { if (socket.readyState === 1) socket.send(JSON.stringify({ type, data })); }); }
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
    this.requests ??= [];
    this.requests.push({type: "move", at: Date.now(), room: this.room, origin: {x: this.self.x, y: this.self.y}, destination: {x,y}, predicted: null, seq: this.seq+1});
    const seq = ++this.seq,
      pending = this.wait("moveAccepted", (d) => d.moveSeq === seq);
    this.send("move", { x, y, seq, roomId: this.room, clientTime: Date.now() });
    return pending;
  }
  async close() {
    clearInterval(this.keepalive);
    this.transport?.close();
    if (this.ws.readyState === 3) return;
    const closed = once(this.ws, "close");
    this.ws.plannedClose = true;
    this.ws.close();
    await closed;
  }
}
// Self-signed certificate exception is restricted to this local fixture.
async function localTLSFetch(url, options) {
  return new Promise((resolve,reject)=>{
    const req=https.request(url,{...options,rejectUnauthorized:false},res=>{
      const chunks=[];res.on("data",chunk=>chunks.push(chunk));res.on("end",()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,json:async()=>JSON.parse(Buffer.concat(chunks)),headers:{get:key=>key==="set-cookie" ? res.headers[key]?.[0] : res.headers[key]}}));
    });req.on("error",reject);req.end(options.body);
  });
}
async function api(path, data, cookie) {
  const r = await (args.origin ? localTLSFetch : fetch)(origin + path, {
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
// Supplemental mixed-workload correctness profile; never a capacity promotion arm.
async function exercise(actor, gather) {
  actor.exercise = [];
  const arrive = async point => { const accepted=await actor.move(point.x,point.y); if(accepted.moving) await actor.wait("playerMoved",d=>d.userId===actor.selfId&&d.moveSeq===actor.seq&&!d.moving); };
  const adventure = async data => {const pending=actor.wait("adventureResult");actor.send("adventure",data);return pending;};
  await actor.join("town"); const vendor=TOWN_RESIDENTS.find(n=>n.id==="mina");await arrive(vendor);
  const talked=actor.wait("npcDialogue",d=>d.id===vendor.id);actor.send("npc",{id:vendor.id});actor.exercise.push({phase:"vendor",at:Date.now(),reply:await talked});
  if(gather){await actor.join("forest");const node=RESOURCE_NODES.find(n=>n.id==="forest-soft"),goal=new NavigationService("forest").nearestWalkable(node);await arrive(goal);
    actor.exercise.push({phase:"gather-start",at:Date.now(),reply:await adventure({action:"gather",nodeId:node.id})});await sleep(300);
    actor.exercise.push({phase:"gather-cancel",at:Date.now(),reply:await adventure({action:"cancelGather"})});}
  await actor.join("yard");await arrive({x:600,y:420});
  if(actor.adventureRoom?.room!==actor.snapshot.instanceId)await actor.wait("adventureRoom",d=>d.room===actor.snapshot.instanceId);
  const mob=actor.adventureRoom.mobs.find(m=>m.hp>0);if(!mob)throw Error("No living safe Yard dummy");
  actor.exercise.push({phase:"combat-target",at:Date.now(),reply:await adventure({action:"target",targetId:mob.id})});await sleep(2500);
  actor.exercise.push({phase:"combat-stop",at:Date.now(),reply:await adventure({action:"stop"})});await actor.join("town");actor.exercised=true;
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
  const diskSamples = [];
  const checkpointDisk = async () => {
    let bytes=0, files=0, temporary=0; const dirs=[checkpointDirectory];
    while(dirs.length) { const dir=dirs.pop(); let entries;
      try {entries=await readdir(dir,{withFileTypes:true});} catch(e){if(e.code==='ENOENT')continue;throw e;}
      for(const entry of entries){const path=resolve(dir,entry.name);if(entry.isDirectory())dirs.push(path);
        else {try {const info=await stat(path);bytes+=info.size;files++;temporary+=Number(entry.name.includes('.tmp'));}catch(e){if(e.code!=='ENOENT')throw e;}}}
    }
    return {bytes,files,temporary};
  };
  const disk = async () => { const fs = await statfs("data"); const sample = {at: Date.now(), availableBytes: Number(fs.bavail)*Number(fs.bsize), checkpointDisk: await checkpointDisk()}; diskSamples.push(sample); if (sample.availableBytes < Number(args.diskFloorGiB ?? 3)*2**30) { stopping = true; errors.push("Disk safety floor reached"); } };
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
    await disk();
    if (stopping) throw Error("Disk safety floor reached before setup");
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
      // Environment files are already loaded by the parent CLI. Do not inherit
      // its optional-file flags and misclassify missing .env warnings as failures.
      execArgv: [],
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
        CHECKPOINT_KEEP_RECENT: "3",
        CHECKPOINT_RETENTION_HOURS: "0",
        CHECKPOINT_GC_INTERVAL_MS: "60000",
        CHECKPOINT_GC_GRACE_MS: "600000",
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
      a.unexpectedDisconnects = 0; a.disconnectEvents = []; a.reconnectWindows = [];
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
      disk().catch(e => { stopping = true; errors.push(e.message); });
      processTree(child.pid)
        .then((s) => processSamples.push(s))
        .catch((e) => errors.push(e.message));
    }, 5000);
    while (!stopping && Date.now() - start < duration * 1000) {
      await Promise.all(
        actors.map(async (a) => {
          try {
            if (args.exercise === "true" && !a.exercised) { await exercise(a,a===actors[0]); }
            else if (a.ws.readyState !== 1 || random() < reconnectProbability) {
              const window = {start: Date.now(), end: null, user: a.selfId, planned: a.ws.readyState === 1};
              a.reconnectWindows.push(window);
              await a.close();
              a.reconnects++;
              await a.connect();
              window.end = Date.now();
            } else if (random() < transitionProbability) {
              await a.join(rooms[Math.floor(random() * rooms.length)]);
              if (["forest", "lake"].includes(a.room)) await a.move(100, 640);
            } else if (random() < emoteProbability) {
              if (Date.now() - (a.emoteAt ?? 0) >= 1600) {
                if (random()<.5) a.send("emote", { emote: "wave" });
                else a.send("phrase", {phrase: "Hello!"});
                a.emoteAt = Date.now();
              }
            } else if (random() < interactionProbability) {
              // Compare the same logical anchor/radius the server validates.
              const point = a.self.seated?.approach ?? a.self;
              const local = a.room === "town" ? TOWN_INTERACTIONS.find(p => !p.seat && Math.hypot(point.x-p.x,point.y-p.y) < 65) : null;
              const prop = a.room !== "town" && roomSpec(a.room).props.find(p => Math.hypot(point.x-p[2],point.y-Math.max(370,p[3]+140)) < 130);
              const id = local?.id ?? prop?.[0];
              if (id) { a.requests ??= []; a.requests.push({type:"interact", at:Date.now(), room:a.room, origin:{x:a.self.x,y:a.self.y}, target:id}); a.send("interact", {propId:id, clientTime:Date.now()}); }
              const resident = a.room === "town" && TOWN_RESIDENTS.find(n => residentAvailable(n) && Math.hypot(point.x-residentPosition(n).x,point.y-residentPosition(n).y) < 65);
              if (resident && Date.now()-(a.npcAt ?? 0)>2000) { a.send("npc", {id:resident.id}); a.npcAt=Date.now(); }
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
      t.p50UpperMs = null; t.p99UpperMs = null;
      for (const [key, fraction] of [["p50UpperMs",.5],["p99UpperMs",.99]]) { let count=0; for(let i=0;i<12;i++) {count+=t.buckets[i]; if(count>=t.count*fraction) {t[key]=i===11?null:2**(i-3);break;}} }
      t.p95UpperMs = null;
      for (let i = 0; i < 12; i++) {
        n += t.buckets[i];
        if (n >= t.count * 0.95) {
          t.p95UpperMs = i === 11 ? null : 2 ** (i - 3);
          break;
        }
      }
    }
    const protocol = {};
    for (const sample of steady) for (const [type, row] of Object.entries(sample.protocol ?? {})) {
      const p = (protocol[type] ??= { encoded: 0, recipients: 0, bytes: 0, sizes: {}, overflow: 0 });
      for (const k of ['encoded','recipients','bytes','overflow']) p[k] += row[k];
      for (const [size,count] of Object.entries(row.sizes)) p.sizes[size] = (p.sizes[size] ?? 0) + count;
    }
    for (const row of Object.values(protocol)) {
      row.messagesPerSecond = row.recipients / seconds;
      row.bytesPerSecond = row.bytes / seconds;
      row.meanBytes = row.bytes / row.recipients;
      row.fanout = row.encoded ? row.recipients / row.encoded : null;
      let n = 0;
      row.p95Bytes = null;
      if (!row.overflow) for (const size of Object.keys(row.sizes).map(Number).sort((a,b) => a-b)) {
        n += row.sizes[size];
        if (n >= row.recipients * .95) { row.p95Bytes = size; break; }
      }
      delete row.sizes;
    }
    const clients = {
      rejections: actors.flatMap((a) => a.rejections ?? []),
      wrongCompanions: actors.reduce((n, a) => n + a.wrongCompanions, 0),
      errors: actors.map((a) => a.errors),
      disconnectAuditVersion: 1,
      disconnectEvents: actors.flatMap(a=>a.disconnectEvents ?? []),
      reconnectWindows: actors.flatMap(a=>a.reconnectWindows ?? []),
      unexpectedDisconnects: actors.reduce(
        (n, a) => n + (a.unexpectedDisconnects ?? 0),
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
      diskSamples,
      impairment: {rtt:Number(args.rtt ?? 0), jitter:Number(args.jitter ?? 0), loss:Number(args.loss ?? 0), burst:args.burst === "true", model:"ordered TCP retransmission stalls", counters:actors.map(a=>a.transport.stats)},
      exercises: actors.map(a=>({user:a.selfId,phases:a.exercise??[],battleDecisions:a.battleDecisions??[]})),
      requests: actors.map(a=>({user:a.selfId, requests:a.requests ?? []})),
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
        eventLoopP95MaxMs: Math.max(...steady.map((s) => s.eventLoopP95Ms ?? 0)),
        protocol,
        eventLoopP99MaxMs: Math.max(...steady.map((s) => s.eventLoopP99Ms)),
        rates,
        timing,
        checkpoints: {
          first: steady[0]?.checkpoints,
          last: steady.at(-1)?.checkpoints,
          peakBytes: Math.max(...steady.map(s => s.checkpoints?.totalBytes ?? 0)),
          samples: steady.map(s => ({ at: s.at, ...s.checkpoints })),
        },
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
      clients.errors.every((row) => !Object.keys(row).length) &&
      !cleanup.players &&
      !cleanup.rooms &&
      !cleanup.connections &&
      !cleanup.snapshotClients &&
      !cleanup.criticalQueueBytes &&
      !cleanup.slowClients &&
      !cleanup.companions &&
      followResults.every((r) => r.passed) &&
      !cleanup.adventureStates &&
      !cleanup.adventureInstances &&
      timing.tickDurationMs.max < 100 &&
      steady.every(
        (s) => s.players === users && s.companions === users && !s.staleActors,
      ) &&
      !(totals.backpressureDrops ?? 0) &&
      !(totals.slowClientDisconnects ?? 0) &&
      !(totals.criticalEventsAwaitingResync ?? 0);
    if (!result.passed) process.exitCode = 1;
    await mkdir("assays", { recursive: true });
    const file = `assays/multiplayer-${args.label ? args.label + "-" : ""}${users}-${duration}s.json`;
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
    const file = `assays/multiplayer-${args.label ? args.label + "-" : ""}${users}-${duration}s-failure-${Date.now()}.json`;
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
    await disk();
    await writeFile(progressFile + ".disk.json", JSON.stringify(diskSamples));
    await pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    await admin.end();
  }
}
for (const users of counts) {
  if (stopping) break;
  await run(users);
}
