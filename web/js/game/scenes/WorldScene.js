import { roomSpec, walkable, validSegment } from "../model.js";
import { PenguinAvatar } from "../entities/PenguinAvatar.js";
import { MochiCompanion } from "../entities/MochiCompanion.js";
import { SpeechBubbleSystem } from "../systems/SpeechBubbleSystem.js";
export function worldScene(Phaser, bridge) {
  return class WorldScene extends Phaser.Scene {
    constructor() {
      super("World");
      this.bridge = bridge;
      this.players = new Map();
      this.pets = new Map();
    }
    create() {
      this.bubbles = new SpeechBubbleSystem(this);
      bridge.scene = this;
      this.input.on("pointerdown", (pointer, over) => {
        if (over.length) return;
        const self = this.players.get(bridge.selfId);
        if (!self) return;
        const x = pointer.worldX,
          y = pointer.worldY;
        if (
          walkable(this.roomId, x, y) &&
          validSegment(this.roomId, self.root.x, self.root.y, x, y)
        ) {
          bridge.send("move", { x, y });
          self.prediction = { x, y };
          self.moving = true;
          this.marker?.destroy();
          this.marker = this.add
            .ellipse(x, y, 22, 11)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(2);
          this.tweens.add({ targets: this.marker, alpha: 0, duration: 1000 });
        } else bridge.status("Walk around the fountain and stay on the paths.");
      });
      bridge.connect();
    }
    setRoomSnapshot(snapshot) {
      this.roomId = snapshot.roomId;
      this.homePets?.forEach((p) => p.destroy());
      this.homePets = [];
      for (const p of this.players.values()) p.destroy();
      for (const p of this.pets.values()) p.destroy();
      this.players.clear();
      this.pets.clear();
      this.bubbles.clear();
      this.background?.destroy();
      this.background = this.add.container(0, 0).setDepth(0);
      this.paint(roomSpec(snapshot.roomId));
      if (snapshot.home) this.paintHome(snapshot.home);
      for (const p of snapshot.players) this.put(p);
    }
    paint(room) {
      const g = this.add.graphics();
      this.background.add(g);
      g.fillStyle(room.color);
      g.fillRect(0, 0, 1200, 720);
      g.fillStyle(0xfff7e8, 0.45);
      g.fillEllipse(620, 530, 1230, 440);
      g.fillStyle(room.accent, 0.14);
      g.fillEllipse(560, 710, 1480, 150);
      g.lineStyle(2, 0xffffff, 0.28);
      for (let x = -300; x < 1400; x += 130)
        g.lineBetween(x, 720, x + 400, 340);
      const text = (x, y, s, size, color = "#465363") => {
        const t = this.add
          .text(x, y, s, {
            fontFamily: "Nunito, sans-serif",
            fontSize: size + "px",
            fontStyle: "bold",
            color,
          })
          .setOrigin(0.5);
        this.background.add(t);
        return t;
      };
      // Original rounded architecture, hanging flags and garden silhouettes.
      g.fillStyle(room.accent, 0.2);
      g.fillRoundedRect(30, 36, 1140, 30, 15);
      for (let x = 90; x < 1160; x += 95) {
        g.fillStyle(
          [0xe9a096, 0x84b3ad, 0xe6c277, 0xa69cc8][Math.floor(x / 95) % 4],
        );
        g.fillTriangle(x, 48, x + 30, 48, x + 15, 84);
      }
      text(600, 110, room.name, 35);
      text(600, 149, room.subtitle, 16, "#697782");
      for (const prop of room.props) {
        const [id, label, x, y] = prop;
        const width = id === "town" ? 116 : 176,
          height = id === "town" ? 60 : 105;
        g.fillStyle(0x716777, 0.12);
        g.fillRoundedRect(
          x - width / 2 + 6,
          y - height / 2 + 7,
          width,
          height,
          22,
        );
        g.fillStyle(0xfff8e8);
        g.fillRoundedRect(x - width / 2, y - height / 2, width, height, 22);
        g.fillStyle(room.accent);
        g.fillRoundedRect(
          x - width / 2 - 7,
          y - height / 2 - 10,
          width + 14,
          28,
          11,
        );
        g.fillStyle(0xb5d2d1);
        g.fillRoundedRect(x - width / 2 + 18, y - 10, 42, 35, 7);
        g.fillStyle(0x9b8a87);
        g.fillRoundedRect(x + 22, y - 3, 32, height / 2 + 3, 13);
        const t = text(x, y + height / 2 + 22, label, 15);
        t.setInteractive({ useHandCursor: true }).on(
          "pointerdown",
          (p, a, b, e) => {
            e.stopPropagation();
            bridge.interact(id, x, Math.max(370, y + 140));
          },
        );
        const hit = this.add
          .zone(x, y, width, height)
          .setInteractive({ useHandCursor: true });
        this.background.add(hit);
        hit.on("pointerdown", (p, a, b, e) => {
          e.stopPropagation();
          bridge.interact(id, x, Math.max(370, y + 140));
        });
      }
      for (const [x, y] of [
        [50, 295],
        [1140, 300],
      ]) {
        g.fillStyle(0x887664);
        g.fillRoundedRect(x - 6, y - 25, 12, 80, 4);
        g.fillStyle(0x80a997);
        g.fillCircle(x, y - 35, 35);
        g.fillStyle(0x9abfac);
        g.fillCircle(x - 20, y - 55, 23);
        g.fillCircle(x + 20, y - 50, 27);
      }
      if (room.id === "town") {
        g.fillStyle(0x766d7e, 0.12);
        g.fillEllipse(600, 444, 200, 83);
        g.fillStyle(0xc4b7c8);
        g.fillEllipse(600, 429, 188, 79);
        g.fillStyle(0x86bbc3);
        g.fillEllipse(600, 422, 164, 60);
        g.fillStyle(0xeae1ee);
        g.fillRoundedRect(589, 341, 22, 80, 10);
        g.fillEllipse(600, 345, 70, 30);
        g.fillStyle(0xb0d6da);
        g.fillEllipse(600, 340, 61, 20);
        text(600, 307, "✦", 27, "#b68a5c");
      }
      if (room.id === "cafe") {
        for (const [x, y] of [
          [180, 570],
          [870, 550],
        ]) {
          g.fillStyle(0x9d746a);
          g.fillEllipse(x, y, 90, 32);
          g.fillStyle(0xedbc87);
          g.fillEllipse(x, y - 9, 90, 32);
        }
      }
      if (room.id === "home") {
        text(600, 300, `${bridge.homeName ?? "Your"} cozy home`, 19);
      }
      text(
        600,
        691,
        "Click a path to walk · Click a friend, Mochi, or doorway to interact",
        14,
        "#657180",
      );
    }
    paintHome(home) {
      this.homePets?.forEach((p) => p.destroy());
      this.homePets = [];

      let i = 0;
      const allCompanions = new Set(
        this.bridge.snapshotPlayers?.map((p) => p.companion?.id) ?? [],
      );
      for (const pet of home.pets) {
        if (allCompanions.has(pet.id)) continue;
        const sprite = new MochiCompanion(
          this,
          { ...pet, x: 200 + i * 65, y: 430, state: "RESTING" },
          (id) => this.bridge.inspectPet(id),
        );
        this.homePets.push(sprite);
        i++;
      }
      const furniture = Object.values(home.pets[0]?.furniture ?? {});
      for (let i = 0; i < furniture.length; i++) {
        const t = this.add
          .text(340 + i * 120, 530, furniture[i], {
            fontFamily: "Nunito",
            fontSize: "16px",
            color: "#79646c",
            backgroundColor: "#f8eadc",
            padding: { x: 18, y: 10 },
          })
          .setOrigin(0.5);
        this.background.add(t);
      }
    }
    put(p) {
      let avatar = this.players.get(p.userId);
      if (!avatar) {
        avatar = new PenguinAvatar(this, p, (id) => bridge.selectPlayer(id));
        this.players.set(p.userId, avatar);
      }
      avatar.update(p);
      const old = this.pets.get(p.userId);
      if (old && old.id !== p.companion?.id) {
        old.destroy();
        this.pets.delete(p.userId);
      }
      if (p.companion) {
        let pet = this.pets.get(p.userId);
        if (!pet) {
          pet = new MochiCompanion(this, p.companion, (id) =>
            bridge.selectPet(p.userId, id),
          );
          this.pets.set(p.userId, pet);
        }
        pet.update(p.companion);
      }
    }
    remove(id) {
      this.players.get(id)?.destroy();
      this.pets.get(id)?.destroy();
      this.players.delete(id);
      this.pets.delete(id);
    }
    update(t, delta) {
      for (const p of this.players.values()) p.frame(t, delta);
      for (const p of this.pets.values()) p.frame(t, delta);
      for (const p of this.homePets ?? []) p.frame(t, delta);
      this.bubbles.frame();
    }
  };
}
