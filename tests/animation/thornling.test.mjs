import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { Texture, TextureSource } from "pixi.js";
import { ANIMATION_SETS, MOB_ACTION_SHEETS } from "../../web/js/isoworld/animation/registry.js";
import { loadActionAtlas, selectTexture, stateMirrored, validateActionAtlas } from "../../web/js/isoworld/animation/atlas.js";
import { auditPixels } from "../../web/js/isoworld/animation/pixel-audit.js";
import { WorldTextures } from "../../web/js/isoworld/animation/texture-lifecycle.js";

const root = "web/assets/isoworld/";
const metadata = JSON.parse(readFileSync(root + MOB_ACTION_SHEETS.thornling));
const set = { ...ANIMATION_SETS[2], id: "thornling", strideDistance: 90 };
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
