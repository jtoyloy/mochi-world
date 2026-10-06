import { Prediction, SnapshotBuffer } from "../game/locomotion/core.js";
import { NavigationService } from "../game/NavigationService.js";
import { plainText } from "../game/model.js";
import { WorldAudio } from "../world3d/audio.js";
import { IsometricWorld } from "./World.js";
export async function mountIsometric(container, bridge, config) {
  const listeners = new Set(),
    data = new Map(),
    bubbles = new Map(),
    queues = new Map(),
    timers = new Set();
  const motion = new Map(),
    petMotion = new Map();
  let moveSeq = 0;
  let roomId = "town",
    home = null,
    marker = null,
    loading = true;
  let cachedSnapshot = null;
  const publish = () => {
    cachedSnapshot = null;
    listeners.forEach((fn) => fn());
  };
  const scene = {
    data,
    motion,
    petMotion,
    movementHz: 10,
    ping: 0,
    network: { latency: 0, jitter: 0, loss: 0 },
    publish,
    adventure: null,
    combatEffects: [],
    players: new Map(),
    pets: new Map(),
    emotes: new Map(),
    reactions: new Map(),
    audio: new WorldAudio(),
    snapshot: () =>
      (cachedSnapshot ??= {
        roomId,
        home,
        marker,
        loading,
        players: [...data.values()],
        bubbles: new Map(bubbles),
      }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setRoomSnapshot(s) {
      roomId = s.roomId;
      this.roomEnteredAt = s.serverTime ?? 0;
      new NavigationService(roomId).grid();
      this.adventure = null;
      this.combatEffects = [];
      this.serverClockOffset = (s.serverTime ?? Date.now()) - Date.now();
      motion.clear();
      petMotion.clear();
      home = s.home;
      marker = null;
      this.emotes.clear();
      this.reactions.clear();
      data.clear();
      this.players.clear();
      this.pets.clear();
      bubbles.clear();
      queues.clear();
      for (const p of s.players) this.put(p, false);
      loading = true;
      publish();
      const timer = setTimeout(() => {
        loading = false;
        publish();
      }, 300);
      timers.add(timer);
    },
    put(p, notify = true) {
      data.set(p.userId, p);
      const t = p.serverTime ?? Date.now();
      let m = motion.get(p.userId);
      if (!m) {
        m = { buffer: new SnapshotBuffer(), prediction: new Prediction(p) };
        motion.set(p.userId, m);
      }
      m.buffer.push(
        { t, x: p.x, y: p.y, moving: p.moving },
        Date.now() + (this.serverClockOffset ?? 0),
      );
      if (p.userId === bridge.selfId && p.serverTime)
        m.prediction.reconcile(p, Date.now(), this.serverClockOffset ?? 0);
      if (p.companion) {
        let pm = petMotion.get(p.companion.id);
        if (!pm) {
          pm = new SnapshotBuffer();
          petMotion.set(p.companion.id, pm);
        }
        pm.push(
          {
            t,
            x: p.companion.x,
            y: p.companion.y,
            moving:
              Math.hypot(
                p.companion.x - (pm.samples.at(-1)?.x ?? p.companion.x),
                p.companion.y - (pm.samples.at(-1)?.y ?? p.companion.y),
              ) > 0.01,
          },
          Date.now() + (this.serverClockOffset ?? 0),
        );
      }

      this.players.set(p.userId, {
        root: { id: "player:" + p.userId },
        prediction: null,
      });
      if (p.companion)
        this.pets.set(p.userId, {
          root: { id: "pet:" + p.companion.id },
          name: { text: p.companion.name },
        });
      else this.pets.delete(p.userId);
      if (notify) publish();
    },
    remove(id) {
      motion.delete(id);
      const previous = data.get(id);
      if (previous?.companion) petMotion.delete(previous.companion.id);
      data.delete(id);
      this.players.delete(id);
      this.pets.delete(id);
      publish();
    },
    prepareMove(goal) {
      const self = data.get(bridge.selfId),
        m = motion.get(bridge.selfId);
      if (!self || !m) return null;
      const start = self.seated ? self.seated.approach : m.prediction.p;
      const path = new NavigationService(roomId).findPath(start, goal);
      if (!path) {
        bridge.status("Choose a reachable path to walk.");
        return null;
      }
      m.prediction.start(path, ++moveSeq);
      marker = { x: goal.x, y: goal.y };
      publish();
      return { ...goal, seq: moveSeq, clientTime: Date.now() };
    },
    motionEvent(type, s) {
      if (s.serverTime && s.serverTime < this.roomEnteredAt) return;
      const m = motion.get(bridge.selfId);
      if (type === "moveAccepted") {
        this.movementHz = s.movementHz ?? 10;
        m?.prediction.reconcile(s, Date.now(), this.serverClockOffset ?? 0);
      }
      if (type === "moveRejected" && s.rejectedSeq === m?.prediction.seq) {
        m.prediction.reject({ ...s, moveSeq: s.rejectedSeq });
        marker = null;
        bridge.status(s.message ?? "That movement was refused.");
        publish();
      }
      if (type === "pong") {
        const rtt = Date.now() - s.clientTime;
        this.ping = rtt;
        this.serverClockOffset = s.serverTime - (s.clientTime + rtt / 2);
      }
    },
    moveTo(end, options = {}) {
      if (!options.interaction) bridge.cancelInteraction?.();
      const self = data.get(bridge.selfId);
      if (!self) return false;
      const nav = new NavigationService(roomId),
        goal = nav.nearestWalkable(end);
      if (!goal || Math.hypot(goal.x - end.x, goal.y - end.y) > 70) {
        bridge.status("Choose a nearby path to walk.");
        return false;
      }
      return bridge.send("move", goal) !== false;
    },
    transition() {
      loading = true;
      publish();
      const timer = setTimeout(() => {
        loading = false;
        publish();
      }, 8000);
      timers.add(timer);
    },
    bubbles: {
      say(key, root, text) {
        if (!root) return;
        const queue = queues.get(key) ?? [];
        if (queue.length >= 3) return;
        queue.push(plainText(text));
        queues.set(key, queue);
        if (!bubbles.has(key)) display(key);
      },
    },
  };
  function display(key) {
    const q = queues.get(key);
    if (!q?.length) {
      bubbles.delete(key);
      publish();
      return;
    }
    const text = q.shift();
    const dismiss = () => {
      bubbles.delete(key);
      display(key);
    };
    bubbles.set(key, { text, dismiss });
    publish();
    const shown = bubbles.get(key);
    const timer = setTimeout(
      () => {
        if (bubbles.get(key) === shown) dismiss();
      },
      Math.min(8000, Math.max(3500, text.length * 60)),
    );
    timers.add(timer);
  }
  bridge.scene = scene;
  const renderer = new IsometricWorld(container, bridge, config, scene);
  await renderer.init();
  bridge.connect();
  const pingTimer = setInterval(
    () => bridge.send("ping", { clientTime: Date.now() }),
    3000,
  );
  return {
    destroy() {
      clearInterval(pingTimer);
      scene.audio.dispose?.();
      renderer.destroy();
      for (const timer of timers) clearTimeout(timer);
      listeners.clear();
    },
    scene,
  };
}

export {
  openConversation,
  openBackpack,
  reactDialog,
  openDomainPanel,
} from "../world3d/Overlays.jsx";
