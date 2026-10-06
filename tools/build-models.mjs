import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { writeFile, mkdir } from "node:fs/promises";
// Original prototypes. Exported locally, no third-party character artwork.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((v) => {
      this.result =
        "data:application/octet-stream;base64," +
        Buffer.from(v).toString("base64");
      this.onloadend?.();
    });
  }
};
await mkdir("web/assets/models", { recursive: true });
for (const kind of ["penguin", "mochi"]) {
  const scene = new THREE.Scene(),
    root = new THREE.Bone(),
    head = new THREE.Bone();
  root.name = kind + "_root";
  head.name = "head";
  head.position.y = kind === "penguin" ? 1.35 : 0.45;
  root.add(head);
  for (const name of [
    "head_socket",
    "face_socket",
    "chest_socket",
    "back_socket",
    "left_hand_socket",
    "feet_socket",
  ]) {
    const bone = new THREE.Bone();
    bone.name = name;
    root.add(bone);
  }
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  geometry.scale(
    ...(kind === "penguin" ? [0.67, 0.95, 0.53] : [0.52, 0.47, 0.48]),
  );
  geometry.translate(0, kind === "penguin" ? 1 : 0.45, 0);
  const count = geometry.attributes.position.count,
    indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    indices[i * 4] = 0;
    indices[i * 4 + 1] = 1;
    const y = geometry.attributes.position.getY(i);
    const w = THREE.MathUtils.clamp(
      (y - (kind === "penguin" ? 1.25 : 0.55)) * 0.8,
      0,
      0.45,
    );
    weights[i * 4] = 1 - w;
    weights[i * 4 + 1] = w;
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const mesh = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: kind === "penguin" ? "#659db1" : "#af91cc",
      roughness: 0.75,
    }),
  );
  mesh.name = kind + "_body";
  mesh.add(root);
  mesh.bind(
    new THREE.Skeleton([
      root,
      head,
      ...root.children.filter((b) => b !== head),
    ]),
  );
  scene.add(mesh);
  const names =
    kind === "penguin"
      ? ["idle", "walk", "wave", "dance", "cheer", "laugh", "sad", "sit"]
      : [
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
  scene.animations = names.map(
    (name) =>
      new THREE.AnimationClip(name, 2, [
        new THREE.QuaternionKeyframeTrack(
          "head.quaternion",
          [0, 0.5, 1, 1.5, 2],
          [
            0,
            0,
            0,
            1,
            0,
            0,
            Math.sin(0.025),
            Math.cos(0.025),
            0,
            0,
            0,
            1,
            0,
            0,
            -Math.sin(0.025),
            Math.cos(0.025),
            0,
            0,
            0,
            1,
          ],
        ),
      ]),
  );
  const buffer = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    animations: scene.animations,
  });
  await writeFile("web/assets/models/" + kind + ".glb", Buffer.from(buffer));
}
console.log("Exported original rigged penguin/mochi prototype GLBs.");
