import * as THREE from "three";
export const MODEL_METADATA = Object.freeze({
  penguin: { scale: 1, rotationOffset: [0, 0, 0], groundOffset: 0 },
  mochi: { scale: 0.9, rotationOffset: [0, 0, 0], groundOffset: 0 },
});
const down = new THREE.Vector3(0, -1, 0);
export function groundHeight(scene, x, z, ray = new THREE.Raycaster()) {
  const surfaces = [];
  scene.traverse((o) => {
    if (o.isMesh && o.userData.walkableGround) surfaces.push(o);
  });
  for (const surface of surfaces) surface.updateWorldMatrix(true, false);
  ray.set(new THREE.Vector3(x, 20, z), down);
  return ray.intersectObjects(surfaces, false)[0]?.point.y ?? null;
}
// World-space bounds include parent scale, rotation, and the current skinned pose.
// Only the visual child moves; network/entity position remains its contact point.
export function settleVisual(
  visual,
  groundY,
  hop = 0,
  metadata = {},
  box = new THREE.Box3(),
) {
  visual.updateWorldMatrix(true, true);
  visual.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox();
    }
  });
  box.setFromObject(visual);
  if (box.isEmpty()) return 0;
  const correction =
    groundY + (metadata.groundOffset ?? 0) + Math.max(0, hop) - box.min.y;
  const origin = visual.getWorldPosition(new THREE.Vector3());
  origin.y += correction;
  visual.position.copy(visual.parent.worldToLocal(origin));
  return correction;
}
