const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 4000;
const HORSE_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const GALLOP_CHARGE_MS = 4500;
const GAITS = {
  idle: {
    label: "STANDING",
    speed: 0,
    animationFps: 0,
    dustInterval: 0,
    color: "#c6d6b6",
  },
  walk: {
    label: "WALK",
    speed: 110,
    animationFps: 4,
    dustInterval: 0,
    color: "#bde59f",
  },
  trot: {
    label: "TROT",
    speed: 240,
    animationFps: 6,
    dustInterval: 0,
    color: "#fff4bd",
  },
  canter: {
    label: "CANTER",
    speed: 345,
    animationFps: 8,
    dustInterval: 160,
    color: "#ffd06a",
  },
  gallop: {
    label: "GALLOP!",
    speed: 470,
    animationFps: 10,
    dustInterval: 80,
    color: "#ff8a5b",
  },
};

class MeadowScene extends Phaser.Scene {
  constructor() {
    super("meadow");
    this.horse = null;
    this.keys = null;
    this.isMoving = false;
    this.gallopCharge = 0;
    this.currentGait = "idle";
    this.currentFacing = "n";
    this.movementFrame = 0;
    this.animationAccumulator = 0;
    this.horseShadow = null;
    this.dustTimer = 0;
    this.gaitText = null;
    this.gallopText = null;
    this.gallopBar = null;
  }

