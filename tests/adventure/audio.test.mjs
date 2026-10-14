import test from "node:test";
import assert from "node:assert/strict";
import { WorldAudio } from "../../web/js/world3d/audio.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("explicit mute retains the positive level across reload and unmute", () => {
  const preferences = storage(), audio = new WorldAudio(preferences);
  audio.setVolume(0.4);
  audio.setMuted(true);
  assert.equal(audio.volume, 0);
  assert.equal(audio.lastVolume, 0.4);
  const restored = new WorldAudio(preferences);
  assert.equal(restored.muted, true);
  assert.equal(restored.lastVolume, 0.4);
  restored.setMuted(false);
  assert.equal(restored.volume, 0.4);
  assert.equal(new WorldAudio(preferences).volume, 0.4);
});

test("legacy zero mute and slider zero preserve a usable unmute level", () => {
  const audio = new WorldAudio(storage({ "mochi-volume": "0" }));
  assert.equal(audio.muted, true);
  audio.setMuted(false);
  assert.equal(audio.volume, 0.15);
  audio.setVolume(0.4);
  audio.setVolume(0);
  audio.setMuted(false);
  assert.equal(audio.volume, 0.4);
});

test("finite volume is bounded and invalid inputs cannot poison audio gains", () => {
  const audio = new WorldAudio(storage());
  audio.ambientGain = { gain: { value: 0 } };
  audio.setVolume(5);
  assert.equal(audio.volume, 0.5);
  for (const value of [NaN, Infinity, -Infinity, undefined, null, "0.5"]) {
    assert.equal(audio.setVolume(value), false);
    assert.equal(audio.volume, 0.5);
    assert.equal(audio.ambientGain.gain.value, 0.5 * 0.035);
  }
  audio.setVolume(-1);
  assert.equal(audio.volume, 0);
  assert.equal(audio.lastVolume, 0.5);
});

test("malformed stored preferences safely default and report the load error", () => {
  for (const value of ["broken", "null", '{"version":1,"muted":true,"lastVolume":0}', '{"version":1,"muted":false,"lastVolume":2}']) {
    const audio = new WorldAudio(storage({ "mochi-audio": value }));
    assert.equal(audio.volume, 0.15);
    assert.equal(audio.muted, false);
    assert.match(audio.preferenceError, /could not be loaded/);
    audio.setVolume(0.5);
    assert.equal(audio.preferenceError, null);
  }
  const legacy = new WorldAudio(storage({ "mochi-volume": "NaN" }));
  assert.equal(legacy.volume, 0.15);
  assert.ok(legacy.preferenceError);
});

test("blocked storage keeps session mute and ambient gain usable without throwing", () => {
  const audio = new WorldAudio({ getItem() { throw new Error("Denied"); }, setItem() { throw new Error("Quota"); } });
  assert.ok(audio.preferenceError);
  audio.ambientGain = { gain: { value: 0 } };
  assert.equal(audio.setVolume(0.4), true);
  assert.equal(audio.ambientGain.gain.value, 0.4 * 0.035);
  assert.match(audio.preferenceError, /could not be saved/);
  audio.setMuted(true);
  assert.equal(audio.ambientGain.gain.value, 0);
  audio.setMuted(false);
  assert.equal(audio.volume, 0.4);
  assert.equal(audio.ambientGain.gain.value, 0.4 * 0.035);
});

test("blocked localStorage property access cannot break construction", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Denied"); } });
  try {
    const audio = new WorldAudio();
    assert.ok(audio.preferenceError);
    audio.setMuted(true);
    audio.setMuted(false);
    assert.equal(audio.volume, 0.15);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
