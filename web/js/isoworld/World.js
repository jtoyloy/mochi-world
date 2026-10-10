import {
  Gait,
  MOTION,
  facing4,
  facing8,
  spring,
} from "../game/locomotion/core.js";
import {
  ANIMATION_SETS,
  MOB_ACTION_SHEETS,
  mobAnimationSet,
  AnimationPlayback,
  directionIndex,
} from "./animation/registry.js";
import {
  loadAnimationAtlas,
  loadActionAtlas,
  selectTexture,
  stateHeight,
  stateMirrored,
} from "./animation/atlas.js";
import { animationCommands } from "./animation/events.js";
import { loadFoliage } from "./animation/foliage.js";
import { WorldTextures } from "./animation/texture-lifecycle.js";
import { AppearanceCache } from "./animation/appearance.js";
import { openAnimationViewer } from "./animation/viewer.js";
import { VENDORS, COMBAT_VENDORS, RESOURCE_NODES } from "../game/adventure.js";
import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
  Rectangle,
  Graphics,
  Text,
} from "pixi.js";
import {
  project,
  unproject,
  depth,
  direction,
  frameIndex,
  beastArchetype,
  visualStep,
} from "./projection.js";
import {
  TOWN_BUILDINGS,
  TOWN_PORTALS,
  TOWN_LAWNS,
  TOWN_TREES,
  TOWN_SPAWN,
} from "./layout.js";
import {
  TOWN_RESIDENTS,
  TOWN_STALLS,
  TOWN_INTERACTIONS,
  residentPosition,
  residentAvailable,
} from "../game/town.js";
import { roomSpec, roomBounds, walkable } from "../game/model.js";
import { NavigationService } from "../game/NavigationService.js";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const hash = (s) =>
  [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
const stop = (e) => e.stopPropagation();
// Foot-anchored assets are independent of hit areas and navigation footprints.
export class IsometricWorld {
  constructor(host, bridge, config, scene) {
    Object.assign(this, { host, bridge, config, scene });
    this.mobEntities = new Map();
    this.effectPool = [];
    this.lastEffectAt = 0;
    this.actors = new Map();
    this.residents = [];
    this.labels = [];
    this.props = [];
    this.textureOwnership = new WorldTextures();
    this.textures = this.textureOwnership.textures;
    this.room = "";
    this.camera = { x: 0, y: 0 };
    this.zoom = 0.7;
    this.debug = {};
    this.frames = 0;
    this.frameTimes = [];
    this.elapsed = 0;
    this.dead = false;
    this.reducedMotion = false;
    this.motionOverride = null;
  }
  async init() {
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const savedMotion = window.localStorage.getItem("mochi-reduced-motion");
    this.motionOverride = savedMotion === null ? null : savedMotion === "true";
    this.reducedMotion = this.motionOverride ?? this.motionPreference.matches;
    this.onMotionPreference = (event) => {
      if (this.motionOverride !== null) return;
      this.reducedMotion = event.matches;
      this.updateMotionControl();
    };
    this.motionPreference.addEventListener("change", this.onMotionPreference);
    this.loading = el("div", "iso-loading", "Opening the gates…");
    this.host.append(this.loading);
    this.app = new Application();
    await this.app.init({
      resizeTo: this.host,
      background: "#dde6ca",
      antialias: true,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
      preference: "webgl",
    });
    if (this.dead) {
      this.app.destroy(true);
      return;
    }
    this.host.append(this.app.canvas);
    this.app.canvas.setAttribute(
      "aria-label",
      "Painterly isometric world. Click paths to walk, residents to talk, or buildings to enter.",
    );
    const [buildings, props, characters, terrain, adventure] =
      await Promise.all(
        ["buildings", "props", "characters", "terrain", "adventure"].map((n) =>
          Assets.load("/assets/isoworld/" + n + "-v1.png"),
        ),
      );
    if (this.dead) return;
    this.terrain = terrain;
    this.atlases = {
      buildings: this.split(buildings, 4, 2),
      props: this.split(props, 4, 2),
      adventure: this.split(adventure, 4, 2),
      characters: this.split(characters, 4, 4),
    };
    try {
      const response = await fetch("/assets/isoworld/foliage-v2.json");
      if (response.ok) {
        const metadata = await response.json();
        const texture = await Assets.load("/assets/isoworld/" + metadata.image);
        this.textureOwnership.shared(texture);
        const foliage = this.textureOwnership.atlas(loadFoliage(texture, metadata));
        // Explicit source rectangles keep both crowns inside their own cutout.
        [this.atlases.props[0], this.atlases.props[1]] = foliage.ownedTextures;
      }
    } catch (error) {
      console.warn("Foliage art fallback:", error.message);
    }
    this.animationAtlases = await Promise.all(
      ANIMATION_SETS.map(async (set) => {
        const texture = await Assets.load("/assets/isoworld/" + set.texture);
        this.textureOwnership.shared(texture);
        const metadata = await (
          await fetch(
            "/assets/isoworld/" + set.texture.replace(".png", ".json"),
          )
        ).json();
        return this.textureOwnership.atlas(loadAnimationAtlas(texture, set, metadata));
      }),
    );
    this.actionAtlases = [];
    const actionTextures = new Set();
    // Optional action sheets never prevent a compatible locomotion fallback.
    await Promise.all(
      ANIMATION_SETS.map(async (set, i) => {
        let art = this.animationAtlases[i];
        for (const suffix of ["actions-v1", "reactions-v1", ...(i < 2 ? ["fishing-v2", "combat-v2"] : i === 3 ? ["cleanup-v2"] : [])]) {
          try {
            const response = await fetch(
              `/assets/isoworld/${set.id}-${suffix}.json`,
            );
            if (!response.ok) continue;
            const m = await response.json();
            const texture = await Assets.load("/assets/isoworld/" + m.image);
            this.textureOwnership.shared(texture);
            actionTextures.add(texture);
            art = this.textureOwnership.atlas(loadActionAtlas(texture, set, m, art));
            this.actionAtlases[i] = art;
          } catch (error) {
            console.warn(`Action art fallback: ${set.id}`, error.message);
          }
        }
      }),
    );
    this.mobAnimationAtlases = {};
    await Promise.all(
      Object.entries(MOB_ACTION_SHEETS).map(async ([id, metadataFile]) => {
        try {
          const response = await fetch(`/assets/isoworld/${metadataFile}`);
          if (!response.ok) throw Error(`Missing optional atlas: ${response.status}`);
          const m = await response.json();
          const texture = await Assets.load("/assets/isoworld/" + m.image);
          this.textureOwnership.shared(texture);
          actionTextures.add(texture);
          const set = mobAnimationSet(id, m);
          const base = {
            rows: set.directions.map(() => ({})),
            metadata: { heights: { idle: m.height, walk: m.height } },
          };
          this.mobAnimationAtlases[id] = this.textureOwnership.atlas(loadActionAtlas(texture, set, m, base));
        } catch (error) {
          console.warn(`Mob art fallback: ${id}`, error.message);
        }
      }),
    );
    // A route may unmount while asynchronous sheets are loading.
    if (this.dead) return;
    this.actionTextureBytes = [...actionTextures].reduce(
      (n, t) => n + t.width * t.height * 4,
      0,
    );
    this.appearanceCache = new AppearanceCache(this.app.renderer);
    this.cameraVelocity = { x: 0, y: 0 };
    this.motionMetrics = {
      snaps: 0,
      corrections: 0,
      localSpeed: 0,
      remoteSpeed: 0,
      frameMs: 0,
    };
    this.seatedFrames = this.atlases.characters.slice(0, 8).map((t) => {
      const f = t.frame;
      const seated = new Texture({
        source: t.source,
        frame: new Rectangle(f.x, f.y, f.width, f.height * 0.72),
      });
      this.textureOwnership.own(seated);
      return seated;
    });
    this.root = new Container();
    this.ground = new Container();
    this.objects = new Container({ sortableChildren: true });
    this.effects = new Container();
    this.root.addChild(this.ground, this.objects, this.effects);
    this.app.stage.addChild(this.root);
    this.ui = el("div", "iso-label-layer");
    this.host.append(this.ui);
    this.makeControls();
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointertap", (e) => {
      const q = this.root.toLocal(e.global);
      this.scene.moveTo(unproject(q));
    });
    this.instrument();
    this.unsub = this.scene.subscribe(() => this.sync());
    this.sync();
    this.tickFn = (t) => this.frame(t.deltaMS / 1000);
    this.app.ticker.add(this.tickFn);
    this.loading.textContent = "Arriving…";
    this.loading.hidden = true;
  }
  split(texture, cols, rows) {
    // Generated source sheets stay immutable. Remove disconnected cell bleed in
    // the runtime atlas, then trim each sprite to its main silhouette and feet.
    const canvas = document.createElement("canvas");
    canvas.width = texture.width;
    canvas.height = texture.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(texture.source.resource, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
      out = [],
      frames = [];
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const x0 = Math.floor((col * canvas.width) / cols),
          y0 = Math.floor((row * canvas.height) / rows),
          w = Math.floor(((col + 1) * canvas.width) / cols) - x0,
          h = Math.floor(((row + 1) * canvas.height) / rows) - y0;
        const visited = new Uint8Array(w * h);
        let best = [];
        for (let j = 0; j < w * h; j++) {
          if (visited[j]) continue;
          const ax = j % w,
            ay = Math.floor(j / w);
          if (pixels.data[((y0 + ay) * canvas.width + x0 + ax) * 4 + 3] < 16)
            continue;
          const queue = [j];
          visited[j] = 1;
          for (let k = 0; k < queue.length; k++) {
            const v = queue[k],
              x = v % w,
              y = Math.floor(v / w);
            for (const n of [
              x > 0 ? v - 1 : -1,
              x < w - 1 ? v + 1 : -1,
              y > 0 ? v - w : -1,
              y < h - 1 ? v + w : -1,
            ]) {
              if (n < 0 || visited[n]) continue;
              visited[n] = 1;
              const nx = n % w,
                ny = Math.floor(n / w);
              if (
                pixels.data[((y0 + ny) * canvas.width + x0 + nx) * 4 + 3] >= 16
              )
                queue.push(n);
            }
          }
          if (queue.length > best.length) best = queue;
        }
        const kept = new Uint8Array(w * h);
        let minX = w,
          minY = h,
          maxX = 0,
          maxY = 0;
        for (const i of best) {
          kept[i] = 1;
          const x = i % w,
            y = Math.floor(i / w);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        for (let j = 0; j < w * h; j++)
          if (!kept[j])
            pixels.data[
              ((y0 + Math.floor(j / w)) * canvas.width + x0 + (j % w)) * 4 + 3
            ] = 0;
        frames.push(
          new Rectangle(
            x0 + minX,
            y0 + minY,
            Math.max(1, maxX - minX + 1),
            Math.max(1, maxY - minY + 1),
          ),
        );
      }
    ctx.putImageData(pixels, 0, 0);
    const source = Texture.from(canvas);
    this.textureOwnership.own(source, true);
    for (const frame of frames) {
      const t = new Texture({ source: source.source, frame });
      out.push(t);
      this.textureOwnership.own(t);
    }
    return out;
  }
  sprite(texture, p, width, layer = this.objects) {
    const s = new Sprite(texture);
    s.anchor.set(0.5, 1);
    s.width = width;
    s.scale.y = s.scale.x;
    const q = project(p);
    s.position.set(q.x, q.y);
    s.zIndex = depth(p);
    layer.addChild(s);
    return s;
  }
  label(text, p, height = 0, cls = "iso-place-label", action) {
    const node = el(action ? "button" : "div", cls, text);
    if (action) {
      node.type = "button";
      node.onclick = action;
    }
    this.ui.append(node);
    const label = { node, p, height };
    this.labels.push(label);
    return label;
  }
  clearMap() {
    for (const e of this.mobEntities.values()) e.label.node.remove();
    this.mobEntities.clear();
    this.effectPool = [];
    this.lastEffectSeq ??= 0;
    for (const a of this.actors.values()) {
      a.node.remove();
      a.bubble.remove();
    }
    this.ground.removeChildren().forEach((n) => n.destroy());
    this.objects.removeChildren().forEach((n) => n.destroy({ children: true }));
    this.effects.removeChildren().forEach((n) => n.destroy());
    for (const l of this.labels) l.node.remove();
    this.labels = [];
    this.actors.clear();
    this.residents = [];
    this.props = [];
    this.ripple = null;
    this.board = null;
    this.debugGraphic = null;
    this.markerGraphic = null;
    this.followGraphic = null;
    if (this.groundTexture) {
      this.groundTexture.destroy(true);
      this.groundTexture = null;
    }
  }
  map() {
    this.clearMap();
    const spec = roomSpec(this.room),
      town = this.room.split(":")[0] === "town";
    this.roomTitle.textContent = spec.name;
    this.minimap.setAttribute("aria-label", `${spec.name} overview. Click to travel to a path.`);
    this.subtitle.textContent = town
      ? "Wander slowly. Stay a little."
      : spec.subtitle;
    this.scene.audio.setRoom(this.room);
    this.paintGround(town, spec);
    if (town) {
      for (const b of TOWN_BUILDINGS) this.building(b);
      for (const s of TOWN_STALLS) {
        const idx = { food: 4, threads: 5, plant: 6, toy: 7, rare: 7, tech: 7 }[
          s.goods
        ];
        const p = { x: s.x, y: s.y + 40 };
        const sprite = this.sprite(this.atlases.buildings[idx], p, 265);
        this.click(sprite, () => this.bridge.resident(s.id, s.x, s.y + 105));
        this.label(
          s.title
            .replace(/'S/g, "'s")
            .toLowerCase()
            .replace(/(^| )\w/g, (c) => c.toUpperCase()),
          p,
          -13,
          "iso-place-label",
          () => this.bridge.resident(s.id, s.x, s.y + 105),
        );
        this.props.push({ sprite, p, w: 155, h: 85 });
      }
      for (const [x, y, index, width] of TOWN_TREES) {
        const p = { x, y };
        const sprite = this.sprite(this.atlases.props[index], p, width);
        this.props.push({ sprite, p, w: 50, h: 50, tree: true });
      }
      for (const [x, y] of [
        [-200, 510],
        [50, 1240],
        [1580, 90],
        [1810, 1470],
        [920, -280],
      ])
        this.sprite(this.atlases.props[2], { x, y }, 160);
      const fountain = this.sprite(
        this.atlases.props[3],
        { x: 600, y: 470 },
        245,
      );
      this.click(fountain, () => this.bridge.interact("fountain", 600, 530));
      this.label(
        "The Wishing Lantern",
        { x: 600, y: 490 },
        0,
        "iso-landmark-label",
      );
      this.ripple = new Graphics();
      const fq = project({ x: 600, y: 430 });
      this.ripple.position.set(fq.x, fq.y - 26);
      this.ripple.zIndex = depth({ x: 600, y: 470 }) + 1;
      this.objects.addChild(this.ripple);
      for (const seat of TOWN_INTERACTIONS.filter((p) => p.seat)) {
        const p = seat.seat;
        const sprite = this.sprite(this.atlases.props[4], p, 112);
        this.click(sprite, () => this.bridge.interact(seat.id, seat.x, seat.y));
        this.props.push({ sprite, p, w: 110, h: 34 });
      }
      for (const p of [
        { x: 90, y: 370 },
        { x: 270, y: 600 },
      ])
        this.sprite(this.atlases.props[5], p, 120);
      for (const p of [
        { x: -140, y: 850 },
        { x: 1850, y: 230 },
      ])
        this.sprite(this.atlases.props[6], p, 165);
      for (const p of [
        { x: 400, y: 690 },
        { x: 1050, y: 720 },
        { x: 250, y: 150 },
      ]) {
        const s = this.sprite(this.atlases.props[7], p, 92);
        if (p.x === 400)
          this.click(s, () => this.bridge.interact("mailbox", 400, 750));
      }
      this.board = new Graphics()
        .roundRect(-55, -86, 110, 70, 8)
        .fill("#80684e")
        .roundRect(-48, -80, 96, 56, 4)
        .fill("#f1e5c9");
      const bq = project({ x: 900, y: 800 });
      this.board.position.set(bq.x, bq.y);
      this.board.zIndex = depth({ x: 900, y: 800 });
      this.objects.addChild(this.board);
      const boardText = new Text({
        text: "TOWN\nNOTICES",
        style: {
          fontFamily: "Georgia",
          fontSize: 12,
          fill: "#745e3e",
          align: "center",
        },
      });
      boardText.anchor.set(0.5);
      boardText.position.set(bq.x, bq.y - 52);
      boardText.zIndex = this.board.zIndex + 1;
      this.objects.addChild(boardText);
      this.click(this.board, () =>
        this.bridge.interact("noticeboard", 900, 850),
      );
      this.label(
        "Town notices",
        { x: 900, y: 800 },
        68,
        "iso-place-label",
        () => this.bridge.interact("noticeboard", 900, 850),
      );
      for (const p of TOWN_PORTALS.filter((p) => p.asset === null))
        this.label("↗ " + p.label, p, 0, "iso-road-label", () =>
          this.bridge.join(p.id),
        );
      for (const [id, v] of Object.entries(VENDORS)) {
        const p = { x: v.x, y: v.y - 70 };
        const cart = this.sprite(this.atlases.adventure[7], p, 195);
        this.click(cart, () => this.bridge.interact("vendor:" + id, v.x, v.y));
        this.label(v.name, p, 0, "iso-place-label", () =>
          this.bridge.interact("vendor:" + id, v.x, v.y),
        );
      }
      for (const [text, p] of [
        ["TRADING HALL · PAPER MARKETS", { x: 1150, y: 70 }],
        ["MARKETPLACE · STYLE & HOME", { x: 1750, y: 770 }],
        ["COMBAT LANE · GEAR & MAGIC", { x: -250, y: 80 }],
        ["MERCHANT ROW · FISH & WOOD", { x: 420, y: 1170 }],
        ["SOCIAL PLAZA", { x: 660, y: 880 }],
      ])
        this.label(text, p, 0, "iso-road-label");
      for (const n of TOWN_RESIDENTS) this.addResident(n);
      // Distant roofs and a soft orchard extend beyond navigable boundaries.
      for (const [x, y, index] of [
        [-650, -750, 0],
        [2100, -620, 1],
        [2470, 250, 0],
        [-900, 1150, 0],
        [700, 2150, 0],
      ]) {
        const s = this.sprite(
          this.atlases.buildings[index],
          { x, y },
          220,
          this.ground,
        );
        s.alpha = 0.42;
      }
    } else {
      if (["forest", "lake", "ruins", "yard"].includes(spec.id)) {
        for (const [x, y, i] of [
          [150, 210, 0],
          [1000, 190, 0],
          [180, 640, 1],
          [1090, 620, 0],
          [510, 175, 0],
        ])
          this.sprite(this.atlases.props[i], { x, y }, 190);
        for (const node of RESOURCE_NODES.filter((n) => n.room === spec.id)) {
          const p = { x: node.x, y: node.y };
          const sprite = this.sprite(
            this.atlases.props[node.kind === "fishing" ? 3 : 0],
            p,
            node.kind === "fishing" ? 150 : 200,
          );
          this.click(sprite, () => this.bridge.gather(node));
          this.label(
            node.name + " · Lv " + node.level,
            p,
            node.kind === "fishing" ? 35 : 120,
            "iso-place-label",
            () => this.bridge.gather(node),
          );
        }
        if (spec.id === "lake") {
          const water = new Graphics()
            .ellipse(0, 0, 160, 55)
            .fill({ color: 0x78acb7, alpha: 0.7 })
            .ellipse(0, -6, 130, 35)
            .stroke({ color: 0xd3e8e5, width: 3 });
          const q = project({ x: 760, y: 200 });
          water.position.set(q.x, q.y);
          water.zIndex = -10000;
          this.objects.addChild(water);
        }
        if (spec.id === "ruins") {
          for (const p of [
            { x: 330, y: 210 },
            { x: 740, y: 230 },
          ]) {
            const g = new Graphics()
              .roundRect(-22, -95, 44, 90, 5)
              .fill("#a49d98")
              .roundRect(-30, -105, 60, 14, 3)
              .fill("#c9c1b7")
              .roundRect(-30, -8, 60, 15, 4)
              .fill("#817e78");
            const q = project(p);
            g.position.set(q.x, q.y);
            g.zIndex = depth(p);
            this.objects.addChild(g);
          }
        }
      }
      for (const [id, label, x, y] of spec.props) {
        const index =
          id === "town"
            ? 3
            : spec.id === "cafe"
              ? 0
              : spec.id === "exchange"
                ? 1
                : spec.id === "arcade"
                  ? 2
                  : 4;
        this.building({
          id,
          label,
          x,
          y,
          asset: index,
          width: id === "town" ? 190 : 270,
        });
      }
      for (const p of [
        { x: 50, y: 460 },
        { x: 1130, y: 650 },
      ])
        this.sprite(this.atlases.props[0], p, 175);
      if (this.scene.snapshot().home) {
        const home = this.scene.snapshot().home;
        let i = 0;
        for (const pet of home.pets) {
          if (
            !this.scene
              .snapshot()
              .players.some((p) => p.companion?.id === pet.id)
          )
            this.actor(
              "home:" + pet.id,
              { ...pet, x: 250 + i++ * 100, y: 500 },
              "pet",
              null,
            );
        }
        this.label(
          "Your own quiet corner",
          { x: 600, y: 420 },
          0,
          "iso-landmark-label",
        );
      }
    }
    this.debugGraphic = new Graphics();
    this.effects.addChild(this.debugGraphic);
    this.markerGraphic = new Graphics();
    this.effects.addChild(this.markerGraphic);
    this.followGraphic = new Graphics();
    this.effects.addChild(this.followGraphic);
    const focus = town ? { x: 600, y: 500 } : { x: 600, y: 500 };
    this.camera = project(focus);
    this.zoom = this.host.clientWidth < 650 ? 0.72 : 0.57;
    this.cameraReady = false;
    this.updateDebug();
  }
  building(b) {
    const p = { x: b.x, y: b.y + 60 };
    const s = this.sprite(this.atlases.buildings[b.asset], p, b.width);
    this.click(s, () => this.bridge.interact(b.id, b.x, b.y + 160));
    this.label(b.label, p, -18, "iso-place-label", () =>
      this.bridge.interact(b.id, b.x, b.y + 160),
    );
    this.props.push({ sprite: s, p, w: b.w ?? 188, h: b.h ?? 126 });
  }
  click(object, fn) {
    object.eventMode = "static";
    object.cursor = "pointer";
    object.on("pointertap", (e) => {
      e.stopPropagation();
      fn();
    });
  }
  paintGround(town, spec) {
    const canvas = document.createElement("canvas");
    canvas.width = 3072;
    canvas.height = 2048;
    const ctx = canvas.getContext("2d");
    const ox = 2400,
      oy = 750;
    ctx.scale(canvas.width / 4800, canvas.height / 3000);
    ctx.translate(ox, oy);
    let seed = 73;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const wash = ctx.createLinearGradient(-2200, -500, 2000, 2000);
    wash.addColorStop(0, "#a8bd91");
    wash.addColorStop(0.5, "#c4d2a3");
    wash.addColorStop(1, "#93b394");
    ctx.fillStyle = wash;
    ctx.fillRect(-ox, -oy, 4800, 3000);
    for (let i = 0; i < 14500; i++) {
      ctx.globalAlpha = 0.02 + rand() * 0.06;
      ctx.fillStyle = ["#486f57", "#f7edbe", "#668767"][i % 3];
      ctx.beginPath();
      ctx.ellipse(
        rand() * 4800 - ox,
        rand() * 3000 - oy,
        rand() * 16 + 2,
        rand() * 5 + 1,
        -0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const polygon = (pts, color) => {
      ctx.beginPath();
      pts
        .map(project)
        .forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    const patterns = [0, 1, 2].map((index) => {
      const tile = document.createElement("canvas");
      tile.width = 512;
      tile.height = 512;
      const t = tile.getContext("2d"),
        image = this.terrain.source.resource;
      t.drawImage(
        image,
        ((index % 2) * image.width) / 2,
        (Math.floor(index / 2) * image.height) / 2,
        image.width / 2,
        image.height / 2,
        0,
        0,
        512,
        512,
      );
      const pattern = ctx.createPattern(tile, "repeat");
      pattern.setTransform(
        new DOMMatrix([0.72 * 0.7, 0.36 * 0.7, -0.72 * 0.7, 0.36 * 0.7, 0, 0]),
      );
      return pattern;
    });
    ctx.globalAlpha = 0.33;
    ctx.fillStyle = patterns[1];
    ctx.fillRect(-ox, -oy, 4800, 3000);
    ctx.globalAlpha = 1;
    const rect = (x, y, w, h, color) => {
      polygon(
        [
          { x: x - w / 2, y: y - h / 2 },
          { x: x + w / 2, y: y - h / 2 },
          { x: x + w / 2, y: y + h / 2 },
          { x: x - w / 2, y: y + h / 2 },
        ],
        color,
      );
      if (
        color === "#ebddbd" ||
        color === "#e6d7b5" ||
        color === "#e5d6b7" ||
        color === "#a2bf8c" ||
        color === "#e7d6b6"
      ) {
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = color === "#a2bf8c" ? 0.55 : 0.7;
        ctx.fillStyle = patterns[color === "#a2bf8c" ? 1 : 0];
        ctx.fillRect(-ox, -oy, 4800, 3000);
        ctx.restore();
      }
    };
    const road = (a, b, width) => {
      const p = project(a),
        q = project(b);
      ctx.lineCap = "round";
      ctx.lineWidth = width + 18;
      ctx.strokeStyle = "#acb18e";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = "#e6d5b1";
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = patterns[2];
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    if (town) {
      road({ x: -650, y: 500 }, { x: 2200, y: 500 }, 150);
      road({ x: 600, y: -650 }, { x: 600, y: 1750 }, 150);
      road({ x: 950, y: 1100 }, { x: 2200, y: 1100 }, 130);
      road({ x: 1500, y: 50 }, { x: 1500, y: 1650 }, 120);
      road({ x: -100, y: 160 }, { x: -100, y: 1500 }, 115);
      road({ x: 300, y: -300 }, { x: 1500, y: -300 }, 120);
      rect(600, 610, 1350, 1250, "#c9c2a2");
      rect(600, 610, 1310, 1210, "#ebddbd");

      // Broad pockets around each shop, never a compressed stall strip.
      for (const s of TOWN_STALLS) rect(s.x, s.y + 80, 340, 300, "#e6d7b5");
      for (const b of TOWN_BUILDINGS)
        rect(b.x, b.y + 70, b.w + 140, b.h + 180, "#e5d6b7");
      for (const [x, y, w, h] of TOWN_LAWNS) rect(x, y, w, h, "#a2bf8c");
      const q = project({ x: 600, y: 430 });
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, 190, 96, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#bdad82";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, 215, 109, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#e9d5a9";
      ctx.lineWidth = 6;
      ctx.stroke();
      for (let i = 0; i < 600; i++) {
        const a = rand() * Math.PI * 2,
          r = 240 + rand() * 700,
          p = project({ x: 600 + Math.cos(a) * r, y: 500 + Math.sin(a) * r });
        if (i % 3 === 0 || r < 390) continue;
        ctx.fillStyle = ["#edb5a1", "#f3ddb0", "#b0a1c1"][i % 3];
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 2 + rand() * 3, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (["forest", "lake", "ruins", "yard"].includes(spec.id)) {
      if (spec.id === "ruins") {
        rect(630, 460, 1050, 470, "#c1b9a8");
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = patterns[2];
        ctx.fillRect(-ox, -oy, 4800, 3000);
        ctx.globalAlpha = 1;
      } else {
        rect(620, 470, 1080, 480, "#a2bf8c");
        road({ x: 1080, y: 520 }, { x: 560, y: 450 }, 70);
        road({ x: 560, y: 450 }, { x: 320, y: 300 }, 50);
      }
      if (spec.id === "lake") {
        polygon(
          [
            { x: 450, y: 120 },
            { x: 1140, y: 120 },
            { x: 1140, y: 265 },
            { x: 450, y: 210 },
          ],
          "#81b1b7",
        );
      }
    } else {
      rect(600, 500, 1280, 770, "#b4b697");
      rect(600, 500, 1240, 730, "#e7d6b6");
      road({ x: 100, y: 580 }, { x: 1200, y: 580 }, 135);
    }
    this.groundTexture = Texture.from(canvas);
    const s = new Sprite(this.groundTexture);
    s.position.set(-ox, -oy);
    s.width = 4800;
    s.height = 3000;
    this.ground.addChild(s);
  }
  addResident(n) {
    const p = residentPosition(
      n,
      Date.now() + (this.scene.serverClockOffset ?? 0),
    );
    const a = this.actor(
      "npc:" + n.id,
      {
        ...p,
        avatar: {
          display_name: n.name,
          body_color: n.color,
          appearance: { style: hash(n.id) % 2 ? "curly" : "classic" },
        },
        userId: n.id,
      },
      "npc",
      () => this.bridge.resident(n.id, a.p.x, a.p.y),
    );
    a.definition = n;
    a.styleKey = null;
    this.styleActor(a);
    this.residents.push(a);
    a.role = n.role;
    a.node.title = n.role + " · authored Town resident";
  }
  actor(key, data, type, onClick) {
    const group = new Container();
    this.objects.addChild(group);
    const shadow = new Graphics()
      .ellipse(0, 1, type === "pet" ? 29 : 20, 9)
      .fill({ color: "#4b5647", alpha: 0.19 });
    group.addChild(shadow);
    const cape = new Graphics();
    group.addChild(cape);
    const s = new Sprite(this.atlases.characters[0]);
    s.anchor.set(0.5, 1);
    group.addChild(s);
    const transitionSprite = new Sprite(s.texture);
    transitionSprite.visible = false;
    group.addChild(transitionSprite);
    const seatLegs = new Graphics()
      .moveTo(-9, -22)
      .lineTo(-10, -4)
      .moveTo(9, -22)
      .lineTo(12, -4)
      .stroke({ color: "#c4b195", width: 7 })
      .ellipse(-11, -3, 8, 4)
      .ellipse(13, -3, 8, 4)
      .fill("#725641");
    group.addChild(seatLegs);
    seatLegs.visible = false;
    const cosmetics = new Graphics();
    group.addChild(cosmetics);
    const guides = new Graphics();
    group.addChild(guides);
    const node = el(
      "button",
      type === "npc" ? "iso-npc-name" : "iso-character-name",
      data.avatar?.display_name ?? data.name,
    );
    node.type = "button";
    node.onclick = onClick ?? (() => this.bridge.inspectPet(data.id));
    this.ui.append(node);
    const bubble = el("button", "iso-speech");
    bubble.type = "button";
    this.ui.append(bubble);
    const a = {
      key,
      type,
      data,
      p: { x: data.x, y: data.y },
      target: data,
      group,
      s,
      transitionSprite,
      shadow,
      cape,
      cosmetics,
      guides,
      seatLegs,
      node,
      bubble,
      facing: 0,
      name: data.name ?? data.avatar?.display_name,
      pose: 0,
      gait: new Gait(type === "pet" ? MOTION.petStride : MOTION.stride),
    };
    this.actors.set(key, a);
    if (onClick) this.click(group, onClick);
    a.onClick = onClick;
    this.styleActor(a);
    return a;
  }
  styleActor(a) {
    const styleKey = JSON.stringify([
      a.data.avatar,
      a.data.equipment,
      a.data.profile?.variant,
      a.data.profile?.beast,
      a.data.name,
    ]);
    if (a.styleKey === styleKey) return;
    a.styleKey = styleKey;
    a.gestureAppearance = null;
    const d = a.data,
      pet = a.type === "pet";
    a.row = pet
      ? beastArchetype(d) === "woodland-deer"
        ? 3
        : 2
      : d.avatar?.appearance?.style === "curly"
        ? 1
        : 0;
    a.animationSet = ANIMATION_SETS[a.row];
    a.playback = new AnimationPlayback(a.animationSet);
    a.playback.idleTime = (hash(a.key) % 480) / 100;
    a.gait.stride = a.animationSet.strideDistance;
    a.s.texture = this.animationAtlases[a.row].rows[a.facing].idle[0];
    a.s.height = pet ? 83 : 124;
    a.s.scale.x = a.s.scale.y;
    a.height = a.s.height;
    a.cape.clear();
    a.cosmetics.clear();
    const slots = d.avatar?.equipment ?? d.equipment ?? {};
    if (!pet) {
      if (slots.back)
        a.cape
          .poly([-24, -30, -26, -64, 0, -78, 25, -57, 20, -28])
          .fill("#896a9d");
      if (slots.hat)
        a.cosmetics
          .ellipse(0, -a.height * 0.79, 21, 6)
          .fill("#996568")
          .roundRect(-13, -a.height * 0.79 - 18, 26, 18, 5)
          .fill("#b9827d");
      if (slots.face)
        a.cosmetics
          .roundRect(-12, -a.height * 0.68, 10, 7, 3)
          .stroke({ color: "#684c52", width: 2 })
          .roundRect(2, -a.height * 0.68, 10, 7, 3)
          .stroke({ color: "#684c52", width: 2 });
      if (slots.hand || slots.accessory)
        a.cosmetics.circle(22, -30, 7).fill("#d8b56b");
      if (slots.top)
        a.cosmetics
          .poly([-11, -39, 11, -39, 9, -23, -9, -23])
          .fill({ color: d.avatar.body_color, alpha: 0.65 });
    } else {
      if (slots.hat)
        a.cosmetics
          .ellipse(0, -a.height * 0.7, 13, 5)
          .fill("#b78391")
          .roundRect(-8, -a.height * 0.7 - 9, 16, 10, 4)
          .fill("#bf8c9e");
      if (slots.accessory) a.cosmetics.circle(16, -24, 5).fill("#e0b657");
    }
    if (a.type === "npc") {
      const id = a.definition?.id;
      if (id === "mina")
        a.cosmetics
          .roundRect(-12, -a.height + 5, 24, 15, 6)
          .circle(-8, -a.height + 5, 7)
          .circle(0, -a.height + 1, 8)
          .circle(8, -a.height + 5, 7)
          .fill("#f8f0dc");
      if (id === "loom")
        a.cosmetics
          .poly([-10, -48, 10, -48, 12, -23, -12, -23])
          .fill("#d7bb99");
      if (id === "pixel")
        a.cosmetics
          .roundRect(-12, -a.height * 0.69, 11, 8, 3)
          .roundRect(2, -a.height * 0.69, 11, 8, 3)
          .stroke({ color: "#715c51", width: 2 });
      if (id === "otto")
        a.cosmetics
          .roundRect(8, -40, 21, 18, 2)
          .fill("#c39c6f")
          .moveTo(18, -40)
          .lineTo(18, -22)
          .stroke({ color: "#f4dab5", width: 2 });
      if (id === "bea")
        a.cosmetics
          .ellipse(15, -34, 9, 13)
          .fill("#a8744e")
          .rect(12, -59, 5, 22)
          .fill("#89643c")
          .circle(15, -34, 3)
          .fill("#574739");
    }
    a.slots = slots;
    a.cosmetics.visible = a.cape.visible = true;
    a.appearanceArt = this.appearanceCache.compose(
      this.animationAtlases[a.row],
      a.styleKey,
      [
        { kind: "cape", graphics: a.cape },
        { kind: "cosmetics", graphics: a.cosmetics },
      ],
      slots,
      a.key === "player:" + this.bridge.selfId ? 192 : 128,
    );
    a.cosmetics.visible = a.cape.visible = !a.appearanceArt?.composited;
    a.node.textContent =
      (d.avatar?.display_name ?? d.name ?? "Mochi") +
      (a.type === "npc" ? " · NPC" : "");
  }
  sync() {
    if (!this.app?.stage || !this.root) return;
    const snap = this.scene.snapshot();
    if (this.room !== snap.roomId) {
      this.room = snap.roomId;
      this.map();
    }
    this.loadingState = snap.loading;
    if (this.loading) this.loading.hidden = !snap.loading;
    this.syncAdventure(snap);
    const keep = new Set(this.residents.map((a) => a.key));
    for (const p of snap.players) {
      const key = "player:" + p.userId;
      keep.add(key);
      let a = this.actors.get(key);
      if (!a)
        a = this.actor(key, p, "player", () =>
          this.bridge.selectPlayer(p.userId),
        );
      a.target = p;
      a.data = p;
      this.styleActor(a);
      if (p.companion) {
        const k = "pet:" + p.companion.id;
        keep.add(k);
        let pet = this.actors.get(k);
        if (!pet)
          pet = this.actor(k, p.companion, "pet", () =>
            this.bridge.selectPet(p.userId, p.companion.id),
          );
        pet.target = p.companion;
        pet.data = p.companion;
        this.styleActor(pet);
      }
    }
    for (const [key, a] of this.actors)
      if (!keep.has(key) && !key.startsWith("home:") && !key.startsWith("dev:"))
        this.removeActor(key);
    if (this.marker !== snap.marker) {
      this.marker = snap.marker;
      if (this.marker) this.markerAt = performance.now();
    }
  }
  syncAdventure() {
    const data = this.scene.adventure;
    if (!data || data.roomId !== this.room) return;
    const alive = new Set();
    for (const m of data.mobs) {
      if (m.hp <= 0 && !this.mobEntities.has(m.id)) continue;
      if (
        m.hp <= 0 &&
        this.mobEntities.get(m.id)?.defeatUntil < performance.now()
      )
        continue;
      alive.add(m.id);
      let e = this.mobEntities.get(m.id);
      if (!e) {
        const index = {
            slime: 0,
            boar: 1,
            thornling: 2,
            riverbeast: 3,
            bandit: 4,
            guardian: 5,
            dummy: 6,
          }[m.type],
          p = { x: m.x, y: m.y },
          width = m.type === "guardian" ? 130 : m.type === "slime" ? 86 : 105;
        const g = this.sprite(this.atlases.adventure[index], p, width),
          bar = new Graphics(),
          shadow = new Graphics()
            .ellipse(0, 0, width * 0.3, 12)
            .fill({ color: 0x394633, alpha: 0.2 });
        this.objects.addChild(bar, shadow);
        const height = g.height;
        const label = this.label(
          m.name + " · Lv " + m.level,
          p,
          height + 20,
          "iso-place-label",
          () => this.bridge.targetMob(m),
        );
        const set = {
          ...ANIMATION_SETS[2],
          id: m.type,
          height,
          strideDistance: 90,
        };
        const fallback = {
          set,
          metadata: {
            heights: { walk: g.texture.height, idle: g.texture.height },
            mirrors: [false, false, false, false],
          },
          rows: Array.from({ length: 4 }, () => ({
            idle: Array(8).fill(g.texture),
            walk: Array(8).fill(g.texture),
          })),
        };
        const art = this.mobAnimationAtlases?.[m.type] ?? fallback;
        e = {
          g,
          bar,
          shadow,
          height,
          p,
          label,
          m,
          gait: new Gait(90),
          playback: new AnimationPlayback(art.set),
          art,
        };
        e.sourceHeight = e.art.metadata.heights.idle;
        this.mobEntities.set(m.id, e);
        this.click(g, () => this.bridge.targetMob(e.m));
      }
      if (m.hp <= 0 && !e.defeatUntil) {
        e.defeatUntil = performance.now() + 1100;
        e.playback.play("defeat");
      }
      if (m.hp > 0 && e.m.hp <= 0 && e.defeatUntil) {
        e.defeatUntil = 0;
        e.playback.clearAction();
      }
      e.m = m;
      e.g.eventMode = m.hp <= 0 || e.defeatUntil ? "none" : "static";
      e.bar
        .clear()
        .roundRect(-28, -e.height - 12, 56, 6, 3)
        .fill("#756e62")
        .roundRect(
          -28,
          -e.height - 12,
          Math.max(1, (56 * m.hp) / m.maxHp),
          6,
          3,
        )
        .fill("#ad6860");
    }
    for (const [id, e] of this.mobEntities)
      if (!alive.has(id)) {
        e.g.destroy();
        e.bar.destroy();
        e.shadow.destroy();
        e.label.node.remove();
        this.labels = this.labels.filter((l) => l !== e.label);
        this.mobEntities.delete(id);
      }
  }
  frameAdventure(dt) {
    if (
      this.scene.gatherCancelled &&
      this.gatherCancelled !== this.scene.gatherCancelled
    ) {
      this.gatherCancelled = this.scene.gatherCancelled;
      const actor = this.actors.get("player:" + this.bridge.selfId);
      if (
        ["fish-cast", "fish-wait", "chop"].includes(
          actor?.playback.action?.state,
        )
      )
        actor.playback.clearAction();
    }
    if (
      this.scene.lastInteraction &&
      this.lastInteraction !== this.scene.lastInteraction
    ) {
      this.lastInteraction = this.scene.lastInteraction;
      const actor = this.actors.get("player:" + this.lastInteraction.userId);
      if (actor && !actor.playback.action) actor.playback.play("interact");
    }
    for (const e of this.mobEntities.values()) {
      const old = e.p;
      e.p = visualStep(e.p, e.m, dt, 150);
      const speed = e.gait.update(e.p.x - old.x, e.p.y - old.y, dt);
      e.playback.update(e.gait, speed, dt);
      e.g.texture = selectTexture(
        e.art,
        e.playback,
        directionIndex(
          e.art.set,
          e.playback.action ? (e.actionFacing ?? e.gait.facing) : e.gait.facing,
        ),
      );
      e.g.scale.set(
        e.height /
          (e.playback.action
            ? stateHeight(e.art, e.playback.state)
            : e.sourceHeight),
      );
      const di = directionIndex(
        e.art.set,
        e.playback.action ? (e.actionFacing ?? e.gait.facing) : e.gait.facing,
      );
      if (stateMirrored(e.art, e.playback.state, di)) e.g.scale.x *= -1;
      e.g.anchor.set(
        e.art.set.footAnchor.x,
        e.art === this.mobAnimationAtlases?.[e.m.type]
          ? e.art.set.footAnchor.y
          : 1,
      );

      e.label.p = e.p;
      const q = project(e.p);
      e.g.position.set(q.x, q.y);
      e.g.zIndex = depth(e.p);
      e.bar.position.set(q.x, q.y);
      e.bar.zIndex = e.g.zIndex + 1;
      e.shadow.position.set(q.x, q.y);
      e.shadow.zIndex = e.g.zIndex - 1;
      const screen = this.root.toGlobal(q);
      e.g.visible =
        e.bar.visible =
        e.shadow.visible =
          screen.x > -150 &&
          screen.y > -150 &&
          screen.x < this.host.clientWidth + 150 &&
          screen.y < this.host.clientHeight + 150;
      if (e.defeatUntil) e.bar.visible = false;
    }
    for (const event of this.scene.combatEffects ?? []) {
      if (event.seq <= (this.lastEffectSeq ?? 0)) continue;
      this.lastEffectSeq = event.seq;
      for (const command of animationCommands(event)) {
        const actor =
          command.actor === "pet"
            ? this.actors.get(
                "pet:" + this.scene.data.get(event.userId)?.companion?.id,
              )
            : (this.actors.get(command.actor) ??
              this.mobEntities.get(command.actor));
        if (!actor?.playback) continue;
        if (actor.defeatUntil && command.state !== "defeat") continue;
        if (command.state) {
          if (actor.m && command.state === "defeat") {
            actor.defeatUntil = performance.now() + 1100;
            actor.g.eventMode = "none";
          }
          const options = {};
          if (actor.type === "player" && command.state === "defeat")
            options.hold = false;
          if (actor.row === 2 && ["attack", "special"].includes(command.state))
            options.duration = 0.42;
          if (actor.row === 3 && ["attack", "special"].includes(command.state))
            options.duration = 0.85;
          const opponent =
            command.actor === event.targetId
              ? event.pet
                ? this.actors.get(
                    "pet:" + this.scene.data.get(event.userId)?.companion?.id,
                  )?.p
                : this.actors.get("player:" + event.userId)?.p
              : this.mobEntities.get(event.targetId)?.p;
          if (opponent)
            actor.actionFacing = facing8(
              opponent.x - actor.p.x,
              opponent.y - actor.p.y,
              actor.gait.facing,
            );
          else actor.actionFacing = actor.gait.facing;
          actor.playback.play(command.state, options);
        } else actor.playback.clearAction();
      }
      if (
        ![
          "hit",
          "spell",
          "pet-hit",
          "pet-special",
          "mob-hit",
          "player_attack",
          "spell_cast",
          "mochi_attack",
          "mochi_special",
          "damage_taken",
        ].includes(event.kind)
      )
        continue;
      const target =
        event.kind === "mob-hit" || event.kind === "damage_taken"
          ? event.pet
            ? this.actors.get(
                "pet:" + this.scene.data.get(event.userId)?.companion?.id,
              )?.p
            : this.actors.get("player:" + event.userId)?.p
          : (this.mobEntities.get(event.targetId)?.p ??
            this.actors.get("player:" + event.userId)?.p);
      if (!target) continue;
      let fx = this.effectPool.find((f) => f.until < performance.now());
      if (!fx && this.effectPool.length < 16) {
        fx = { g: new Graphics(), until: 0 };
        this.effects.addChild(fx.g);
        this.effectPool.push(fx);
      }
      if (!fx) continue;

      fx.p = { ...target };
      fx.until = performance.now() + 450;
      fx.kind = event.kind;
    }
    for (const f of this.effectPool) {
      const left = (f.until - performance.now()) / 450;
      f.g.visible = left > 0;
      if (!f.g.visible) continue;
      const q = project(f.p);
      f.g.position.set(q.x, q.y - 30);
      f.g
        .clear()
        .circle(0, 0, this.reducedMotion ? 12 : (1 - left) * 50 + 8)
        .stroke({
          color: f.kind.includes("spell") ? 0xa09dd0 : 0xe9c57c,
          width: 3,
          alpha: left,
        })
        .moveTo(-22, -22)
        .lineTo(22, 22)
        .stroke({ color: 0xf9efd0, width: 4, alpha: left });
    }
  }
  removeActor(key) {
    const a = this.actors.get(key);
    a.group.destroy({ children: true });
    a.node.remove();
    a.bubble.remove();
    this.actors.delete(key);
  }
  updateMotionControl() {
    if (!this.motionControl) return;
    this.motionControl.setAttribute("aria-pressed", String(this.reducedMotion));
    this.motionControl.textContent = this.reducedMotion ? "◎" : "◌";
    this.motionControl.title = `Reduced decorative motion: ${this.reducedMotion ? "on" : "off"}`;
  }
  makeControls() {
    this.title = el("div", "iso-room-title");
    this.roomTitle = el("strong", "", "Town Square");
    this.subtitle = el("span", "", "Wander slowly. Stay a little.");
    this.title.append(
      el("small", "", "THE LANTERN DISTRICT"),
      this.roomTitle,
      this.subtitle,
    );
    this.host.append(this.title);
    this.controls = el("div", "iso-controls");
    const zoom = (text, delta) => {
      const b = el("button", "", text);
      b.type = "button";
      b.setAttribute("aria-label", delta < 0 ? "Zoom out" : "Zoom in");
      b.title = delta < 0 ? "Zoom out" : "Zoom in";
      b.onclick = () =>
        (this.zoom = Math.max(0.35, Math.min(1.3, this.zoom + delta)));
      this.controls.append(b);
    };
    zoom("−", -0.1);
    zoom("+", 0.1);
    const center = el("button", "", "⌂");
    center.type = "button";
    center.setAttribute("aria-label", "Recenter on your character");
    center.onclick = () => {
      const a = this.actors.get("player:" + this.bridge.selfId);
      if (a) this.camera = project(a.p);
    };
    this.controls.append(center);
    const sound = el("input", "");
    sound.type = "range";
    sound.min = 0;
    sound.max = 0.5;
    sound.step = 0.01;
    sound.value = this.scene.audio.volume;
    sound.setAttribute("aria-label", "Sound volume");
    sound.oninput = () => this.scene.audio.setVolume(Number(sound.value));
    this.controls.append(sound);
    this.motionControl = el("button", "", "◌");
    this.motionControl.type = "button";
    this.motionControl.setAttribute("aria-label", "Reduce decorative motion");
    this.motionControl.onclick = () => {
      this.reducedMotion = !this.reducedMotion;
      this.motionOverride = this.reducedMotion;
      window.localStorage.setItem("mochi-reduced-motion", String(this.reducedMotion));
      this.updateMotionControl();
    };
    this.updateMotionControl();
    this.controls.append(this.motionControl);
    this.host.append(this.controls);
    this.minimap = document.createElement("canvas");
    this.minimap.width = 180;
    this.minimap.height = 130;
    this.minimap.className = "iso-minimap";
    this.minimap.setAttribute(
      "aria-label",
      "Town overview. Click to travel to a path.",
    );
    this.minimap.onclick = (e) => {
      const rect = this.minimap.getBoundingClientRect(),
        bounds = roomBounds(this.room);
      this.scene.moveTo({
        x:
          bounds.minX +
          Math.max(
            0,
            Math.min(
              1,
              (((e.clientX - rect.left) / rect.width) * 180 - 10) / 160,
            ),
          ) *
            (bounds.maxX - bounds.minX),
        y:
          bounds.minY +
          Math.max(
            0,
            Math.min(
              1,
              (((e.clientY - rect.top) / rect.height) * 130 - 10) / 110,
            ),
          ) *
            (bounds.maxY - bounds.minY),
      });
    };
    this.host.append(this.minimap);
    if (this.config.development) {
      this.dev = el("details", "iso-debug");
      this.dev.append(el("summary", "", "World diagnostics"));
      for (const [key, label] of [
        ["nav", "Walkability / collisions"],
        ["depth", "Depth / foot and bubble anchors"],
        ["routes", "NPC routes / spawn / follow"],
      ]) {
        const l = el("label", "", label),
          i = el("input", "");
        i.type = "checkbox";
        i.onchange = () => {
          this.debug[key] = i.checked;
          this.updateDebug();
        };
        l.prepend(i);
        this.dev.append(l);
      }
      this.metrics = el("p", "");
      this.dev.append(this.metrics);
      const fpsLabel = el("label", "", "Render cap FPS"),
        fpsSelect = el("select", "");
      for (const value of [0, 30, 60, 120]) {
        const option = el(
          "option",
          "",
          value ? String(value) : "Display refresh",
        );
        option.value = value;
        fpsSelect.append(option);
      }
      fpsSelect.setAttribute("aria-label", "Render cap FPS");
      fpsSelect.onchange = () =>
        (this.app.ticker.maxFPS = Number(fpsSelect.value));
      fpsLabel.append(fpsSelect);
      this.dev.append(fpsLabel);
      this.motionDebug = el("p", "");
      this.dev.append(this.motionDebug);
      const preview = el("button", "", "Animation viewer");
      preview.onclick = async () => {
        await this.loadGestures();
        openAnimationViewer(
          this.animationAtlases,
          this.gestureAtlases,
          this.actionAtlases,
          this.mobAnimationAtlases,
        );
      };
      this.dev.append(preview);
      const crowdLabel = el("label", "", "Animation crowd (client-only)"),
        crowd = el("select", "");
      crowd.setAttribute("aria-label", "Animation crowd");
      for (const count of [0, 20, 40]) {
        const o = el("option", "", `${count} remote players + ${count} Mochis`);
        o.value = count;
        crowd.append(o);
      }
      crowd.onchange = () => this.animationCrowd(Number(crowd.value));
      crowdLabel.append(crowd);
      this.dev.append(crowdLabel);
      const legacyLabel = el("label", "", "Animation comparison"),
        legacy = el("select", "");
      legacy.setAttribute("aria-label", "Animation comparison");
      for (const text of ["Full body", "Legacy prototype"])
        legacy.append(el("option", "", text));
      legacy.onchange = async () => {
        if (legacy.value === "Legacy prototype" && !this.legacyWalk) {
          const { walkFramesFromAtlas } = await import("./WalkFrames.js");
          const texture = await Assets.load("/assets/isoworld/walk-rig-v1.png");
          const m = await (
            await fetch("/assets/isoworld/locomotion-v1.json")
          ).json();
          if (this.dead) return;
          this.textureOwnership.shared(texture);
          this.legacyWalk = walkFramesFromAtlas(
            this.atlases.characters,
            texture,
            m,
          );
          for (const row of this.legacyWalk.rows)
            for (const direction of row)
              for (const frame of direction.walk) this.textureOwnership.own(frame);
        }
        this.legacyComparison = legacy.value === "Legacy prototype";
        this.frameTimes.length = 0;
      };
      legacyLabel.append(legacy);
      this.dev.append(legacyLabel);
      for (const [name, values] of [
        ["latency", [0, 50, 100, 200]],
        ["jitter", [0, 25, 50]],
        ["loss", [0, 1, 3, 5]],
      ]) {
        const label = el(
            "label",
            "",
            name === "loss" ? "Snapshot loss %" : "Network " + name + " ms",
          ),
          select = el("select", "");
        for (const value of values) {
          const option = el("option", "", String(value));
          option.value = value;
          select.append(option);
        }
        select.setAttribute(
          "aria-label",
          name === "loss" ? "Snapshot loss %" : "Network " + name + " ms",
        );
        select.onchange = () =>
          (this.scene.network[name] = Number(select.value));
        label.append(select);
        this.dev.append(label);
      }
      this.host.append(this.dev);
    }
  }
  updateDebug() {
    if (!this.debugGraphic) return;
    const g = this.debugGraphic;
    g.clear();
    if (this.debug.nav) {
      for (const p of new NavigationService(this.room, 60).grid().nodes) {
        const q = project(p);
        g.circle(q.x, q.y, 3).fill({ color: "#427a69", alpha: 0.6 });
      }
      for (const p of this.props) {
        const q = project(p.p);
        g.ellipse(q.x, q.y, p.w * 0.5, p.h * 0.3).stroke({
          color: "#bd566b",
          width: 2,
        });
      }
    }
    if (this.debug.routes) {
      for (const n of TOWN_RESIDENTS.filter((n) => n.route)) {
        for (let i = 0; i < n.route.length; i++) {
          const p = project({ x: n.route[i][0], y: n.route[i][1] }),
            q = project({
              x: n.route[(i + 1) % n.route.length][0],
              y: n.route[(i + 1) % n.route.length][1],
            });
          g.moveTo(p.x, p.y)
            .lineTo(q.x, q.y)
            .stroke({ color: "#b377ce", width: 3 });
        }
      }
      const q = project(TOWN_SPAWN);
      g.circle(q.x, q.y, 24).stroke({ color: "#cc9361", width: 3 });
    }
  }
  loadGestures() {
    if (this.gestureLoading) return this.gestureLoading;
    this.gestureLoading = Promise.all(
      ANIMATION_SETS.slice(0, 2).map(async (set, i) => {
        const m = await (
          await fetch(
            "/assets/isoworld/human-" +
              (i ? "coral" : "sage") +
              "-gesture-v2.json",
          )
        ).json();
        const t = await Assets.load("/assets/isoworld/" + m.image);
        return this.textureOwnership.atlas(loadAnimationAtlas(t, set, m));
      }),
    )
      .then((a) => {
        if (!this.dead) this.gestureAtlases = a;
      })
      .catch((e) => {
        console.warn("Gesture art unavailable; using compatible idle", e);
      });
    return this.gestureLoading;
  }
  animationCrowd(count) {
    if (!this.config.development) return;
    for (const key of [...this.actors.keys()])
      if (key.startsWith("dev:")) this.removeActor(key);
    const self = this.actors.get("player:" + this.bridge.selfId),
      center = self?.p ?? { x: 550, y: 550 };
    for (let i = 0; i < count; i++)
      for (const pet of [false, true]) {
        const x = center.x + ((i % 8) - 3.5) * 42,
          y = center.y + (Math.floor(i / 8) - 2) * 65 + (pet ? 32 : 0),
          key = `dev:${pet ? "pet" : "player"}:${i}`;
        const a = this.actor(
          key,
          {
            x,
            y,
            id: key,
            userId: key,
            name: pet ? `Mochi ${i + 1}` : `Walker ${i + 1}`,
            avatar: {
              display_name: pet ? `Mochi ${i + 1}` : `Walker ${i + 1}`,
              appearance: { style: i % 2 ? "curly" : "classic" },
            },
            profile: {
              beast: { archetype: i % 2 ? "woodland-deer" : "moonfox" },
            },
          },
          pet ? "pet" : "player",
        );
        a.demo = { x, y, phase: i * 0.6, rate: 1.2 + (i % 3) * 0.4 };
      }
    this.frameTimes.length = 0;
  }
  frame(dt) {
    if (this.dead) return;
    const start = performance.now(),
      viewportWidth = this.host.clientWidth,
      viewportHeight = this.host.clientHeight;
    this.motionMetrics.frameMs = dt * 1000;
    dt = Math.min(0.1, dt);
    this.elapsed += dt;
    this.frames++;
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length > 180) this.frameTimes.shift();
    const snapshot = this.scene.snapshot();
    this.frameAdventure(dt);
    const now = Date.now(),
      self = this.actors.get("player:" + this.bridge.selfId),
      offset = this.scene.serverClockOffset ?? 0;
    for (const a of this.actors.values()) {
      if (a.definition) {
        a.group.visible = residentAvailable(a.definition, now + offset);
      }
      const oldX = a.p.x,
        oldY = a.p.y;
      if (a.demo) {
        const t = this.elapsed * a.demo.rate + a.demo.phase;
        a.p = {
          x: a.demo.x + Math.cos(t) * 80,
          y: a.demo.y + Math.sin(t) * 80,
        };
      } else if (a.definition) {
        a.p = residentPosition(a.definition, now + offset);
      } else if (a.key === "player:" + this.bridge.selfId) {
        const m = this.scene.motion.get(this.bridge.selfId);
        if (m) {
          a.p = m.prediction.step(dt);
          this.motionMetrics.error = m.prediction.error;
          this.motionMetrics.corrections = m.prediction.corrections;
          this.motionMetrics.snaps = m.prediction.snaps;
          this.motionMetrics.nodes = m.prediction.path.length;
          this.motionMetrics.waypoint = m.prediction.path[0];
        }
      } else {
        const buffer =
          a.type === "pet"
            ? this.scene.petMotion.get(a.data.id)
            : this.scene.motion.get(a.data.userId)?.buffer;
        const sampled = buffer?.sample(now + offset);
        if (sampled) a.p = sampled;
      }
      const teleport =
        Math.hypot(a.p.x - oldX, a.p.y - oldY) > MOTION.snapError;
      const speed = a.gait.update(
          teleport ? 0 : a.p.x - oldX,
          teleport ? 0 : a.p.y - oldY,
          dt,
        ),
        moving = a.gait.state === "walk";
      if (
        a.gait.state === "idle" &&
        a.type === "player" &&
        Number.isFinite(a.data.rotation)
      )
        a.gait.facing = facing8(
          Math.sin(a.data.rotation),
          Math.cos(a.data.rotation),
          a.gait.facing,
        );
      a.facing = facing4(a.gait.facing);
      if (this.config.development) {
        a.node.dataset.animation = a.gait.state;
        a.node.dataset.frame = a.gait.frame;
        a.node.dataset.speed = speed.toFixed(2);
        a.node.dataset.worldX = a.p.x.toFixed(2);
        a.node.dataset.worldY = a.p.y.toFixed(2);
        a.node.dataset.facing = a.gait.facing;
      }
      const seated = !!a.data.seated || a.definition?.state === "sit";
      const profile = a.animationSet;
      let directionIndexForArt = directionIndex(profile, a.gait.facing);
      const art = a.appearanceArt ?? this.animationAtlases[a.row];
      const requested =
        a.definition?.state === "vendor"
          ? "vendor-idle"
          : snapshot.bubbles.get(a.key)?.text ||
              (a.type === "npc" && !a.bubble.hidden && a.bubble.textContent)
            ? "talk"
            : (a.definition?.state ?? "");
      if (
        a.type === "pet" &&
        a.data.state === "EXHAUSTED" &&
        a.playback.action?.state !== "exhausted"
      )
        a.playback.play("exhausted");
      if (
        a.type === "pet" &&
        a.playback.action?.state === "exhausted" &&
        a.data.state !== "EXHAUSTED"
      )
        a.playback.clearAction();
      a.playback.update(a.gait, speed, dt, requested);
      // Keep locomotion and accepted action timing intact; quiet decorative idles.
      if (this.reducedMotion && !a.playback.action && a.playback.state === "idle")
        a.playback.frame = 0;
      if (
        a.row < 2 &&
        ["talk", "gesture"].includes(a.playback.state) &&
        !this.gestureAtlases
      )
        this.loadGestures();
      const gesture = this.gestureAtlases?.[a.row];
      const gestureActive =
        !!gesture && ["talk", "gesture"].includes(a.playback.state);
      if (a.playback.action)
        directionIndexForArt = directionIndex(
          profile,
          a.actionFacing ?? a.gait.facing,
        );
      const actionArt = a.playback.action && this.actionAtlases[a.row];
      let activeArt = actionArt || (gestureActive ? gesture : art);
      if (gestureActive && !a.gestureAppearance)
        a.gestureAppearance = this.appearanceCache.compose(
          gesture,
          a.styleKey,
          [
            { kind: "cape", graphics: a.cape },
            { kind: "cosmetics", graphics: a.cosmetics },
          ],
          a.slots,
          a.key === "player:" + this.bridge.selfId ? 192 : 128,
        );
      if (!actionArt && gestureActive && a.gestureAppearance)
        activeArt = a.gestureAppearance;
      a.cosmetics.visible = a.cape.visible = !activeArt.composited;
      a.s.texture =
        seated && a.type !== "pet"
          ? this.seatedFrames[frameIndex(a.row, a.facing)]
          : selectTexture(activeArt, a.playback, directionIndexForArt);
      const height = profile.height;
      a.s.scale.set(
        height /
          (seated && a.type !== "pet"
            ? this.atlases.characters[frameIndex(a.row, a.facing)].height
            : a.playback.action
              ? stateHeight(activeArt, a.playback.state)
              : activeArt.metadata.heights[
                  ["walk", "trot", "settle"].includes(a.playback.state)
                    ? "walk"
                    : "idle"
                ]),
      );
      if (!seated && stateMirrored(activeArt, a.playback.state, directionIndexForArt))
        a.s.scale.x *= -1;
      a.s.anchor.set(profile.footAnchor.x, seated ? 1 : profile.footAnchor.y);
      if (this.config.development) {
        a.node.dataset.animation = a.playback.state;
        a.node.dataset.frame = a.playback.frame;
      }
      a.s.alpha = 1;
      a.transitionSprite.visible = false;
      if (!seated && a.playback.state === "settle" && !this.legacyComparison) {
        const blend = 1 - a.playback.settleTime / profile.settleSeconds;
        a.transitionSprite.texture = a.s.texture;
        a.transitionSprite.anchor.copyFrom(a.s.anchor);
        a.transitionSprite.scale.copyFrom(a.s.scale);
        a.transitionSprite.alpha = 1 - blend;
        a.transitionSprite.visible = true;
        a.s.texture = art.rows[directionIndexForArt].idle[0];
        a.s.scale.set(height / art.metadata.heights.idle);
        if (art.metadata.mirrors[directionIndexForArt]) a.s.scale.x *= -1;
        a.s.alpha = blend;
      }
      // Overlay cosmetics share the body phase/direction; world/UI anchors stay stable.
      const secondary = this.reducedMotion ? 0 : moving
        ? Math.sin(a.playback.phase * Math.PI * 2)
        : Math.sin(a.playback.idleTime * 1.3) * 0.2;
      a.cosmetics.rotation = secondary * 0.018;
      a.cosmetics.x = secondary * 1.2;
      a.cape.rotation = this.reducedMotion ? 0 :
        Math.sin(a.playback.phase * Math.PI * 2 - 0.5) *
        (moving ? 0.025 : 0.004);
      if (
        this.config.development &&
        this.legacyComparison &&
        this.legacyWalk &&
        !seated
      ) {
        const oldArt = this.legacyWalk.rows[a.row][a.facing];
        a.s.texture = moving ? oldArt.walk[a.gait.frame] : oldArt.idle;
        a.s.scale.set(
          profile.height / (moving ? oldArt.height : oldArt.idle.height),
        );
        a.s.anchor.set(0.5, moving ? this.legacyWalk.anchor.y : 1);
      }
      a.s.y = seated ? -18 : 0;
      a.s.rotation = 0;
      const q = project(a.p);
      a.group.position.set(q.x, q.y);
      a.group.zIndex = depth(a.p) + (a.type === "pet" ? 0.01 : 0.02);
      a.seatLegs.visible = seated && a.type !== "pet";
      if (a.key === "player:" + this.bridge.selfId) {
        this.motionMetrics.localSpeed = speed;
        this.motionMetrics.animation = a.gait.state;
        this.motionMetrics.facing = a.gait.facing;
        for (const event of a.gait.events) this.scene.audio.cue("step");
      } else if (a.type === "player") this.motionMetrics.remoteSpeed = speed;
      const emote = this.scene.emotes.get(a.data.userId),
        reaction = this.scene.reactions.get(a.data.id);
      if (!this.reducedMotion && emote && now - emote.at < 3500 && emote.kind === "dance")
        a.s.rotation = Math.sin(this.elapsed * 7) * 0.09;
      if (!this.reducedMotion && reaction && now - reaction.at < 1800)
        a.s.y -= Math.abs(Math.sin(this.elapsed * 6)) * 5;
      a.transitionSprite.y = a.s.y;
      a.cosmetics.y = a.s.y;
      a.cape.y = a.s.y;
      const screen = this.root.toGlobal(q),
        inView =
          screen.x > -200 &&
          screen.x < viewportWidth + 200 &&
          screen.y > -200 &&
          screen.y < viewportHeight + 200;
      a.group.renderable = inView;
      a.node.style.left = screen.x + "px";
      a.node.style.top = screen.y - profile.height * this.zoom - 10 + "px";
      a.node.hidden =
        !inView ||
        !a.group.visible ||
        (a.type === "npc" &&
          (!self || Math.hypot(a.p.x - self.p.x, a.p.y - self.p.y) > 300));
      const bubble = snapshot.bubbles.get(a.key);
      let text = bubble?.text;
      if (
        !text &&
        a.definition &&
        self &&
        Math.hypot(a.p.x - self.p.x, a.p.y - self.p.y) < 240 &&
        Math.floor((now / 1000 + (hash(a.key) % 75)) % 75) < 4
      )
        text = a.definition.ambient;
      a.bubble.hidden = !text || !inView || !a.group.visible;
      if (a.bubbleText !== (text ?? "")) {
        a.bubbleText = text ?? "";
        a.bubble.textContent = a.bubbleText;
      }
      a.bubble.onclick = bubble?.dismiss ?? null;
      a.bubble.style.left = screen.x + "px";
      a.bubble.style.top = screen.y - a.height * this.zoom - 42 + "px";
      if (this.debug.depth) {
        a.guides
          .clear()
          .moveTo(-7, 0)
          .lineTo(7, 0)
          .moveTo(0, -7)
          .lineTo(0, 7)
          .moveTo(-6, -a.height)
          .lineTo(6, -a.height)
          .moveTo(-6, -a.height - 42 / this.zoom)
          .lineTo(6, -a.height - 42 / this.zoom)
          .stroke({ color: "#be6c8e", width: 1.5 });
      } else if (a.guides.context.instructions.length) a.guides.clear();
      if (this.debug.depth && a.shadowDebug !== true) {
        a.shadowDebug = true;
        a.shadow
          .clear()
          .ellipse(0, 1, 20, 9)
          .fill({ color: "#566353", alpha: 0.15 })
          .moveTo(-12, 0)
          .lineTo(12, 0)
          .moveTo(0, -12)
          .lineTo(0, 12)
          .stroke({ color: "#d87b60", width: 2 });
        a.node.title =
          "depth " +
          a.group.zIndex.toFixed(1) +
          " · foot " +
          a.p.x.toFixed(0) +
          "," +
          a.p.y.toFixed(0);
      } else if (!this.debug.depth && a.shadowDebug !== false) {
        a.shadowDebug = false;
        a.node.title = a.definition
          ? a.definition.role + " · authored Town resident"
          : "";
        a.shadow
          .clear()
          .ellipse(0, 1, a.type === "pet" ? 29 : 20, 9)
          .fill({ color: "#4b5647", alpha: 0.19 });
      }
    }
    if (self) {
      const center = project({ x: 600, y: 500 }),
        q = project(self.p),
        mobile = viewportWidth < 650;
      const desired = mobile
        ? q
        : {
            x: center.x + (q.x - center.x) * 0.75,
            y: center.y + (q.y - center.y) * 0.75,
          };
      spring(this.camera, this.cameraVelocity, desired, dt, 16);
    }
    // Display interest affects replication only, never gameplay relevance.
    if (performance.now() - (this.viewSentAt ?? -Infinity) > 1100) {
      const halfWidth = this.host.clientWidth / (2 * this.zoom);
      const halfHeight = this.host.clientHeight / (2 * this.zoom);
      const key = `${Math.round(halfWidth)}:${Math.round(halfHeight)}`;
      if ((key !== this.viewKey || performance.now() - (this.viewReportedAt ?? -Infinity) > 10000) && this.scene.snapshot().loading === false) {
        this.bridge.send?.('view', { halfWidth, halfHeight });
        this.viewKey = key;
        this.viewReportedAt = performance.now();
      }
      this.viewSentAt = performance.now();
    }
    this.root.scale.set(this.zoom);
    this.root.position.set(
      viewportWidth * 0.5 - this.camera.x * this.zoom,
      viewportHeight * (viewportWidth < 650 ? 0.46 : 0.48) -
        this.camera.y * this.zoom,
    );
    if (this.motionDebug && this.frames % 15 === 0) {
      const m = this.motionMetrics,
        b = [...this.scene.motion.values()].map((v) => v.buffer.samples.length);
      const elapsed = Math.max(
        0.001,
        (now - (this.correctionAt ?? now)) / 1000,
      );
      if (elapsed >= 1 || !this.correctionAt) {
        m.correctionsPerSecond =
          (m.corrections - (this.previousCorrections ?? 0)) / elapsed;
        this.previousCorrections = m.corrections;
        this.correctionAt = now;
      }
      this.motionDebug.textContent = `Movement: ${this.scene.movementHz} Hz server · frame ${m.frameMs.toFixed(1)} ms · ping ${this.scene.ping.toFixed(0)} ms · buffers ${b.join("/")} · interpolation ${this.scene.motion.get(this.bridge.selfId)?.buffer.delay.toFixed(0) ?? MOTION.interpolationDelay} ms · arrival max ${Math.max(0, ...(this.scene.motion.get(this.bridge.selfId)?.buffer.arrivalIntervals ?? [])).toFixed(0)} ms · error ${(m.error ?? 0).toFixed(2)} · corrections ${m.corrections} (${(m.correctionsPerSecond ?? 0).toFixed(1)}/s) · hard snaps ${m.snaps} · speed local ${m.localSpeed.toFixed(1)} / remote ${m.remoteSpeed.toFixed(1)} · ${m.animation ?? "idle"} facing ${m.facing ?? 0} · ${m.nodes ?? 0} path nodes · waypoint ${m.waypoint ? Math.round(m.waypoint.x) + "," + Math.round(m.waypoint.y) : "none"}`;
    }
    this.app.stage.hitArea = this.app.screen;
    for (const label of this.labels) {
      const q = this.root.toGlobal(project(label.p));
      label.node.style.left = q.x + "px";
      label.node.style.top = q.y - label.height * this.zoom + "px";
      label.node.hidden =
        q.x < 0 ||
        q.x > viewportWidth ||
        q.y < 95 ||
        (q.y - label.height * this.zoom < 220 && Math.abs(q.x - viewportWidth * 0.5) < 180) ||
        q.y > viewportHeight - (viewportWidth < 650 ? 255 : 145);
    }
    for (const p of this.props) {
      const s = p.sprite;
      if (!s.destroyed) {
        let fade = false;
        if (self) {
          const foot = this.root.toGlobal(project(self.p)),
            box = s.getBounds();
          fade =
            depth(self.p) < s.zIndex &&
            foot.x > box.x &&
            foot.x < box.x + box.width &&
            foot.y > box.y &&
            foot.y < box.y + box.height;
        }
        s.alpha += ((fade ? 0.48 : 1) - s.alpha) * Math.min(1, dt * 8);
      }
    }
    if (this.followGraphic) {
      this.followGraphic.clear();
      if (this.debug.routes && self) {
        const pet = this.actors.get("pet:" + self.data.companion?.id);
        if (pet) {
          const a = project(self.p),
            b = project(pet.p);
          this.followGraphic
            .moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({ color: "#a87ab9", width: 2 })
            .circle(b.x, b.y, 12)
            .stroke({ color: "#a87ab9", width: 2 });
        }
      }
    }
    if (this.ripple) {
      const t = this.reducedMotion ? 0 : this.elapsed % 2.5;
      this.ripple
        .clear()
        .ellipse(0, 0, 24 + t * 11, 9 + t * 4)
        .stroke({ color: "#d4f4e6", alpha: (1 - t / 2.5) * 0.7, width: 2 });
    }
    if (this.markerGraphic) {
      this.markerGraphic.clear();
      if (this.marker && performance.now() - this.markerAt < 1300) {
        const q = project(this.marker);
        this.markerGraphic
          .ellipse(q.x, q.y, 18, 8)
          .stroke({ color: "#ad795b", width: 2 })
          .circle(q.x, q.y, 3)
          .fill("#f9efd5");
      }
    }
    if (now - (this.hudAt ?? 0) > 500) {
      this.hudAt = now;
      this.drawMinimap();
      if (this.metrics) {
        const sorted = [...this.frameTimes].sort((a, b) => a - b),
          p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        const countSprites = (n) =>
          !n.visible || !n.renderable
            ? 0
            : (n instanceof Sprite ? 1 : 0) +
              (n.children ?? []).reduce((sum, c) => sum + countSprites(c), 0);
        this.metrics.textContent = `${Math.round(this.app.ticker.FPS)} FPS · p95 ${p95.toFixed(1)} ms · ${this.actors.size} entities · ${this.objects.children.length} depth objects · CPU update ${(performance.now() - start).toFixed(2)} ms · PixiJS/WebGL · DPR ${this.app.renderer.resolution}. ${this.gpuCounts?.draws ?? "…"} GL draws · ${Math.round(this.gpuCounts?.triangles ?? 0)} triangles · character RGBA ${((this.animationAtlases.reduce((n, a) => n + a.texture.width * a.texture.height * 4, 0) + (this.gestureAtlases ? this.gestureAtlases[0].texture.width * this.gestureAtlases[0].texture.height * 4 : 0)) / 1048576).toFixed(1)} MiB + action ${((this.actionTextureBytes ?? 0) / 1048576).toFixed(1)} MiB · ${[...this.actors.values()].filter((a) => a.group.renderable).length} visible actors · ${countSprites(this.root)} visible sprites · appearance cache ${(this.appearanceCache.bytes / 1048576).toFixed(1)} MiB · ${this.legacyComparison ? "legacy prototype" : "full body"}.`;
      }
    }
  }
  instrument() {
    if (!this.config.development) return;
    const gl = this.app.renderer.gl;
    if (!gl) return;
    this.drawCounter = { draws: 0, triangles: 0 };
    this.glOriginal = [];
    for (const name of [
      "drawElements",
      "drawArrays",
      "drawElementsInstanced",
      "drawArraysInstanced",
    ]) {
      const original = gl[name];
      if (!original) continue;
      this.glOriginal.push([name, original]);
      gl[name] = (...args) => {
        this.drawCounter.draws++;
        const count = name.includes("Elements") ? args[1] : args[2],
          instances = name.endsWith("Instanced") ? args.at(-1) : 1;
        if (args[0] === gl.TRIANGLES)
          this.drawCounter.triangles += (count / 3) * instances;
        return original.apply(gl, args);
      };
    }
    this.renderProbe = {
      prerender: () => {
        this.drawCounter.draws = 0;
        this.drawCounter.triangles = 0;
      },
      postrender: () => {
        this.gpuCounts = { ...this.drawCounter };
      },
    };
    this.app.renderer.runners.prerender.add(this.renderProbe);
    this.app.renderer.runners.postrender.add(this.renderProbe);
  }
  drawMinimap() {
    const c = this.minimap.getContext("2d"),
      b = roomBounds(this.room),
      w = 180,
      h = 130;
    const xy = (p) => ({
      x: 10 + ((p.x - b.minX) / (b.maxX - b.minX)) * 160,
      y: 10 + ((p.y - b.minY) / (b.maxY - b.minY)) * 110,
    });
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#f1e7ce";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#dbc49a";
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(12, 65);
    c.lineTo(170, 65);
    c.moveTo(90, 12);
    c.lineTo(90, 120);
    c.stroke();
    for (const p of this.props) {
      const q = xy(p.p);
      c.fillStyle = p.tree ? "#789672" : "#b99178";
      c.fillRect(q.x - 3, q.y - 3, 6, 6);
    }
    for (const a of this.actors.values()) {
      if (!a.group.visible) continue;
      const q = xy(a.p);
      c.fillStyle =
        a.key === "player:" + this.bridge.selfId
          ? "#b26c59"
          : a.type === "pet"
            ? "#9478ad"
            : "#6d9792";
      c.beginPath();
      c.arc(q.x, q.y, a.type === "player" ? 3 : 2, 0, Math.PI * 2);
      c.fill();
    }
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.motionPreference?.removeEventListener("change", this.onMotionPreference);
    this.appearanceCache?.destroy();
    if (this.renderProbe) {
      this.app.renderer.runners.prerender.remove(this.renderProbe);
      this.app.renderer.runners.postrender.remove(this.renderProbe);
      for (const [name, original] of this.glOriginal)
        this.app.renderer.gl[name] = original;
    }
    this.unsub?.();
    this.app?.ticker.remove(this.tickFn);
    if (this.ground) this.clearMap();
    if (this.app?.renderer) this.app.destroy(true, { children: true });
    for (const e of [
      this.ui,
      this.title,
      this.controls,
      this.minimap,
      this.dev,
      this.loading,
    ])
      e?.remove();
    this.textureOwnership.destroy();
  }
}
