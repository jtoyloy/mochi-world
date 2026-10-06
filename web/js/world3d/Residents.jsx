import React, { useRef, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { WorldHtml as Html } from "./Labels.jsx";
import {
  TOWN_RESIDENTS,
  residentPosition,
  residentAvailable,
} from "../game/town.js";
import { groundHeight, settleVisual } from "./grounding.js";
import { ContactShadow } from "./Grounding.jsx";
const sphere = new THREE.SphereGeometry(1, 12, 8);
function Resident({ n, bridge }) {
  const root = useRef(),
    body = useRef(),
    wing = useRef(),
    at = useRef(0),
    { scene, camera } = useThree(),
    [bubble, setBubble] = useState(false),
    [nearLabel, setNearLabel] = useState(false),
    [hover, setHover] = useState(false);
  const materials = useMemo(
    () =>
      [n.color, "#fff0d5", "#deaa62", "#455b59"].map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
      ),
    [n.color],
  );
  React.useEffect(
    () => () => materials.forEach((m) => m.dispose()),
    [materials],
  );
  useFrame(({ clock }) => {
    if (
      clock.elapsedTime - at.current <
      (camera.position.distanceTo(root.current.position) > 35 ? 0.5 : 0.2)
    )
      return;
    const measuredStart = performance.now();
    at.current = clock.elapsedTime;
    const p = residentPosition(
        n,
        Date.now() + (bridge.scene.serverClockOffset ?? 0),
      ),
      r = root.current;
    r.position.set(
      (p.x - 600) / 50,
      groundHeight(scene, (p.x - 600) / 50, (p.y - 500) / 50) ?? r.position.y,
      (p.y - 500) / 50,
    );
    const distance = camera.position.distanceTo(r.position),
      near = distance < 35;
    body.current.rotation.y = p.rotation ?? 0;
    body.current.rotation.z =
      n.state === "perform" && near && !bridge.reducedMotion
        ? Math.sin(clock.elapsedTime * 3) * 0.06
        : 0;
    wing.current.rotation.z =
      n.shop && near && (clock.elapsedTime + n.id.length) % 14 < 2
        ? -1.1 + Math.sin(clock.elapsedTime * 5) * 0.12
        : n.state === "perform"
          ? -1.2 + Math.sin(clock.elapsedTime * 4) * 0.2
          : n.state === "walk" && p.state === "walk" && near
            ? Math.sin(clock.elapsedTime * 6) * 0.2
            : 0.15;
    settleVisual(
      body.current,
      r.position.y,
      p.state === "walk" && near && !bridge.reducedMotion
        ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.045
        : 0,
    );
    bridge.scene.npcWork ??= { ms: 0, count: 0 };
    bridge.scene.npcWork.ms += performance.now() - measuredStart;
    bridge.scene.npcWork.count++;
  });
  React.useEffect(() => {
    const tick = () => {
      const p = residentPosition(
          n,
          Date.now() + (bridge.scene.serverClockOffset ?? 0),
        ),
        self = bridge.scene.data.get(bridge.selfId),
        distance = self ? Math.hypot(self.x - p.x, self.y - p.y) : Infinity;
      setNearLabel(distance < 450);
      setBubble(
        distance < 210 && (Date.now() / 1000 + n.id.length * 13) % 75 < 4,
      );
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [n, bridge]);
  const shape = (pos, scale, m) => (
    <mesh
      geometry={sphere}
      material={materials[m]}
      position={pos}
      scale={scale}
      castShadow={false}
    />
  );
  return (
    <group
      ref={root}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        const p = residentPosition(
          n,
          Date.now() + (bridge.scene.serverClockOffset ?? 0),
        );
        bridge.resident(n.id, p.x, p.y);
      }}
    >
      <group ref={body} scale={0.83}>
        <group
          position={[
            0,
            n.state === "sit" ? (n.id === "moss" ? 0.68 : 0.65) : 0,
            0,
          ]}
          scale={[1, n.state === "sit" ? 0.72 : 1, 1]}
        >
          {shape([0, 1, 0], [0.64, 0.94, 0.5], 0)}
          {shape([0, 0.95, 0.39], [0.44, 0.68, 0.14], 1)}
          {shape([0, 1.52, 0.42], [0.44, 0.3, 0.13], 1)}
          {[-1, 1].map((s) => (
            <React.Fragment key={s}>
              {shape([s * 0.19, 1.55, 0.53], [0.055, 0.075, 0.03], 3)}
            </React.Fragment>
          ))}
          {shape([0, 1.31, 0.57], [0.13, 0.08, 0.16], 2)}
          <group ref={wing} position={[0.6, 1, 0]}>
            {shape([0.06, -0.15, 0], [0.17, 0.43, 0.16], 0)}
          </group>
          {shape([-0.61, 0.85, 0], [0.17, 0.43, 0.16], 0)}
          {n.shop && shape([0, 1.99, 0], [0.52, 0.1, 0.42], 2)}
          {n.id === "otto" && (
            <mesh position={[0, 0.85, 0.57]} material={materials[2]}>
              <boxGeometry args={[0.55, 0.45, 0.32]} />
            </mesh>
          )}
          {n.id === "bea" && (
            <mesh
              position={[0.36, 0.72, 0.4]}
              rotation={[0, 0, -0.35]}
              material={materials[2]}
            >
              <capsuleGeometry args={[0.13, 0.48, 4, 8]} />
            </mesh>
          )}
          {n.id === "pixel" &&
            [-1, 1].map((s) => (
              <mesh
                key={s}
                position={[s * 0.19, 1.55, 0.57]}
                material={materials[3]}
              >
                <torusGeometry args={[0.115, 0.014, 4, 16]} />
              </mesh>
            ))}
          {n.id === "mina" && shape([0, 2.15, 0], [0.42, 0.22, 0.35], 1)}
          {n.id === "loom" && shape([0, 1, 0.42], [0.39, 0.54, 0.06], 2)}
        </group>
        {[-1, 1].map((s) => (
          <React.Fragment key={s}>
            {shape([s * 0.27, 0.08, 0.2], [0.26, 0.11, 0.32], 2)}
          </React.Fragment>
        ))}
      </group>
      <ContactShadow radius={0.6} />
      {(nearLabel || hover) && (
        <Html
          position={[0, 2.05, 0]}
          center
          distanceFactor={23}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className="resident-name">
            {n.name}
            <small>NPC · {n.role}</small>
          </span>
        </Html>
      )}
      {bubble && (
        <Html
          position={[0, 2.8, 0]}
          center
          zIndexRange={[21, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className="resident-bubble">{n.ambient}</span>
        </Html>
      )}
    </group>
  );
}
export function Residents({ bridge }) {
  const [time, setTime] = useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return TOWN_RESIDENTS.filter((n) =>
    residentAvailable(n, time + (bridge.scene.serverClockOffset ?? 0)),
  ).map((n) => <Resident key={n.id} n={n} bridge={bridge} />);
}
