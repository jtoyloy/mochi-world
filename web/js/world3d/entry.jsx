import { groundHeight } from "./grounding.js";
import { Occlusion } from "./Occlusion.jsx";
import { LabelPortalContext } from "./Labels.jsx";
import { roomSpec } from "../game/model.js";
import React, { useState, useEffect, useRef, Component } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Environment } from "./Environment.jsx";
import { Penguin, Mochi } from "./Characters.jsx";
import { NavigationService, toWorld } from "../game/NavigationService.js";
import { plainText } from "../game/model.js";
import { WorldAudio } from "./audio.js";
class SceneError extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div className="world-load">
        <h2>The world needs a moment</h2>
        <p>Graphics could not start. Your Mochi and items are safe.</p>
        <button onClick={() => location.reload()}>Retry world</button>
        <a href="/pets">Open Mochis</a>
      </div>
    ) : (
      this.props.children
    );
  }
}
function CameraRig({ bridge, quality, onMetrics }) {
  const { camera, gl, scene } = useThree(),
    at = useRef(0),
    frames = useRef(0),
    started = useRef(0);
  useFrame(({ clock }, dt) => {
    const self = bridge.scene.data.get(bridge.selfId),
      p = self ? toWorld(self) : [0, 0, 1.8],
      mobile = innerWidth < 700;
    if (!bridge.scene.debug?.free)
      camera.position.lerp(
        new THREE.Vector3(
          p[0] * 0.72 +
            (bridge.scene.debug?.angle === "market"
              ? 8
              : bridge.scene.debug?.angle === "cafe"
                ? -8
                : 0),
          bridge.scene.debug?.close ? 9 : mobile ? 21 : 16,
          p[2] * 0.72 + (bridge.scene.debug?.close ? 12 : mobile ? 25 : 20),
        ),
        1 - Math.exp(-2 * dt),
      );
    if (!bridge.scene.debug?.free)
      camera.lookAt(p[0] * 0.72, 0, p[2] * 0.72 - 2);
    if (
      self?.moving &&
      clock.elapsedTime - (bridge.scene.audio.stepAt ?? 0) > 0.45
    ) {
      bridge.scene.audio.stepAt = clock.elapsedTime;
      bridge.scene.audio.cue("step");
    }
    frames.current++;
    if (clock.elapsedTime - at.current > 1) {
      const info = gl.info;
      const contacts = [];
      scene.traverse((o) => {
        if (o.userData.grounding) contacts.push(o.userData.grounding);
      });
      onMetrics({
        contacts,
        npcMs: bridge.scene.npcWork?.count
          ? (bridge.scene.npcWork.ms / bridge.scene.npcWork.count).toFixed(3)
          : "…",
        fps: Math.round(frames.current / (clock.elapsedTime - at.current)),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        quality,
      });
      bridge.scene.npcWork = { ms: 0, count: 0 };
      frames.current = 0;
      at.current = clock.elapsedTime;
    }
  });
  return null;
}
function World({ bridge, state, quality, onMetrics }) {
  const town = state.roomId === "town";
  return (
    <>
      <color attach="background" args={["#b5d5cb"]} />
      <fog attach="fog" args={["#b5d5cb", 35, 65]} />
      <hemisphereLight args={["#fff0d8", "#91a896", town ? 1.5 : 2.1]} />
      <ambientLight intensity={town ? 0.18 : 0.3} />
      <directionalLight
        position={[-9, 15, 9]}
        intensity={
          bridge.scene.debug?.light === "evening" ? 1.3 : town ? 3 : 2.6
        }
        color="#fff0d5"
        castShadow={quality !== "low"}
        shadow-mapSize-width={quality === "high" ? 2048 : 1024}
        shadow-mapSize-height={quality === "high" ? 2048 : 1024}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-normalBias={0.04}
      />
      <directionalLight
        position={[8, 7, -8]}
        color="#c1dfed"
        intensity={town ? 0.6 : 0.8}
      />
      {bridge.scene.debug?.free && (
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI * 0.48}
          minDistance={5}
          maxDistance={55}
        />
      )}
      <CameraRig bridge={bridge} quality={quality} onMetrics={onMetrics} />
      <Occlusion bridge={bridge} roomId={state.roomId} />
      <Environment roomId={state.roomId} bridge={bridge} home={state.home} />
      {state.players.map((p) => (
        <React.Fragment key={p.userId}>
          <Penguin
            data={p}
            bridge={bridge}
            bubble={state.bubbles.get("player:" + p.userId)}
          />
          {p.companion && (
            <Mochi
              data={p.companion}
              owner={p.userId}
              bridge={bridge}
              bubble={state.bubbles.get("pet:" + p.companion.id)}
            />
          )}
        </React.Fragment>
      ))}
      {state.home?.pets
        .filter((p) => !state.players.some((v) => v.companion?.id === p.id))
        .map((p, i) => (
          <Mochi
            key={p.id}
            data={{ ...p, x: 250 + i * 65, y: 470, state: "RESTING" }}
            bridge={bridge}
            inactive
          />
        ))}
      {state.marker && <GroundMarker marker={state.marker} />}
    </>
  );
}
function GroundMarker({ marker }) {
  const ref = useRef(),
    { scene } = useThree();
  useFrame(() => {
    if (ref.current)
      ref.current.position.y =
        (groundHeight(scene, (marker.x - 600) / 50, (marker.y - 500) / 50) ??
          ref.current.position.y - 0.03) + 0.03;
  });
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(marker.x - 600) / 50, 0.08, (marker.y - 500) / 50]}
    >
      <ringGeometry args={[0.18, 0.23, 32]} />
      <meshBasicMaterial color="#fff8d7" transparent opacity={0.8} />
    </mesh>
  );
}
function App({ bridge, config }) {
  const labelPortal = useRef(null);
  const [debug, setDebug] = useState({}),
    [intro, setIntro] = useState(false),
    [tour, setTour] = useState(false);
  bridge.scene.debug = debug;
  const [state, setState] = useState(bridge.scene.snapshot()),
    [quality, setQuality] = useState(
      localStorage.getItem("mochi-quality") ?? "auto",
    ),
    [metrics, setMetrics] = useState({}),
    [volume, setVolume] = useState(bridge.scene.audio.volume);
  useEffect(
    () => bridge.scene.subscribe(() => setState(bridge.scene.snapshot())),
    [],
  );
  useEffect(() => {
    if (
      state.roomId === "town" &&
      bridge.selfId &&
      !localStorage.getItem("mochi-town-intro:" + bridge.selfId)
    )
      setIntro(true);
  }, [state.roomId, bridge.selfId]);
  const finishIntro = () => {
    localStorage.setItem("mochi-town-intro:" + bridge.selfId, "seen");
    setIntro(false);
    setTour(false);
  };
  const effective =
    quality === "auto" ? (innerWidth < 700 ? "low" : "medium") : quality;
  return (
    <SceneError>
      <LabelPortalContext.Provider value={labelPortal}>
        <Canvas
          shadows={effective !== "low"}
          dpr={
            effective === "low" ? 1 : effective === "high" ? [1, 1.8] : [1, 1.3]
          }
          camera={{ position: [0, 15, 20], fov: 43, near: 0.1, far: 90 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
          fallback={<span aria-hidden="true" />}
        >
          <World
            bridge={bridge}
            state={state}
            quality={effective}
            onMetrics={setMetrics}
          />
        </Canvas>
        <div className="world-label-layer" ref={labelPortal} />
        <div className="room-title3d location-title">
          <small>MOCHI WORLD</small>
          <strong>{roomSpec(state.roomId)?.name}</strong>
          <span>{roomSpec(state.roomId)?.subtitle}</span>
        </div>
        {intro && state.roomId === "town" && (
          <aside
            className="town-intro"
            aria-label="Pip's optional town welcome"
          >
            <span className="npc-portrait">🐧</span>
            <div>
              <strong>Pip · Town guide</strong>
              <p>
                {tour
                  ? "Click the paving to walk. Café and garden are west; stalls are east. Click a nearby resident to talk and browse the existing shops. Your Mochi follows beside you."
                  : "Welcome to Mochi World! Make yourself at home."}
              </p>
              <button onClick={() => setTour(true)}>Show me around</button>
              <button onClick={finishIntro}>
                {tour ? "Ready to explore" : "I'll explore"}
              </button>
            </div>
          </aside>
        )}
        <div className="graphics-controls">
          <label>
            Graphics{" "}
            <select
              aria-label="Graphics quality"
              value={quality}
              onChange={(e) => {
                setQuality(e.target.value);
                localStorage.setItem("mochi-quality", e.target.value);
              }}
            >
              {["auto", "low", "medium", "high"].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label>
            Sound{" "}
            <input
              aria-label="Sound volume"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={volume}
              onChange={(e) => {
                setVolume(+e.target.value);
                bridge.scene.audio.setVolume(+e.target.value);
                bridge.scene.audio.cue();
              }}
            />
          </label>
        </div>
        {config.development && (
          <details className="performance3d">
            <summary>World performance</summary>
            <p>
              Town benchmark · 12 residents · 11–12 present · authored dialogue
            </p>
            <label>
              <input
                type="checkbox"
                checked={!!debug.free}
                onChange={(e) => setDebug({ ...debug, free: e.target.checked })}
              />{" "}
              Free camera (drag / scroll)
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!debug.ground}
                onChange={(e) =>
                  setDebug({ ...debug, ground: e.target.checked })
                }
              />{" "}
              Model bounds, origin and ground ray
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!debug.routes}
                onChange={(e) =>
                  setDebug({ ...debug, routes: e.target.checked })
                }
              />{" "}
              Navigation grid and NPC routes
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!debug.materials}
                onChange={(e) =>
                  setDebug({ ...debug, materials: e.target.checked })
                }
              />{" "}
              Material swatches
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!debug.close}
                onChange={(e) =>
                  setDebug({ ...debug, close: e.target.checked })
                }
              />{" "}
              Close character review
            </label>
            <label>
              Review angle{" "}
              <select
                aria-label="Town review angle"
                value={debug.angle ?? "plaza"}
                onChange={(e) =>
                  setDebug({ ...debug, angle: e.target.value, free: false })
                }
              >
                <option value="plaza">Plaza</option>
                <option value="market">Market</option>
                <option value="cafe">Café</option>
              </select>
            </label>
            <label>
              Lighting{" "}
              <select
                aria-label="Town lighting"
                value={debug.light ?? "afternoon"}
                onChange={(e) => setDebug({ ...debug, light: e.target.value })}
              >
                <option>afternoon</option>
                <option>evening</option>
              </select>
            </label>
            <p>
              {metrics.fps ?? "…"} FPS · {metrics.drawCalls} draws ·{" "}
              {metrics.triangles?.toLocaleString()} triangles
            </p>
            <p>
              {metrics.textures} textures · {metrics.geometries} geometries ·{" "}
              {state.players.length} players · {effective}
            </p>
            <p>NPC pose/ground update {metrics.npcMs} ms average · 2–5 Hz</p>
            <p>
              Sun shadow:{" "}
              {effective === "low"
                ? "disabled"
                : effective === "high"
                  ? "2048²"
                  : "1024²"}
            </p>
            {debug.ground &&
              metrics.contacts?.map((c, i) => (
                <p key={i}>
                  {c.kind} · ground {c.groundY.toFixed(3)} · base{" "}
                  {c.minY.toFixed(3)} · visual offset {c.offset.toFixed(3)}
                </p>
              ))}
            <p>
              {state.players.find((p) => p.userId === bridge.selfId)?.companion
                ?.name ?? "No active companion"}{" "}
              · independent Cadence scheduler
            </p>
            <p>
              Position{" "}
              {state.players
                .find((p) => p.userId === bridge.selfId)
                ?.x?.toFixed(1)}
              ,{" "}
              {state.players
                .find((p) => p.userId === bridge.selfId)
                ?.y?.toFixed(1)}{" "}
              · socket status in the world bar.
            </p>
            <p>
              Texture bytes depend on compression; texture count is measured,
              bytes are not estimated.
            </p>
          </details>
        )}
        {state.loading && (
          <div className="room-transition">
            <small>ARRIVING AT</small>
            <strong>{state.roomId.split(":")[0]}</strong>
          </div>
        )}
      </LabelPortalContext.Provider>
    </SceneError>
  );
}
export function mount3D(container, bridge, config) {
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
      this.serverClockOffset = (s.serverTime ?? Date.now()) - Date.now();
      home = s.home;
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
  const root = createRoot(container);
  root.render(<App bridge={bridge} config={config} />);
  bridge.connect();
  return {
    destroy() {
      scene.audio.dispose?.();
      root.unmount();
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
} from "./Overlays.jsx";
