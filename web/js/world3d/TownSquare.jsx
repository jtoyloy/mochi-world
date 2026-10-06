import {
  TownPart as Piece,
  Goods,
  DistrictDetails,
  DistantTown,
  TownSky,
} from "./TownKit.jsx";
import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import {
  Tree,
  Bench,
  Lamp,
  Fountain,
  PaintedSign,
  Storefront,
  MarketBoard,
} from "./Environment.jsx";
import { Residents } from "./Residents.jsx";
import { townMaterial, TownStyleContext } from "./materials.js";
import { TOWN_RESIDENTS, TOWN_STALLS } from "../game/town.js";
import { walkable } from "../game/model.js";
import { roomSpec } from "../game/model.js";
function Stall({ position, title, color, goods = "rare" }) {
  return (
    <group position={position} userData={{ fadeObstruction: true }}>
      <Piece
        position={[0, 0.63, 0]}
        size={[2.3, 1.25, 1]}
        kind="paintedWood"
        color={color}
      />
      <Piece position={[0, 1.28, 0]} size={[2.5, 0.12, 1.2]} />
      {[-1.05, 1.05].map((x) => (
        <Piece
          key={x}
          position={[x, 1.7, -0.35]}
          size={[0.08, 2.5, 0.08]}
          kind="metal"
        />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <Piece
          key={i}
          position={[(i - 3.5) * 0.34, 2.8, 0]}
          size={[0.35, 0.1, 1.65]}
          rotation={[0.13, 0, 0]}
          kind="fabric"
          color={i % 2 ? "#f5dfbc" : color}
        />
      ))}
      <PaintedSign text={title} position={[0, 2.4, 0.53]} width={2.15} />
      {[0, 1, 2].map((i) => (
        <group key={i} position={[(i - 1) * 0.6, 1.51, 0]}>
          <Goods kind={goods} index={i} />
        </group>
      ))}
    </group>
  );
}
function Blossoms() {
  const ref = useRef();
  useEffect(() => {
    const o = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      o.position.set(
        Math.sin(i * 19.31) * 17,
        0.18,
        -7 + Math.cos(i * 4.13) * 0.3,
      );
      o.scale.set(0.09, 0.13, 0.09);
      o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
      ref.current.setColorAt(i, new THREE.Color(i % 3 ? "#e6b488" : "#b694b0"));
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[null, null, 160]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}
function Banners() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.02;
  });
  return (
    <group ref={ref}>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh
          key={i}
          position={[
            -8 + i * 1.25,
            4.8 + Math.sin((i / 13) * Math.PI) * 0.5,
            -3.6,
          ]}
          rotation={[0, 0, Math.PI]}
          material={townMaterial("fabric", i % 2 ? "#c88470" : "#719c96")}
        >
          <coneGeometry args={[0.19, 0.48, 3]} />
        </mesh>
      ))}
      <Piece
        position={[0.15, 5, -3.6]}
        size={[17, 0.025, 0.025]}
        kind="metal"
      />
    </group>
  );
}
function Terrace({ bridge }) {
  const ramp = useMemo(() => {
    const g = new THREE.PlaneGeometry(6, 3);
    g.rotateX(-Math.PI / 2);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++)
      a.setY(i, ((a.getZ(i) + 1.5) / 3) * 0.575 + 0.025);
    a.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);
  const click = (e) => {
    e.stopPropagation();
    bridge.scene.moveTo({ x: e.point.x * 50 + 600, y: e.point.z * 50 + 500 });
  };
  return (
    <group position={[-11, 0, 4.3]}>
      <Piece position={[0, 0.29, 1.5]} size={[6, 0.6, 3]} kind="stone" />
      <mesh
        position={[0, 0, -1.5]}
        geometry={ramp}
        material={townMaterial("stone")}
        userData={{ walkableGround: true }}
        onClick={click}
        receiveShadow
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.6, 1.5]}
        userData={{ walkableGround: true }}
        onClick={click}
      >
        <planeGeometry args={[6, 3]} />
        <meshStandardMaterial color="#d9ccb1" />
      </mesh>
      {[-2.8, 2.8].map((x) => (
        <Piece
          key={x}
          position={[x, 0.9, 1.5]}
          size={[0.12, 0.5, 3]}
          kind="paintedWood"
        />
      ))}
      <Bench
        position={[0, 0.6, 2.3]}
        bridge={{ interact: () => bridge.interact("sit:garden", 50, 865) }}
        id="sit:garden"
      />
    </group>
  );
}
export function TownSquare({ bridge }) {
  const room = roomSpec("town");
  useEffect(() => {
    bridge.scene.audio.setRoom?.("town");
    return () => bridge.scene.audio.setRoom?.(null);
  }, [bridge]);
  return (
    <TownStyleContext.Provider value={true}>
      <group>
        <Piece position={[0, -0.55, 0]} size={[90, 1, 65]} kind="foliage" />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.025, 0]}
          material={townMaterial("stone")}
          userData={{ walkableGround: true }}
          onClick={(e) => {
            e.stopPropagation();
            bridge.scene.moveTo({
              x: e.point.x * 50 + 600,
              y: e.point.z * 50 + 500,
            });
          }}
          receiveShadow
        >
          <planeGeometry args={[36, 16]} />
        </mesh>
        {/* broad, unobstructed arrival and social apron */}
        <Piece
          position={[0, 0.031, 6.7]}
          size={[12, 0.012, 1.6]}
          userData={{ walkableGround: true }}
          kind="stone"
          color="#c5b599"
        />
        <PaintedSign
          text="WELCOME TO MOCHI SQUARE"
          position={[0, 0.055, 6.9]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={7}
        />
        <group
          onClick={(e) => {
            e.stopPropagation();
            bridge.interact("fountain", 600, 530);
          }}
        >
          <Fountain />
        </group>
        <MarketBoard position={[7, 2.2, -4.4]} scale={0.48} />
        <group position={[0, 0, -1.4]}>
          <Piece position={[0, 3.2, 0]} size={[0.18, 2.2, 0.18]} kind="brass" />
          <mesh
            position={[0, 4.3, 0]}
            material={townMaterial("brass")}
            castShadow
          >
            <torusGeometry args={[0.7, 0.08, 8, 32]} />
          </mesh>
          <PaintedSign
            text="THE WISHING LANTERN"
            position={[0, 0.8, 1.91]}
            width={2}
          />
        </group>
        {room.props.map((prop, i) => (
          <Storefront
            key={prop[0]}
            prop={prop}
            bridge={bridge}
            room="town"
            accent={["#c28570", "#74978e", "#9691ac", "#588c94", "#819d75"][i]}
          />
        ))}
        {TOWN_STALLS.map((stall) => (
          <Stall
            key={stall.id}
            position={[(stall.x - 600) / 50, 0, (stall.y - 500) / 50]}
            title={stall.title}
            color={stall.color}
            goods={stall.goods}
          />
        ))}
        <Piece
          position={[-10.4, 0.6, -3.2]}
          size={[2.7, 1.2, 0.7]}
          kind="wood"
        />
        <PaintedSign
          text="TEA · RICE · TREATS"
          position={[-10.4, 1.7, -3.1]}
          width={2.6}
        />
        <Terrace bridge={bridge} />
        <Bench position={[-5, 0, -2.5]} bridge={bridge} id="sit:west" />
        <Bench position={[5, 0, -2.5]} bridge={bridge} id="sit:east" />
        <Bench position={[-6.6, 0, 1.2]} bridge={bridge} id="sit:cafe" />
        {[-15, -8, 8, 16].flatMap((x) =>
          [[-6.6], [6.8]].map(([z], i) => (
            <Lamp key={x + ":" + i} position={[x, 0, z]} />
          )),
        )}
        {[-17, -13, -8, -3, 3, 8, 13, 17].map((x, i) => (
          <Tree key={x} position={[x, 0, -9]} scale={i % 2 ? 0.9 : 1.15} />
        ))}
        <Blossoms />
        <Banners />
        <TownAtmosphere bridge={bridge} />
        <group position={[-3, 0, 6]}>
          <Piece position={[0, 1.1, 0]} size={[0.14, 2.2, 0.14]} kind="metal" />
          <PaintedSign
            text="CAFÉ ←   → MARKET"
            position={[0, 1.9, 0.09]}
            width={2.4}
          />
          <PaintedSign
            text="ARCADE ↑  GARDEN ←"
            position={[0, 1.3, 0.09]}
            width={2.4}
          />
        </group>
        <group
          position={[-4, 0, 3.8]}
          onClick={(e) => {
            e.stopPropagation();
            bridge.interact("mailbox", 400, 750);
          }}
        >
          <Piece
            position={[0, 0.75, 0]}
            size={[0.65, 1.5, 0.65]}
            kind="metal"
          />
          <Piece
            position={[0, 1.5, 0]}
            size={[0.8, 0.3, 0.7]}
            kind="paintedWood"
            color="#bb7e6c"
          />
          <PaintedSign text="POST" position={[0, 1.15, 0.34]} width={0.55} />
        </group>
        <group
          position={[6, 0, 6]}
          userData={{ fadeObstruction: true }}
          onClick={(e) => {
            e.stopPropagation();
            bridge.interact("noticeboard", 900, 850);
          }}
        >
          <Piece position={[0, 1.3, 0]} size={[2.4, 2.3, 0.14]} kind="wood" />
          <PaintedSign
            text="TOWN NOTICEBOARD"
            position={[0, 2.15, 0.09]}
            width={2.2}
          />
          <PaintedSign
            text="DAILY CUP · VISIT THE ARENA"
            position={[0, 1.5, 0.09]}
            width={2.2}
          />
          <PaintedSign
            text="MEET · PLAY · EXPLORE"
            position={[0, 0.9, 0.09]}
            width={2.2}
          />
        </group>
        {/* Far skyline is scenery, never a walkable surface. */}
        <DistantTown />
        <DistrictDetails />
        <TownSky />
        <TownDebug bridge={bridge} />
        <Residents bridge={bridge} />
      </group>
    </TownStyleContext.Provider>
  );
}