  preload() {
    for (const direction of HORSE_DIRECTIONS) {
      this.load.image(
        `horse-${direction}-idle`,
        `./public/assets/horse/animation/horse-${direction}-idle.png`,
      );
      for (let frame = 0; frame < 4; frame += 1) {
        this.load.image(
          `horse-${direction}-walk-${frame}`,
          `./public/assets/horse/animation/horse-${direction}-walk-${frame}.png`,
        );
      }
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

    this.horseShadow = this.add
      .ellipse(
        WORLD_WIDTH / 2,
        WORLD_HEIGHT / 2 + 30,
        54,
        16,
        0x1b2b18,
        0.25,
      )
      .setDepth(9);

    this.horse = this.physics.add
      .sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "horse-n-idle")
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
      walk: Phaser.Input.Keyboard.KeyCodes.CTRL,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });

    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.CTRL,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    ]);

    this.createHud();
  }

  update(_time, delta) {
    const horizontal = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const direction = new Phaser.Math.Vector2(horizontal, vertical);

    this.isMoving = direction.lengthSq() > 0;

    if (!this.isMoving) {
      this.horse.setVelocity(0, 0);
      this.gallopCharge = 0;
      this.currentGait = "idle";
      this.movementFrame = 0;
      this.animationAccumulator = 0;
      this.horse.setScale(1);
      this.horse.setAngle(0);
      this.horse.setY(Math.round(this.horse.y));
      this.dustTimer = 0;
      this.horse.setTexture(`horse-${this.currentFacing}-idle`);
      this.updateShadow(0);
      this.updateGaitHud();
      return;
    }

    this.currentGait = this.getCurrentGait(delta);
    const gait = GAITS[this.currentGait];

    direction.normalize();
    this.horse.setVelocity(
      direction.x * gait.speed,
      direction.y * gait.speed,
    );

    const facing = this.getFacingDirection(horizontal, vertical);
    this.currentFacing = facing;
    this.setHorseCollider(facing);
    this.updateHorseAnimation(gait, delta);
    this.emitDust(direction, gait, delta);
    this.updateGaitHud();
  }

  updateHorseAnimation(gait, delta) {
    const frameDuration = 1000 / gait.animationFps;
    this.animationAccumulator += delta;

    while (this.animationAccumulator >= frameDuration) {
      this.animationAccumulator -= frameDuration;
      this.movementFrame = (this.movementFrame + 1) % 4;
    }

    this.horse.setScale(1);
    this.horse.setAngle(0);
    this.horse.setTexture(
      `horse-${this.currentFacing}-walk-${this.movementFrame}`,
    );

    const liftByFrame = [0.12, 0, 0.08, 0.04];
    const lift = liftByFrame[this.movementFrame];
    this.updateShadow(lift);
  }

  updateShadow(lift) {
    this.horseShadow.setPosition(this.horse.x, this.horse.y + 31);
    this.horseShadow.setScale(1 - lift * 0.14, 1 - lift * 0.08);
    this.horseShadow.setAlpha(0.25 - lift * 0.08);
  }

  emitDust(direction, gait, delta) {
    if (!gait.dustInterval) {
      this.dustTimer = 0;
      return;
    }

    this.dustTimer += delta;
    if (this.dustTimer < gait.dustInterval) return;
    this.dustTimer %= gait.dustInterval;

    const behindX =
      this.horse.x - direction.x * 42 + Phaser.Math.Between(-5, 5);
    const behindY =
      this.horse.y - direction.y * 42 + 30 + Phaser.Math.Between(-3, 3);
    const size = this.currentGait === "gallop" ? 7 : 5;
    const dust = this.add
      .rectangle(behindX, behindY, size, size, 0xd6c27b, 0.55)
      .setDepth(8);

    this.tweens.add({
      targets: dust,
      x: behindX - direction.x * 18,
      y: behindY - direction.y * 18 - 4,
      alpha: 0,
      scale: 1.8,
      duration: this.currentGait === "gallop" ? 320 : 420,
      ease: "Quad.easeOut",
      onComplete: () => dust.destroy(),
    });
  }

  getCurrentGait(delta) {
    // Walking takes priority if both modifiers are held.
    if (this.keys.walk.isDown) {
      this.gallopCharge = 0;
      return "walk";
    }

    if (this.keys.run.isDown) {
      this.gallopCharge = Math.min(
        this.gallopCharge + delta,
        GALLOP_CHARGE_MS,
      );
      return this.gallopCharge >= GALLOP_CHARGE_MS ? "gallop" : "canter";
    }

    this.gallopCharge = 0;
    return "trot";
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
    texture.fillRect(0, 0, 32, 32);

    const tufts = [
      [7, 7, 0x477d35],
      [23, 15, 0x79ad55],
      [12, 26, 0x508b3b],
    ];

    for (const [x, y, color] of tufts) {
      texture.fillStyle(color);
      texture.fillRect(x, y, 2, 4);
      texture.fillRect(x - 2, y + 2, 2, 2);
      texture.fillRect(x + 2, y + 1, 2, 2);
    }

    texture.generateTexture("grass", 32, 32);
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
      detail.fillRect(x, y, 4, random.pick([4, 8]));
      detail.fillRect(x - 4, y + 4, 4, 4);
      detail.fillRect(x + 4, y, 4, 4);
    }
  }

  createHud() {
    const panel = this.add
      .rectangle(18, 18, 320, 132, 0x142416, 0.88)
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
      .text(34, 57, "WASD MOVE  |  CTRL WALK  |  SHIFT RUN", {
        fontFamily: '"Courier New", monospace',
        fontSize: "11px",
        color: "#d9efb0",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.gaitText = this.add
      .text(34, 80, "GAIT: STANDING", {
        fontFamily: '"Courier New", monospace',
        fontSize: "15px",
        fontStyle: "bold",
        color: GAITS.idle.color,
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.add
      .rectangle(34, 108, 270, 7, 0x324735, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(101);

    this.gallopBar = this.add
      .rectangle(34, 108, 270, 7, 0xff8a5b, 1)
      .setOrigin(0)
      .setScale(0, 1)
      .setScrollFactor(0)
      .setDepth(102);

    this.gallopText = this.add
      .text(34, 120, "HOLD SHIFT WHILE MOVING TO GALLOP", {
        fontFamily: '"Courier New", monospace',
        fontSize: "10px",
        color: "#a9bd9a",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.updateGaitHud();
  }

  updateGaitHud() {
    const gait = GAITS[this.currentGait];
    const progress = Phaser.Math.Clamp(
      this.gallopCharge / GALLOP_CHARGE_MS,
      0,
      1,
    );

    this.gaitText
      .setText(`GAIT: ${gait.label}  |  ${gait.speed} SPEED`)
      .setColor(gait.color);
    this.gallopBar.setScale(progress, 1);

    if (this.currentGait === "gallop") {
      this.gallopText.setText("FULL GALLOP!").setColor(GAITS.gallop.color);
    } else if (this.currentGait === "canter") {
      this.gallopText
        .setText(`GALLOP BUILDING: ${Math.floor(progress * 100)}%`)
        .setColor(GAITS.canter.color);
    } else {
      this.gallopText
        .setText("HOLD SHIFT WHILE MOVING TO GALLOP")
        .setColor("#a9bd9a");
    }
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
