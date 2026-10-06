import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { townMaterial } from "./materials.js";
import { PaintedSign } from "./Environment.jsx";
export function TownPart({
  position = [0, 0, 0],
  size = [1, 1, 1],
  kind = "wood",
  color,
  shadow = true,
  ...props
}) {
  return (
    <RoundedBox
      position={position}
      args={size}
      radius={Math.min(0.09, ...size.map((v) => v / 4))}
      smoothness={1}
      material={townMaterial(kind, color)}
      castShadow={shadow}
      receiveShadow
      {...props}
    />
  );
}
const ball = new THREE.SphereGeometry(1, 16, 10);
export function Goods({ kind, index = 0 }) {
  if (kind === "food")
    return (
      <>
        <TownPart
          size={[0.45, 0.04, 0.32]}
          kind="wood"
          position={[0, -0.1, 0]}
        />
        <mesh
          geometry={ball}
          scale={[0.17, 0.09, 0.12]}
          material={townMaterial("plaster", "#fff0d5")}
        />
        <TownPart
          size={[0.27, 0.05, 0.2]}
          position={[0, 0.09, 0]}
          kind="fabric"
          color={index % 2 ? "#83a082" : "#d68d78"}
        />
      </>
    );
  if (kind === "toy")
    return index === 1 ? (
      <TownPart size={[0.3, 0.3, 0.3]} kind="paintedWood" color="#ad9ab9" />
    ) : (
      <>
        <mesh
          geometry={ball}
          scale={[0.18, 0.2, 0.17]}
          material={townMaterial("fabric", "#d9ac7c")}
        />
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            geometry={ball}
            position={[s * 0.12, 0.17, 0]}
            scale={[0.07, 0.08, 0.07]}
            material={townMaterial("fabric", "#d9ac7c")}
          />
        ))}
      </>
    );
  if (kind === "threads")
    return (
      <>
        <TownPart
          size={[0.31, 0.4, 0.08]}
          kind="fabric"
          color={index % 2 ? "#b894a9" : "#7e9d94"}
        />
        <TownPart
          size={[0.5, 0.13, 0.1]}
          position={[0, 0.14, 0]}
          kind="fabric"
          color={index % 2 ? "#b894a9" : "#7e9d94"}
        />
      </>
    );
  if (kind === "tech")
    return (
      <>
        <TownPart size={[0.38, 0.3, 0.07]} kind="metal" />
        <TownPart
          size={[0.3, 0.21, 0.02]}
          position={[0, 0, 0.05]}
          kind="glass"
        />
        <TownPart
          size={[0.2, 0.06, 0.2]}
          position={[0, -0.17, 0]}
          kind="metal"
        />
      </>
    );
  if (kind === "plant")
    return (
      <>
        <TownPart
          position={[0, -0.05, 0]}
          size={[0.28, 0.2, 0.28]}
          kind="plaster"
          color="#c08e73"
        />
        <mesh
          geometry={ball}
          position={[0, 0.13, 0]}
          scale={[0.22, 0.26, 0.17]}
          material={townMaterial("foliage", index % 2 ? "#96af8b" : "#75967c")}
        />
      </>
    );
  return (
    <mesh material={townMaterial("brass")} rotation={[0, index * 0.7, 0]}>
      <octahedronGeometry args={[0.22]} />
    </mesh>
  );
}
function CaféTable({ position }) {
  return (
    <group position={position} userData={{ fadeObstruction: true }}>
      <mesh position={[0, 0.85, 0]} material={townMaterial("wood")} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 0.1, 24]} />
      </mesh>
      <TownPart
        position={[0, 0.43, 0]}
        size={[0.12, 0.86, 0.12]}
        kind="metal"
      />
      {[-0.85, 0.85].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <TownPart
            position={[0, 0.4, 0]}
            size={[0.45, 0.13, 0.45]}
            kind="paintedWood"
          />
          <TownPart
            position={[0, 0.2, 0]}
            size={[0.1, 0.4, 0.1]}
            kind="metal"
          />
        </group>
      ))}
      <TownPart position={[0, 1.6, 0]} size={[0.045, 3.2, 0.045]} kind="wood" />
      <mesh
        position={[0, 3.2, 0]}
        material={townMaterial("fabric", "#c7977b")}
        castShadow
      >
        <coneGeometry args={[1.15, 0.45, 8]} />
      </mesh>
      <mesh
        geometry={ball}
        position={[0.26, 0.99, 0]}
        scale={[0.09, 0.12, 0.09]}
        material={townMaterial("plaster", "#fff1d6")}
      />
      <mesh
        geometry={ball}
        position={[-0.25, 0.99, 0.1]}
        scale={[0.09, 0.12, 0.09]}
        material={townMaterial("plaster", "#fff1d6")}
      />
    </group>
  );
}
export function DistrictDetails() {
  const light = useRef();
  useFrame(({ clock }) => {
    if (light.current)
      light.current.material.emissiveIntensity =
        0.3 + Math.sin(clock.elapsedTime * 2) * 0.1;
  });
  return (
    <>
      <CaféTable position={[-13.4, 0, -2]} />
      <CaféTable position={[-8.8, 0, -2.8]} />
      <group position={[-9.4, 0, -4]}>
        <TownPart
          position={[0, 0.42, 0]}
          size={[0.65, 0.84, 0.65]}
          kind="wood"
        />
        <PaintedSign text="FRESH TEA" position={[0, 1, 0.34]} width={0.85} />
      </group>
      <group position={[-1.8, 0, -4.4]}>
        <TownPart
          position={[0, 0.75, 0]}
          size={[0.65, 1.5, 0.75]}
          kind="paintedWood"
          color="#9a88ae"
        />
        <TownPart
          position={[0, 1.35, 0.39]}
          size={[0.5, 0.4, 0.04]}
          kind="glass"
        />
        <TownPart
          position={[0, 0.88, 0.44]}
          size={[0.48, 0.1, 0.2]}
          kind="metal"
        />
        <PaintedSign text="PLAY" position={[0, 1.8, 0.05]} width={0.6} />
      </group>
      <mesh ref={light} position={[-1.8, 2.1, -4.4]}>
        <sphereGeometry args={[0.13, 12, 8]} />
        <meshStandardMaterial
          color="#e8ba85"
          emissive="#e8ba85"
          emissiveIntensity={0.3}
        />
      </mesh>
      <group position={[6.6, 0, -6]}>
        {[-1, 1].map((x) => (
          <TownPart
            key={x}
            position={[x, 1.6, 0]}
            size={[0.18, 3.2, 0.18]}
            kind="metal"
          />
        ))}
        <TownPart position={[0, 3.2, 0]} size={[2.2, 0.2, 0.4]} kind="metal" />
      </group>
      {[
        [12, 0, 1],
        [15.8, 0, 1],
        [12, 0, 5.8],
      ].map((p, i) => (
        <group key={i} position={p}>
          <TownPart position={[0, 0.25, 0]} size={[0.65, 0.5, 0.6]} />
          <TownPart
            position={[0, 0.52, 0]}
            size={[0.7, 0.07, 0.65]}
            kind="paintedWood"
          />
          <PaintedSign
            text={i === 0 ? "TOYS" : i === 1 ? "DELIVERY" : "FINDS"}
            position={[0, 0.3, 0.32]}
            width={0.55}
          />
        </group>
      ))}
      {/* Original Mochi lantern sculpture: friendly silhouette enclosed by a brass halo. */}
      <group position={[0, 3.5, -1.4]}>
        <mesh
          geometry={ball}
          scale={[0.55, 0.46, 0.48]}
          material={townMaterial("brass")}
          castShadow
        />
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            geometry={ball}
            position={[s * 0.19, 0.05, 0.43]}
            scale={[0.065, 0.085, 0.035]}
            material={townMaterial("metal", "#526b66")}
          />
        ))}
        <mesh
          geometry={ball}
          position={[0, -0.1, 0.47]}
          scale={[0.04, 0.026, 0.02]}
          material={townMaterial("metal", "#526b66")}
        />
      </group>
    </>
  );
}
export function DistantTown() {
  return (
    <>
      {[-24, -17, -10, 0, 9, 17, 24].map((x, i) => (
        <group key={x} position={[x, 0, -16]}>
          <TownPart
            position={[0, 2.1, 0]}
            size={[4.3, 4.2, 3]}
            kind="plaster"
            color={i % 2 ? "#becbb4" : "#d2d7bf"}
            shadow={false}
          />
          <mesh
            position={[0, 4.6, 0]}
            rotation={[0, Math.PI / 4, 0]}
            material={townMaterial(
              "paintedWood",
              i % 2 ? "#91a79a" : "#b6baa1",
            )}
          >
            <coneGeometry args={[3.6, 1.5, 4]} />
          </mesh>
          {[-1, 1].map((s) => (
            <TownPart
              key={s}
              position={[s * 0.95, 2.6, 1.51]}
              size={[0.8, 1.1, 0.03]}
              kind="glass"
              shadow={false}
            />
          ))}
          <TownPart
            position={[0, 0.8, 1.52]}
            size={[0.65, 1.6, 0.04]}
            kind="paintedWood"
            shadow={false}
          />
        </group>
      ))}
    </>
  );
}
export function TownSky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#86b9bb") },
          bottom: { value: new THREE.Color("#dee1c9") },
        },
        vertexShader:
          "varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader:
          "varying vec3 vDirection;uniform vec3 top;uniform vec3 bottom;void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(-.05,.8,vDirection.y)),1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }",
      }),
    [],
  );
  React.useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material}>
      <sphereGeometry args={[70, 24, 12]} />
    </mesh>
  );
}
