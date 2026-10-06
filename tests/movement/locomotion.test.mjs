import { test } from "node:test";
import assert from "node:assert/strict";
import {
  traverse,
  advance,
  Gait,
  SnapshotBuffer,
  Prediction,
  facing8,
  spring,
} from "../../web/js/game/locomotion/core.js";
import { companionStep } from "../../web/js/game/model.js";
test("waypoint overshoot uses the full distance through multiple corners", () => {
  let p = { x: 0, y: 0 },
    path = [
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ];
  const r = traverse(p, path, 35);
  assert.deepEqual(p, { x: 25, y: 10 });
  assert.equal(r.moved, 35);
  assert.equal(path.length, 1);
});
test("movement and distance cadence agree at 30, 60 and 120 FPS", () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    let p = { x: 0, y: 0, speed: 0 },
      path = [{ x: 10000, y: 0 }],
      g = new Gait();
    for (let i = 0; i < hz * 5; i++) {
      let old = p.x;
      advance(p, path, 1 / hz);
      g.update(p.x - old, 0, 1 / hz);
    }
    results.push({ x: p.x, phase: g.phase });
  }
  assert.ok(
    Math.max(...results.map((r) => r.x)) -
      Math.min(...results.map((r) => r.x)) <
      0.01,
  );
  assert.ok(
    Math.max(...results.map((r) => r.phase)) -
      Math.min(...results.map((r) => r.phase)) <
      0.001,
  );
});
test("large suspended deltas are clamped", () => {
  let p = { x: 0, y: 0, speed: 180 };
  advance(p, [{ x: 1000, y: 0 }], 5);
  assert.equal(p.x, 18);
});
test("traversal stops at a forbidden segment", () => {
  let p = { x: 0, y: 0 };
  const path = [
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ];
  traverse(p, path, 30, (a, b) => b.x <= 10);
  assert.equal(p.x, 10);
  assert.equal(path.length, 1);
});
test("facing quantization has boundary hysteresis and eight directions", () => {
  assert.equal(facing8(1, 0.44, 0), 0);
  assert.equal(facing8(1, 0.8, 0), 1);
  assert.equal(facing8(0, 0, 6), 6);
  for (let i = 0; i < 8; i++)
    assert.equal(
      facing8(
        Math.cos((i * Math.PI) / 4),
        Math.sin((i * Math.PI) / 4),
        (i + 4) % 8,
      ),
      i,
    );
});
test("gait stops without resetting phase and emits alternating contact hooks", () => {
  const g = new Gait(100);
  g.update(25, 0, 0.1);
  g.update(25, 0, 0.1);
  assert.deepEqual(g.events, ["footstep_right"]);
  const phase = g.phase;
  g.update(0, 0, 0.1);
  assert.equal(g.state, "idle");
  assert.equal(g.phase, phase);
  g.update(0, 50, 0.2);
  assert.deepEqual(g.events, ["footstep_left"]);
  assert.equal(g.state, "walk");
});
test("snapshot interpolation is timestamp based and rejects unordered/duplicate inputs", () => {
  const b = new SnapshotBuffer(120);
  b.push({ t: 1000, x: 0, y: 0, moving: true });
  b.push({ t: 1100, x: 18, y: 0, moving: true });
  b.push({ t: 1050, x: 999, y: 0 });
  b.push({ t: 1100, x: 999, y: 0 });
  assert.equal(b.samples.length, 2);
  assert.equal(b.sample(1170).x, 9);
});
test("extrapolation is capped and cleanly stops on idle snapshots", () => {
  const b = new SnapshotBuffer(120);
  b.push({ t: 0, x: 0, y: 0, moving: true });
  b.push({ t: 100, x: 18, y: 0, moving: true });
  assert.ok(Math.abs(b.sample(1000).x - 39.6) < 1e-9);
  b.push({ t: 200, x: 36, y: 0, moving: false });
  assert.equal(b.sample(2000).x, 36);
});
test("prediction starts before a server ack and ignores stale sequences", () => {
  const p = new Prediction({ x: 0, y: 0 });
  p.start([{ x: 100, y: 0 }], 2);
  p.step(0.1);
  assert.equal(p.p.x, 3);
  p.reconcile({ x: 0, y: 0, moveSeq: 1, serverTime: 1000 }, 1100);
  assert.equal(p.p.x, 3);
});
test("small reconciliation preserves displayed position and relaxes smoothly", () => {
  const p = new Prediction({ x: 20, y: 0 });
  p.seq = 1;
  p.reconcile({ x: 18, y: 0, moveSeq: 1, serverTime: 1000, path: [] }, 1000);
  assert.equal(p.p.x + p.bias.x, 20);
  assert.ok(p.step(0.05).x < 20);
  assert.equal(p.snaps, 0);
});
test("large errors snap, invalid destinations stop and reordered snapshots do not rewind", () => {
  const p = new Prediction({ x: 500, y: 0 });
  p.seq = 1;
  p.reconcile({ x: 0, y: 0, moveSeq: 1, serverTime: 2000, path: [] }, 2000);
  assert.equal(p.snaps, 1);
  p.reconcile({ x: 999, y: 0, moveSeq: 1, serverTime: 1000 }, 2000);
  assert.equal(p.p.x, 0);
  p.start([{ x: 100, y: 0 }], 2);
  p.reject({ x: 0, y: 0, moveSeq: 2 });
  assert.equal(p.path.length, 0);
});
test("follow formation rotates, accelerates and catches up without teleports", () => {
  let p = { x: 0, y: 0 };
  const owner = {
    x: 150,
    y: 150,
    moving: true,
    speed: 180,
    rotation: Math.PI / 2,
  };
  let next = companionStep(p, owner, 0.1, 0);
  assert.ok(next.followSpeed <= 50);
  assert.ok(Math.hypot(next.x, next.y) <= 5.01);
  for (let i = 0; i < 100; i++) next = companionStep(next, owner, 0.1, i * 100);
  assert.ok(next.x < owner.x);
  assert.ok(Math.hypot(next.x - owner.x, next.y - owner.y) > 85);
});
test("spring follows visual target consistently across frame rates", () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const p = { x: 0, y: 0 },
      v = { x: 0, y: 0 };
    for (let i = 0; i < hz; i++) spring(p, v, { x: 100, y: 40 }, 1 / hz, 16);
    results.push(p.x);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 1e-6);
});

