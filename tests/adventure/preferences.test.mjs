import test from "node:test";
import assert from "node:assert/strict";
import { GraphicsQualityPreference, QUALITY_KEY, readMotionPreference, saveMotionPreference } from "../../web/js/isoworld/preferences.js";
import { bindAudioControls } from "../../web/js/isoworld/audio-controls.js";
import { WorldAudio } from "../../web/js/world3d/audio.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function renderer() {
  const calls = [];
  const app = { renderer: { screen: { width: 768, height: 1024 }, resolution: 2,
    resize(width, height, resolution) { calls.push([width, height, resolution]); this.resolution = resolution; } },
    ticker: { maxFPS: 0 } };
  return { app, calls };
}

test("quality applies retained low power and restores Standard without replacing the renderer", () => {
  const saved = storage(), { app, calls } = renderer(), original = app.renderer;
  const preference = new GraphicsQualityPreference({ getStorage: () => saved, pixelRatio: () => 3 });
  assert.deepEqual(preference.profile(), { resolution: 2, maxFPS: 0 });
  assert.equal(preference.select("low", app), true);
  assert.deepEqual(calls, [[768, 1024, 1]]);
  assert.equal(app.ticker.maxFPS, 30);
  const restored = new GraphicsQualityPreference({ getStorage: () => saved, pixelRatio: () => 3 });
  assert.equal(restored.value, "low");
  restored.apply(app);
  assert.equal(calls.length, 1, "unchanged density does not resize again");
  restored.select("standard", app);
  assert.equal(app.renderer, original);
  assert.deepEqual(calls.at(-1), [768, 1024, 2]);
  assert.equal(app.ticker.maxFPS, 0);
  assert.match(restored.status(app), /Standard.*2× pixel density.*display refresh/);
});

test("invalid quality, blocked storage and invalid device density retain usable session controls", () => {
  const bad = storage({ [QUALITY_KEY]: "ultra" }), { app } = renderer();
  const invalid = new GraphicsQualityPreference({ getStorage: () => bad, pixelRatio: () => NaN });
  assert.equal(invalid.value, "standard");
  assert.match(invalid.notice, /invalid/);
  assert.equal(invalid.profile().resolution, 1);
  assert.equal(invalid.select("ultra", app), false);
  const denied = new GraphicsQualityPreference({ getStorage() { throw new Error("Denied"); }, pixelRatio: () => 2 });
  denied.select("low", app);
  assert.equal(app.ticker.maxFPS, 30);
  assert.match(denied.status(app), /Could not save quality.*session/);
});

test("motion override validates saved values and storage errors retain system/session fallback", () => {
  assert.deepEqual(readMotionPreference(() => storage()), { override: null, notice: "" });
  for (const value of [true, false]) {
    const saved = storage();
    assert.equal(saveMotionPreference(value, () => saved), "");
    assert.equal(readMotionPreference(() => saved).override, value);
  }
  assert.equal(readMotionPreference(() => storage({ "mochi-reduced-motion": "corrupt" })).override, null);
  const denied = () => { throw new Error("Denied"); };
  assert.match(readMotionPreference(denied).notice, /system setting/);
  assert.match(saveMotionPreference(true, denied), /works for this session/);
});

test("actual audio controls keep mute, volume and error announcements synchronized", () => {
  const audio = new WorldAudio(storage()), slider = {}, status = {};
  const mute = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  bindAudioControls({ audio, slider, mute, status });
  slider.value = "0.4"; slider.oninput();
  mute.onclick();
  assert.equal(slider.value, "0");
  assert.equal(mute.attributes["aria-pressed"], "true");
  assert.equal(mute.attributes["aria-label"], "Unmute sound");
  mute.onclick();
  assert.equal(slider.value, "0.4");
  assert.equal(mute.attributes["aria-pressed"], "false");
  audio.storage = { setItem() { throw new Error("Quota"); } };
  slider.value = "0.2"; slider.oninput();
  assert.equal(audio.volume, 0.2);
  assert.match(status.textContent, /could not be saved.*session/);
});
