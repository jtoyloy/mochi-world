import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { Texture, TextureSource } from "pixi.js";
import { AnimationPlayback, MOB_ACTION_SHEETS, mobAnimationSet } from "../../web/js/isoworld/animation/registry.js";
import { loadActionAtlas, selectTexture, stateMirrored, validateActionAtlas } from "../../web/js/isoworld/animation/atlas.js";
import { auditPixels } from "../../web/js/isoworld/animation/pixel-audit.js";
import { WorldTextures } from "../../web/js/isoworld/animation/texture-lifecycle.js";

const root = "web/assets/isoworld/";
const metadata = JSON.parse(readFileSync(root + MOB_ACTION_SHEETS.thornling));
const set = mobAnimationSet("thornling", metadata);
const base = () => ({ rows: set.directions.map(() => ({})), metadata: { heights: { idle: metadata.height, walk: metadata.height } } });

test("optional Thornling registration contains all five painted states and rejects clipped padded frames", () => {
  const manifest = JSON.parse(readFileSync(root + "manifest.json"));
  assert.equal(manifest.atlases[metadata.image].metadata, MOB_ACTION_SHEETS.thornling);
  assert.equal(manifest.atlases[metadata.image].classification, "USABLE_PROVISIONAL");
  assert.equal(metadata.frames.length, 40);
  validateActionAtlas(metadata, set);
  const png = PNG.sync.read(readFileSync(root + metadata.image));
  assert.deepEqual(auditPixels(png, metadata), []);
  const clipped = structuredClone(metadata);
  const frame = clipped.frames[0].frame;
  // Simulate an opaque limb reaching its registered boundary.
  png.data[(frame.y * png.width + frame.x) * 4 + 3] = 255;
  png.data[(frame.y * png.width + frame.x + 1) * 4 + 3] = 255;
  png.data[(frame.y * png.width + frame.x + 2) * 4 + 3] = 255;
  assert.throws(() => auditPixels(png, clipped), /Clipped padded cell/);
});

test("Thornling Pixi frame selections and repeated World teardown retain the shared sheet", () => {
  const source = new TextureSource({ width: metadata.size[0], height: metadata.size[1] });
  const sheet = new Texture({ source });
  const baseline = source.listenerCount("resize");
  for (let mount = 0; mount < 3; mount++) {
    const owner = new WorldTextures();
    owner.shared(sheet);
    const art = owner.atlas(loadActionAtlas(sheet, set, metadata, base()));
    assert.equal(art.ownedTextures.length, 40);
    assert.equal(new Set(art.ownedTextures).size, 40);
    for (const state of metadata.requiredStates) for (let direction = 0; direction < 4; direction++) for (let frame = 0; frame < 8; frame++) {
      const texture = selectTexture(art, { state, frame }, direction);
      assert.equal(texture, art.ownedTextures[metadata.states[state][direction][frame]]);
      assert.equal(texture.source, source);
      assert.equal(stateMirrored(art, state, direction), metadata.mirrors[direction]);
    }
    owner.destroy();
    assert.equal(source.destroyed, false);
    assert.equal(sheet.destroyed, false);
    assert.equal(source.listenerCount("resize"), baseline);
    assert.ok(art.ownedTextures.every(texture => texture.destroyed));
  }
  sheet.destroy(true);
});

test("reviewed lying contacts meet the ground without changing scale or walking registration", () => {
  const png = PNG.sync.read(readFileSync(root + metadata.image));
  for (const index of metadata.states.defeat[0]) {
    const f = metadata.frames[index];
    let bottom = -1;
    for (let y = f.frame.y; y < f.frame.y + f.frame.h; y++) for (let x = f.frame.x; x < f.frame.x + f.frame.w; x++)
      if (png.data[(y * png.width + x) * 4 + 3] >= 96) bottom = Math.max(bottom, y);
    const logicalContact = f.spriteSourceSize.y + bottom - f.frame.y;
    assert.ok(Math.abs(logicalContact - 224 * .88) < 1, `defeat pose ${index} contact`);
    assert.deepEqual(f.sourceSize, { w: 224, h: 224 });
    assert.deepEqual(f.pivot, { x: .5, y: .88 });
  }
  assert.ok(metadata.sourceAudit.groundBaselines[1].every(y => y === 401), "failed walk planting was not relabeled through per-frame recentering");
  assert.equal(metadata.height, 174);
});

test("weighted idle retains every drawing with brief closed-eye holds and validated contact metadata", () => {
  const durations = set.idleFrameDurations;
  assert.ok(Math.abs(set.idleSeconds - 4.8) < 1e-8);
  assert.ok(Math.abs(durations[2] + durations[5] + durations[6] - .24) < 1e-8);
  let elapsed = 0;
  for (let frame = 0; frame < 8; frame++) {
    const playback = new AnimationPlayback(set);
    playback.update({ distance: 0 }, 0, elapsed + durations[frame] / 2);
    assert.equal(playback.frame, frame);
    elapsed += durations[frame];
  }
  const playback = new AnimationPlayback(set);
  playback.update({ distance: 0 }, 0, elapsed + .01);
  assert.equal(playback.frame, 0, "weighted loop wraps");
  assert.equal(mobAnimationSet("boar").idleFrameDurations, undefined, "simpler profile remains control");
  assert.equal(metadata.contactFrames.attack, 4);
  for (const durations of [[], [1], Array(8).fill(0), Array(8).fill(NaN)])
    assert.throws(() => mobAnimationSet("thornling", { idleFrameDurations: durations }), /Invalid idle frame durations/);
  const badContact = structuredClone(metadata);
  badContact.contactFrames.attack = 8;
  assert.throws(() => validateActionAtlas(badContact, set), /Invalid painted contact frame/);
});
