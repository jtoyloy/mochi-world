import { ActorSnapshots } from "./snapshots.mjs";
import { performance } from "node:perf_hooks";
import { advance, traverse } from "../../web/js/game/locomotion/core.js";
import { nearbyResident, TOWN_INTERACTIONS } from "../../web/js/game/town.js";
import { CompanionFollowController } from "../../web/js/game/CompanionFollowController.js";
import { NavigationService } from "../../web/js/game/NavigationService.js";
import { WebSocketServer } from "ws";
import {
  roomSpec,
  walkable,
  validSegment,
  moveToward,
  companionStep,
  EMOTES,
  PHRASES,
  plainText,
} from "../../web/js/game/model.js";
import { GameError } from "../world/service.mjs";
export class MemoryRoomStore {
  constructor() {
    this.rooms = new Map();
    this.players = new Map();
  }
}
export class Multiplayer {
  constructor({
    server,
    metrics = null,
    authenticate,
    avatars,
    dialogue,
    world,
    store = new MemoryRoomStore(),
    capacity = Number(process.env.MAX_PLAYERS_PER_ROOM ?? 40),
    now = () => Date.now(),
  }) {
    Object.assign(this, {
      avatars,
      dialogue,
      world,
      store,
      capacity,
      now,
      metrics,
    });
    if ((process.env.MULTIPLAYER_STORAGE ?? "memory") !== "memory")
      throw new Error(
        "This release implements MULTIPLAYER_STORAGE=memory; Redis needs a distributed RoomStore adapter",
      );
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)
      throw new Error("MAX_PLAYERS_PER_ROOM must be 1–100");
    if (server) {
      this.wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
      server.on("upgrade", async (req, socket, head) => {
        try {
          if (new URL(req.url, "http://localhost").pathname !== "/socket")
            throw new Error("Unknown socket");
          if (
            req.headers.origin !== `http://${req.headers.host}` &&
            req.headers.origin !== `https://${req.headers.host}`
          )
            throw new Error("Socket origin refused");
          const userId = await authenticate(req);
          this.wss.handleUpgrade(req, socket, head, (ws) => {
            ws.sessionExpiresAt = req.sessionExpiresAt;
            ws.revalidateSession = () => authenticate(req);
            this.connect(ws, userId).catch(() =>
              ws.close(1011, "Room unavailable"),
            );
          });
        } catch {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
        }
      });
    }
    this.speechGap = Number(
      process.env.MOCHI_AUTONOMOUS_SPEECH_GAP_MS ?? 45000,
    );
    if (
      !Number.isFinite(this.speechGap) ||
      this.speechGap < 30000 ||
      this.speechGap > 90000
    )
      throw new Error("Autonomous speech gap must be 30000–90000ms");
    this.followController = new CompanionFollowController();
    this.snapshots = new ActorSnapshots();
    this.encounters = new Map();
    this.tickAt = this.now();
    this.movementHz = Number(process.env.MOVEMENT_HZ ?? 10);
    if (![10, 15, 20].includes(this.movementHz))
      throw new Error("MOVEMENT_HZ must be 10, 15 or 20");
    this.timer = setInterval(() => this.tick(), 1000 / this.movementHz);
    this.timer.unref();
    this.speechTimer = setInterval(
      () =>
        this.environmentSpeech()
          .then(() => this.socialEncounters())
          .catch(() => {}),
      15000,
    );
    this.speechTimer.unref();
  }
  flush(p) {
    if (p.ws.readyState !== 1) return false;
    this.metrics?.observe?.('socketBufferedBytes', p.ws.bufferedAmount ?? 0);
    if (p.ws.bufferedAmount >= 200000) {
      p.slowSince ??= this.now();
      if (this.now() - p.slowSince >= 5000) this.slowClose(p);
      return false;
    }
    p.slowSince = null;
    while (p.outbox?.length && p.ws.bufferedAmount < 200000) {
      const item = p.outbox.shift();
      p.outboxBytes -= Buffer.byteLength(item.encoded);
      this.deliver(p, item.encoded, item.type, item.parts);
      this.metrics?.count('criticalEventsFlushed');
    }
    return !p.outbox?.length && p.ws.bufferedAmount < 200000;
  }
  slowClose(p) {
    if (p.deliveryClosed) return;
    p.deliveryClosed = true;
    this.metrics?.count('criticalEventsAwaitingResync', p.outbox?.length ?? 0);
    p.outbox = [];
    p.outboxBytes = 0;
    this.metrics?.count('slowClientDisconnects');
    p.ws.close(1013, 'Client is too slow; reconnect for authoritative state');
  }
  deliver(p, encoded, type, parts = {}) {
    p.ws.send(encoded);
    const bytes = Buffer.byteLength(encoded);
    this.metrics?.count('outboundMessages');
    this.metrics?.count('outboundBytes', bytes);
    this.metrics?.protocolSent?.(type, bytes);
    for (const [part, size] of Object.entries(parts)) this.metrics?.protocolSent?.("component:" + part, size);
  }
  sendEncoded(p, encoded, type = 'unknown', parts = {}) {
    if (p.deliveryClosed) {
      this.metrics?.count('closedSocketSkips');
      return false;
    }
    if (p.ws.readyState !== 1) {
      this.metrics?.count('closedSocketSkips');
      return false;
    }
    if (this.flush(p)) {
      this.deliver(p, encoded, type, parts);
      return true;
    }
    if (p.deliveryClosed) return false;
    p.outbox ??= [];
    p.outboxBytes ??= 0;
    if (p.outbox.length >= 256 || p.outboxBytes + Buffer.byteLength(encoded) > 1048576) {
      // Count the overflowing event as well as the queued events requiring resync.
      this.metrics?.count('criticalEventsAwaitingResync');
      this.slowClose(p);
      return false;
    }
    p.outbox.push({ encoded, type, parts });
    p.outboxBytes += Buffer.byteLength(encoded);
    this.metrics?.count('criticalEventsQueued');
    return false;
  }
  parts(type, data) {
    if (!this.metrics) return {};
    const at = performance.now(), parts = {};
    const bytes = value => Buffer.byteLength(JSON.stringify(value));
    const actors = type === 'playerMoved' || type === 'playerJoined' ? [data]
      : type === 'movementSnapshot' || type === 'roomSnapshot' ? data.players : [];
    for (const player of actors ?? []) {
      const { companion, avatar, username, presence, ...dynamic } = player;
      parts.playerState = (parts.playerState ?? 0) + bytes(dynamic);
      if (companion) {
        const { profile, equipment, name, ...pet } = companion;
        parts.companionState = (parts.companionState ?? 0) + bytes(pet);
        if (profile || equipment || name) parts.companionDescription = (parts.companionDescription ?? 0) + bytes({ profile, equipment, name });
      }
    }
    if (type === 'adventureRoom') {
      parts.mobState = bytes(data.mobs);
      parts.resourceNodes = bytes(data.nodes);
    }
    for (const [part,size] of Object.entries(parts)) this.metrics.protocolEncoded?.('component:' + part,size);
    this.metrics.time?.('componentMeasurementMs',performance.now()-at);
    return parts;
  }
  encode(type, data) {
    const at = performance.now();
    const encoded = JSON.stringify({ type, data });
    this.metrics?.time?.('serializationMs', performance.now() - at);
    const bytes = Buffer.byteLength(encoded);
    this.metrics?.count('serializedBytes', bytes);
    this.metrics?.protocolEncoded?.(type, bytes);
    return encoded;
  }
  sendMovement(p, data) {
    if (!this.flush(p) || p.deliveryClosed) {
      this.metrics?.count('coalescedMovementSnapshots');
      return false;
    }
    this.deliver(p, this.encode('movementSnapshot', data), 'movementSnapshot', this.parts('movementSnapshot', data));
    return true;
  }
  send(p, type, data) {
    this.sendEncoded(p, this.encode(type, data), type, this.parts(type, data));
  }
  broadcast(room, type, data) {
    const encoded = this.encode(type, data), parts = this.parts(type, data);
    for (const p of this.store.rooms.get(room)?.players.values() ?? [])
      this.sendEncoded(p, encoded, type, parts);
  }
  public(p) {
    return {
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      x: p.x,
      y: p.y,
      moving: !!p.target,
      rotation: p.rotation ?? 0,
      serverTime: this.now(),
      moveSeq: p.moveSeq ?? 0,
      speed: p.speed ?? 0,
      path: p.target ? [p.target, ...(p.path ?? [])] : [],
      companion: p.companion
        ? {
            ...p.companion,
            route: undefined,
            routeAt: undefined,
            motorPath: undefined,
          }
        : null,
      presence: p.presence,
      seated: p.seated ?? null,
    };
  }
  async connect(ws, userId) {
    const user = await this.world.account(userId),
      avatar = await this.avatars.get(userId);
    // Account revocation may occur while the avatar is loading after upgrade.
    if (ws.revalidateSession && await ws.revalidateSession() !== userId) {
      ws.close(4003, "Sign in again");
      return;
    }
    if (ws.readyState !== 1) return;
    const existing = this.store.players.get(userId);
    if (existing) {
      existing.ws.close(4001, "Opened in another tab");
      this.disconnect(existing);
    }
    const p = {
      ws,
      userId,
      username: user.username,
      avatar,
      x: 550,
      y: 590,
      room: null,
      companion: null,
      lastMove: 0,
      lastEvent: 0,
      windowAt: 0,
      eventCount: 0,
      lastSeen: this.now(),
      speechAt: 0,
      presence: "online",
      joined: false,
    };
    this.metrics?.count("connects");
    this.store.players.set(userId, p);
    let serial = Promise.resolve();
    ws.on("message", (raw) => {
      this.metrics?.count("inboundMessages");
      this.metrics?.count("inboundBytes", raw.length);
      const receivedAt = performance.now();
      serial = serial
        .then(async () => {
          if (this.store.players.get(userId) !== p) return;
          if (p.ws.sessionExpiresAt <= this.now()) {
            this.disconnect(p);
            p.ws.close(4003, "Session expired; sign in again");
            return;
          }
          const msg = JSON.parse(raw.toString());
          const startedAt = performance.now();
          try {
            await this.handle(p, msg);
          } finally {
            if (msg.type === "move")
              this.metrics?.time(
                "movementValidationMs",
                performance.now() - startedAt,
              );
            this.metrics?.time("dispatchMs", performance.now() - receivedAt);
          }
        })
        .catch((e) => {
          if (!e.responseSent) this.send(p, "error", { message: e.message });
        });
    });
    ws.on("close", () => this.disconnect(p));
    ws.on("error", () => this.disconnect(p));
    ws.on("pong", () => {
      p.lastSeen = this.now();
    });
    this.send(p, "ready", { userId });
  }
  async join(p, roomId) {
    if (typeof roomId !== "string" || roomId.length > 70 || !roomSpec(roomId))
      throw new GameError("Unknown room");
    if (roomId.startsWith("home:")) {
      const username = roomId.slice(5);
      const owner = (
        await this.world.pool.query("SELECT id FROM users WHERE username=$1", [
          username,
        ])
      ).rows[0];
      if (!owner) throw new GameError("Home not found");
      if (owner.id !== p.userId) {
        const friends = await this.world.friends(p.userId);
        if (!friends.friends.some((f) => f.id === owner.id))
          throw new GameError("Homes are open to accepted friends", 403);
      }
    } else if (roomId === "home") roomId = "home:" + p.username;
    else if (roomId.includes(":")) throw new GameError("Unknown room instance");
    this.leave(p);
    const friends = await this.world.friends(p.userId);
    if (this.store.players.get(p.userId) !== p) return;
    const candidates = [...this.store.rooms.values()].sort(
      (a, b) =>
        Number(
          [...b.players.keys()].some((id) =>
            friends.friends.some((f) => f.id === id),
          ),
        ) -
        Number(
          [...a.players.keys()].some((id) =>
            friends.friends.some((f) => f.id === id),
          ),
        ),
    );
    let instance = candidates.find(
      (r) => r.roomId === roomId && r.players.size < this.capacity,
    );
    if (!instance) {
      let n = 1;
      while (this.store.rooms.has(roomId + "-" + n)) n++;
      instance = { id: roomId + "-" + n, roomId, players: new Map() };
      this.store.rooms.set(instance.id, instance);
    }
    p.room = instance.id;
    p.roomId = roomId;
    new NavigationService(roomId).grid();
    p.seated = null;
    p.target = null;
    p.path = [];
    const resume =
      p.avatar.current_room_id === roomId &&
      walkable(roomId, p.avatar.last_x, p.avatar.last_y);
    p.x = resume ? p.avatar.last_x : 550;
    p.y = resume ? p.avatar.last_y : roomId === "town" ? 840 : 590;
    // Spread arrivals rather than stacking bodies at one anchor.
    const nav = new NavigationService(roomId);
    for (
      let i = 0;
      i < 20 &&
      [...instance.players.values()].some(
        (other) => Math.hypot(other.x - p.x, other.y - p.y) < 80,
      );
      i++
    ) {
      const candidate = nav.nearestWalkable({
        x: p.x + 90,
        y: p.y + (i % 2 ? 45 : -45),
      });
      if (candidate) {
        p.x = candidate.x;
        p.y = candidate.y;
      }
    }
    p.companion = await this.avatars.companion(p.userId);
    if (p.companion)
      p.companion = {
        ...p.companion,
        ...new NavigationService(p.roomId ?? "town").nearestWalkable({
          x: p.x - 95,
          y: p.y + 40,
        }),
        state: "FOLLOWING",
      };
    if (this.store.players.get(p.userId) !== p) {
      if (
        !instance.players.size &&
        this.store.rooms.get(instance.id) === instance
      )
        this.store.rooms.delete(instance.id);
      return;
    }
    instance.players.set(p.userId, p);
    p.joined = true;
    const home = roomId.startsWith("home:")
      ? await this.homeData(roomId.slice(5))
      : null;
    this.send(p, "roomSnapshot", {
      home,
      serverTime: this.now(),
      roomId,
      instanceId: instance.id,
      selfId: p.userId,
      capacity: this.capacity,
      players: [...instance.players.values()].map((v) => this.public(v)),
    });
    this.broadcast(instance.id, "playerJoined", this.public(p));
    console.info(
      JSON.stringify({
        event: "player_joined_room",
        userId: p.userId,
        instanceId: instance.id,
      }),
    );
  }
  async homeData(username) {
    const pets = (
      await this.world.pool.query(
        "SELECT m.id,m.name,m.profile FROM mochis m JOIN users u ON u.id=m.user_id WHERE u.username=$1 ORDER BY m.id",
        [username],
      )
    ).rows;
    return {
      owner: username,
      pets: pets.map((p) => ({
        id: p.id,
        name: p.name,
        profile: { variant: p.profile.variant },
        furniture: p.profile.homeSlots ?? {},
        placements: p.profile.homePositions ?? {},
      })),
    };
  }
  async socialEncounters() {
    for (const room of this.store.rooms.values()) {
      const pets = [...room.players.values()].filter((p) => p.companion);
      for (let i = 0; i < pets.length; i++)
        for (let j = i + 1; j < pets.length; j++) {
          const a = pets[i],
            b = pets[j];
          if (
            Math.hypot(
              a.companion.x - b.companion.x,
              a.companion.y - b.companion.y,
            ) > 110
          )
            continue;
          const ids = [a.companion.id, b.companion.id].sort(),
            key = ids.join(":");
          if (this.now() - (this.encounters.get(key) ?? 0) < 60000) continue;
          this.encounters.set(key, this.now());
          const relation = (
            await this.world.pool.query(
              "INSERT INTO mochi_relationships(mochi_a_id,mochi_b_id,familiarity,interactions,last_interaction_at) VALUES($1,$2,1,1,now()) ON CONFLICT(mochi_a_id,mochi_b_id) DO UPDATE SET familiarity=least(100,mochi_relationships.familiarity+1),interactions=mochi_relationships.interactions+1,last_interaction_at=now() RETURNING familiarity",
              ids,
            )
          ).rows[0];
          if (relation.familiarity >= 3) {
            for (const [p, other] of [
              [a, b],
              [b, a],
            ])
              this.speak(p, {
                mochiId: p.companion.id,
                text: `Hi ${other.companion.name}!`,
                visibility: "room",
              });
            a.companion.state = "INTERACTING";
            b.companion.state = "INTERACTING";
          }
        }
    }
  }
  leave(p) {
    this.adventure?.departure(p, "room-departure");
    if (!p.room) return;
    const old = p.room;
    this.snapshots.forget(p.userId);
    this.store.rooms.get(old)?.players.delete(p.userId);
    this.broadcast(old, "playerLeft", { userId: p.userId });
    if (!this.store.rooms.get(old)?.players.size) this.store.rooms.delete(old);
    p.room = null;
    p.target = null;
    console.info(
      JSON.stringify({
        event: "player_left_room",
        userId: p.userId,
        instanceId: old,
      }),
    );
  }
  disconnect(p) {
    if (this.store.players.get(p.userId) !== p) return;
    this.metrics?.count("disconnects");
    this.persist(p).catch(() => {});
    this.leave(p);
    this.store.players.delete(p.userId);
    p.outbox = [];
    p.outboxBytes = 0;
  }
  async persist(p) {
    if (!p.roomId) return;
    await this.world.pool.query(
      "UPDATE player_avatars SET current_room_id=$2,last_x=$3,last_y=$4,updated_at=now() WHERE user_id=$1",
      [
        p.userId,
        p.roomId,
        p.seated?.approach.x ?? p.x,
        p.seated?.approach.y ?? p.y,
      ],
    );
  }
  async refresh(userId) {
    const p = this.store.players.get(userId);
    if (!p) return;
    p.avatar = await this.avatars.get(userId);
    p.companion = await this.avatars.companion(userId);
    if (p.companion)
      p.companion = {
        ...p.companion,
        ...new NavigationService(p.roomId ?? "town").nearestWalkable({
          x: p.x - 95,
          y: p.y + 40,
        }),
        state: "FOLLOWING",
      };
    if (p.room && p.roomId.startsWith("home:")) {
      await this.persist(p);
      p.avatar.current_room_id = p.roomId;
      p.avatar.last_x = p.x;
      p.avatar.last_y = p.y;
      await this.join(p, p.roomId);
      return;
    }
    if (p.room) this.broadcast(p.room, "playerJoined", this.public(p));
  }
  rejection(p, data, reason, target = null, radius = null) {
    if (!this.metrics) return;
    this.metrics.count(target || radius ? "interactionRejections" : "movementRejections");
    this.metrics.rejections ??= [];
    if (this.metrics.rejections.length >= 1000) { this.metrics.count("rejectionTraceOverflow"); return; }
    this.metrics.rejections.push({at: this.now(), room: p.roomId, instance: p.room, user: p.userId, reason,
      request: data, authoritative: {x: p.x, y: p.y, seated: p.seated ?? null},
      target: target && {x: target.x, y: target.y}, interactionRadius: radius,
      requestAgeMs: Number.isFinite(data.clientTime) ? this.now()-data.clientTime : null,
      originWalkable: walkable(p.roomId, p.seated?.approach.x ?? p.x, p.seated?.approach.y ?? p.y),
      destinationWalkable: Number.isFinite(data.x) ? walkable(p.roomId, data.x, data.y) : null});
  }
  async handle(p, msg) {
    if (
      !msg ||
      typeof msg.type !== "string" ||
      !msg.data ||
      typeof msg.data !== "object" ||
      Array.isArray(msg.data)
    )
      throw new GameError("Malformed socket event");
    const { type, data } = msg;
    const now = this.now();
    p.lastSeen = now;
    if (now - p.windowAt >= 1000) {
      p.windowAt = now;
      p.eventCount = 0;
    }
    if (++p.eventCount > 25) {
      p.ws.close(1008, "Socket rate limit");
      throw new GameError("Too many socket events");
    }
    if (type === "joinRoom") return this.join(p, data.roomId);
    if (type === "leaveRoom") return this.leave(p);
    if (!p.room) throw new GameError("Join a room first");
    if (type === "adventure") {
      if (now - (p.lastAdventureRequest ?? 0) < 150)
        throw new GameError("Adventure actions are limited", 429);
      p.lastAdventureRequest = now;
      const result = await this.adventure?.action(p, data);
      this.send(p, "adventureResult", result);
      return;
    }
    switch (type) {
      case 'view':
        if (![data.halfWidth, data.halfHeight].every(Number.isFinite))
          throw new GameError('Invalid view bounds');
        if (now - (p.viewAt ?? 0) < 1000) break;
        p.viewAt = now;
        p.view = { halfWidth: Math.max(400, Math.min(2400, data.halfWidth)), halfHeight: Math.max(250, Math.min(1600, data.halfHeight)) };
        break;
      case "ping":
        this.send(p, "pong", { clientTime: data.clientTime, serverTime: now });
        break;
      case "move": {
        try {
          if (data.roomId && data.roomId !== p.roomId)
            throw new GameError("Movement belongs to a previous room");
          if (
            data.seq !== undefined &&
            (!Number.isSafeInteger(data.seq) ||
              data.seq <= 0 ||
              data.seq <= (p.moveSeq ?? 0))
          )
            throw new GameError("Invalid movement sequence");
          if (now - p.lastMove < 120)
            throw new GameError("Movement updates are limited");
          p.lastMove = now;
          if (!walkable(p.roomId, data.x, data.y))
            throw new GameError("That path is blocked");
          if (p.seated) {
            p.x = p.seated.approach.x;
            p.y = p.seated.approach.y;
            p.seated = null;
          }
          p.path = new NavigationService(p.roomId).findPath(p, data);
          if (!p.path?.length)
            throw new GameError("That destination is unreachable");
          p.target = p.path.shift();
          p.moveSeq = data.seq ?? (p.moveSeq ?? 0) + 1;
          p.presence = "online";
          this.send(p, "moveAccepted", {
            ...this.public(p),
            destination: { x: data.x, y: data.y },
            movementHz: this.movementHz,
          });
        } catch (e) {
          this.rejection(p, data, e.message);
          this.send(p, "moveRejected", {
            ...this.public(p),
            rejectedSeq: data.seq,
            message: e.message,
          });
          e.responseSent = true;
          throw e;
        }
        break;
      }
      case "emote":
      case "phrase":
        if (now - p.lastEvent < 1500) throw new GameError("Emote cooldown");
        p.lastEvent = now;
        if (
          type === "emote"
            ? !Object.hasOwn(EMOTES, data.emote)
            : !PHRASES.includes(data.phrase)
        )
          throw new GameError("Unknown emote");
        this.broadcast(p.room, "playerEmoted", {
          userId: p.userId,
          text: type === "emote" ? EMOTES[data.emote] : data.phrase,
        });
        break;
      case "npc": {
        if (p.roomId !== "town")
          throw new GameError("Residents are in Town Square");
        const n = nearbyResident(data.id, p, this.now());
        if (!n) throw new GameError("Walk closer to talk");
        if (this.now() - (p.npcAt ?? 0) < 1500)
          throw new GameError("Give the resident a moment");
        p.npcAt = this.now();
        let line = n.line;
        if (p.companion) {
          const pet = await this.world.pet(p.companion.id);
          if (n.id === "mina" && pet.stats.Fullness < 35)
            line += ` ${pet.name} looks ready for a snack.`;
          if (n.id === "loom" && p.companion.equipment?.hat)
            line += ` I like ${pet.name}'s hat.`;
        }
        this.send(p, "npcDialogue", {
          id: n.id,
          name: n.name,
          line,
          shop: n.shop ?? null,
          vendor: n.vendor ?? null,
        });
        break;
      }
      case "interact": {
        const local =
          p.roomId === "town" &&
          TOWN_INTERACTIONS.find((v) => v.id === data.propId);
        if (local) {
          if (Math.hypot(p.x - local.x, p.y - local.y) > 120) {
            this.rejection(p, data, "Walk closer to interact", local, 120);
            throw new GameError("Walk closer to interact");
          }
          if (local.seat) {
            if (
              [...this.store.rooms.get(p.room).players.values()].some(
                (v) => v !== p && v.seated?.id === local.id,
              )
            )
              throw new GameError("This seat is taken");
            p.seated = {
              ...local.seat,
              id: local.id,
              approach: { x: local.x, y: local.y },
            };
            p.x = local.seat.x;
            p.y = local.seat.y;
            p.target = null;
            p.path = [];
            p.rotation = 0;
            this.broadcast(p.room, "playerMoved", this.public(p));
          }
          this.send(p, "interaction", { propId: local.id, text: local.line });
          break;
        }

        const prop = roomSpec(p.roomId).props.find((v) => v[0] === data.propId);
        if (
          !prop ||
          Math.hypot(p.x - prop[2], p.y - Math.max(370, prop[3] + 140)) > 190
        ) {
          this.rejection(p, data, "Walk closer to interact", prop && {x: prop[2], y: Math.max(370, prop[3]+140)}, 190);
          throw new GameError("Walk closer to interact");
        }
        this.send(p, "interaction", { propId: data.propId });
        break;
      }
      case "talkToMochi":
        if (!p.companion || data.mochiId !== p.companion.id)
          throw new GameError("Talk to your active companion");
        {
          const answer = await this.dialogue.talk(p.userId, data, p.roomId);
          this.speak(p, answer);
          break;
        }
      case "presence":
        if (!["online", "away"].includes(data.status))
          throw new GameError("Unknown presence");
        p.presence = data.status;
        break;
      default:
        throw new GameError("Unknown socket event");
    }
  }
  speak(p, answer) {
    const data = { ...answer, userId: p.userId };
    if (answer.visibility === "room")
      this.broadcast(p.room, "mochiSpoke", data);
    else this.send(p, "mochiSpoke", data);
  }
  tick() {
    const startedAt = performance.now();
    const roomDurations = new Map();
    const now = this.now(),
      dt = Math.min(0.25, Math.max(0, (now - this.tickAt) / 1000));
    this.metrics?.time("tickIntervalMs", now - this.tickAt);
    this.tickAt = now;
    for (const p of this.store.players.values()) {
      if (p.ws.sessionExpiresAt <= now) {
        this.disconnect(p);
        p.ws.close(4003, "Session expired; sign in again");
        continue;
      }
      if (now - p.lastSeen > 45000) {
        p.ws.terminate?.();
        this.disconnect(p);
        continue;
      }
      if (!p.room) continue;
      const actorTickAt = performance.now();
      if (p.target) {
        const path = [p.target, ...(p.path ?? [])];
        const result = advance(p, path, dt, 0.25);
        if (result.moved) p.rotation = Math.atan2(result.dx, result.dy);
        p.target = path.shift() ?? null;
        p.path = path;
        if (!p.target) this.persist(p).catch(() => {});
      }
      if (!p.target) p.speed = 0;
      if (p.companion?.motorPath?.length) {
        const active = this.adventure?.states.get(p.userId);
        if (active?.target && active.petHp > 0)
          traverse(
            p.companion,
            p.companion.motorPath,
            165 * Math.min(dt, 0.25),
            (a, b) => validSegment(p.roomId, a.x, a.y, b.x, b.y),
          );
        else p.companion.motorPath = [];
      }
      if (
        p.companion &&
        !(
          this.adventure?.states.get(p.userId)?.target &&
          this.adventure.states.get(p.userId)?.petHp > 0
        )
      ) {
        const followAt = performance.now();
        const next = this.followController.step(
          p.companion,
          {
            x: p.x,
            y: p.y,
            moving: !!p.target,
            rotation: p.rotation ?? 0,
            speed: p.speed ?? 0,
          },
          p.roomId,
          dt,
          now,
        );
        this.metrics?.time("companionFollowMs", performance.now() - followAt);
        if (walkable(p.roomId, next.x, next.y)) {
          p.companion = next;
          if (this.adventure?.states.get(p.userId)?.petHp <= 0)
            p.companion.state = "EXHAUSTED";
        } else p.companion.state = "RETURNING";
        if (Math.hypot(p.companion.x - p.x, p.companion.y - p.y) > 650) {
          for (const [dx, dy] of [
            [-45, 15],
            [45, 15],
            [0, 40],
          ]) {
            if (walkable(p.roomId, p.x + dx, p.y + dy)) {
              p.companion.x = p.x + dx;
              p.companion.y = p.y + dy;
              p.companion.state = "RETURNING";
              break;
            }
          }
        }
      }
      this.metrics?.count("actorUpdates");
      if (p.companion) this.metrics?.count("companionUpdates");
      if (
        Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000) &&
        Math.floor(now / 1000) % 15 === 0
      )
        p.ws.ping?.();
      roomDurations.set(
        p.room,
        (roomDurations.get(p.room) ?? 0) + performance.now() - actorTickAt,
      );
    }
    this.snapshots.tick(this, now);
    for (const duration of roomDurations.values())
      this.metrics?.time("roomTickDurationMs", duration);
    const durationMs = performance.now() - startedAt;
    this.metrics?.time("tickDurationMs", durationMs);
    if (durationMs >= 100) this.metrics?.count("movementDeadlineOverruns");
    for (const [key, at] of this.encounters)
      if (now - at > 120000) this.encounters.delete(key);
  }
  async environmentSpeech() {
    const count = new Map();
    for (const p of [...this.store.players.values()].sort(
      (a, b) => a.speechAt - b.speechAt,
    )) {
      if (
        !p.room ||
        !p.companion ||
        this.now() - p.speechAt < this.speechGap ||
        (count.get(p.room) ?? 0) >= 3
      )
        continue;
      const pet = await this.world.pet(p.companion.id);
      let text =
        pet.stats.Fullness < 30
          ? "I'm getting hungry. Can we find a snack?"
          : pet.stats.Energy < 25
            ? "I'm a little sleepy."
            : pet.stats.Happiness < 35
              ? "Can we play together?"
              : null;
      if (!text && p.roomId === "park")
        text = "There's room for a little play here!";
      if (text) {
        p.speechAt = this.now();
        count.set(p.room, (count.get(p.room) ?? 0) + 1);
        this.speak(p, { mochiId: p.companion.id, text, visibility: "room" });
        console.info(
          JSON.stringify({
            event: "mochi_autonomous_speech",
            mochiId: p.companion.id,
          }),
        );
      }
    }
  }
  close() {
    clearInterval(this.timer);
    clearInterval(this.speechTimer);
    for (const p of this.store.players.values()) p.ws.close();
    this.wss?.close();
  }
}
