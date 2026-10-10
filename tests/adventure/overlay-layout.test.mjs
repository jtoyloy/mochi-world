import test from "node:test";
import assert from "node:assert/strict";
import { overlayOffsets, observeOverlayLayout, compactOverlayViewport, bindOverlayDisclosure } from "../../web/js/game/overlay-layout.js";

test("wrapped phone panels reserve a gap above the preceding panel's full height", () => {
  for (const sizes of [{ dock: 84, emotes: 95, hud: 107 }, { dock: 128, emotes: 140, hud: 160 }]) {
    const result = overlayOffsets(sizes);
    assert.equal(result.emotes - (10 + sizes.dock), 8);
    assert.equal(result.hud - (result.emotes + sizes.emotes), 8);
    assert.equal(result.controls - (result.hud + sizes.hud), 8);
  }
});

test("disclosure preserves live action nodes and delayed close cannot steal them from a replacement", () => {
  const parent = { appends: 0, append(node) { this.appends++; node.parentNode = this; } };
  const content = [{ parentNode: parent }, { parentNode: parent }];
  const invoker = { setAttribute(key, value) { this[key] = value; } };
  const makeDialog = () => ({ append(...nodes) { for (const node of nodes) node.parentNode = this; },
    addEventListener(type, fn) { this.delayedClose = fn; }, close() { this.closed = true; } });
  let restorations = 0;
  const first = makeDialog();
  const disclosure = bindOverlayDisclosure({ dialog: first, invoker, content, restored: () => restorations++ });
  assert.equal(content[0].parentNode, first); assert.equal(invoker["aria-expanded"], "true");
  disclosure.close(); assert.equal(content[0].parentNode, parent); assert.equal(restorations, 1);
  const second = makeDialog();
  const replacement = bindOverlayDisclosure({ dialog: second, invoker, content, restored: () => restorations++ });
  first.delayedClose();
  assert.equal(content[0].parentNode, second); assert.equal(content[1].parentNode, second);
  assert.equal(invoker["aria-expanded"], "true"); assert.equal(restorations, 1);
  replacement.close(); second.delayedClose();
  assert.equal(content[0].parentNode, parent); assert.equal(restorations, 2); assert.equal(parent.appends, 4);
});

test("phone, short landscape and measured tablet collisions use compact controls while wide desktop stays unchanged", () => {
  const sizes = { hudWidth: 359, cameraWidth: 238, mapWidth: 150 };
  for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }, { width: 844, height: 390 }, { width: 768, height: 1024 }])
    assert.equal(compactOverlayViewport({ ...sizes, ...viewport }), true);
  assert.equal(compactOverlayViewport({ ...sizes, width: 1280, height: 800 }), false);
  assert.equal(compactOverlayViewport({ ...sizes, width: 900, height: 700 }), false);
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
