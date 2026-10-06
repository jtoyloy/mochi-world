import { moveToward } from "../model.js";
export class PenguinAvatar {
  constructor(scene, player, onClick) {
    this.scene = scene;
    this.id = player.userId;
    this.root = scene.add.container(player.x, player.y);
    this.shadow = scene.add.ellipse(0, 3, 56, 17, 0x665f73, 0.18);
    this.root.add(this.shadow);
    this.parts = scene.add.container(0, 0);
    this.root.add(this.parts);
    this.name = scene.add
      .text(0, -88, player.avatar.display_name, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#394556",
        backgroundColor: "#fff7e5",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5, 1);
    this.root.add(this.name);
    this.draw(player.avatar);
    this.body
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (pointer, x, y, event) => {
        event.stopPropagation();
        onClick(player.userId);
      });
    this.target = { x: player.x, y: player.y };
    this.moving = false;
  }
  draw(avatar) {
    this.parts.removeAll(true);
    this.body = this.scene.add
      .image(0, -31, "penguin")
      .setTint(parseInt(avatar.body_color.slice(1), 16));
    this.parts.add(this.body);
    this.parts.add(this.scene.add.image(0, -30, "penguin-detail"));
    const slots = avatar.equipment ?? {};
    if (slots.top) this.parts.add(this.scene.add.image(0, -21, "top"));
    if (slots.hat) this.parts.add(this.scene.add.image(0, -67, "hat"));
    if (slots.face) this.parts.add(this.scene.add.image(0, -47, "face"));
    if (slots.accessory)
      this.parts.add(this.scene.add.image(26, -30, "accessory"));
    this.name.setText(avatar.display_name);
  }
  update(player) {
    if (JSON.stringify(player.avatar) !== JSON.stringify(this.avatar)) {
      this.avatar = player.avatar;
      this.draw(player.avatar);
      this.body
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", (p, x, y, e) => {
          e.stopPropagation();
          this.scene.bridge.selectPlayer(this.id);
        });
    }
    this.target = { x: player.x, y: player.y };
    this.moving = player.moving;
    if (
      !player.moving ||
      Math.hypot(player.x - this.root.x, player.y - this.root.y) > 80
    )
      this.prediction = null;
  }
  frame(time, delta) {
    if (this.prediction) {
      const next = moveToward(
        this.root,
        this.prediction,
        180,
        Math.min(delta / 1000, 0.1),
      );
      this.root.setPosition(next.x, next.y);
    } else {
      const f = 1 - Math.exp(-delta / 90);
      this.root.x += (this.target.x - this.root.x) * f;
      this.root.y += (this.target.y - this.root.y) * f;
    }
    this.root.setDepth(this.root.y);
    const scale = 0.92 + (this.root.y - 350) / 2200;
    this.root.setScale(scale);
    this.parts.rotation = this.moving
      ? this.scene.bridge.reducedMotion
        ? 0
        : Math.sin(time / 100) * 0.07
      : 0;
    this.parts.y = this.scene.bridge.reducedMotion
      ? 0
      : this.moving
        ? Math.abs(Math.sin(time / 110)) * -3
        : Math.sin(time / 800) * 0.7;
  }
  destroy() {
    this.root.destroy();
  }
}
