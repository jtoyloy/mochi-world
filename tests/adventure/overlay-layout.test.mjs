import test from "node:test";
import assert from "node:assert/strict";
import { overlayOffsets, observeOverlayLayout } from "../../web/js/game/overlay-layout.js";

test("wrapped phone panels reserve a gap above the preceding panel's full height", () => {
  for (const sizes of [{ dock: 84, emotes: 95, hud: 107 }, { dock: 128, emotes: 140, hud: 160 }]) {
    const result = overlayOffsets(sizes);
    assert.equal(result.emotes - (10 + sizes.dock), 8);
    assert.equal(result.hud - (result.emotes + sizes.emotes), 8);
    assert.equal(result.controls - (result.hud + sizes.hud), 8);
  }
});

test("actual panel resize updates phone offsets and desktop/teardown restore CSS defaults", () => {
  const values = new Map(), panels = [84, 95, 107].map(height => ({ height, getBoundingClientRect() { return { height: this.height }; } }));
  const selectors = [".world-dock", ".world-emotes", ".adventure-hud"];
  let resize, disconnected = false;
  const observed = [];
  const shell = { clientWidth: 375,
    querySelector: selector => panels[selectors.indexOf(selector)],
    style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) },
  };
  class Observer { constructor(callback) { resize = callback; } observe(panel) { observed.push(panel); } disconnect() { disconnected = true; } }
  const stop = observeOverlayLayout(shell, Observer);
  assert.deepEqual(observed, [shell, ...panels]);
  assert.equal(values.get("--world-hud-bottom"), "205px");
  assert.equal(values.get("--world-controls-bottom"), "320px");
  panels[1].height = 140; panels[2].height = 160; resize();
  assert.equal(values.get("--world-hud-bottom"), "250px");
  assert.equal(values.get("--world-controls-bottom"), "418px");
  shell.clientWidth = 1280; resize(); assert.equal(values.size, 0);
  shell.clientWidth = 320; resize(); assert.equal(values.size, 3);
  stop(); assert.equal(disconnected, true); assert.equal(values.size, 0);
});
