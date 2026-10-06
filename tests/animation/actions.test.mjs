import test from "node:test";
import assert from "node:assert/strict";
import {
  AnimationPlayback,
  ANIMATION_SETS,
  ACTION_STATES,
} from "../../web/js/isoworld/animation/registry.js";
import { animationCommands } from "../../web/js/isoworld/animation/events.js";
import { Gait } from "../../web/js/game/locomotion/core.js";

test("action override preserves distance phase and accepts later authoritative actions immediately", () => {
  const p = new AnimationPlayback(ANIMATION_SETS[0]),
    g = new Gait(105);
  p.update(g, 0, 0);
  g.update(30, 0, 0.1);
  p.update(g, 300, 0.1);
  p.play("sword");
  g.update(21, 0, 0.1);
  p.update(g, 210, 0.1);
  assert.equal(p.state, "sword");
  assert.ok(Math.abs(p.phase - 51 / 105) < 1e-9);
  p.play("hurt");
  p.update(g, 0, 0.05);
  assert.equal(p.state, "hurt");
  p.play("bow");
  p.update(g, 0, 0.05);
  assert.equal(p.state, "bow");
  p.update(g, 0, 1);
  assert.equal(p.state, "idle");
  const phase = p.phase;
  g.update(10, 0, 0.1);
  p.update(g, 100, 0.1);
  assert.ok(Math.abs(p.phase - ((phase + 10 / 105) % 1)) < 1e-9);
});
test("fish waits for outcome; movement cancels gathering presentation; defeat holds", () => {
  const p = new AnimationPlayback(ANIMATION_SETS[0]),
    g = new Gait();
  p.play("fish-cast");
  p.update(g, 0, 1);
  assert.equal(p.state, "fish-wait");
  p.update(g, 0, 10);
  assert.equal(p.state, "fish-wait");
  p.play("fish-catch");
  p.update(g, 0, 1);
  assert.equal(p.state, "idle");
  p.play("chop");
  g.update(10, 0, 0.1);
  p.update(g, 100, 0.1);
  assert.equal(p.state, "walk");
  p.play("defeat");
  p.update(g, 0, 2);
  assert.equal(p.state, "defeat");
  assert.equal(p.frame, 7);
  p.clearAction();
  p.update(g, 0, 0.1);
  assert.equal(p.state, "idle");
});
test("all declared actions stay within frame range and cannot mutate ground/head anchors", () => {
  for (const set of ANIMATION_SETS)
    for (const state of Object.keys(ACTION_STATES)) {
      const before = JSON.stringify([set.footAnchor, set.headAnchor]),
        p = new AnimationPlayback(set),
        g = new Gait();
      p.play(state);
      for (let i = 0; i < 100; i++) {
        p.update(g, 0, 0.02);
        assert.ok(p.frame >= 0 && p.frame < 8);
      }
      assert.equal(JSON.stringify([set.footAnchor, set.headAnchor]), before);
    }
});
test("server adapter separates aggressor and hit recipient, including pet and poison", () => {
  assert.deepEqual(
    animationCommands({
      kind: "mob-hit",
      userId: "u",
      targetId: "m",
      pet: true,
    }),
    [
      { actor: "m", state: "attack" },
      { actor: "pet", state: "hurt" },
    ],
  );
  assert.deepEqual(
    animationCommands({ kind: "mob-hit", userId: "u", poison: true }),
    [{ actor: "player:u", state: "hurt" }],
  );
  assert.equal(
    animationCommands({
      kind: "hit",
      userId: "u",
      targetId: "m",
      weaponType: "dagger",
    })[0].state,
    "dagger",
  );
  assert.equal(
    animationCommands({
      kind: "defend",
      userId: "u",
      pet: true,
      owner: true,
    })[0].state,
    "defend-owner",
  );
  assert.deepEqual(animationCommands({ kind: "unknown" }), []);
});

test("registered actions reject missing states/frame slots/pivot drift and preserve ground on transition", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { validateActionAtlas, loadActionAtlas, selectTexture } =
    await import("../../web/js/isoworld/animation/atlas.js");
  const { Texture, TextureSource } = await import("pixi.js");
  for (const file of readdirSync("web/assets/isoworld").filter((f) =>
    /-(actions|reactions)-v1\.json$/.test(f),
  )) {
    const m = JSON.parse(readFileSync("web/assets/isoworld/" + file)),
      id = file.replace(/-(actions|reactions)-v1\.json$/, "");
    const set = ANIMATION_SETS.find((s) => s.id === id) ?? {
      ...ANIMATION_SETS[2],
      id,
    };
    validateActionAtlas(m, set);
    const bad = structuredClone(m);
    bad.frames[0].pivot.y += 0.01;
    assert.throws(() => validateActionAtlas(bad, set));
    const missing = structuredClone(m);
    delete missing.states[missing.requiredStates[0]];
    assert.throws(() => validateActionAtlas(missing, set));
    const gap = structuredClone(m);
    gap.states[Object.keys(gap.states)[0]][0].pop();
    assert.throws(() => validateActionAtlas(gap, set));
    const source = new TextureSource({ width: m.size[0], height: m.size[1] });
    const base = {
      metadata: { heights: { walk: m.height, idle: m.height } },
      rows: set.directions.map(() => ({
        idle: [Texture.EMPTY],
        walk: [Texture.EMPTY],
      })),
    };
    const art = loadActionAtlas(new Texture({ source }), set, m, base);
    for (const state of Object.keys(m.states))
      for (let d = 0; d < 4; d++)
        for (let frame = 0; frame < 8; frame++) {
          const t = selectTexture(art, { state, frame }, d),
            ground =
              ((t.trim.y + t.trim.height - t.orig.height * set.footAnchor.y) *
                set.height) /
              m.height;
          assert.ok(
            Math.abs(ground) < 1e-8,
            `${id}/${state} ground registration`,
          );
        }
    assert.equal(
      selectTexture(art, { state: "missing", frame: 7 }, 0),
      art.rows[0].idle.at(-1),
    );
    source.destroy();
  }
});

