import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { settleVisual, groundHeight } from "../../web/js/world3d/grounding.js";
import {
  TOWN_RESIDENTS,
  nearbyResident,
  residentPosition,
} from "../../web/js/game/town.js";
import { NavigationService } from "../../web/js/game/NavigationService.js";
import { walkable, validSegment, roomBounds } from "../../web/js/game/model.js";
test("world-space contact correction preserves entity coordinates under scaled and rotated poses", () => {
  const scene = new THREE.Scene(),
    entity = new THREE.Group(),
    visual = new THREE.Group();
  scene.add(entity);
  entity.add(visual);
  entity.position.set(5, 0.6, 3);
  visual.scale.setScalar(0.9);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.4));
  foot.position.y = 0.09;
  visual.add(foot);
  for (const roll of [0, 0.12, -0.12]) {
    visual.rotation.z = roll;
    visual.scale.y = roll ? 0.75 : 0.9;
    settleVisual(visual, 0.6, 0);
    scene.updateMatrixWorld(true);
    assert.ok(
      Math.abs(new THREE.Box3().setFromObject(visual).min.y - 0.6) < 1e-6,
    );
    assert.deepEqual(entity.position.toArray(), [5, 0.6, 3]);
  }
  settleVisual(visual, 0.6, 0.2);
  scene.updateMatrixWorld(true);
  assert.ok(
    Math.abs(new THREE.Box3().setFromObject(visual).min.y - 0.8) < 1e-6,
  );
});
test("ground rays hit designated elevated surfaces and ignore props", () => {
  const scene = new THREE.Scene();
  for (const [y, ground] of [
    [0, true],
    [0.6, true],
    [2, false],
  ]) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial(),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.userData.walkableGround = ground;
    scene.add(m);
  }
  assert.equal(groundHeight(scene, 0, 0), 0.6);
});
test("Town expands independently and routes reach all static keepers without crossing stalls", () => {
  assert.deepEqual(roomBounds("cafe"), {
    minX: 60,
    maxX: 1140,
    minY: 350,
    maxY: 665,
  });
  assert.equal(TOWN_RESIDENTS.length, 18);
  assert.equal(
    new Set(TOWN_RESIDENTS.filter((n) => n.shop).map((n) => n.shop)).size,
    10,
  );
  const nav = new NavigationService("town"),
    start = { x: 550, y: 590 };
  for (const n of TOWN_RESIDENTS.filter((n) => n.shop)) {
    assert.ok(walkable("town", n.x, n.y), n.id);
    const path = nav.findPath(start, n);
    assert.ok(path?.length, n.id);
    let p = start;
    for (const q of path) {
      assert.ok(validSegment("town", p.x, p.y, q.x, q.y), n.id);
      p = q;
    }
  }
});
test("resident authority rejects remote/unknown contacts and checks authored moving positions", () => {
  const n = TOWN_RESIDENTS.find((n) => n.id === "otto"),
    p = residentPosition(n, 123000);
  assert.equal(nearbyResident("otto", p, 123000), n);
  assert.equal(nearbyResident("otto", { x: 1400, y: 800 }, 123000), null);
  assert.equal(nearbyResident("unknown", p, 123000), null);
});
test("all shipped skinned clips settle above the contact plane through rest, roll and scale", async () => {
  const { readFile } = await import("node:fs/promises"),
    { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  for (const kind of ["mochi", "penguin"]) {
    const bytes = await readFile(`web/assets/models/${kind}.glb`),
      asset = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        "",
      );
    const scene = new THREE.Scene(),
      entity = new THREE.Group(),
      visual = new THREE.Group();
    scene.add(entity);
    entity.add(visual);
    visual.add(asset.scene);
    entity.position.set(3, 0.6, -4);
    const mixer = new THREE.AnimationMixer(asset.scene);
    for (const clip of asset.animations) {
      mixer.stopAllAction();
      mixer.clipAction(clip).play();
      for (const t of [0.1, 0.5, 1]) {
        mixer.update(t);
        visual.scale.set(1, 0.75, 1);
        visual.rotation.set(0, 0.4, 0.12);
        settleVisual(visual, 0.6);
        scene.updateMatrixWorld(true);
        assert.ok(
          Math.abs(new THREE.Box3().setFromObject(visual).min.y - 0.6) < 1e-5,
          kind + clip.name,
        );
      }
    }
  }
});
test("authored roaming residents stay on valid routes with separated resident footprints", () => {
  for (let time = 0; time < 40000; time += 200) {
    const positions = TOWN_RESIDENTS.map((n) => ({
      n,
      ...residentPosition(n, time),
    }));
    for (const p of positions.filter((p) => p.n.route)) {
      assert.ok(walkable("town", p.x, p.y), p.n.id);
      for (const q of positions) {
        if (q.n !== p.n)
          assert.ok(
            Math.hypot(p.x - q.x, p.y - q.y) > 55,
            `${p.n.id} / ${q.n.id}`,
          );
      }
    }
  }
});
test("ground probe follows a translated ramp continuously and reports absent terrain", () => {
  const scene = new THREE.Scene();
  assert.equal(groundHeight(scene, 0, 0), null);
  const g = new THREE.PlaneGeometry(6, 3);
  g.rotateX(-Math.PI / 2);
  const a = g.attributes.position;
  for (let i = 0; i < a.count; i++)
    a.setY(i, ((a.getZ(i) + 1.5) / 3) * 0.575 + 0.025);
  a.needsUpdate = true;
  g.computeVertexNormals();
  const ramp = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  ramp.position.set(-11, 0, 2.8);
  ramp.userData.walkableGround = true;
  scene.add(ramp);
  for (const [z, y] of [
    [1.3, 0.025],
    [2.8, 0.3125],
    [4.3, 0.6],
  ])
    assert.ok(Math.abs(groundHeight(scene, -11, z) - y) < 1e-6);
});
test("seated path requests start at the declared approach rather than inside a bench", () => {
  const nav = new NavigationService("town"),
    seat = { x: 350, y: 375, seated: { approach: { x: 350, y: 415 } } };
  assert.equal(walkable("town", seat.x, seat.y), false);
  assert.ok(nav.findPath(seat, { x: 350, y: 500 })?.length);
});
