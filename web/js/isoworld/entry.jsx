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
  let roomId = "town",
    home = null,
    marker = null,
    loading = true;
  const publish = () => listeners.forEach((fn) => fn());
  const scene = {
    data,
    publish,
    adventure: null,
    combatEffects: [],
    players: new Map(),
    pets: new Map(),
    emotes: new Map(),
    reactions: new Map(),
    audio: new WorldAudio(),
    snapshot: () => ({
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
      this.adventure = null;
      this.combatEffects = [];
      this.serverClockOffset = (s.serverTime ?? Date.now()) - Date.now();
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
      data.delete(id);
      this.players.delete(id);
      this.pets.delete(id);
      publish();
    },
    moveTo(end, options = {}) {
      if (!options.interaction) bridge.cancelInteraction?.();
      const self = data.get(bridge.selfId);
      if (!self) return false;
      const nav = new NavigationService(roomId),
        goal = nav.nearestWalkable(end);
      if (
        !goal ||
        Math.hypot(goal.x - end.x, goal.y - end.y) > 70 ||
        !nav.findPath(self, goal)
      ) {
        bridge.status("Choose a nearby path to walk.");
        return false;
      }
      marker = goal;
      bridge.send("move", goal);
      this.audio.cue("step");
      publish();
      return true;
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
  return {
    destroy() {
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
