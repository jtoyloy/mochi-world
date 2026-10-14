// Original synthesized cues; no downloaded recordings. Audio starts only after a gesture.
const DEFAULT_VOLUME = 0.15;
const PREFERENCE_KEY = "mochi-audio";
const boundedVolume = value => typeof value === "number" && Number.isFinite(value)
  ? Math.max(0, Math.min(0.5, value)) : null;
export class WorldAudio {
  constructor(storage) {
    this.volume = this.lastVolume = DEFAULT_VOLUME;
    this.muted = false;
    this.preferenceError = null;
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
      if (!this.storage) throw new Error("Storage unavailable");
      const saved = this.storage.getItem(PREFERENCE_KEY);
      if (saved !== null) {
        const preferences = JSON.parse(saved);
        if (preferences?.version !== 1 || typeof preferences.muted !== "boolean"
          || boundedVolume(preferences.lastVolume) !== preferences.lastVolume
          || preferences.lastVolume <= 0) throw new Error("Invalid preferences");
        this.lastVolume = preferences.lastVolume;
        this.muted = preferences.muted;
        this.volume = this.muted ? 0 : this.lastVolume;
      } else {
        const legacy = this.storage.getItem("mochi-volume");
        if (legacy !== null) {
          if (!legacy.trim() || !Number.isFinite(Number(legacy))) throw new Error("Invalid preferences");
          this.volume = boundedVolume(Number(legacy));
          this.muted = this.volume === 0;
          if (!this.muted) this.lastVolume = this.volume;
        }
      }
    } catch {
      this.preferenceError = "Audio preferences could not be loaded. Sound controls still work for this session.";
    }
  }
  setVolume(v) {
    const volume = boundedVolume(v);
    if (volume === null) return false;
    if (volume > 0) this.lastVolume = volume;
    this.muted = volume === 0;
    this.volume = volume;
    this.savePreferences();
    return true;
  }
  setMuted(muted) {
    if (typeof muted !== "boolean") return false;
    this.muted = muted;
    this.volume = muted ? 0 : this.lastVolume;
    this.savePreferences();
    return true;
  }
  savePreferences() {
    if (this.ambientGain) this.ambientGain.gain.value = this.volume * 0.035;
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(PREFERENCE_KEY, JSON.stringify({ version: 1, muted: this.muted, lastVolume: this.lastVolume }));
      this.preferenceError = null;
    } catch {
      this.preferenceError = "Audio preferences could not be saved. Sound controls still work for this session.";
    }
  }
  setRoom(room) {
    this.room = room;
    if (room !== "town") {
      this.ambient?.stop();
      this.ambient = null;
      clearInterval(this.birds);
      this.birds = null;
    } else if (this.context) this.startAmbience();
  }
  startAmbience() {
    if (this.room !== "town" || this.ambient || !this.context) return;
    const ctx = this.context,
      buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * 0.03) / 1.03;
      data[i] = previous;
    }
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    gain.gain.value = this.volume * 0.035;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    this.ambient = source;
    this.ambientGain = gain;
    this.birds = setInterval(() => {
      if (this.volume && document.visibilityState === "visible")
        this.cue("bird");
    }, 19000);
  }
  dispose() {
    clearInterval(this.birds);
    this.ambient?.stop();
    this.context?.close();
  }
  cue(kind = "ui") {
    if (!this.volume) return;
    try {
      this.context ??= new AudioContext();
      this.context.resume();
      this.startAmbience();
      const o = this.context.createOscillator(),
        g = this.context.createGain();
      const notes = {
        hit: 180,
        "mob-hit": 110,
        spell: 520,
        "pet-hit": 330,
        "pet-special": 720,
        fishing: 980,
        woodcutting: 130,
        vendor: 620,
        victory: 880,
      };
      o.type = ["hit", "mob-hit", "woodcutting"].includes(kind)
        ? "triangle"
        : "sine";
      o.frequency.value =
        notes[kind] ??
        (kind === "bell"
          ? 880
          : kind === "bird"
            ? 1100
            : kind === "pet"
              ? 660
              : kind === "step"
                ? 150
                : 440);
      g.gain.setValueAtTime(this.volume * 0.15, this.context.currentTime);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.12,
      );
      o.connect(g);
      g.connect(this.context.destination);
      if (kind === "bird" || kind === "pet")
        o.frequency.exponentialRampToValueAtTime(
          kind === "bird" ? 1500 : 880,
          this.context.currentTime + 0.09,
        );
      o.start();
      o.stop(this.context.currentTime + 0.13);
    } catch {}
  }
}