function TownDebug({ bridge }) {
  const debug = bridge.scene.debug ?? {},
    nav = useMemo(() => {
      const p = [];
      for (let y = 100; y <= 900; y += 40)
        for (let x = -300; x <= 1500; x += 40)
          if (walkable("town", x, y))
            p.push((x - 600) / 50, 0.06, (y - 500) / 50);
      return new Float32Array(p);
    }, []);
  return (
    <group>
      {debug.routes && (
        <>
          <points>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[nav, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#a25166" size={0.06} />
          </points>
          {TOWN_RESIDENTS.filter((n) => n.route).map((n) => (
            <line key={n.id}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[
                    new Float32Array(
                      [...n.route, n.route[0]].flatMap(([x, y]) => [
                        (x - 600) / 50,
                        0.1,
                        (y - 500) / 50,
                      ]),
                    ),
                    3,
                  ]}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#4267bc" />
            </line>
          ))}
        </>
      )}
      {debug.materials &&
        Object.keys({
          stone: 1,
          paintedWood: 1,
          wood: 1,
          brass: 1,
          metal: 1,
          glass: 1,
          fabric: 1,
          foliage: 1,
          water: 1,
        }).map((kind, i) => (
          <group key={kind} position={[-5 + i * 1.2, 1.2, 7.5]}>
            <mesh material={townMaterial(kind)}>
              <sphereGeometry args={[0.45, 16, 12]} />
            </mesh>
            <PaintedSign text={kind} position={[0, -0.7, 0.1]} width={1} />
          </group>
        ))}
    </group>
  );
}

