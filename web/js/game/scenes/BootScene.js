export function bootScene(Phaser) {
  return class BootScene extends Phaser.Scene {
    constructor() {
      super("Boot");
    }
    create() {
      const texture = (key, w, h, paint) => {
        const g = this.add.graphics();
        paint(g);
        g.generateTexture(key, w, h);
        g.destroy();
      };
      texture("penguin", 80, 94, (g) => {
        g.fillStyle(0xffffff);
        g.fillEllipse(40, 46, 58, 79);
        g.fillEllipse(15, 54, 15, 35);
        g.fillEllipse(65, 54, 15, 35);
        g.fillStyle(0xf2bb65);
        g.fillEllipse(25, 85, 24, 12);
        g.fillEllipse(55, 85, 24, 12);
      });
      texture("penguin-detail", 80, 94, (g) => {
        g.fillStyle(0xfff8e7);
        g.fillEllipse(40, 60, 39, 44);
        g.fillEllipse(31, 32, 20, 22);
        g.fillEllipse(49, 32, 20, 22);
        g.fillStyle(0x374454);
        g.fillCircle(32, 30, 3);
        g.fillCircle(48, 30, 3);
        g.fillStyle(0xe9a35a);
        g.fillTriangle(32, 41, 48, 41, 40, 49);
        g.fillStyle(0xeeb2aa, 0.65);
        g.fillEllipse(24, 41, 9, 5);
        g.fillEllipse(56, 41, 9, 5);
      });
      texture("mochi", 48, 44, (g) => {
        g.fillStyle(0xffffff);
        g.fillRoundedRect(2, 3, 44, 36, 17);
        g.fillEllipse(12, 37, 12, 9);
        g.fillEllipse(36, 37, 12, 9);
      });
      texture("mochi-detail", 48, 44, (g) => {
        g.fillStyle(0x51496a);
        g.fillCircle(17, 19, 2);
        g.fillCircle(31, 19, 2);
        g.lineStyle(1.5, 0x51496a);
        g.beginPath();
        g.arc(24, 22, 4, 0, Math.PI);
        g.strokePath();
        g.fillStyle(0xe8aac5);
        g.fillEllipse(11, 24, 8, 4);
        g.fillEllipse(37, 24, 8, 4);
      });
      texture("hat", 74, 34, (g) => {
        g.fillStyle(0xc17b87);
        g.fillRoundedRect(18, 3, 38, 25, 9);
        g.fillRoundedRect(5, 23, 64, 8, 4);
        g.fillStyle(0xf5ce9f);
        g.fillRect(18, 20, 38, 6);
      });
      texture("top", 55, 28, (g) => {
        g.fillStyle(0x71948c);
        g.fillRoundedRect(2, 2, 51, 24, 8);
        g.fillStyle(0xfaf1da);
        g.fillCircle(28, 14, 5);
      });
      texture("face", 54, 19, (g) => {
        g.lineStyle(3, 0x6a5c79);
        g.strokeRoundedRect(4, 2, 20, 13, 5);
        g.strokeRoundedRect(30, 2, 20, 13, 5);
        g.lineBetween(24, 7, 30, 7);
      });
      texture("accessory", 23, 31, (g) => {
        g.fillStyle(0xefcb74);
        g.fillRoundedRect(2, 4, 19, 26, 5);
        g.fillStyle(0xffffff);
        g.fillCircle(11, 14, 4);
      });
      this.scene.start("World");
    }
  };
}
