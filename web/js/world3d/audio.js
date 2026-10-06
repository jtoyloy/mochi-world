// Original synthesized cues; no downloaded recordings. Audio starts only after a gesture.
export class WorldAudio {
  constructor() {
    this.volume = Number(localStorage.getItem("mochi-volume") ?? 0.15);
  }
  setVolume(v) {
    this.volume = v;
    localStorage.setItem("mochi-volume", v);
    if (this.ambientGain) this.ambientGain.gain.value = v * 0.035;
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
