const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1800;
const HORSE_SPEED = 240;
const HORSE_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

class MeadowScene extends Phaser.Scene {
  constructor() {
    super("meadow");
    this.horse = null;
    this.keys = null;
    this.isMoving = false;
    this.walkTime = 0;
  }

  preload() {
    for (const direction of HORSE_DIRECTIONS) {
      this.load.image(
        `horse-${direction}`,
        `./public/assets/horse/horse-${direction}.png`,
      );
    }
  }

  create() {
    this.createGrassTexture();
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, "grass")
      .setOrigin(0);

    this.addWorldDetails();

    this.physics.world.setBounds(24, 24, WORLD_WIDTH - 48, WORLD_HEIGHT - 48);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#5c963f");

    this.horse = this.physics.add
      .sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "horse-n")
      .setDepth(10)
      .setCollideWorldBounds(true);

    this.setHorseCollider("n");

    this.cameras.main.startFollow(this.horse, true, 0.09, 0.09);
    this.cameras.main.setZoom(1.15);

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.createHud();
  }

  update(_time, delta) {
    const horizontal = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const direction = new Phaser.Math.Vector2(horizontal, vertical);

    this.isMoving = direction.lengthSq() > 0;

    if (!this.isMoving) {
      this.horse.setVelocity(0, 0);
      this.walkTime = 0;
      this.horse.setScale(1);
      this.horse.setY(Math.round(this.horse.y));
      return;
    }

    direction.normalize();
    this.horse.setVelocity(
      direction.x * HORSE_SPEED,
      direction.y * HORSE_SPEED,
    );

    const facing = this.getFacingDirection(horizontal, vertical);
    this.horse.setTexture(`horse-${facing}`);
    this.horse.setAngle(0);
    this.setHorseCollider(facing);

    // A restrained pixel-style gait while dedicated animation frames are pending.
    this.walkTime += delta;
    const stride = Math.sin(this.walkTime * 0.018);
    this.horse.setScale(1 + Math.abs(stride) * 0.025, 1 - Math.abs(stride) * 0.015);
  }

  getFacingDirection(horizontal, vertical) {
    if (vertical < 0) {
      if (horizontal < 0) return "nw";
      if (horizontal > 0) return "ne";
      return "n";
    }

    if (vertical > 0) {
      if (horizontal < 0) return "sw";
      if (horizontal > 0) return "se";
      return "s";
    }

    return horizontal < 0 ? "w" : "e";
  }

  setHorseCollider(facing) {
    if (facing === "e" || facing === "w") {
      this.horse.body.setSize(84, 38);
      this.horse.body.setOffset(22, 45);
      return;
    }

    if (facing.length === 2) {
      this.horse.body.setSize(66, 66);
      this.horse.body.setOffset(31, 31);
      return;
    }

    this.horse.body.setSize(38, 84);
    this.horse.body.setOffset(45, 22);
  }

  createGrassTexture() {
    const texture = this.make.graphics({ x: 0, y: 0, add: false });
    texture.fillStyle(0x5f9d45);
    texture.fillRect(0, 0, 64, 64);

    const tufts = [
      [8, 10, 0x4d8738],
      [42, 6, 0x75ad52],
      [25, 31, 0x548f3d],
      [54, 45, 0x4b8236],
      [12, 53, 0x78af54],
      [36, 58, 0x568f3d],
    ];

    for (const [x, y, color] of tufts) {
      texture.fillStyle(color);
      texture.fillRect(x, y, 3, 5);
      texture.fillRect(x - 2, y + 2, 2, 2);
      texture.fillRect(x + 3, y + 1, 2, 2);
    }

    texture.generateTexture("grass", 64, 64);
    texture.destroy();
  }

  addWorldDetails() {
    const detail = this.add.graphics();
    detail.setDepth(1);

    // A darker pixel border makes the edge of the current playable field clear.
    detail.lineStyle(16, 0x3e7132, 1);
    detail.strokeRect(8, 8, WORLD_WIDTH - 16, WORLD_HEIGHT - 16);
    detail.lineStyle(4, 0x82b85d, 1);
    detail.strokeRect(20, 20, WORLD_WIDTH - 40, WORLD_HEIGHT - 40);

    const random = new Phaser.Math.RandomDataGenerator(["horsin-around"]);
    for (let i = 0; i < 160; i += 1) {
      const x = random.between(45, WORLD_WIDTH - 45);
      const y = random.between(45, WORLD_HEIGHT - 45);
      const shade = random.pick([0x4b8337, 0x77ad53, 0x538d3c]);
      detail.fillStyle(shade, 0.7);
      detail.fillRect(x, y, 3, random.between(4, 7));
      detail.fillRect(x - 2, y + 2, 2, 2);
      detail.fillRect(x + 3, y + 1, 2, 2);
    }
  }

  createHud() {
    const panel = this.add
      .rectangle(18, 18, 258, 74, 0x142416, 0.88)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(100);
    panel.setStrokeStyle(3, 0xb7d878);

    this.add
      .text(34, 29, "HORSIN' AROUND", {
        fontFamily: '"Courier New", monospace',
        fontSize: "19px",
        fontStyle: "bold",
        color: "#fff4bd",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.add
      .text(34, 57, "WASD  •  MOVE IN 8 DIRECTIONS", {
        fontFamily: '"Courier New", monospace',
        fontSize: "12px",
        color: "#d9efb0",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#102714",
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: MeadowScene,
};

new Phaser.Game(config);
