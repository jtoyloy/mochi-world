import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldTextures } from "../../web/js/isoworld/animation/texture-lifecycle.js";

const source = () => ({ destroyed: false, destroys: 0, destroy() { this.destroyed = true; this.destroys++; } });
const texture = (s = source()) => ({ source: s, destroys: 0, destroy(destroySource) { this.destroys++; if (destroySource) s.destroy(); } });
test("two Worlds release owned frame views while cached shared sheets survive remount", () => {
  const sheet = texture(), first = new WorldTextures(), second = new WorldTextures();
  first.shared(sheet); second.shared(sheet);
  const a = texture(sheet.source), b = texture(sheet.source);
  first.atlas({ ownedTextures: [a, a] }); second.atlas({ ownedTextures: [b] });
  const canvas = texture(), canvasFrame = texture(canvas.source);
  first.own(canvas, true); first.own(canvasFrame);
  first.destroy(); first.destroy();
  assert.equal(a.destroys, 1);
  assert.equal(b.destroys, 0);
  assert.equal(sheet.destroys, 0);
  assert.equal(sheet.source.destroyed, false);
  assert.equal(canvasFrame.destroys, 1);
  assert.equal(canvas.source.destroys, 1);
  assert.equal(first.textures.length, 0);
  second.destroy();
  assert.equal(b.destroys, 1);
  assert.equal(sheet.source.destroyed, false);
});
test("late optional frame allocations after unmount release immediately", () => {
  const owned = new WorldTextures(); owned.destroy();
  const sheet = texture(), frame = texture(sheet.source), canvas = texture();
  owned.shared(sheet); owned.atlas({ownedTextures:[frame]}); owned.own(canvas, true);
  assert.equal(frame.destroys, 1);
  assert.equal(sheet.source.destroys, 0);
  assert.equal(canvas.source.destroys, 1);
  assert.equal(owned.textures.length, 0);
  assert.equal(owned.sources.size, 0);
});
test("real Pixi frame views detach source listeners without destroying cached sources", async () => {
  const { Texture, TextureSource } = await import("pixi.js");
  const sharedSource = new TextureSource({width:224,height:224});
  const sheet = new Texture({source:sharedSource});
  const baseline = sharedSource.listenerCount("resize");
  for (let mount=0; mount<3; mount++) {
    const owned = new WorldTextures();
    owned.shared(sheet);
    const frame = new Texture({source:sharedSource});
    owned.own(frame);
    assert.equal(sharedSource.listenerCount("resize"), baseline + 1);
    owned.destroy();
    assert.equal(frame.destroyed, true);
    assert.equal(sheet.destroyed, false);
    assert.equal(sharedSource.destroyed, false);
    assert.equal(sharedSource.listenerCount("resize"), baseline);
  }
  sheet.destroy(true);
});