test("victory survives trailing hit/stale snapshot; confirmed respawn restores mob presentation", async () => {
  const { IsometricWorld } = await import("../../web/js/isoworld/World.js");
  const { Texture } = await import("pixi.js");
  const point = { set() {} };
  const graphics = {
    position: point,
    clear() {
      return this;
    },
    roundRect() {
      return this;
    },
    fill() {
      return this;
    },
  };
  const m = { id: "m", type: "slime", x: 20, y: 20, hp: 20, maxHp: 20 };
  const scene = {
    adventure: { roomId: "forest", mobs: [m] },
    data: new Map(),
    combatEffects: [
      { seq: 1, kind: "victory", userId: "u", targetId: "m" },
      { seq: 2, kind: "hit", userId: "u", targetId: "m" },
    ],
  };
  const w = new IsometricWorld(
    { clientWidth: 1280, clientHeight: 900 },
    { selfId: "u" },
    {},
    scene,
  );
  w.room = "forest";
  w.root = { toGlobal: (q) => q };
  w.effects = { addChild() {} };
  const set = ANIMATION_SETS[2];
  const e = {
    m,
    p: { x: 20, y: 20 },
    height: 80,
    sourceHeight: 1,
    bar: graphics,
    shadow: { position: point },
    label: {},
    g: { position: point, scale: point, anchor: point },
    gait: new Gait(),
    playback: new AnimationPlayback(set),
    art: {
      set,
      metadata: { heights: { idle: 1 }, mirrors: [false, false, false, false] },
      rows: Array.from({ length: 4 }, () => ({
        walk: [Texture.EMPTY],
        idle: [Texture.EMPTY],
      })),
    },
  };
  w.mobEntities.set("m", e);
  const player = {
    type: "player",
    p: { x: 0, y: 0 },
    gait: new Gait(),
    playback: new AnimationPlayback(ANIMATION_SETS[0]),
  };
  w.actors.set("player:u", player);
  w.frameAdventure(0.016);
  assert.equal(e.playback.action.state, "defeat");
  assert.equal(e.g.eventMode, "none");
  assert.equal(player.playback.action.state, "sword");
  w.syncAdventure();
  assert.equal(
    e.playback.action.state,
    "defeat",
    "stale living snapshot cannot override accepted victory",
  );
  scene.adventure.mobs = [{ ...m, hp: 0 }];
  w.syncAdventure();
  assert.ok(e.defeatUntil);
  scene.adventure.mobs = [{ ...m, hp: 20 }];
  w.syncAdventure();
  assert.equal(e.playback.action, null);
  assert.equal(e.g.eventMode, "static");
  for (const fx of w.effectPool) fx.g.destroy();
});

test('cleanup sheets preserve per-state direction mirrors across merged action layers', async () => {
  const { readFileSync } = await import('node:fs');
  const { PNG } = await import('pngjs');
  const { auditPixels } = await import('../../web/js/isoworld/animation/pixel-audit.js');
  const { validateActionAtlas, loadActionAtlas, stateMirrored } = await import('../../web/js/isoworld/animation/atlas.js');
  const { Texture, TextureSource } = await import('pixi.js');
  for (const [id, set] of [['chestnut-sage-fishing-v2', ANIMATION_SETS[0]], ['dark-curls-coral-fishing-v2', ANIMATION_SETS[1]], ['chestnut-sage-combat-v2', ANIMATION_SETS[0]], ['dark-curls-coral-combat-v2', ANIMATION_SETS[1]], ['woodland-deer-cleanup-v2', ANIMATION_SETS[3]]]) {
    const m = JSON.parse(readFileSync(`web/assets/isoworld/${id}.json`));
    validateActionAtlas(m, set);
    assert.throws(() => validateActionAtlas({...m,mirrors:[]}, set), /directional mirror/);
    const p = PNG.sync.read(readFileSync('web/assets/isoworld/' + m.image));
    assert.deepEqual(auditPixels(p, m), [], 'complete padded silhouettes');
    assert.deepEqual(auditPixels(p, {...m,states:undefined}), [], 'all export cells contain valid art');
    const base = { rows: set.directions.map(() => ({idle:[Texture.EMPTY]})), metadata: {heights:{idle:100}, mirrors:[false,false,false,false], stateMirrors:{sword:[false,true,true,false]}} };
    const source = new TextureSource({width:p.width,height:p.height});
    const art = loadActionAtlas(new Texture({source}), set, m, base);
    assert.equal(stateMirrored(art, 'sword', 1), !id.includes('combat'));
    assert.equal(stateMirrored(art, 'idle', 1), false, 'fallback keeps locomotion facing');
    if (id.includes('fishing')) {
      assert.equal(new Set(m.states['fish-cast'].map(row => row.join(','))).size, 4);
      for (let d=0;d<4;d++) assert.equal(stateMirrored(art, 'fish', d), false);
    } else assert.equal(stateMirrored(art, 'attack', 1), !id.includes('combat'));
    source.destroy();
  }
});
