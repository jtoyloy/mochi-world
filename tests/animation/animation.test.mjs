import test from "node:test";
import assert from "node:assert/strict";
import {
  ANIMATION_SETS,
  AnimationPlayback,
  animationSet,
  directionIndex,
  frameFromPhase,
  validateSet,
} from "../../web/js/isoworld/animation/registry.js";
import { Gait } from "../../web/js/game/locomotion/core.js";
test("all current appearances validate and all 8 sectors map to art", () => {
  for (const s of ANIMATION_SETS) {
    validateSet(s);
    assert.equal(s.walkFrameCount, 8);
    assert.equal(s.idleFrameCount, 8);
    for (let i = 0; i < 8; i++)
      assert.ok(directionIndex(s, i) < s.directions.length);
  }
});
test("eight-direction replacement maps without aliasing", () => {
  const s = {
    ...ANIMATION_SETS[0],
    directions: ["SE", "S", "SW", "W", "NW", "N", "NE", "E"],
  };
  validateSet(s);
  for (let i = 0; i < 8; i++) assert.equal(directionIndex(s, i), i);
});
test("broken direction sets/pivots/source sizes fail", () => {
  for (const change of [
    { directions: ["SE"] },
    { footAnchor: { x: 1.4, y: 0 } },
    { cell: [0, 192] },
    { walkFrameCount: 0 },
  ])
    assert.throws(() => validateSet({ ...ANIMATION_SETS[0], ...change }));
});
test("phase frame boundaries wrap including negative phases", () => {
  assert.equal(frameFromPhase(0, 8), 0);
  assert.equal(frameFromPhase(0.5, 8), 4);
  assert.equal(frameFromPhase(1, 8), 0);
  assert.equal(frameFromPhase(-0.125, 8), 7);
});
test("fallback retains compatible human animation", () =>
  assert.equal(animationSet("missing-outfit").id, "chestnut-sage"));
test("turns preserve distance phase at half/full/150 percent speeds", () => {
  for (const speed of [90, 180, 270]) {
    const g = new Gait(105),
      p = new AnimationPlayback(ANIMATION_SETS[0]);
    p.update(g, 0, 0);
    g.update(speed * 0.1, 0, 0.1);
    p.update(g, speed, 0.1);
    const phase = p.phase;
    g.facing = 4;
    p.update(g, speed, 0);
    assert.equal(p.phase, phase);
    assert.ok(Math.abs(phase - (speed * 0.1) / 105) < 1e-9);
  }
});
test("stop settles then quiet idle breath/blink frames progress", () => {
  const g = new Gait(),
    p = new AnimationPlayback(ANIMATION_SETS[0]);
  p.update(g, 0, 0);
  g.update(30, 0, 0.1);
  p.update(g, 300, 0.1);
  const f = p.frame;
  p.update(g, 0, 0.05);
  assert.equal(p.state, "settle");
  assert.equal(p.frame, f);
  p.update(g, 0, 0.15);
  assert.equal(p.state, "idle");
  p.update(g, 0, 1);
  assert.ok(p.frame > 0);
});
test("remote numerical noise uses hysteresis and idle never consumes gait distance", () => {
  const g = new Gait(),
    p = new AnimationPlayback(ANIMATION_SETS[0]);
  p.update(g, 2, 0.1);
  assert.equal(p.state, "idle");
  g.update(1, 0, 0.1);
  p.update(g, 10, 0.1);
  assert.equal(p.state, "walk");
  p.update(g, 2, 0.1);
  assert.equal(p.state, "walk");
  p.update(g, 0.5, 0.2);
  assert.equal(p.state, "idle");
});
test("fox and deer have distinct stride, catch-up and idle profiles", () => {
  assert.notEqual(
    ANIMATION_SETS[2].strideDistance,
    ANIMATION_SETS[3].strideDistance,
  );
  assert.notEqual(ANIMATION_SETS[2].idleSeconds, ANIMATION_SETS[3].idleSeconds);
  const g = new Gait(),
    p = new AnimationPlayback(ANIMATION_SETS[2]);
  p.update(g, 210, 0.1);
  assert.equal(p.state, "trot");
  p.update(g, 180, 0.1);
  assert.equal(p.state, "trot");
  p.update(g, 160, 0.1);
  assert.equal(p.state, "walk");
});
test("registered full-body and gesture atlases preserve original rectangles, trim and foot pivots", async () => {
  const fs = await import("node:fs");
  const { PNG } = await import("pngjs");
  const { validateAtlas, loadAnimationAtlas } =
    await import("../../web/js/isoworld/animation/atlas.js");
  const { Texture, TextureSource } = await import("pixi.js");
  for (let i = 0; i < ANIMATION_SETS.length; i++) {
    const set = ANIMATION_SETS[i],
      files = [
        set.texture.replace(".png", ".json"),
        ...(i < 2 ? [`human-${i ? "coral" : "sage"}-gesture-v2.json`] : []),
      ];
    for (const file of files) {
      const m = JSON.parse(fs.readFileSync("web/assets/isoworld/" + file));
      validateAtlas(m, set);
      const p = PNG.sync.read(
        fs.readFileSync("web/assets/isoworld/" + m.image),
      );
      assert.deepEqual(m.size, [p.width, p.height]);
      const source = new TextureSource({ width: p.width, height: p.height }),
        a = loadAnimationAtlas(new Texture({ source }), set, m);
      assert.equal(a.rows.length, 4);
      assert.equal(a.rows[0].walk.length, 8);
      assert.equal(a.rows[0].idle.length, 8);
      assert.equal(a.rows[0].walk[0].orig.width, 224);
      assert.ok(a.rows[0].walk[0].trim);
      assert.throws(() =>
        validateAtlas({ ...m, frames: m.frames.slice(1) }, set),
      );
      source.destroy();
    }
  }
});

