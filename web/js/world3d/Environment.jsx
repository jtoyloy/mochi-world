import { TownStyleContext, townMaterial } from "./materials.js";
import { TownSquare } from "./TownSquare.jsx";
import React, { useRef, useState, useMemo, useEffect, useContext } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { WorldHtml as Html } from "./Labels.jsx";
import * as THREE from "three";
import { Soft } from "./Characters.jsx";
import { roomSpec } from "../game/model.js";
export function Block({
  position = [0, 0, 0],
  size = [1, 1, 1],
  color = "#fff1da",
  radius = 0.14,
  kind,
  ...props
}) {
  const town = useContext(TownStyleContext);
  const material = town
    ? townMaterial(
        kind ??
          (color === "#90c2bd"
            ? "glass"
            : color === "#fff1da" || color === "#efe0c3"
              ? "plaster"
              : color.startsWith("#b")
                ? "wood"
                : "paintedWood"),
        color,
      )
    : null;
  return (
    <RoundedBox
      position={position}
      args={size}
      radius={radius}
      smoothness={2}
      castShadow
      receiveShadow
      {...props}
      material={material ?? undefined}
    >
      {!material && <meshStandardMaterial color={color} roughness={0.8} />}
    </RoundedBox>
  );
}
export function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <Block
        position={[0, 1, 0]}
        size={[0.23, 2, 0.23]}
        color="#ae8263"
        radius={0.08}
      />
      <Soft position={[0, 2.45, 0]} scale={[1.1, 1.15, 0.95]} color="#6e9d80" />
      <Soft
        position={[-0.65, 2.1, 0.18]}
        scale={[0.7, 0.8, 0.7]}
        color="#8fb494"
      />
      <Soft
        position={[0.65, 2.3, -0.1]}
        scale={[0.7, 0.85, 0.7]}
        color="#82aa85"
      />
      <Block size={[1.8, 0.3, 1.6]} color="#d9c8a3" />
    </group>
  );
}
export function Bench({ position, rotation = 0, bridge, id }) {
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={
        bridge
          ? (e) => {
              e.stopPropagation();
              bridge.interact(
                id,
                position[0] * 50 + 600,
                position[2] * 50 + 540,
              );
            }
          : undefined
      }
    >
      <Block position={[0, 0.55, 0]} size={[2, 0.15, 0.55]} color="#bb8a65" />
      <Block
        position={[0, 0.95, -0.23]}
        size={[2, 0.48, 0.12]}
        color="#bd926b"
      />
      {[-0.7, 0.7].map((x) => (
        <Block
          key={x}
          position={[x, 0.25, 0]}
          size={[0.14, 0.5, 0.4]}
          color="#5d7c74"
        />
      ))}
    </group>
  );
}
export function Lamp({ position }) {
  return (
    <group position={position}>
      <Block
        position={[0, 1.3, 0]}
        size={[0.1, 2.6, 0.1]}
        color="#577d77"
        radius={0.04}
      />
      <Soft
        position={[0, 2.75, 0]}
        scale={[0.26, 0.38, 0.26]}
        color="#ffe9a4"
      />
      <mesh position={[0, 2.75, 0]}>
        <sphereGeometry args={[0.19, 12, 8]} />
        <meshStandardMaterial
          color="#ffdfa0"
          emissive="#ffd89b"
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
}
export function Fountain() {
  const crystal = useRef(),
    water = useRef();
  useFrame(({ clock }) => {
    if (crystal.current) {
      crystal.current.rotation.y = clock.elapsedTime * 0.3;
      crystal.current.position.y = 2.9 + Math.sin(clock.elapsedTime) * 0.08;
    }
    if (water.current) water.current.rotation.y = clock.elapsedTime * 0.1;
  });
  return (
    <group position={[0, 0, -1.4]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.88, 2.03, 0.5, 48]} />
        <meshStandardMaterial color="#ded1b9" />
      </mesh>
      <mesh position={[0, 0.52, 0]} ref={water}>
        <cylinderGeometry args={[1.64, 1.64, 0.1, 48]} />
        <meshStandardMaterial
          color="#77c5c1"
          roughness={0.22}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.48, 1.3, 24]} />
        <meshStandardMaterial color="#ebdcc0" />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.15, 32]} />
        <meshStandardMaterial color="#e6ceb4" />
      </mesh>
      <mesh ref={crystal} position={[0, 2.9, 0]} castShadow>
        <octahedronGeometry args={[0.45]} />
        <meshStandardMaterial
          color="#f2b85f"
          metalness={0.3}
          roughness={0.3}
          emissive="#ca8427"
          emissiveIntensity={0.08}
        />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[
            Math.cos((i * Math.PI) / 2) * 0.7,
            1.15,
            Math.sin((i * Math.PI) / 2) * 0.7,
          ]}
        >
          <cylinderGeometry args={[0.022, 0.028, 1.3, 8]} />
          <meshStandardMaterial color="#c3efdf" transparent opacity={0.65} />
        </mesh>
      ))}
    </group>
  );
}
export function PaintedSign({
  text,
  position,
  width = 3.3,
  color = "#fff1d6",
  ink = "#425a53",
  rotation,
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 768, 128);
    ctx.fillStyle = ink;
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 384, 66, 730);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, color, ink]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, width / 6]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
export function MarketBoard({ position = [0, 0, -6.5], scale = 1 }) {
  const [prices, setPrices] = useState("Loading market…");
  const [label, setLabel] = useState("PAPER MARKETS · NO REAL TRADES");
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const rows = await Promise.all(
          ["SOL", "BONK", "WIF"].map(async (s) => {
            const r = await fetch("/api/world-market/" + s);
            if (!r.ok) throw Error();
            return r.json();
          }),
        );
        if (live)
          setLabel(
            rows.some((r) => r.source === "mock")
              ? "MOCK PRICES · PAPER ONLY"
              : "LIVE PRICES · PAPER ONLY",
          );
        if (live)
          setPrices(
            rows
              .map((r) => r.symbol + " $" + Number(r.price).toPrecision(4))
              .join(" · "),
          );
      } catch {
        if (live) setPrices("Market unavailable · paper portfolios are safe");
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <group position={position} scale={scale}>
      <Block position={[0, 3, 0]} size={[7.5, 1.8, 0.25]} color="#3f605f" />
      <PaintedSign
        text={label}
        position={[0, 3.55, 0.15]}
        width={7}
        color="#3f605f"
        ink="#e5d5a2"
      />
      <PaintedSign
        text={prices}
        position={[0, 2.95, 0.15]}
        width={7}
        color="#3f605f"
        ink="#f2eee0"
      />
    </group>
  );
}
function Furniture({ slot }) {
  if (slot === "bed")
    return (
      <>
        <Block position={[0, 0.1, 0]} size={[1.7, 0.3, 1]} color="#a591b1" />
        <Block
          position={[0, 0.35, 0]}
          size={[1.6, 0.25, 0.95]}
          color="#ecdfc7"
        />
        <Soft
          position={[0, 0.5, -0.25]}
          scale={[0.5, 0.08, 0.2]}
          color="#f7edde"
        />
      </>
    );
  if (slot === "rug") return <Block size={[1.9, 0.05, 1.3]} color="#91ae8f" />;
  if (slot === "plant")
    return (
      <>
        <Block size={[0.45, 0.5, 0.45]} color="#c18a73" />
        <Soft position={[0, 0.6, 0]} scale={[0.5, 0.6, 0.5]} color="#88a88b" />
      </>
    );
  if (slot === "computer")
    return (
      <>
        <Block size={[1.6, 0.7, 0.8]} color="#b48f6e" />
        <Block
          position={[0, 0.75, 0]}
          size={[1.1, 0.8, 0.15]}
          color="#698b88"
        />
        <PaintedSign
          text="PAPER PORTFOLIO"
          position={[0, 0.8, 0.09]}
          width={1}
          color="#315253"
          ink="#e9d7a5"
        />
      </>
    );
  return <Soft scale={[0.35, 0.35, 0.35]} color="#cba2ab" />;
}
const signs = {
  cafe: "THE LITTLE KETTLE",
  market: "THE WISH MARKET",
  arcade: "STARLIGHT ARCADE",
  exchange: "PAPER EXCHANGE",
  park: "CLOVER GARDEN",
};
export function Storefront({ prop, accent, bridge, room }) {
  const [hover, setHover] = useState(false),
    [id, label, x, y] = prop,
    px = (x - 600) / 50,
    pz = (y - 500) / 50,
    interior = room !== "town" && room !== "market";
  return (
    <group
      position={[px, 0, pz]}
      userData={{ fadeObstruction: true }}
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
        bridge.interact(id, x, Math.max(370, y + 140));
      }}
    >
      {id === "park" && room === "town" ? (
        <>
          <Block
            position={[-1.2, 1, 0]}
            size={[0.35, 2, 0.35]}
            color="#7b9d7b"
          />
          <Block
            position={[1.2, 1, 0]}
            size={[0.35, 2, 0.35]}
            color="#7b9d7b"
          />
          <Block
            position={[0, 2.1, 0]}
            size={[2.8, 0.45, 0.6]}
            color="#759379"
          />
          <PaintedSign
            text="CLOVER GARDEN"
            position={[0, 2.13, 0.45]}
            width={2.5}
          />
          <Soft
            position={[-1.25, 2.55, 0]}
            scale={[0.5, 0.5, 0.5]}
            color="#9eb58b"
          />
          <Soft
            position={[1.25, 2.55, 0]}
            scale={[0.5, 0.5, 0.5]}
            color="#9eb58b"
          />
        </>
      ) : id === "town" ? (
        <>
          <Block position={[0, 0.12, 0]} size={[2, 0.24, 1]} color="#a6bfb0" />
          <Html zIndexRange={[25, 0]} center position={[0, 0.6, 0]}>
            <span className="place-sign">← Town Square</span>
          </Html>
        </>
      ) : interior ? (
        <>
          <Block position={[0, 0.7, 0]} size={[2.9, 1.4, 1.3]} color={accent} />
          <Block
            position={[0, 1.48, 0]}
            size={[3.1, 0.18, 1.5]}
            color="#f3dab8"
          />
          <Block
            position={[0, 2.15, -0.4]}
            size={[3, 1.25, 0.18]}
            color={
              room === "exchange" || room === "arcade" ? "#375965" : "#f4e4cc"
            }
          />
          <PaintedSign
            text={label}
            position={[0, 2.2, -0.2]}
            width={2.8}
            color={hover ? "#ffe3a4" : "#fff1d6"}
          />
          {[0, 1, 2].map((i) => (
            <Soft
              key={i}
              position={[(i - 1) * 0.7, 1.7, 0.1]}
              scale={[0.24, 0.16, 0.22]}
              color={["#edae76", "#9bbdac", "#d7a2bd"][i]}
            />
          ))}
        </>
      ) : (
        <>
          <Block
            position={[0, 1.6, 0]}
            size={[3.6, 3.2, 2.4]}
            color="#efe0c3"
            radius={0.24}
          />
          <Block position={[0, 3.35, 0]} size={[4, 0.3, 2.8]} color={accent} />
          <Block position={[0, 3.7, 0]} size={[3.7, 0.5, 2.5]} color={accent} />
          <Block
            position={[0.75, 0.95, 1.22]}
            size={[0.85, 1.9, 0.12]}
            color="#527777"
            radius={0.16}
          />
          <Soft
            position={[0.98, 0.9, 1.32]}
            scale={[0.035, 0.035, 0.035]}
            color="#e7b968"
          />
          <Block
            position={[-0.85, 1.6, 1.22]}
            size={[1.15, 1.3, 0.14]}
            color="#90c2bd"
          />
          <Block
            position={[-0.85, 1.6, 1.32]}
            size={[0.05, 1.35, 0.05]}
            color="#ffefd4"
          />
          <Block
            position={[-0.85, 1.6, 1.32]}
            size={[1.2, 0.05, 0.05]}
            color="#ffefd4"
          />
          <Block
            position={[0, 2.92, 1.45]}
            size={[3.65, 0.22, 0.85]}
            color={hover ? "#e5b475" : accent}
          />
          <PaintedSign
            text={signs[id] ?? label}
            position={[0, 3.08, 1.88]}
            color={hover ? "#ffe3a4" : "#fff1d6"}
          />
          {[-1.35, 1.35].map((v) => (
            <group key={v} position={[v, 0.3, 1.35]}>
              <Block size={[0.55, 0.6, 0.55]} color="#bd8f73" />
              <Soft
                position={[0, 0.43, 0]}
                scale={[0.36, 0.32, 0.36]}
                color="#92b293"
              />
            </group>
          ))}
        </>
      )}
      {hover && (
        <Html
          zIndexRange={[25, 0]}
          center
          position={[0, 4.45, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className="interaction-label">{label} · Explore</span>
        </Html>
      )}
    </group>
  );
}
function PetalInstances() {
  const mesh = useRef();
  const positions = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => [
        Math.sin(i * 19.3) * 10,
        0.15,
        -6.3 + Math.cos(i * 7.7) * 0.4,
      ]),
    [],
  );
  React.useEffect(() => {
    const o = new THREE.Object3D();
    positions.forEach((p, i) => {
      o.position.set(...p);
      o.scale.set(0.08, 0.12, 0.08);
      o.updateMatrix();
      mesh.current.setMatrixAt(i, o.matrix);
      mesh.current.setColorAt(
        i,
        new THREE.Color(i % 2 ? "#e9b782" : "#bd93b6"),
      );
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return (
    <instancedMesh ref={mesh} args={[null, null, positions.length]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}
export function Environment({ roomId, bridge, home }) {
  const room = roomSpec(roomId),
    town = room.id === "town",
    outdoor = town || room.id === "park" || room.id === "market",
    accent = "#" + room.accent.toString(16);
  if (town) return <TownSquare bridge={bridge} />;
  return (
    <group>
      <Block
        position={[0, -0.42, -1.3]}
        size={[25, 0.8, 18]}
        color={outdoor ? "#90ac91" : "#d2b99a"}
        radius={0.45}
      />
      <Block
        position={[0, -0.045, -0.1]}
        size={[23, 0.14, 8]}
        userData={{ walkableGround: true }}
        color={outdoor ? "#e5d3b1" : "#ead5b6"}
        radius={0.3}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        onClick={(e) => {
          e.stopPropagation();
          bridge.scene.moveTo({
            x: e.point.x * 50 + 600,
            y: e.point.z * 50 + 500,
          });
        }}
      >
        <planeGeometry args={[23, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => (
        <Block
          key={i}
          position={[(i - 7.5) * 1.4, 0.018, 2.75]}
          size={[1.34, 0.055, 0.13]}
          userData={{ walkableGround: true }}
          color="#ccba9a"
          radius={0.025}
        />
      ))}
      {outdoor ? (
        <>
          <Block position={[0, 0.1, -7]} size={[24, 0.25, 1]} color="#789b7d" />
          <PetalInstances />
          {[
            [-11, 0, -4],
            [-9, 0, -7],
            [9.5, 0, -7],
            [11, 0, -3],
          ].map((p, i) => (
            <Tree key={i} position={p} scale={i % 2 ? 0.85 : 1} />
          ))}
        </>
      ) : (
        <>
          <Block
            position={[0, 2.3, -7]}
            size={[24, 4.6, 0.28]}
            color={
              room.id === "arcade"
                ? "#6e628a"
                : room.id === "exchange"
                  ? "#87aea2"
                  : "#dab49d"
            }
          />
          {[-8, -4, 0, 4, 8].map((x) => (
            <Block
              key={x}
              position={[x, 2.6, -6.8]}
              size={[2.6, 2.3, 0.08]}
              color="#aed5ce"
            />
          ))}
        </>
      )}
      {town && (
        <>
          <Fountain />
          <Bench position={[-5, 0, -2.5]} rotation={0.2} />
          <Bench position={[5, 0, -2.5]} rotation={-0.2} />
          {[
            [-8, 0, 2.7],
            [8, 0, 2.7],
            [-4, 0, -6],
            [4, 0, -6],
          ].map((p, i) => (
            <Lamp key={i} position={p} />
          ))}
        </>
      )}
      {room.props.map((prop, i) => (
        <Storefront
          key={prop[0]}
          prop={prop}
          accent={
            town
              ? ["#aa7870", "#73938a", "#88809e", "#658f97", "#7e9c77"][i]
              : accent
          }
          bridge={bridge}
          room={room.id}
        />
      ))}
      {room.id === "exchange" && <MarketBoard />}
      {room.id === "cafe" && (
        <>
          {[-6, 5].map((x) => (
            <group key={x} position={[x, 0, 1]}>
              <mesh position={[0, 0.9, 0]} castShadow>
                <cylinderGeometry args={[0.85, 0.85, 0.16, 32]} />
                <meshStandardMaterial color="#b38365" />
              </mesh>
              <Block
                position={[0, 0.45, 0]}
                size={[0.16, 0.9, 0.16]}
                color="#6b7b71"
              />
              <Bench position={[0, 0, 1.1]} />
              <Soft
                position={[0, 1.1, 0]}
                scale={[0.16, 0.18, 0.16]}
                color="#e9cba2"
              />
            </group>
          ))}
          <group position={[-8, 0.0, -5.1]}>
            <Soft
              position={[0, 0.8, 0]}
              scale={[0.45, 0.8, 0.45]}
              color="#a5b1c4"
            />
            <Html zIndexRange={[25, 0]} center position={[0, 2, 0]}>
              <span className="nameplate">Pip · Café keeper</span>
            </Html>
          </group>
        </>
      )}
      {room.id === "park" && (
        <>
          <Bench position={[5, 0, 1.7]} />
          <Soft
            position={[-4, 0.3, 0.4]}
            scale={[0.3, 0.3, 0.3]}
            color="#d89484"
          />
          <mesh position={[-3, 0.3, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.65, 0.12, 12, 32]} />
            <meshStandardMaterial color="#ddb16a" />
          </mesh>
        </>
      )}
      {room.id === "arena" &&
        [-1, 0, 1].map((x, i) => (
          <group key={i} position={[x * 1.3, 0, -1]}>
            <Block
              position={[0, 0.3 + (i === 1 ? 0.2 : 0), 0]}
              size={[1, 0.6 + (i === 1 ? 0.4 : 0), 1]}
              color="#be9d78"
            />
            <Soft
              position={[0, 1.1 + (i === 1 ? 0.4 : 0), 0]}
              scale={[0.3, 0.4, 0.3]}
              color="#ddb45b"
            />
          </group>
        ))}
      {room.id === "home" && (
        <>
          <Block
            position={[-6, 0.3, -2]}
            size={[3, 0.6, 1.8]}
            color="#a09ab7"
          />
          <Block
            position={[-6, 0.7, -2.4]}
            size={[3, 0.9, 0.3]}
            color="#8c84a4"
          />
          <Block
            position={[-6, 0.68, -1.7]}
            size={[2.9, 0.18, 1]}
            color="#e2cdb8"
          />
          {Object.entries(home?.pets[0]?.furniture ?? {}).map(
            ([slot, item], i) => (
              <group
                key={slot}
                position={[
                  -8 + (home.pets[0]?.placements?.[slot] ?? i) * 3,
                  0.35,
                  -5.7,
                ]}
              >
                <Furniture slot={slot} />
                <Html zIndexRange={[25, 0]} center position={[0, 0.8, 0]}>
                  <span className="nameplate">{item}</span>
                </Html>
              </group>
            ),
          )}
        </>
      )}
    </group>
  );
}