function TownAtmosphere({ bridge }) {
  const spark = useRef(),
    water = useRef();
  const particles = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: 28 }, (_, i) => [
          Math.sin(i * 8.8) * 12,
          0.7 + Math.sin(i * 12.2) * 0.5,
          -5 + Math.cos(i * 2.5) * 2,
        ]).flat(),
      ),
    [],
  );
  useFrame(({ clock }) => {
    if (bridge.reducedMotion) return;
    spark.current.position.y = Math.sin(clock.elapsedTime * 0.4) * 0.15;
    water.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.7) * 0.08);
  });
  return (
    <>
      <points ref={spark}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#fff3c8"
          size={0.045}
          transparent
          opacity={0.45}
        />
      </points>
      <group ref={water} position={[0, 0.585, -1.4]}>
        {[0.7, 1.2, 1.5].map((r) => (
          <mesh
            key={r}
            rotation={[-Math.PI / 2, 0, 0]}
            material={townMaterial("water", "#b0ddd1")}
          >
            <torusGeometry args={[r, 0.012, 4, 40]} />
          </mesh>
        ))}
      </group>
      {[-16, 0, 16].map((x, i) => (
        <group key={x} position={[x, 10 + (i % 2), -20]}>
          {[-1, 0, 1].map((j) => (
            <mesh
              key={j}
              position={[j * 1.5, Math.abs(j) * -0.3, 0]}
              scale={[2, 1, 1]}
            >
              <sphereGeometry args={[1, 12, 8]} />
              <meshBasicMaterial color="#e5e8d8" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}