test("both beast profiles animate controller-produced follow, turns, catch-up, stop and resume", async () => {
  const { CompanionFollowController } =
    await import("../../web/js/game/CompanionFollowController.js");
  for (const set of ANIMATION_SETS.slice(2)) {
    const controller = new CompanionFollowController(),
      g = new Gait(set.strideDistance),
      p = new AnimationPlayback(set);
    let pet = { x: 400, y: 440, state: "FOLLOWING" },
      owner = {
        x: 530,
        y: 470,
        rotation: Math.PI / 2,
        moving: true,
        speed: 180,
      },
      walks = 0,
      idles = 0,
      turns = new Set();
    const step = (dt, now) => {
      const next = controller.step(pet, owner, "yard", dt, now);
      const speed = g.update(next.x - pet.x, next.y - pet.y, dt);
      p.update(g, speed, dt);
      pet = next;
      if (["walk", "trot"].includes(p.state)) {
        walks++;
        turns.add(g.facing);
      }
      if (p.state === "idle") idles++;
      assert.ok(Number.isFinite(p.phase) && p.phase >= 0 && p.phase < 1);
    };
    for (let i = 0; i < 60; i++) {
      owner.x += 1.6;
      step(0.02, i * 20);
    }
    owner.rotation = 0;
    for (let i = 60; i < 120; i++) {
      owner.y += 1.6;
      step(0.02, i * 20);
    }
    owner.moving = false;
    owner.speed = 0;
    for (let i = 120; i < 800; i++) step(0.02, i * 20);
    assert.ok(walks > 50, `${set.id} follows with a gait`);
    assert.ok(turns.size > 1, `${set.id} turns`);
    assert.ok(idles > 20, `${set.id} settles and idles`);
    const before = g.distance;
    owner.x += 260;
    owner.moving = true;
    owner.rotation = Math.PI / 2;
    owner.speed = 180;
    for (let i = 800; i < 1000; i++) step(0.02, i * 20);
    assert.ok(g.distance > before + 100, `${set.id} resumes and catches up`);
  }
});
