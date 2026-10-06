import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NavigationService,
  toWorld,
  fromWorld,
  smoothAngle,
} from "../../web/js/game/NavigationService.js";
import { CompanionFollowController } from "../../web/js/game/CompanionFollowController.js";
import { validSegment, walkable } from "../../web/js/game/model.js";
import { readFile } from "node:fs/promises";
test("shared pathfinding routes around fountain with entirely valid segments", () => {
  const nav = new NavigationService("town"),
    start = { x: 350, y: 430 },
    end = { x: 850, y: 430 };
  assert.equal(validSegment("town", start.x, start.y, end.x, end.y), false);
  const path = nav.findPath(start, end);
  assert.ok(path.length > 1);
  let previous = start;
  for (const point of path) {
    assert.ok(validSegment("town", previous.x, previous.y, point.x, point.y));
    previous = point;
  }
  assert.deepEqual(path.at(-1), end);
});
test("navigation rejects invalid inputs and snaps blocked destinations onto walkable floor", () => {
  const nav = new NavigationService("town");
  assert.equal(nav.findPath({ x: 550, y: 590 }, { x: NaN, y: 400 }), null);
  const p = nav.nearestWalkable({ x: 600, y: 430 });
  assert.ok(walkable("town", p.x, p.y));
  assert.equal(nav.findPath({ x: 0, y: 0 }, p), null);
});
test("coordinate conversion preserves logical authoritative position and rotation wraps shortest way", () => {
  const p = { x: 890, y: 570 },
    w = toWorld(p);
  assert.deepEqual(fromWorld({ x: w[0], z: w[2] }), p);
  assert.ok(smoothAngle(3.1, -3.1, 0.1) > 3.1);
});
test("companion return routes around obstacles without crossing the fountain", () => {
  const control = new CompanionFollowController();
  let pet = { x: 380, y: 430, state: "FOLLOWING" },
    owner = { x: 800, y: 430, moving: false };
  for (let i = 0; i < 70; i++) {
    const next = control.step(pet, owner, "town", 0.1, i * 100);
    assert.ok(validSegment("town", pet.x, pet.y, next.x, next.y));
    pet = next;
  }
  assert.ok(Math.hypot(pet.x - owner.x, pet.y - owner.y) < 110);
});
test("original model assets contain independent skins, named sockets and animation clips", async () => {
  for (const kind of ["penguin", "mochi"]) {
    const bytes = await readFile("web/assets/models/" + kind + ".glb");
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    const n = bytes.readUInt32LE(12),
      json = JSON.parse(bytes.subarray(20, 20 + n).toString());
    assert.ok(json.skins.length);
    assert.ok(json.nodes.some((n) => n.name === "head_socket"));
    assert.ok(json.animations.some((a) => a.name === "idle"));
    assert.ok(json.animations.length >= 8);
  }
});
test("Café table footprints are obstacles and routes go around them", () => {
  const nav = new NavigationService("cafe");
  assert.equal(nav.isWalkable({ x: 300, y: 550 }), false);
  const start = { x: 200, y: 550 },
    end = { x: 450, y: 550 },
    path = nav.findPath(start, end);
  assert.ok(path.length > 1);
  let p = start;
  for (const q of path) {
    assert.ok(validSegment("cafe", p.x, p.y, q.x, q.y));
    p = q;
  }
});
