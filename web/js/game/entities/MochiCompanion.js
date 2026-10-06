export class MochiCompanion {
  constructor(scene, pet, onClick) {
    this.scene = scene;
    this.id = pet.id;
    this.root = scene.add.container(pet.x, pet.y);
    this.root.add(scene.add.ellipse(0, 3, 35, 12, 0x665f73, 0.16));
    this.sprite = scene.add
      .image(0, -17, "mochi")
      .setTint(pet.profile?.variant === "Aurora" ? 0x9ecac2 : 0xc3a8eb);
    this.root.add(this.sprite);
    this.root.add(scene.add.image(0, -17, "mochi-detail"));
    this.name = scene.add
      .text(0, 10, pet.name, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "12px",
        color: "#544671",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0);
    this.root.add(this.name);
    this.sprite
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p, x, y, e) => {
        e.stopPropagation();
        onClick(pet.id);
      });
    this.cosmetics = scene.add.container(0, 0);
    this.root.add(this.cosmetics);
    this.equipmentKey = "";
    this.target = pet;
    this.applyCosmetics(pet);
  }
  applyCosmetics(pet) {
    const key = JSON.stringify(pet.equipment ?? {});
    if (key === this.equipmentKey) return;
    this.equipmentKey = key;
    this.cosmetics.removeAll(true);
    const slots = pet.equipment ?? {};
    if (slots.hat)
      this.cosmetics.add(this.scene.add.image(0, -38, "hat").setScale(0.55));
    if (slots.accessory)
      this.cosmetics.add(
        this.scene.add.image(19, -12, "accessory").setScale(0.5),
      );
    if (slots.glasses)
      this.cosmetics.add(this.scene.add.image(0, -22, "face").setScale(0.7));
  }
  update(pet) {
    this.target = pet;
    this.applyCosmetics(pet);
  }
  frame(t, delta) {
    const f = 1 - Math.exp(-delta / 100);
    this.root.x += (this.target.x - this.root.x) * f;
    this.root.y += (this.target.y - this.root.y) * f;
    this.root.setDepth(this.root.y + 1);
    this.sprite.y =
      -17 +
      (this.target.state === "RESTING"
        ? 2
        : this.scene.bridge.reducedMotion
          ? 0
          : Math.sin(t / 170) * 1.5);
    this.root.setScale(this.target.state === "RESTING" ? 0.95 : 1);
  }
  destroy() {
    this.root.destroy();
  }
}
