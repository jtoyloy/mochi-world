import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Texture, TextureSource } from "pixi.js";
import { validateFoliage, loadFoliage } from "../../web/js/isoworld/animation/foliage.js";
const metadata = JSON.parse(readFileSync("web/assets/isoworld/foliage-v2.json"));
test("foliage uses explicit separated crops and shares one immutable source", () => {
  const source = new TextureSource({width:1774,height:887}), sheet = new Texture({source});
  const art = loadFoliage(sheet, metadata);
  assert.equal(art.ownedTextures.length, 2);
  assert(art.ownedTextures.every(frame => frame.source === source));
  for (const frame of art.ownedTextures) frame.destroy(false);
  assert.equal(source.destroyed, false);
  sheet.destroy(true);
});
test("foliage rejects source overflow, overlapping registrations and pivot drift", () => {
  for (const change of [m=>m.frames[0].region.w=1000,m=>m.frames[1].frame.x=0,m=>m.frames[0].pivot.y=.5]) {
    const malformed = structuredClone(metadata); change(malformed);
    assert.throws(() => validateFoliage(malformed,1774,887));
  }
});