test("articulated gait has grounded stance, lifted passing foot and alternating contact", async () => {
  const { contactPose } = await import("../../web/js/game/locomotion/core.js");
  assert.deepEqual(contactPose(0), { along: 15, lift: 0 });
  assert.equal(contactPose(0.25).lift, 0);
  assert.equal(contactPose(0.5).along, -15);
  assert.ok(contactPose(0.75).lift > 11);
  assert.equal(contactPose(0.25 + 0.5).along, 0);
  assert.ok(contactPose(0.25 + 0.5).lift > 0);
});
test("arrival delay adapts to latency while extrapolation stays bounded", () => {
  const b = new SnapshotBuffer();
  b.push({ t: 0, x: 0, y: 0, moving: true }, 200);
  b.push({ t: 100, x: 18, y: 0, moving: true }, 300);
  assert.equal(b.delay, 300);
  assert.equal(b.sample(350).x, 9);
  assert.ok(b.sample(10000).x < 40);
});

test("published walk atlas preserves all frame rectangles and rejects invalid source/pivot metadata", async () => {
  const fs = await import("node:fs/promises");
  const { walkFramesFromAtlas } = await import(
    "../../web/js/isoworld/WalkFrames.js"
  );
  const { Texture } = await import("pixi.js");
  const m = JSON.parse(
    await fs.readFile(
      new URL("../../web/assets/isoworld/locomotion-v1.json", import.meta.url),
    ),
  );
  const png = await fs.readFile(
    new URL("../../web/assets/isoworld/walk-rig-v1.png", import.meta.url),
  );
  assert.equal(
    png.readUInt32BE(16),
    m.states.walk.columns * m.states.walk.cell[0],
  );
  assert.equal(
    png.readUInt32BE(20),
    m.states.walk.rows * m.states.walk.cell[1],
  );
  const base = Texture.EMPTY,
    texture = { width: 1280, height: 2880, source: base.source };
  const rig = walkFramesFromAtlas(Array(16).fill(base), texture, m);
  assert.equal(rig.rows.flatMap((d) => d.flatMap((d) => d.walk)).length, 128);
  for (const t of rig.rows.flatMap((d) => d.flatMap((d) => d.walk))) {
    assert.equal(t.frame.width, 160);
    assert.equal(t.frame.height, 180);
  }
  assert.throws(
    () =>
      walkFramesFromAtlas(Array(16).fill(base), { ...texture, width: 1279 }, m),
    /dimensions/,
  );
  const wrong = structuredClone(m);
  wrong.states.walk.anchor = [0.5, 2];
  assert.throws(
    () => walkFramesFromAtlas(Array(16).fill(base), texture, wrong),
    /pivot/,
  );
});

test("stationary authoritative seating does not count repeated hard snaps", () => {
  const p = new Prediction({ x: 10, y: 10 });
  for (let t = 1000; t < 2000; t += 100)
    p.reconcile(
      {
        x: 10,
        y: 10,
        moveSeq: 0,
        seated: { id: "bench" },
        serverTime: t,
        path: [],
      },
      t,
    );
  assert.equal(p.snaps, 0);
  assert.equal(p.p.x, 10);
});
