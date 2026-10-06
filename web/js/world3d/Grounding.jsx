import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { groundHeight, settleVisual, MODEL_METADATA } from "./grounding.js";
export function GroundedVisual({
  entity,
  animated,
  kind,
  bridge,
  children,
  config,
}) {
  const metadata = {
    scale: 1,
    rotationOffset: [0, 0, 0],
    groundOffset: 0,
    ...MODEL_METADATA[kind],
    ...config,
  };
  const visual = useRef(),
    { scene } = useThree(),
    box = useMemo(() => new THREE.Box3(), []),
    ray = useMemo(() => new THREE.Raycaster(), []);
  const debug = useMemo(() => new THREE.Box3Helper(box, 0xe27160), [box]),
    axes = useMemo(() => new THREE.AxesHelper(0.6), []),
    arrow = useMemo(
      () =>
        new THREE.ArrowHelper(
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(0, 2, 0),
          2,
          0x427fcc,
        ),
      [],
    );
  useFrame(() => {
    if (!entity.current || !visual.current) return;
    const root = entity.current;
    root.position.y =
      groundHeight(scene, root.position.x, root.position.z, ray) ??
      root.position.y;
    const hop = Math.max(0, animated.current?.position.y ?? 0);
    settleVisual(visual.current, root.position.y, hop, metadata, box);
    axes.visible = arrow.visible = debug.visible = !!bridge.scene.debug?.ground;
    debug.position.copy(root.position).multiplyScalar(-1);
    visual.current.updateWorldMatrix(true, true);
    box.setFromObject(visual.current);
    root.userData.grounding = {
      groundY: root.position.y,
      minY: box.min.y,
      offset: visual.current.position.y,
      kind,
    };
  }, -1);
  return (
    <>
      <group
        ref={visual}
        scale={metadata.scale}
        rotation={metadata.rotationOffset}
      >
        {children}
      </group>
      <primitive object={debug} />
      <primitive object={axes} />
      <primitive object={arrow} />
    </>
  );
}
let shadow;
export function ContactShadow({ radius = 0.6 }) {
  const texture = useMemo(() => {
    if (shadow) return shadow;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(52,62,61,.28)");
    g.addColorStop(1, "rgba(52,62,61,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return (shadow = new THREE.CanvasTexture(c));
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}
