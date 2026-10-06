import { GroundedVisual, ContactShadow } from "./Grounding.jsx";
import { ModelAsset } from "./ModelAsset.jsx";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { WorldHtml as Html } from "./Labels.jsx";
import * as THREE from "three";
import { toWorld, smoothAngle } from "../game/NavigationService.js";
export const AVATAR_SOCKETS = [
  "head_socket",
  "face_socket",
  "chest_socket",
  "back_socket",
  "left_hand_socket",
  "feet_socket",
];
export const PENGUIN_ANIMATIONS = [
  "idle",
  "walk",
  "wave",
  "dance",
  "cheer",
  "laugh",
  "sad",
  "sit",
];
export const MOCHI_ANIMATIONS = [
  "idle",
  "follow",
  "happy",
  "sad",
  "excited",
  "sleep",
  "eat",
  "play",
  "look",
  "hop",
];
const sphere = new THREE.SphereGeometry(1, 24, 16);
export function Soft({
  position = [0, 0, 0],
  scale = [1, 1, 1],
  color = "#fdf1db",
  roughness = 0.7,
  ...props
}) {
  return (
    <mesh
      geometry={sphere}
      position={position}
      scale={scale}
      castShadow
      receiveShadow
      {...props}
    >
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}
function Eyes({ small = false, sleepy = false }) {
  const blink = useRef();
  useFrame(({ clock }) => {
    if (blink.current)
      blink.current.scale.y = sleepy
        ? 0.2
        : clock.elapsedTime % 4.9 < 0.16
          ? 0.12
          : 1;
  }, -2);
  return (
    <group ref={blink} position={[0, small ? 0.57 : 1.48, 0]}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Soft
            position={[s * (small ? 0.17 : 0.22), 0, small ? 0.51 : 0.51]}
            scale={small ? [0.07, 0.085, 0.035] : [0.09, 0.12, 0.05]}
            color="#283745"
          />
          <Soft
            position={[
              s * (small ? 0.17 : 0.22) - 0.018,
              small ? 0.02 : 0.04,
              small ? 0.55 : 0.56,
            ]}
            scale={[0.022, 0.029, 0.018]}
            color="white"
          />
        </group>
      ))}
    </group>
  );
}
function Socket({ name, position, children }) {
  const bone = useMemo(() => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  }, [name]);
  return (
    <primitive object={bone} position={position}>
      {children}
    </primitive>
  );
}
export function CosmeticAttachments({ equipment = {}, pet = false }) {
  return (
    <group>
      {equipment.hat && (
        <Socket name="head_socket" position={[0, pet ? 0.9 : 1.99, 0]}>
          <Soft scale={[pet ? 0.38 : 0.58, 0.18, 0.4]} color="#ce605a" />
          <Soft
            position={[0, -0.06, 0.3]}
            scale={[0.46, 0.05, 0.27]}
            color="#b3474b"
          />
          <Soft
            position={[0, 0.15, 0]}
            scale={[0.06, 0.07, 0.06]}
            color="#f3d59a"
          />
        </Socket>
      )}
      {(equipment.face || equipment.glasses) && (
        <Socket name="face_socket" position={[0, pet ? 0.58 : 1.47, 0.55]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.2, 0, 0]}>
              <torusGeometry args={[0.14, 0.035, 8, 24]} />
              <meshStandardMaterial color="#775147" />
            </mesh>
          ))}
        </Socket>
      )}
      {(equipment.top || equipment.shirt) && (
        <Socket name="chest_socket" position={[0, 0.75, 0]}>
          <Soft scale={[0.63, 0.5, 0.45]} color="#90ad8f" />
        </Socket>
      )}
      {(equipment.back || equipment.accessory) && (
        <Socket name="back_socket" position={[0, 0.9, -0.45]}>
          <Soft scale={[0.4, 0.42, 0.17]} color="#c79558" />
        </Socket>
      )}
      {equipment.hand && (
        <Socket name="left_hand_socket" position={[-0.78, 0.8, 0.15]}>
          <Soft scale={[0.14, 0.2, 0.14]} color="#dcac62" />
        </Socket>
      )}
      {equipment.feet && (
        <Socket name="feet_socket" position={[0, 0, 0]}>
          {[-1, 1].map((s) => (
            <Soft
              key={s}
              position={[s * 0.3, 0.12, 0.22]}
              scale={[0.3, 0.15, 0.4]}
              color="#6b8c89"
            />
          ))}
        </Socket>
      )}
    </group>
  );
}
export function Penguin({ data, bridge, bubble }) {
  const root = useRef(),
    body = useRef(),
    left = useRef(),
    right = useRef(),
    feet = useRef(),
    initialized = useRef(false),
    speed = useRef(0),
    rig = useMemo(() => {
      const b = new THREE.Bone();
      b.name = "penguin_root";
      for (const name of AVATAR_SOCKETS) {
        const socket = new THREE.Bone();
        socket.name = name;
        b.add(socket);
      }
      return b;
    }, []);
  useFrame(({ clock }, dt) => {
    const r = root.current;
    if (!r) return;
    const target = toWorld(data),
      t = clock.elapsedTime;
    if (!initialized.current) {
      r.position.set(...target);
      initialized.current = true;
    }
    const distance = Math.hypot(
      target[0] - r.position.x,
      target[2] - r.position.z,
    );
    speed.current = THREE.MathUtils.damp(
      speed.current,
      data.moving ? 1 : 0,
      10,
      dt,
    );
    r.position.x = THREE.MathUtils.damp(
      r.position.x,
      target[0],
      data.userId === bridge.selfId ? 16 : 10,
      dt,
    );
    r.position.z = THREE.MathUtils.damp(
      r.position.z,
      target[2],
      data.userId === bridge.selfId ? 16 : 10,
      dt,
    );
    body.current.rotation.y = smoothAngle(
      body.current.rotation.y,
      data.rotation ?? 0,
      dt,
    );
    const moving = speed.current,
      emote = bridge.scene.emotes.get(data.userId),
      active = emote && Date.now() - emote.at < 4000;
    body.current.position.y = bridge.reducedMotion
      ? 0
      : Math.abs(Math.sin(t * 10)) * moving * 0.055;
    body.current.rotation.z = bridge.reducedMotion
      ? 0
      : Math.sin(t * 10) * moving * 0.045;
    left.current.rotation.z = -0.22 + Math.sin(t * 10) * moving * 0.15;
    right.current.rotation.z = 0.22 - Math.sin(t * 10) * moving * 0.15;
    body.current.scale.y = THREE.MathUtils.damp(
      body.current.scale.y,
      !data.seated && active && emote.kind === "sit" ? 0.72 : 1,
      10,
      dt,
    );
    if (active && !bridge.reducedMotion) {
      if (emote.kind === "wave" || emote.kind === "cheer")
        right.current.rotation.z = -1.9 + Math.sin(t * 12) * 0.35;
      if (emote.kind === "dance") {
        body.current.rotation.y += Math.sin(t * 3) * 0.4;
        body.current.position.y += Math.abs(Math.sin(t * 5)) * 0.12;
      }
      if (emote.kind === "sad") body.current.rotation.x = 0.2;
      if (emote.kind === "sit" && !data.seated) {
        body.current.position.y = -0.35;
        body.current.rotation.x = -0.15;
      }
      if (emote.kind === "laugh")
        body.current.rotation.z = Math.sin(t * 16) * 0.08;
    } else body.current.rotation.x = 0;
    feet.current.rotation.x = Math.sin(t * 10) * moving * 0.15;
  }, -2);
  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        bridge.selectPlayer(data.userId);
      }}
    >
      <GroundedVisual
        entity={root}
        animated={body}
        kind="penguin"
        bridge={bridge}
      >
        <group ref={body}>
          <primitive object={rig}>
            <group
              position={[0, data.seated?.height ?? 0, 0]}
              scale={[1, data.seated ? 0.72 : 1, 1]}
            >
              <ModelAsset
                kind="penguin"
                color={data.avatar.body_color}
                animation={
                  data.seated
                    ? "sit"
                    : Date.now() -
                          (bridge.scene.emotes.get(data.userId)?.at ?? 0) <
                        4000
                      ? bridge.scene.emotes.get(data.userId).kind
                      : data.moving
                        ? "walk"
                        : "idle"
                }
                fallback={
                  <Soft
                    position={[0, 1, 0]}
                    scale={[0.67, 0.95, 0.53]}
                    color={data.avatar.body_color}
                  />
                }
              />
              <Soft
                position={[0, 0.88, 0.43]}
                scale={[0.46, 0.64, 0.17]}
                color="#fff3df"
              />
              <Soft
                position={[0, 1.49, 0.38]}
                scale={[0.47, 0.35, 0.17]}
                color="#fff3df"
              />
              <Eyes />
              <Soft
                position={[0, 1.29, 0.65]}
                scale={[0.15, 0.09, 0.18]}
                color="#eeaf54"
              />
              <group ref={left} position={[-0.57, 1.01, 0]}>
                <Soft
                  position={[-0.13, -0.18, 0]}
                  scale={[0.18, 0.48, 0.19]}
                  color={data.avatar.body_color}
                />
              </group>
              <group ref={right} position={[0.57, 1.01, 0]}>
                <Soft
                  position={[0.13, -0.18, 0]}
                  scale={[0.18, 0.48, 0.19]}
                  color={data.avatar.body_color}
                />
              </group>
              <CosmeticAttachments equipment={data.avatar.equipment} />
            </group>
            <group ref={feet}>
              {[-1, 1].map((s) => (
                <Soft
                  key={s}
                  position={[s * 0.28, 0.1, 0.23]}
                  scale={[0.29, 0.13, 0.39]}
                  color="#e9a45c"
                />
              ))}
            </group>
          </primitive>
        </group>
      </GroundedVisual>
      <ContactShadow radius={0.7} />
      <mesh
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.018, 0]}
      >
        <circleGeometry args={[0.65, 24]} />
        <meshBasicMaterial
          color="#4f5c60"
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>
      <Html
        zIndexRange={[30, 0]}
        center
        position={[0, 2.35, 0]}
        distanceFactor={20}
        style={{ pointerEvents: "none" }}
      >
        <span
          className={
            "nameplate " + (data.userId === bridge.selfId ? "own" : "")
          }
        >
          {data.avatar.display_name}
        </span>
      </Html>
      <Speech bubble={bubble} height={3} />
    </group>
  );
}
export function Mochi({ data, owner, bridge, bubble, inactive = false }) {
  const root = useRef(),
    body = useRef(),
    init = useRef(false);
  const color =
    { momo: "#a08ecb", berry: "#d289a1", kiki: "#8bbbc1" }[
      data.profile?.variant
    ] ?? "#af91cc";
  useFrame(({ clock }, dt) => {
    const r = root.current;
    if (!r) return;
    const target = toWorld(data);
    if (!init.current) {
      r.position.set(...target);
      init.current = true;
    }
    r.position.x = THREE.MathUtils.damp(r.position.x, target[0], 9, dt);
    r.position.z = THREE.MathUtils.damp(r.position.z, target[2], 9, dt);
    const t = clock.elapsedTime,
      following = ["FOLLOWING", "RETURNING", "WANDERING"].includes(data.state);
    body.current.position.y = bridge.reducedMotion
      ? 0
      : Math.abs(Math.sin(t * (following ? 9 : 2))) *
        (following ? 0.12 : 0.025);
    body.current.scale.y = THREE.MathUtils.damp(
      body.current.scale.y,
      data.state === "RESTING" ? 0.86 : 1,
      10,
      dt,
    );
    body.current.rotation.y = following
      ? Math.sin(t * 2) * 0.12
      : Math.sin(t * 0.6) * 0.18;
    const reaction = bridge.scene.reactions.get(data.id);
    if (reaction && Date.now() - reaction.at < 4500 && !bridge.reducedMotion) {
      body.current.rotation.z = Math.sin(t * 9) * 0.12;
      body.current.position.y += Math.abs(Math.sin(t * 8)) * 0.13;
      body.current.scale.y = THREE.MathUtils.damp(
        body.current.scale.y,
        reaction.kind === "sleep" ? 0.75 : 1 + Math.sin(t * 10) * 0.06,
        10,
        dt,
      );
    } else body.current.rotation.z = 0;
  }, -2);
  const reaction = bridge.scene.reactions.get(data.id);
  const playing = reaction?.kind === "play" && Date.now() - reaction.at < 4500;
  const eating = reaction?.kind === "feed" && Date.now() - reaction.at < 4500;
  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        inactive
          ? bridge.inspectPet(data.id)
          : bridge.selectPet(owner, data.id);
      }}
    >
      {playing && (
        <Soft
          position={[0.9, 0.3, 0.5]}
          scale={[0.26, 0.26, 0.26]}
          color="#e4a365"
        />
      )}
      {eating && (
        <group position={[0, 0.15, 0.7]}>
          <Soft scale={[0.25, 0.13, 0.2]} color="#f5ead6" />
          <Soft
            position={[0, 0.12, 0]}
            scale={[0.18, 0.08, 0.14]}
            color="#ba8878"
          />
        </group>
      )}
      <GroundedVisual
        entity={root}
        animated={body}
        kind="mochi"
        bridge={bridge}
      >
        <group ref={body}>
          <ModelAsset
            kind="mochi"
            color={color}
            animation={
              reaction && Date.now() - reaction.at < 4500
                ? ({ feed: "eat", play: "play", sleep: "sleep", pet: "happy" }[
                    reaction.kind
                  ] ?? "happy")
                : data.state === "RESTING"
                  ? "sleep"
                  : data.state === "FOLLOWING"
                    ? "follow"
                    : "idle"
            }
            fallback={
              <Soft
                position={[0, 0.45, 0]}
                scale={[0.52, 0.47, 0.48]}
                color={color}
              />
            }
          />
          <Soft
            position={[0, 0.56, 0.32]}
            scale={[0.37, 0.25, 0.21]}
            color={color}
          />
          <Eyes small sleepy={data.state === "RESTING"} />
          {[-1, 1].map((s) => (
            <Soft
              key={s}
              position={[s * 0.31, 0.47, 0.46]}
              scale={[0.065, 0.035, 0.03]}
              color="#e4afb5"
            />
          ))}
          <Soft
            position={[0, 0.43, 0.51]}
            scale={[0.06, 0.025, 0.025]}
            color="#765269"
          />
          {[-1, 1].map((s) => (
            <Soft
              key={s}
              position={[s * 0.28, 0.09, 0.12]}
              scale={[0.17, 0.11, 0.22]}
              color={color}
            />
          ))}
          <CosmeticAttachments equipment={data.equipment} pet />
        </group>
      </GroundedVisual>
      <ContactShadow radius={0.55} />
      <mesh
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
      >
        <circleGeometry args={[0.48, 20]} />
        <meshBasicMaterial
          transparent
          opacity={0.12}
          color="#544766"
          depthWrite={false}
        />
      </mesh>
      <Html
        zIndexRange={[30, 0]}
        center
        position={[0, 1.18, 0]}
        distanceFactor={20}
        style={{ pointerEvents: "none" }}
      >
        <span className="nameplate pet">{data.name}</span>
      </Html>
      <Speech bubble={bubble} height={1.8} />
    </group>
  );
}
function Speech({ bubble, height }) {
  return (
    bubble && (
      <Html center position={[0, height, 0]} zIndexRange={[40, 0]}>
        <button className="speech3d" onClick={bubble.dismiss}>
          {bubble.text}
        </button>
      </Html>
    )
  );
}
