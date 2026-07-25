const WORLD_WIDTH = 8000;
const WORLD_HEIGHT = 6000;
const START_X = WORLD_WIDTH / 2;
const START_Y = WORLD_HEIGHT / 2;
const MAX_LIVES = 3;
const HIT_COOLDOWN_MS = 900;
const JUMP_DURATION_MS = 850;
const JUMP_COOLDOWN_MS = 1050;
const JUMP_HEIGHT = 48;
const HORSE_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const GALLOP_CHARGE_MS = 4500;
const GAIT_DAMAGE = {
  idle: 0,
  walk: 0,
  trot: 1,
  canter: 2,
  gallop: 3,
};
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
    this.obstacles = null;
    this.dustTimer = 0;
    this.lives = MAX_LIVES;
    this.hitCooldownUntil = 0;
    this.knockbackUntil = 0;
    this.knockbackVelocity = new Phaser.Math.Vector2();
    this.isJumping = false;
    this.jumpStartedAt = 0;
    this.jumpCooldownUntil = 0;
    this.heartIcons = [];
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
    this.createObstacleTextures();
    this.createHeartTextures();
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, "grass")
      .setOrigin(0);

    this.addWorldDetails();
    this.addFlowers();
    this.createObstacles();

    this.physics.world.setBounds(24, 24, WORLD_WIDTH - 48, WORLD_HEIGHT - 48);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#5c963f");

    this.horseShadow = this.add
      .ellipse(
        START_X,
        START_Y + 30,
        54,
        16,
        0x1b2b18,
        0.25,
      )
      .setDepth(9);

    this.horse = this.physics.add
      .sprite(START_X, START_Y, "horse-n-idle")
      .setDepth(10)
      .setCollideWorldBounds(true);

    this.setHorseCollider("n");
    this.physics.add.collider(
      this.horse,
      this.obstacles,
      this.handleObstacleCollision,
      this.canCollideWithObstacle,
      this,
    );

    this.cameras.main.startFollow(this.horse, true, 0.09, 0.09);
    this.cameras.main.setZoom(1.15);

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      walk: Phaser.Input.Keyboard.KeyCodes.V,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.V,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ]);

    this.createHud();
  }

  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.jump)) {
      this.startJump(time);
    }

    if (time < this.knockbackUntil) {
      this.horse.setVelocity(
        this.knockbackVelocity.x,
        this.knockbackVelocity.y,
      );
      this.updateShadow(0);
      this.updateJump(time);
      return;
    }

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
      this.updateJump(time);
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
    this.updateJump(time);
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

  startJump(time) {
    if (
      this.isJumping ||
      time < this.jumpCooldownUntil ||
      time < this.knockbackUntil
    ) {
      return;
    }

    this.isJumping = true;
    this.jumpStartedAt = time;
    this.jumpCooldownUntil = time + JUMP_COOLDOWN_MS;
  }

  updateJump(time) {
    if (!this.isJumping) {
      this.horse.setDisplayOrigin(64, 64);
      return;
    }

    const progress = Phaser.Math.Clamp(
      (time - this.jumpStartedAt) / JUMP_DURATION_MS,
      0,
      1,
    );
    const arc = Math.sin(progress * Math.PI);
    const height = Math.round(arc * JUMP_HEIGHT);

    // Lift only the rendered sprite so the physics body keeps its trajectory.
    this.horse.setDisplayOrigin(64, 64 + height);
    this.horse.setScale(1 + arc * 0.06);
    this.horseShadow.setScale(1 - arc * 0.38, 1 - arc * 0.24);
    this.horseShadow.setAlpha(0.25 - arc * 0.18);

    if (progress >= 1) {
      this.isJumping = false;
      this.horse.setDisplayOrigin(64, 64);
      this.horse.setScale(1);
      this.updateShadow(0);
    }
  }

  canCollideWithObstacle() {
    return !this.isJumping;
  }

  handleObstacleCollision(horse, obstacle) {
    const now = this.time.now;
    if (now < this.hitCooldownUntil) return;

    const damage = GAIT_DAMAGE[this.currentGait];
    if (damage === 0) {
      this.hitCooldownUntil = now + 300;
      this.showCollisionMessage("CAREFUL WALK - SAFE", "#bde59f");
      return;
    }

    this.hitCooldownUntil = now + HIT_COOLDOWN_MS;
    this.lives -= damage;
    this.updateHearts();
    this.showCollisionMessage(`-${damage} HEART${damage > 1 ? "S" : ""}`, "#ff776d");
    this.cameras.main.shake(130 + damage * 35, 0.004 + damage * 0.002);

    horse.setTintFill(0xff776d);
    this.time.delayedCall(160, () => horse.clearTint());

    const away = new Phaser.Math.Vector2(
      horse.x - obstacle.x,
      horse.y - obstacle.y,
    );
    if (away.lengthSq() === 0) {
      away.set(-horse.body.velocity.x, -horse.body.velocity.y);
    }
    away.normalize();
    this.knockbackVelocity.copy(away).scale(190 + damage * 35);
    this.knockbackUntil = now + 260;

    if (this.lives <= 0) {
      this.resetHorse();
    }
  }

  resetHorse() {
    this.lives = MAX_LIVES;
    this.gallopCharge = 0;
    this.currentGait = "idle";
    this.currentFacing = "n";
    this.movementFrame = 0;
    this.animationAccumulator = 0;
    this.knockbackUntil = 0;
    this.isJumping = false;
    this.jumpStartedAt = 0;
    this.jumpCooldownUntil = this.time.now + 500;
    this.hitCooldownUntil = this.time.now + 1200;
    this.horse.body.reset(START_X, START_Y);
    this.horse.setTexture("horse-n-idle");
    this.horse.setDisplayOrigin(64, 64);
    this.horse.setScale(1);
    this.horse.setAngle(0);
    this.horse.clearTint();
    this.horseShadow.setPosition(START_X, START_Y + 31);
    this.updateHearts();
    this.showCollisionMessage("BACK TO THE PADDOCK!", "#fff4bd");
    this.cameras.main.flash(220, 255, 244, 189, false);
    this.updateGaitHud();
  }

  showCollisionMessage(message, color) {
    const notice = this.add
      .text(this.horse.x, this.horse.y - 68, message, {
        fontFamily: '"Courier New", monospace',
        fontSize: "13px",
        fontStyle: "bold",
        color,
        backgroundColor: "#142416",
        padding: { x: 5, y: 3 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.tweens.add({
      targets: notice,
      y: notice.y - 24,
      alpha: 0,
      duration: 850,
      ease: "Quad.easeOut",
      onComplete: () => notice.destroy(),
    });
  }

  emitDust(direction, gait, delta) {
    if (this.isJumping) {
      this.dustTimer = 0;
      return;
    }

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

  createObstacleTextures() {
    const puddle = this.make.graphics({ x: 0, y: 0, add: false });
    puddle.fillStyle(0x213d52);
    puddle.fillRect(16, 8, 64, 8);
    puddle.fillRect(8, 16, 80, 32);
    puddle.fillRect(16, 48, 64, 8);
    puddle.fillStyle(0x2f6173);
    puddle.fillRect(16, 16, 64, 24);
    puddle.fillRect(24, 40, 48, 8);
    puddle.fillStyle(0x6fa5a2);
    puddle.fillRect(24, 20, 24, 4);
    puddle.fillRect(56, 36, 16, 4);
    puddle.generateTexture("puddle", 96, 64);
    puddle.destroy();

    this.createFenceTexture("fence-horizontal", false);
    this.createFenceTexture("fence-vertical", true);
  }

  createFenceTexture(key, vertical) {
    const width = vertical ? 64 : 128;
    const height = vertical ? 128 : 64;
    const fence = this.make.graphics({ x: 0, y: 0, add: false });
    const posts = vertical ? [10, 58, 106] : [10, 58, 106];

    fence.fillStyle(0x392617);
    if (vertical) {
      fence.fillRect(20, 8, 8, 112);
      fence.fillRect(40, 8, 8, 112);
      for (const y of posts) {
        fence.fillRect(12, y, 44, 12);
      }
    } else {
      fence.fillRect(8, 20, 112, 8);
      fence.fillRect(8, 40, 112, 8);
      for (const x of posts) {
        fence.fillRect(x, 12, 12, 44);
      }
    }

    fence.fillStyle(0x8b5426);
    if (vertical) {
      fence.fillRect(24, 8, 8, 112);
      fence.fillRect(44, 8, 8, 112);
      for (const y of posts) {
        fence.fillRect(16, y, 36, 8);
        fence.fillRect(20, y - 4, 28, 4);
      }
    } else {
      fence.fillRect(8, 24, 112, 8);
      fence.fillRect(8, 44, 112, 8);
      for (const x of posts) {
        fence.fillRect(x, 16, 8, 36);
        fence.fillRect(x - 4, 20, 4, 28);
      }
    }

    fence.fillStyle(0xc17a32);
    if (vertical) {
      fence.fillRect(28, 12, 4, 104);
      fence.fillRect(48, 12, 4, 104);
    } else {
      fence.fillRect(12, 28, 104, 4);
      fence.fillRect(12, 48, 104, 4);
    }
    fence.generateTexture(key, width, height);
    fence.destroy();
  }

  createObstacles() {
    this.obstacles = this.physics.add.staticGroup();

    const addObstacle = (x, y, texture) => {
      const obstacle = this.obstacles
        .create(x, y, texture)
        .setDepth(8);

      if (texture === "puddle") {
        obstacle.body.setSize(76, 40);
      } else if (texture === "fence-horizontal") {
        obstacle.body.setSize(116, 48);
      } else {
        obstacle.body.setSize(48, 116);
      }
      obstacle.body.updateFromGameObject();
    };

    addObstacle(START_X + 310, START_Y + 70, "puddle");
    addObstacle(START_X - 300, START_Y - 150, "fence-horizontal");
    addObstacle(START_X - 330, START_Y + 210, "fence-vertical");
    addObstacle(START_X + 420, START_Y - 190, "fence-horizontal");

    const random = new Phaser.Math.RandomDataGenerator(["horsin-obstacles"]);
    const textures = ["puddle", "fence-horizontal", "fence-vertical"];
    for (let i = 0; i < 64; i += 1) {
      let x;
      let y;
      do {
        x = random.between(160, WORLD_WIDTH - 160);
        y = random.between(160, WORLD_HEIGHT - 160);
      } while (Phaser.Math.Distance.Between(x, y, START_X, START_Y) < 520);

      addObstacle(x, y, random.pick(textures));
    }
  }

  createHeartTextures() {
    const createHeart = (key, fillColor) => {
      const heart = this.make.graphics({ x: 0, y: 0, add: false });
      heart.fillStyle(0x3b1f21);
      heart.fillRect(2, 0, 4, 2);
      heart.fillRect(10, 0, 4, 2);
      heart.fillRect(0, 2, 16, 6);
      heart.fillRect(2, 8, 12, 2);
      heart.fillRect(4, 10, 8, 2);
      heart.fillRect(6, 12, 4, 2);
      heart.fillStyle(fillColor);
      heart.fillRect(2, 2, 12, 4);
      heart.fillRect(4, 6, 8, 2);
      heart.fillRect(6, 8, 4, 2);
      heart.generateTexture(key, 16, 14);
      heart.destroy();
    };

    createHeart("heart-full", 0xe84f4f);
    createHeart("heart-empty", 0x5d4b4b);
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
    for (let i = 0; i < 320; i += 1) {
      const x = random.between(45, WORLD_WIDTH - 45);
      const y = random.between(45, WORLD_HEIGHT - 45);
      const shade = random.pick([0x4b8337, 0x77ad53, 0x538d3c]);
      detail.fillStyle(shade, 0.7);
      detail.fillRect(x, y, 4, random.pick([4, 8]));
      detail.fillRect(x - 4, y + 4, 4, 4);
      detail.fillRect(x + 4, y, 4, 4);
    }
  }

  addFlowers() {
    const flowers = this.add.graphics();
    flowers.setDepth(2);

    const petalColors = [
      0xffe36e,
      0xf4f0d0,
      0xf28ba8,
      0xa98ee8,
      0x80bde8,
    ];
    const random = new Phaser.Math.RandomDataGenerator(["horsin-flowers"]);

    const drawFlower = (rawX, rawY, petalColor) => {
      const x = Math.round(rawX / 2) * 2;
      const y = Math.round(rawY / 2) * 2;

      flowers.fillStyle(0x397432);
      flowers.fillRect(x, y + 3, 2, 7);
      flowers.fillStyle(petalColor);
      flowers.fillRect(x - 2, y, 2, 2);
      flowers.fillRect(x + 2, y, 2, 2);
      flowers.fillRect(x, y - 2, 2, 2);
      flowers.fillRect(x, y + 2, 2, 2);
      flowers.fillStyle(0xf5bd3f);
      flowers.fillRect(x, y, 2, 2);
    };

    const drawPatch = (x, y, flowerCount) => {
      for (let i = 0; i < flowerCount; i += 1) {
        drawFlower(
          x + random.between(-18, 18),
          y + random.between(-14, 14),
          random.pick(petalColors),
        );
      }
    };

    const startingPatches = [
      [START_X - 190, START_Y - 80],
      [START_X + 160, START_Y - 110],
      [START_X - 130, START_Y + 150],
      [START_X + 210, START_Y + 135],
      [START_X + 40, START_Y + 205],
    ];
    for (const [x, y] of startingPatches) {
      drawPatch(x, y, random.between(3, 6));
    }

    for (let i = 0; i < 420; i += 1) {
      drawPatch(
        random.between(70, WORLD_WIDTH - 70),
        random.between(70, WORLD_HEIGHT - 70),
        random.between(1, 3),
      );
    }
  }

  createHud() {
    // The main camera is zoomed, so fixed HUD coordinates need a small inset
    // to remain inside the visible top-left safe area.
    const hudOffsetX = 62;
    const hudOffsetY = 35;
    const panel = this.add
      .rectangle(18 + hudOffsetX, 18 + hudOffsetY, 250, 108, 0x142416, 0.88)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(100);
    panel.setStrokeStyle(3, 0xb7d878);

    for (let i = 0; i < MAX_LIVES; i += 1) {
      this.heartIcons.push(
        this.add
          .image(34 + hudOffsetX + i * 30, 29 + hudOffsetY, "heart-full")
          .setOrigin(0)
          .setScale(1.25)
          .setScrollFactor(0)
          .setDepth(101),
      );
    }

    this.add
      .text(126 + hudOffsetX, 29 + hudOffsetY, "HORSIN' AROUND", {
        fontFamily: '"Courier New", monospace',
        fontSize: "13px",
        fontStyle: "bold",
        color: "#fff4bd",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.gaitText = this.add
      .text(34 + hudOffsetX, 57 + hudOffsetY, "GAIT: STANDING", {
        fontFamily: '"Courier New", monospace',
        fontSize: "13px",
        fontStyle: "bold",
        color: GAITS.idle.color,
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.add
      .rectangle(34 + hudOffsetX, 79 + hudOffsetY, 218, 6, 0x324735, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(101);

    this.gallopBar = this.add
      .rectangle(34 + hudOffsetX, 79 + hudOffsetY, 218, 6, 0xff8a5b, 1)
      .setOrigin(0)
      .setScale(0, 1)
      .setScrollFactor(0)
      .setDepth(102);

    this.gallopText = this.add
      .text(34 + hudOffsetX, 90 + hudOffsetY, "", {
        fontFamily: '"Courier New", monospace',
        fontSize: "9px",
        color: "#a9bd9a",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.updateHearts();
    this.updateGaitHud();
  }

  updateHearts() {
    for (let i = 0; i < this.heartIcons.length; i += 1) {
      this.heartIcons[i].setTexture(i < this.lives ? "heart-full" : "heart-empty");
    }
  }

  updateGaitHud() {
    const gait = GAITS[this.currentGait];
    const progress = Phaser.Math.Clamp(
      this.gallopCharge / GALLOP_CHARGE_MS,
      0,
      1,
    );

    this.gaitText
      .setText(`GAIT: ${gait.label}`)
      .setColor(gait.color);
    this.gallopBar.setScale(progress, 1);

    if (this.currentGait === "gallop") {
      this.gallopText.setText("FULL GALLOP!").setColor(GAITS.gallop.color);
    } else if (this.currentGait === "canter") {
      this.gallopText
        .setText(`GALLOP: ${Math.floor(progress * 100)}%`)
        .setColor(GAITS.canter.color);
    } else {
      this.gallopText.setText("");
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
