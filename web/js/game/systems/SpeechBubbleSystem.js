import { plainText } from "../model.js";
export class SpeechBubbleSystem {
  constructor(scene) {
    this.scene = scene;
    this.entries = new Map();
  }
  say(id, anchor, text) {
    const message = plainText(text, 220);
    if (!message || !anchor) return;
    const existing = this.entries.get(id);
    if (existing) {
      if (existing.queue.length < 3) existing.queue.push(message);
      return;
    }
    const bubble = this.scene.add
      .container(anchor.x, anchor.y - 100)
      .setDepth(10000);
    const label = this.scene.add
      .text(0, 0, message, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "16px",
        color: "#374454",
        wordWrap: { width: 210 },
        align: "center",
        padding: { x: 14, y: 11 },
        backgroundColor: "#fffdf5",
      })
      .setOrigin(0.5, 1);
    const tail = this.scene.add
      .triangle(0, 7, 0, 0, 12, 0, 6, 8, 0xfffdf5)
      .setOrigin(0.5, 1);
    bubble.add([tail, label]);
    label
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p, x, y, e) => {
        e.stopPropagation();
        this.dismiss(id);
      });
    const entry = { anchor, bubble, queue: [] };
    this.entries.set(id, entry);
    entry.timer = this.scene.time.delayedCall(
      Math.min(8000, Math.max(3000, message.length * 45)),
      () => {
        this.scene.tweens.add({
          targets: bubble,
          alpha: 0,
          duration: 250,
          onComplete: () => this.dismiss(id),
        });
      },
    );
  }
  dismiss(id) {
    const e = this.entries.get(id);
    if (!e) return;
    e.timer.remove();
    e.bubble.destroy();
    this.entries.delete(id);
    if (e.queue.length) {
      const next = e.queue.shift();
      this.say(id, e.anchor, next);
      this.entries.get(id).queue = e.queue;
    }
  }
  frame() {
    const placed = [];
    for (const [id, e] of this.entries) {
      if (!e.anchor.active) {
        e.queue = [];
        this.dismiss(id);
        continue;
      }
      const label = e.bubble.list[1],
        width = label.width,
        height = label.height;
      let x = Math.max(
          width / 2 + 8,
          Math.min(1200 - width / 2 - 8, e.anchor.x),
        ),
        y = e.anchor.y - 100;
      for (const prior of placed) {
        if (
          Math.abs(x - prior.x) < (width + prior.width) / 2 + 8 &&
          y - height < prior.y &&
          y > prior.y - prior.height
        )
          y = prior.y - prior.height - 12;
      }
      y = Math.max(height + 8, y);
      e.bubble.setPosition(x, y);
      placed.push({ x, y, width, height });
    }
  }
  clear() {
    for (const e of this.entries.values()) e.queue = [];
    for (const id of [...this.entries.keys()]) this.dismiss(id);
    for (const e of this.entries.values()) e.bubble.destroy();
    this.entries.clear();
  }
}
