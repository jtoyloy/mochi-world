import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
export function Occlusion({ bridge, roomId }) {
  const { scene, camera } = useThree(),
    groups = useRef([]),
    at = useRef(-1),
    ray = useRef(new THREE.Raycaster()),
    clones = useRef(new Map());
  useEffect(
    () => () => {
      for (const [mesh, v] of clones.current) {
        mesh.material = v.original;
        v.copy.dispose();
      }
      clones.current.clear();
      groups.current = [];
    },
    [roomId],
  );
  useFrame(({ clock }) => {
    if (clock.elapsedTime - at.current < 0.1) return;
    at.current = clock.elapsedTime;
    const self = bridge.scene.data.get(bridge.selfId);
    if (!self) return;
    const marked = [];
    scene.traverse((o) => {
      if (o.userData.fadeObstruction) marked.push(o);
    });
    groups.current = marked;
    const meshes = [];
    for (const group of marked)
      group.traverse((o) => {
        if (o.isMesh && !Array.isArray(o.material)) meshes.push(o);
      });
    const obscured = new Set();
    for (const p of [self, self.companion].filter(Boolean)) {
      const target = new THREE.Vector3((p.x - 600) / 50, 0.8, (p.y - 500) / 50),
        direction = target.clone().sub(camera.position),
        distance = direction.length();
      ray.current.set(camera.position, direction.normalize());
      ray.current.far = distance - 0.3;
      for (const hit of ray.current.intersectObjects(meshes, false)) {
        let o = hit.object;
        while (o && !o.userData.fadeObstruction) o = o.parent;
        if (o) obscured.add(o);
      }
    }
    for (const group of marked)
      group.traverse((mesh) => {
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        if (obscured.has(group) && !clones.current.has(mesh)) {
          const original = mesh.material,
            copy = original.clone();
          mesh.material = copy;
          clones.current.set(mesh, { original, copy });
        }
        const v = clones.current.get(mesh);
        if (v) {
          v.copy.opacity = obscured.has(group) ? 0.24 : v.original.opacity;
          v.copy.transparent = obscured.has(group) || v.original.transparent;
          v.copy.depthWrite = obscured.has(group)
            ? false
            : v.original.depthWrite;
        }
      });
  });
  return null;
}
