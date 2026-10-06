import { test } from "node:test";
import assert from "node:assert/strict";
import {
  project,
  unproject,
  depth,
  direction,
  beastArchetype,
  visualStep,
} from "../../web/js/isoworld/projection.js";
import {
  TOWN_BUILDINGS,
  TOWN_TREES,
  ISO_TOWN_BOUNDS,
} from "../../web/js/isoworld/layout.js";
import { TOWN_STALLS, TOWN_RESIDENTS } from "../../web/js/game/town.js";
import { NavigationService } from "../../web/js/game/NavigationService.js";
import {
  walkable,
  validSegment,
  companionStep,
} from "../../web/js/game/model.js";
test("isometric projection round trips positive, negative and boundary coordinates", () => {
  for (const p of [
    { x: 0, y: 0 },
    { x: -650, y: 1750 },
    { x: 2200, y: -650 },
    { x: 543.73, y: 788.61 },
  ]) {
    const q = unproject(project(p));
    assert.ok(Math.abs(p.x - q.x) < 1e-9);
    assert.ok(Math.abs(p.y - q.y) < 1e-9);
  }
});
test("foot depth and facing order foreground correctly, retaining idle direction", () => {
  assert.ok(depth({ x: 700, y: 600 }) > depth({ x: 500, y: 600 }));
  assert.equal(direction(20, 0), 0);
  assert.equal(direction(0, 20), 1);
  assert.equal(direction(-20, 0), 2);
  assert.equal(direction(0, -20), 3);
  assert.equal(direction(0, 0, 3), 3);
});
test("Town is larger and vendor footprints have gathering setbacks", () => {
  assert.ok(
    (ISO_TOWN_BOUNDS.maxX - ISO_TOWN_BOUNDS.minX) *
      (ISO_TOWN_BOUNDS.maxY - ISO_TOWN_BOUNDS.minY) >
      1800 * 800 * 4,
  );
  for (const a of TOWN_STALLS)
    for (const b of TOWN_STALLS)
      if (a !== b)
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 350, `${a.id}/${b.id}`);
  const nav = new NavigationService("town");
  for (const b of TOWN_BUILDINGS) {
    assert.equal(walkable("town", b.x, b.y), false);
    const goal = { x: b.x, y: b.y + 160 };
    assert.ok(walkable("town", goal.x, goal.y), b.id);
    const route = nav.findPath({ x: 550, y: 840 }, goal);
    assert.ok(route, b.id);
    let p = { x: 550, y: 840 };
    for (const q of route) {
      assert.ok(validSegment("town", p.x, p.y, q.x, q.y));
      p = q;
    }
  }
  for (const [x, y] of TOWN_TREES) assert.equal(walkable("town", x, y), false);
});
test("beast presentation respects explicit archetype and deterministic existing variants", () => {
  assert.equal(
    beastArchetype({ profile: { variant: "mint" } }),
    "woodland-deer",
  );
  assert.equal(beastArchetype({ profile: { variant: "lavender" } }), "moonfox");
  assert.equal(
    beastArchetype({
      profile: { beast: { archetype: "woodland-deer" }, variant: "lavender" },
    }),
    "woodland-deer",
  );
});
test("visual interpolation cannot overshoot or teleport after a long frame", () => {
  const p = { x: 0, y: 0 };
  assert.deepEqual(visualStep(p, { x: 1, y: 0 }, 0.1), { x: 1, y: 0 });
  assert.ok(visualStep(p, { x: 1000, y: 0 }, 100).x <= 20.5);
  assert.deepEqual(visualStep(p, p, 0.1), p);
});
test("beast follow uses room to separate silhouettes while retaining declared state ownership", () => {
  const owner = { x: 600, y: 600, moving: true };
  let pet = { x: 570, y: 620, state: "FOLLOWING" };
  for (let i = 0; i < 40; i++) pet = companionStep(pet, owner, 0.1, i * 100);
  const a = project(owner),
    b = project(pet);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 85);
  assert.ok(Math.hypot(pet.x - owner.x, pet.y - owner.y) > 95);
  assert.equal(pet.state, "FOLLOWING");
});

test("NPC interactions wait for actual destination arrival rather than stale stopped snapshots", async () => {
  const { interactionArrived } = await import("../../web/js/game/arrival.js");
  const goal = { x: 100, y: 390 };
  assert.equal(
    interactionArrived({ x: 550, y: 840, moving: false }, goal),
    false,
  );
  assert.equal(interactionArrived({ ...goal, moving: true }, goal), false);
  assert.equal(interactionArrived({ ...goal, moving: false }, goal), true);
  assert.equal(
    interactionArrived({ x: NaN, y: 390, moving: false }, goal),
    false,
  );
  assert.equal(interactionArrived({ ...goal, moving: false }, null), false);
});

test("room teardown releases fountain effects before a secondary room frame", async () => {
  const { IsometricWorld } = await import("../../web/js/isoworld/World.js");
  const { Container, Graphics } = await import("pixi.js");
  const world = new IsometricWorld(null, {}, {}, {});
  world.ground = new Container();
  world.objects = new Container();
  world.effects = new Container();
  world.ripple = new Graphics().circle(0, 0, 12).fill("white");
  world.objects.addChild(world.ripple);
  world.clearMap();
  assert.equal(world.ripple, null);
  assert.equal(world.objects.children.length, 0);
  assert.equal(world.actors.size, 0);
});
