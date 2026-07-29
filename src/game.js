const WORLD_WIDTH = 8000;
const WORLD_HEIGHT = 6000;
const START_X = WORLD_WIDTH / 2;
const START_Y = WORLD_HEIGHT / 2;
const MAX_LIVES = 3;
const WORLD_VERSION = 2;
const PROGRESS_SCHEMA_VERSION = 2;
const PROGRESS_STORAGE_KEY = "horsin-around-progress";
const PROGRESS_LEASE_KEY = `${PROGRESS_STORAGE_KEY}:lease`;
const PROGRESS_LEASE_MS = 12000;
const AUTOSAVE_INTERVAL_MS = 5000;
const SPAWN_CLEARANCE = 48;
const CHUNK_SIZE = 1024;
const MINIMAP_REFRESH_MS = 100;
const MINIMAP_WORLD_HALF_WIDTH = 1600;
const HIT_COOLDOWN_MS = 900;
const JUMP_DURATION_MS = 850;
const JUMP_COOLDOWN_MS = 1050;
const JUMP_HEIGHT = 48;
const HORSE_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const GALLOP_CHARGE_MS = 4500;
const TRACK_LOGICAL_WIDTH = 2800;
const TRACK_LOGICAL_HEIGHT = 1100;
const TRACK_SCALE_X = 2;
const TRACK_SCALE_Y = 1.5;
const TRACK_WIDTH = TRACK_LOGICAL_WIDTH * TRACK_SCALE_X;
const TRACK_HEIGHT = TRACK_LOGICAL_HEIGHT * TRACK_SCALE_Y;
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
    dustInterval: 55,
    color: "#ff8a5b",
  },
};

function resolveGaitState({
  isMoving,
  walkHeld,
  runHeld,
  gallopCharge,
  delta,
}) {
  if (!isMoving) {
    return { gait: "idle", gallopCharge: 0 };
  }
  if (walkHeld) {
    return { gait: "walk", gallopCharge: 0 };
  }
  if (runHeld) {
    const nextCharge = Math.min(
      gallopCharge + delta,
      GALLOP_CHARGE_MS,
    );
    return {
      gait: nextCharge >= GALLOP_CHARGE_MS ? "gallop" : "canter",
      gallopCharge: nextCharge,
    };
  }
  return { gait: "trot", gallopCharge: 0 };
}

function resetKeys(keys, names) {
  for (const name of names) {
    keys?.[name]?.reset();
  }
}

function emitHoofDust(scene, direction, gait, delta, depth) {
  if (!gait.dustInterval) return 0;

  const elapsed = scene.dustTimer + delta;
  if (elapsed < gait.dustInterval) return elapsed;

  const isGallop = scene.currentGait === "gallop";
  const particleCount = isGallop ? 3 : 1;
  const perpendicularX = -direction.y;
  const perpendicularY = direction.x;
  const colors = [0xd6c27b, 0xe6cf8a, 0xc9aa67];

  for (let particle = 0; particle < particleCount; particle += 1) {
    const sideOffset = Phaser.Math.Between(
      isGallop ? -15 : -7,
      isGallop ? 15 : 7,
    );
    const trailDistance = Phaser.Math.Between(
      isGallop ? 38 : 34,
      isGallop ? 54 : 44,
    );
    const behindX =
      scene.horse.x -
      direction.x * trailDistance +
      perpendicularX * sideOffset;
    const behindY =
      scene.horse.y -
      direction.y * trailDistance +
      perpendicularY * sideOffset +
      Phaser.Math.Between(22, 32);
    const size = isGallop
      ? Phaser.Math.Between(7, 11)
      : Phaser.Math.Between(4, 6);
    const dust = scene.add
      .rectangle(
        behindX,
        behindY,
        size,
        size,
        Phaser.Math.RND.pick(colors),
        isGallop ? 0.78 : 0.55,
      )
      .setDepth(depth);

    scene.tweens.add({
      targets: dust,
      x:
        behindX -
        direction.x * Phaser.Math.Between(20, 34) +
        perpendicularX * Phaser.Math.Between(-10, 10),
      y:
        behindY -
        direction.y * Phaser.Math.Between(20, 34) -
        Phaser.Math.Between(6, 14),
      alpha: 0,
      scale: isGallop ? Phaser.Math.FloatBetween(2.4, 3.1) : 1.8,
      duration: isGallop
        ? Phaser.Math.Between(420, 560)
        : Phaser.Math.Between(360, 440),
      ease: "Quad.easeOut",
      onComplete: () => dust.destroy(),
    });
  }

  return elapsed % gait.dustInterval;
}

const FACILITIES = [
  {
    id: "stable-main",
    type: "stable",
    name: "MEADOW STABLE",
    sceneKey: "stable-interior",
    texture: "stable-exterior",
    x: START_X + 650,
    y: START_Y + 70,
    entrance: { x: START_X + 650, y: START_Y + 178 },
    returnPosition: { x: START_X + 650, y: START_Y + 238 },
    interiorSpawn: { x: 480, y: 525 },
  },
  {
    id: "horse-hospital",
    type: "hospital",
    name: "HORSE HOSPITAL",
    sceneKey: "hospital-interior",
    texture: "hospital-exterior",
    x: START_X - 680,
    y: START_Y + 90,
    entrance: { x: START_X - 680, y: START_Y + 198 },
    returnPosition: { x: START_X - 680, y: START_Y + 258 },
    interiorSpawn: { x: 480, y: 525 },
  },
  {
    id: "trotting-track",
    type: "track",
    name: "CIRCUS MAXIMUS",
    sceneKey: "track-interior",
    texture: "track-exterior",
    x: START_X,
    y: START_Y - 680,
    entrance: { x: START_X, y: START_Y - 572 },
    returnPosition: { x: START_X, y: START_Y - 512 },
    interiorSpawn: {
      x: 1400 * TRACK_SCALE_X,
      y: 1010 * TRACK_SCALE_Y,
    },
  },
];
const FACILITY_BY_ID = new Map(
  FACILITIES.map((facility) => [facility.id, facility]),
);
const INTERIOR_SCENE_BY_FACILITY = new Map(
  FACILITIES.map((facility) => [facility.id, facility.sceneKey]),
);

class HorseProgress {
  constructor({
    schemaVersion = PROGRESS_SCHEMA_VERSION,
    worldVersion = WORLD_VERSION,
    revision = 0,
    lives = MAX_LIVES,
    location = {
      type: "world",
      id: "meadow",
      position: { x: START_X, y: START_Y },
      entranceId: null,
    },
    records = {},
    updatedAt = null,
  } = {}) {
    this.schemaVersion = schemaVersion;
    this.worldVersion = worldVersion;
    this.revision = revision;
    this.lives = lives;
    this.location = {
      type: location.type,
      id: location.id,
      position: {
        x: location.position.x,
        y: location.position.y,
      },
      entranceId: location.entranceId ?? null,
    };
    this.records = { ...records };
    this.updatedAt = updatedAt;
  }

  static createDefault() {
    return new HorseProgress();
  }

  static fromJSON(value) {
    if (!value || typeof value !== "object") {
      return HorseProgress.createDefault();
    }

    // Version 1 stored position at the root. Keep it loadable.
    const sourceLocation =
      value.location && typeof value.location === "object"
        ? value.location
        : {
            type: "world",
            id: "meadow",
            position: value.position,
            entranceId: null,
          };
    const savedX = Number(sourceLocation.position?.x);
    const savedY = Number(sourceLocation.position?.y);
    const savedLives = Number(value.lives);
    const savedRevision = Number(value.revision);
    const isKnownInterior = INTERIOR_SCENE_BY_FACILITY.has(sourceLocation.id);
    const locationType =
      sourceLocation.type === "interior" && isKnownInterior
        ? "interior"
        : "world";

    return new HorseProgress({
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      worldVersion: Number.isInteger(value.worldVersion)
        ? value.worldVersion
        : WORLD_VERSION,
      revision:
        Number.isInteger(savedRevision) && savedRevision >= 0
          ? savedRevision
          : 0,
      lives:
        Number.isInteger(savedLives) && savedLives > 0
          ? Math.min(savedLives, MAX_LIVES)
          : MAX_LIVES,
      location: {
        type: locationType,
        id: locationType === "interior" ? sourceLocation.id : "meadow",
        position: {
          x: Number.isFinite(savedX) ? savedX : START_X,
          y: Number.isFinite(savedY) ? savedY : START_Y,
        },
        entranceId:
          typeof sourceLocation.entranceId === "string"
            ? sourceLocation.entranceId
            : null,
      },
      records:
        value.records && typeof value.records === "object"
          ? value.records
          : {},
      updatedAt:
        typeof value.updatedAt === "string" ? value.updatedAt : null,
    });
  }

  setLocation(type, id, x, y, entranceId = null) {
    this.location = {
      type,
      id,
      position: {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
      },
      entranceId,
    };
  }

  markSaved() {
    this.revision += 1;
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      worldVersion: this.worldVersion,
      revision: this.revision,
      lives: this.lives,
      location: {
        ...this.location,
        position: { ...this.location.position },
      },
      records: { ...this.records },
      updatedAt: this.updatedAt,
    };
  }
}

function mergeProgressRecords(localRecords = {}, storedRecords = {}) {
  const merged = { ...storedRecords, ...localRecords };
  const keys = new Set([
    ...Object.keys(storedRecords),
    ...Object.keys(localRecords),
  ]);

  for (const key of keys) {
    if (!/best.*ms$/i.test(key)) continue;
    const candidates = [
      Number(storedRecords[key]),
      Number(localRecords[key]),
    ].filter((value) => Number.isFinite(value) && value > 0);
    if (candidates.length > 0) {
      merged[key] = Math.min(...candidates);
    }
  }
  return merged;
}

class LocalProgressStore {
  constructor() {
    this.sessionId =
      globalThis.crypto?.randomUUID?.() ??
      `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.leaseWarningShown = false;
  }

  load() {
    try {
      const saved = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
      return saved
        ? HorseProgress.fromJSON(JSON.parse(saved))
        : HorseProgress.createDefault();
    } catch (error) {
      console.warn("Could not load saved progress.", error);
      return HorseProgress.createDefault();
    }
  }

  tryAcquireLease() {
    const now = Date.now();
    const savedLease = window.localStorage.getItem(PROGRESS_LEASE_KEY);
    if (savedLease) {
      try {
        const lease = JSON.parse(savedLease);
        if (
          lease.sessionId !== this.sessionId &&
          Number(lease.expiresAt) > now
        ) {
          if (!this.leaseWarningShown) {
            console.warn(
              "Progress saving is paused because another game tab is active.",
            );
            this.leaseWarningShown = true;
          }
          return false;
        }
      } catch {
        // A malformed lease is safe to replace.
      }
    }

    const nextLease = {
      sessionId: this.sessionId,
      expiresAt: now + PROGRESS_LEASE_MS,
    };
    window.localStorage.setItem(
      PROGRESS_LEASE_KEY,
      JSON.stringify(nextLease),
    );
    const confirmedValue = window.localStorage.getItem(
      PROGRESS_LEASE_KEY,
    );
    let acquired = false;
    try {
      const confirmedLease = JSON.parse(confirmedValue);
      acquired = confirmedLease.sessionId === this.sessionId;
    } catch {
      acquired = false;
    }
    if (acquired) {
      this.leaseWarningShown = false;
    }
    return acquired;
  }

  releaseLease() {
    try {
      const savedLease = window.localStorage.getItem(PROGRESS_LEASE_KEY);
      if (!savedLease) return;
      const lease = JSON.parse(savedLease);
      if (lease.sessionId === this.sessionId) {
        window.localStorage.removeItem(PROGRESS_LEASE_KEY);
      }
    } catch {
      // The lease expires automatically if storage cannot be accessed.
    }
  }

  save(progress) {
    try {
      if (!this.tryAcquireLease()) return false;

      const storedValue = window.localStorage.getItem(
        PROGRESS_STORAGE_KEY,
      );
      if (storedValue) {
        try {
          const storedProgress = HorseProgress.fromJSON(
            JSON.parse(storedValue),
          );
          progress.revision = Math.max(
            progress.revision,
            storedProgress.revision,
          );
          progress.records = mergeProgressRecords(
            progress.records,
            storedProgress.records,
          );
        } catch {
          console.warn("Replacing invalid saved progress.");
        }
      }

      progress.markSaved();
      window.localStorage.setItem(
        PROGRESS_STORAGE_KEY,
        JSON.stringify(progress),
      );
      return true;
    } catch (error) {
      console.warn("Could not save progress.", error);
      return false;
    }
  }
}

class ProgressScene extends Phaser.Scene {
  constructor(key) {
    super(key);
    this.autosaveElapsed = 0;
    this.pageHideHandler = null;
  }

  get progress() {
    return this.registry.get("progress");
  }

  get progressStore() {
    return this.registry.get("progressStore");
  }

  saveLocation(type, id, x, y, entranceId = null, force = false, delta = 0) {
    this.progress.setLocation(type, id, x, y, entranceId);
    this.progress.worldVersion = WORLD_VERSION;
    this.autosaveElapsed += delta;

    if (force || this.autosaveElapsed >= AUTOSAVE_INTERVAL_MS) {
      this.progressStore.save(this.progress);
      this.autosaveElapsed = 0;
    }
  }

  installPageSave(getLocation) {
    this.pageHideHandler = () => {
      if (!this.sys.isActive()) return;
      const location = getLocation();
      this.saveLocation(
        location.type,
        location.id,
        location.x,
        location.y,
        location.entranceId,
        true,
      );
      this.progressStore.releaseLease();
    };
    window.addEventListener("pagehide", this.pageHideHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("pagehide", this.pageHideHandler);
    });
  }
}

class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
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
    const store = new LocalProgressStore();
    const progress = store.load();
    this.registry.set("progressStore", store);
    this.registry.set("progress", progress);

    if (progress.location.type === "interior") {
      const interiorScene = INTERIOR_SCENE_BY_FACILITY.get(
        progress.location.id,
      );
      if (interiorScene) {
        this.scene.start(interiorScene, {
          facilityId: progress.location.id,
        });
        return;
      }
    }

    this.scene.start("meadow");
  }
}

class MeadowChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.activeChunks = new Map();
    this.currentChunkKey = null;
    this.radius = 1;
    this.wantedChunks = new Set();
    this.pendingChunks = [];
    this.queuedChunks = new Set();
  }

  update(worldX, worldY) {
    const centerX = Math.floor(worldX / CHUNK_SIZE);
    const centerY = Math.floor(worldY / CHUNK_SIZE);
    const centerKey = `${centerX}:${centerY}`;
    if (centerKey === this.currentChunkKey) {
      this.loadNextChunk();
      return;
    }
    this.currentChunkKey = centerKey;

    const wanted = new Set();
    const maximumChunkX = Math.ceil(WORLD_WIDTH / CHUNK_SIZE) - 1;
    const maximumChunkY = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE) - 1;

    for (
      let chunkY = centerY - this.radius;
      chunkY <= centerY + this.radius;
      chunkY += 1
    ) {
      for (
        let chunkX = centerX - this.radius;
        chunkX <= centerX + this.radius;
        chunkX += 1
      ) {
        if (
          chunkX < 0 ||
          chunkY < 0 ||
          chunkX > maximumChunkX ||
          chunkY > maximumChunkY
        ) {
          continue;
        }
        const key = `${chunkX}:${chunkY}`;
        wanted.add(key);
        if (
          !this.activeChunks.has(key) &&
          !this.queuedChunks.has(key)
        ) {
          this.pendingChunks.push({ key, chunkX, chunkY });
          this.queuedChunks.add(key);
        }
      }
    }
    this.wantedChunks = wanted;
    this.pendingChunks.sort((a, b) => {
      const distanceA =
        Math.abs(a.chunkX - centerX) + Math.abs(a.chunkY - centerY);
      const distanceB =
        Math.abs(b.chunkX - centerX) + Math.abs(b.chunkY - centerY);
      return distanceA - distanceB;
    });

    for (const [key, layers] of this.activeChunks) {
      if (wanted.has(key)) continue;
      layers.details.destroy();
      layers.flowers.destroy();
      this.activeChunks.delete(key);
    }

    this.loadNextChunk();
  }

  loadNextChunk() {
    while (this.pendingChunks.length > 0) {
      const pending = this.pendingChunks.shift();
      this.queuedChunks.delete(pending.key);
      if (
        !this.wantedChunks.has(pending.key) ||
        this.activeChunks.has(pending.key)
      ) {
        continue;
      }
      this.activeChunks.set(
        pending.key,
        this.createChunk(pending.chunkX, pending.chunkY),
      );
      return;
    }
  }

  createChunk(chunkX, chunkY) {
    const random = new Phaser.Math.RandomDataGenerator([
      `horsin-chunk:${WORLD_VERSION}:${chunkX}:${chunkY}`,
    ]);
    const originX = chunkX * CHUNK_SIZE;
    const originY = chunkY * CHUNK_SIZE;
    const chunkWidth = Math.min(CHUNK_SIZE, WORLD_WIDTH - originX);
    const chunkHeight = Math.min(CHUNK_SIZE, WORLD_HEIGHT - originY);
    const details = this.scene.add.graphics().setDepth(1);
    const flowers = this.scene.add.graphics().setDepth(2);
    const petalColors = [
      0xffe36e,
      0xf4f0d0,
      0xf28ba8,
      0xa98ee8,
      0x80bde8,
    ];

    for (let i = 0; i < 8; i += 1) {
      const x = originX + random.between(35, chunkWidth - 35);
      const y = originY + random.between(35, chunkHeight - 35);
      const shade = random.pick([0x4b8337, 0x77ad53, 0x538d3c]);
      details.fillStyle(shade, 0.7);
      details.fillRect(x, y, 4, random.pick([4, 8]));
      details.fillRect(x - 4, y + 4, 4, 4);
      details.fillRect(x + 4, y, 4, 4);
    }

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

    for (let patch = 0; patch < 10; patch += 1) {
      const patchX = originX + random.between(35, chunkWidth - 35);
      const patchY = originY + random.between(35, chunkHeight - 35);
      const flowerCount = random.between(1, 3);
      for (let flower = 0; flower < flowerCount; flower += 1) {
        drawFlower(
          patchX + random.between(-18, 18),
          patchY + random.between(-14, 14),
          random.pick(petalColors),
        );
      }
    }

    if (
      START_X >= originX &&
      START_X < originX + chunkWidth &&
      START_Y >= originY &&
      START_Y < originY + chunkHeight
    ) {
      const startingPatches = [
        [-190, -80],
        [160, -110],
        [-130, 150],
        [210, 135],
        [40, 205],
      ];
      for (const [offsetX, offsetY] of startingPatches) {
        for (let flower = 0; flower < 4; flower += 1) {
          drawFlower(
            START_X + offsetX + random.between(-16, 16),
            START_Y + offsetY + random.between(-12, 12),
            random.pick(petalColors),
          );
        }
      }
    }

    return { details, flowers };
  }
}

class MeadowScene extends ProgressScene {
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
    this.structureColliders = null;
    this.facilitySprites = [];
    this.nearbyFacility = null;
    this.entrancePrompt = null;
    this.isTransitioning = false;
    this.chunkManager = null;
    this.dustTimer = 0;
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
    this.minimapGraphics = null;
    this.minimapBounds = null;
    this.minimapElapsed = 0;
  }

  create() {
    this.createGrassTexture();
    this.createObstacleTextures();
    this.createFacilityTextures();
    this.createHeartTextures();
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, "grass")
      .setOrigin(0);

    this.createWorldBorder();
    this.createObstacles();
    this.createFacilities();

    this.physics.world.setBounds(24, 24, WORLD_WIDTH - 48, WORLD_HEIGHT - 48);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#5c963f");

    const savedPosition =
      this.progress.location.type === "world"
        ? this.progress.location.position
        : { x: START_X, y: START_Y };
    const spawn = this.findSafeWorldSpawn(savedPosition);
    this.progress.setLocation("world", "meadow", spawn.x, spawn.y);
    this.progress.worldVersion = WORLD_VERSION;

    this.horseShadow = this.add
      .ellipse(
        spawn.x,
        spawn.y + 30,
        54,
        16,
        0x1b2b18,
        0.25,
      )
      .setDepth(9);

    this.horse = this.physics.add
      .sprite(spawn.x, spawn.y, "horse-n-idle")
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
    this.physics.add.collider(this.horse, this.structureColliders);

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
      enter: Phaser.Input.Keyboard.KeyCodes.E,
    });

    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.V,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.E,
    ]);

    this.entrancePrompt = this.add
      .text(0, 0, "", {
        fontFamily: '"Courier New", monospace',
        fontSize: "12px",
        fontStyle: "bold",
        color: "#fff4bd",
        backgroundColor: "#142416",
        padding: { x: 6, y: 4 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);

    this.chunkManager = new MeadowChunkManager(this);
    this.chunkManager.update(this.horse.x, this.horse.y);
    this.createHud();
    this.installPageSave(() => ({
      type: "world",
      id: "meadow",
      x: this.horse.x,
      y: this.horse.y,
      entranceId: null,
    }));
    this.progressStore.save(this.progress);
  }

  update(time, delta) {
    if (this.isTransitioning) {
      this.horse.setVelocity(0, 0);
      return;
    }

    this.updateWorldSystems(delta);
    if (
      this.nearbyFacility &&
      !this.isJumping &&
      Phaser.Input.Keyboard.JustDown(this.keys.enter)
    ) {
      this.enterFacility(this.nearbyFacility);
      return;
    }

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

  updateWorldSystems(delta) {
    this.chunkManager?.update(this.horse.x, this.horse.y);
    this.updateMinimap(delta);
    this.saveLocation(
      "world",
      "meadow",
      this.horse.x,
      this.horse.y,
      null,
      false,
      delta,
    );

    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const facility of FACILITIES) {
      const distance = Phaser.Math.Distance.Between(
        this.horse.x,
        this.horse.y,
        facility.entrance.x,
        facility.entrance.y,
      );
      if (distance < 115 && distance < closestDistance) {
        closest = facility;
        closestDistance = distance;
      }
    }

    this.nearbyFacility = closest;
    if (closest) {
      this.entrancePrompt
        .setText(`E  ENTER ${closest.name}`)
        .setPosition(closest.entrance.x, closest.entrance.y - 52)
        .setVisible(true);
    } else {
      this.entrancePrompt.setVisible(false);
    }
  }

  enterFacility(facility) {
    this.isTransitioning = true;
    this.horse.setVelocity(0, 0);
    this.entrancePrompt.setVisible(false);
    this.progress.setLocation(
      "interior",
      facility.id,
      facility.interiorSpawn.x,
      facility.interiorSpawn.y,
      "front-door",
    );
    this.progressStore.save(this.progress);
    this.cameras.main.fadeOut(240, 20, 36, 22);

    this.time.delayedCall(250, () => {
      const interior = this.scene.get(facility.sceneKey);
      if (interior.sys.isSleeping()) {
        interior.prepareForEntry();
      }
      this.scene.switch(facility.sceneKey, {
        facilityId: facility.id,
      });
    });
  }

  prepareReturnFromFacility(facility) {
    const returnPosition = this.findSafeWorldSpawn(
      facility.returnPosition,
    );
    this.progress.setLocation(
      "world",
      "meadow",
      returnPosition.x,
      returnPosition.y,
      facility.id,
    );
    this.horse.body.reset(returnPosition.x, returnPosition.y);
    this.horse.setVelocity(0, 0);
    this.horse.setTexture("horse-s-idle");
    this.horse.setDisplayOrigin(64, 64);
    this.horse.setScale(1);
    this.horse.clearTint();
    this.currentFacing = "s";
    this.currentGait = "idle";
    this.gallopCharge = 0;
    this.movementFrame = 0;
    this.animationAccumulator = 0;
    this.dustTimer = 0;
    this.knockbackUntil = 0;
    this.isJumping = false;
    this.isTransitioning = false;
    this.nearbyFacility = null;
    this.entrancePrompt.setVisible(false);
    this.setHorseCollider("s");
    resetKeys(this.keys, [
      "up",
      "left",
      "down",
      "right",
      "walk",
      "run",
      "jump",
      "enter",
    ]);
    this.horseShadow.setPosition(
      returnPosition.x,
      returnPosition.y + 31,
    );
    this.chunkManager.update(returnPosition.x, returnPosition.y);
    this.updateHearts();
    this.updateGaitHud();
    this.updateMinimap(0, true);
    this.cameras.main.fadeIn(180, 20, 36, 22);
  }

  isWorldPositionSafe(x, y) {
    if (
      x < 24 + SPAWN_CLEARANCE ||
      x > WORLD_WIDTH - 24 - SPAWN_CLEARANCE ||
      y < 24 + SPAWN_CLEARANCE ||
      y > WORLD_HEIGHT - 24 - SPAWN_CLEARANCE
    ) {
      return false;
    }

    const collisionGroups = [this.obstacles, this.structureColliders];
    for (const group of collisionGroups) {
      for (const obstacle of group.getChildren()) {
        const body = obstacle.body;
        if (
          x + SPAWN_CLEARANCE > body.left &&
          x - SPAWN_CLEARANCE < body.right &&
          y + SPAWN_CLEARANCE > body.top &&
          y - SPAWN_CLEARANCE < body.bottom
        ) {
          return false;
        }
      }
    }

    return true;
  }

  findSafeWorldSpawn(savedPosition) {
    const requestedX = Number.isFinite(savedPosition?.x)
      ? savedPosition.x
      : START_X;
    const requestedY = Number.isFinite(savedPosition?.y)
      ? savedPosition.y
      : START_Y;
    const origin = {
      x: Phaser.Math.Clamp(
        requestedX,
        24 + SPAWN_CLEARANCE,
        WORLD_WIDTH - 24 - SPAWN_CLEARANCE,
      ),
      y: Phaser.Math.Clamp(
        requestedY,
        24 + SPAWN_CLEARANCE,
        WORLD_HEIGHT - 24 - SPAWN_CLEARANCE,
      ),
    };

    if (this.isWorldPositionSafe(origin.x, origin.y)) return origin;

    const nearby = this.searchForSafeWorldPosition(origin);
    if (nearby) return nearby;

    const fallback = { x: START_X, y: START_Y };
    return this.isWorldPositionSafe(fallback.x, fallback.y)
      ? fallback
      : this.searchForSafeWorldPosition(fallback, 2048) ?? fallback;
  }

  searchForSafeWorldPosition(origin, maximumRadius = 1024) {
    const step = 64;
    for (let radius = step; radius <= maximumRadius; radius += step) {
      for (let offset = -radius; offset <= radius; offset += step) {
        const candidates = [
          { x: origin.x + offset, y: origin.y - radius },
          { x: origin.x + offset, y: origin.y + radius },
          { x: origin.x - radius, y: origin.y + offset },
          { x: origin.x + radius, y: origin.y + offset },
        ];
        for (const candidate of candidates) {
          if (this.isWorldPositionSafe(candidate.x, candidate.y)) {
            return candidate;
          }
        }
      }
    }
    return null;
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
    this.progress.lives -= damage;
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

    if (this.progress.lives <= 0) {
      this.resetHorse();
    } else {
      this.progressStore.save(this.progress);
    }
  }

  resetHorse() {
    const resetPosition = this.findSafeWorldSpawn({
      x: START_X,
      y: START_Y,
    });
    this.progress.lives = MAX_LIVES;
    this.progress.setLocation(
      "world",
      "meadow",
      resetPosition.x,
      resetPosition.y,
    );
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
    this.horse.body.reset(resetPosition.x, resetPosition.y);
    this.horse.setTexture("horse-n-idle");
    this.horse.setDisplayOrigin(64, 64);
    this.horse.setScale(1);
    this.horse.setAngle(0);
    this.horse.clearTint();
    this.setHorseCollider("n");
    this.horseShadow.setPosition(
      resetPosition.x,
      resetPosition.y + 31,
    );
    this.updateHearts();
    this.showCollisionMessage("BACK TO THE PADDOCK!", "#fff4bd");
    this.cameras.main.flash(220, 255, 244, 189, false);
    this.updateGaitHud();
    this.progressStore.save(this.progress);
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

    this.dustTimer = emitHoofDust(this, direction, gait, delta, 8);
  }

  getCurrentGait(delta) {
    const state = resolveGaitState({
      isMoving: true,
      walkHeld: this.keys.walk.isDown,
      runHeld: this.keys.run.isDown,
      gallopCharge: this.gallopCharge,
      delta,
    });
    this.gallopCharge = state.gallopCharge;
    return state.gait;
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
    if (
      this.textures.exists("puddle") &&
      this.textures.exists("fence-horizontal") &&
      this.textures.exists("fence-vertical")
    ) {
      return;
    }

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

  createFacilityTextures() {
    if (!this.textures.exists("stable-exterior")) {
      const stable = this.make.graphics({ x: 0, y: 0, add: false });
      stable.fillStyle(0x25301f, 0.35);
      stable.fillRect(12, 166, 232, 18);
      stable.fillStyle(0x56331e);
      stable.fillRect(20, 58, 216, 112);
      stable.fillStyle(0x9b4d2a);
      stable.fillRect(30, 70, 196, 92);
      stable.fillStyle(0x3b2419);
      stable.fillTriangle(8, 62, 128, 4, 248, 62);
      stable.fillStyle(0x71361f);
      stable.fillTriangle(24, 62, 128, 16, 232, 62);
      stable.fillStyle(0x2e2118);
      stable.fillRect(102, 112, 52, 58);
      stable.fillStyle(0xd6a35b);
      stable.fillRect(108, 118, 17, 46);
      stable.fillRect(131, 118, 17, 46);
      stable.fillStyle(0xf4d58a);
      stable.fillRect(50, 88, 30, 26);
      stable.fillRect(176, 88, 30, 26);
      stable.generateTexture("stable-exterior", 256, 192);
      stable.destroy();
    }

    if (!this.textures.exists("hospital-exterior")) {
      const hospital = this.make.graphics({ x: 0, y: 0, add: false });
      hospital.fillStyle(0x25301f, 0.35);
      hospital.fillRect(12, 166, 232, 18);
      hospital.fillStyle(0xd8d6c5);
      hospital.fillRect(20, 52, 216, 118);
      hospital.fillStyle(0xf2eed8);
      hospital.fillRect(30, 62, 196, 100);
      hospital.fillStyle(0x3d5961);
      hospital.fillRect(10, 42, 236, 20);
      hospital.fillStyle(0x31505b);
      hospital.fillRect(20, 32, 216, 14);
      hospital.fillStyle(0x3a3b35);
      hospital.fillRect(104, 112, 48, 58);
      hospital.fillStyle(0x8dc2c8);
      hospital.fillRect(110, 118, 16, 46);
      hospital.fillRect(130, 118, 16, 46);
      hospital.fillStyle(0xd74747);
      hospital.fillRect(116, 70, 24, 58);
      hospital.fillRect(99, 87, 58, 24);
      hospital.generateTexture("hospital-exterior", 256, 192);
      hospital.destroy();
    }

    if (!this.textures.exists("track-exterior")) {
      const track = this.make.graphics({ x: 0, y: 0, add: false });
      track.fillStyle(0x25301f, 0.35);
      track.fillRect(10, 164, 300, 18);
      track.fillStyle(0x5b3b2a);
      track.fillRect(18, 68, 284, 104);
      track.fillStyle(0xc9a36b);
      track.fillRect(26, 62, 268, 104);
      track.fillStyle(0xe0bf82);
      track.fillTriangle(34, 62, 160, 10, 286, 62);
      track.fillStyle(0x8e2f2e);
      track.fillTriangle(58, 58, 160, 22, 262, 58);
      track.fillStyle(0x6d4930);
      track.fillRect(20, 60, 280, 12);
      track.fillRect(20, 156, 280, 14);

      for (const x of [44, 94, 226, 276]) {
        track.fillStyle(0x795338);
        track.fillRect(x - 8, 72, 20, 84);
        track.fillStyle(0xe4c58e);
        track.fillRect(x - 4, 72, 12, 84);
        track.fillRect(x - 8, 72, 20, 8);
        track.fillRect(x - 8, 148, 20, 8);
      }

      track.fillStyle(0x563326);
      track.fillCircle(160, 112, 38);
      track.fillRect(122, 112, 76, 52);
      track.fillStyle(0x241c19);
      track.fillCircle(160, 116, 28);
      track.fillRect(132, 116, 56, 50);
      track.fillStyle(0xb33a35);
      track.fillRect(68, 84, 18, 44);
      track.fillRect(234, 84, 18, 44);
      track.fillStyle(0xe8c36e);
      track.fillRect(72, 88, 10, 8);
      track.fillRect(238, 88, 10, 8);
      track.generateTexture("track-exterior", 320, 192);
      track.destroy();
    }
  }

  createFacilities() {
    this.structureColliders = this.physics.add.staticGroup();

    for (const facility of FACILITIES) {
      const structure = this.structureColliders
        .create(facility.x, facility.y, facility.texture)
        .setDepth(8);
      if (facility.type === "track") {
        structure.body.setSize(286, 120);
      } else {
        structure.body.setSize(226, 142);
      }
      structure.body.updateFromGameObject();
      this.facilitySprites.push(structure);

      this.add
        .text(facility.x, facility.y - 116, facility.name, {
          fontFamily: '"Courier New", monospace',
          fontSize: "12px",
          fontStyle: "bold",
          color: "#fff4bd",
          backgroundColor: "#273b25",
          padding: { x: 5, y: 3 },
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(9);
    }
  }

  createFenceTexture(key, vertical) {
    if (this.textures.exists(key)) return;

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
    if (
      this.textures.exists("heart-full") &&
      this.textures.exists("heart-empty")
    ) {
      return;
    }

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
    if (this.textures.exists("grass")) return;

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

  createWorldBorder() {
    const detail = this.add.graphics();
    detail.setDepth(1);

    detail.lineStyle(16, 0x3e7132, 1);
    detail.strokeRect(8, 8, WORLD_WIDTH - 16, WORLD_HEIGHT - 16);
    detail.lineStyle(4, 0x82b85d, 1);
    detail.strokeRect(20, 20, WORLD_WIDTH - 40, WORLD_HEIGHT - 40);
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

    this.createMinimap(hudOffsetX, hudOffsetY);
    this.updateHearts();
    this.updateGaitHud();
    this.updateMinimap(0, true);
  }

  createMinimap(hudOffsetX, hudOffsetY) {
    const panelWidth = 180;
    const panelHeight = 140;
    const panelX = 960 - hudOffsetX - panelWidth;
    const panelY = 540 - hudOffsetY - panelHeight;
    const mapX = panelX + 8;
    const mapY = panelY + 8;
    const mapWidth = panelWidth - 16;
    const mapHeight = panelHeight - 16;

    this.minimapBounds = {
      x: mapX,
      y: mapY,
      width: mapWidth,
      height: mapHeight,
      centerX: mapX + mapWidth / 2,
      centerY: mapY + mapHeight / 2,
    };

    this.add
      .rectangle(
        panelX,
        panelY,
        panelWidth,
        panelHeight,
        0x142416,
        0.9,
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(100)
      .setStrokeStyle(3, 0xb7d878);

    this.add
      .rectangle(mapX, mapY, mapWidth, mapHeight, 0x315d32, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(101)
      .setStrokeStyle(1, 0x7aa85c);

    const grid = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(101);
    grid.lineStyle(1, 0x6f9854, 0.22);
    grid.lineBetween(
      this.minimapBounds.centerX,
      mapY + 1,
      this.minimapBounds.centerX,
      mapY + mapHeight - 1,
    );
    grid.lineBetween(
      mapX + 1,
      this.minimapBounds.centerY,
      mapX + mapWidth - 1,
      this.minimapBounds.centerY,
    );

    this.minimapGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(102);
  }

  updateMinimap(delta = 0, force = false) {
    if (!this.minimapGraphics || !this.minimapBounds || !this.horse) {
      return;
    }

    this.minimapElapsed += delta;
    if (!force && this.minimapElapsed < MINIMAP_REFRESH_MS) return;
    this.minimapElapsed = 0;

    const bounds = this.minimapBounds;
    const halfHeight =
      MINIMAP_WORLD_HALF_WIDTH * (bounds.height / bounds.width);
    const scaleX = bounds.width / (MINIMAP_WORLD_HALF_WIDTH * 2);
    const scaleY = bounds.height / (halfHeight * 2);
    const graphics = this.minimapGraphics;
    graphics.clear();

    for (const obstacle of this.obstacles.getChildren()) {
      const offsetX = obstacle.x - this.horse.x;
      const offsetY = obstacle.y - this.horse.y;
      if (
        Math.abs(offsetX) > MINIMAP_WORLD_HALF_WIDTH ||
        Math.abs(offsetY) > halfHeight
      ) {
        continue;
      }

      const markerX = bounds.centerX + offsetX * scaleX;
      const markerY = bounds.centerY + offsetY * scaleY;
      const isPuddle = obstacle.texture.key === "puddle";
      graphics.fillStyle(isPuddle ? 0x64b5cf : 0xc98742, 0.9);
      if (isPuddle) {
        graphics.fillRect(markerX - 2, markerY - 1, 4, 2);
      } else {
        graphics.fillRect(markerX - 1.5, markerY - 1.5, 3, 3);
      }
    }

    const markerPadding = 8;
    for (const facility of FACILITIES) {
      const offsetX = facility.entrance.x - this.horse.x;
      const offsetY = facility.entrance.y - this.horse.y;
      const unclampedX = bounds.centerX + offsetX * scaleX;
      const unclampedY = bounds.centerY + offsetY * scaleY;
      const markerX = Phaser.Math.Clamp(
        unclampedX,
        bounds.x + markerPadding,
        bounds.x + bounds.width - markerPadding,
      );
      const markerY = Phaser.Math.Clamp(
        unclampedY,
        bounds.y + markerPadding,
        bounds.y + bounds.height - markerPadding,
      );

      if (facility.type === "stable") {
        graphics.fillStyle(0xffd06a, 1);
        graphics.fillRect(markerX - 4, markerY - 4, 8, 8);
        graphics.fillStyle(0x60401f, 1);
        graphics.fillRect(markerX - 1, markerY - 1, 3, 3);
      } else if (facility.type === "hospital") {
        graphics.fillStyle(0xff8291, 1);
        graphics.fillRect(markerX - 4, markerY - 1.5, 8, 3);
        graphics.fillRect(markerX - 1.5, markerY - 4, 3, 8);
      } else {
        graphics.lineStyle(2, 0x79d8ff, 1);
        graphics.strokeCircle(markerX, markerY, 4);
      }
    }

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(bounds.centerX - 3, bounds.centerY - 1, 7, 3);
    graphics.fillRect(bounds.centerX - 1, bounds.centerY - 3, 3, 7);
    graphics.fillStyle(0x3b1f21, 1);
    graphics.fillRect(bounds.centerX, bounds.centerY, 1, 1);
  }

  updateHearts() {
    for (let i = 0; i < this.heartIcons.length; i += 1) {
      this.heartIcons[i].setTexture(
        i < this.progress.lives ? "heart-full" : "heart-empty",
      );
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

class BaseInteriorScene extends ProgressScene {
  constructor(key, facilityId, width = 960, height = 640) {
    super(key);
    this.facilityId = facilityId;
    this.interiorWidth = width;
    this.interiorHeight = height;
    this.facility = null;
    this.horse = null;
    this.horseShadow = null;
    this.wallGroup = null;
    this.keys = null;
    this.currentFacing = "n";
    this.currentGait = "idle";
    this.gallopCharge = 0;
    this.movementFrame = 0;
    this.animationAccumulator = 0;
    this.dustTimer = 0;
    this.exitPoint = { x: width / 2, y: height - 44 };
    this.exitPrompt = null;
    this.isTransitioning = false;
  }

  init(data) {
    this.facilityId = data?.facilityId ?? this.facilityId;
  }

  create() {
    this.facility = FACILITY_BY_ID.get(this.facilityId);
    if (!this.facility) {
      this.scene.start("meadow");
      return;
    }

    this.createCollisionTexture();
    this.wallGroup = this.physics.add.staticGroup();
    this.buildInterior();
    this.createBoundaryWalls();

    const savedPosition =
      this.progress.location.type === "interior" &&
      this.progress.location.id === this.facility.id
        ? this.progress.location.position
        : this.facility.interiorSpawn;
    const spawn = this.findSafeInteriorSpawn(savedPosition);
    this.progress.setLocation(
      "interior",
      this.facility.id,
      spawn.x,
      spawn.y,
      "front-door",
    );

    this.horseShadow = this.add
      .ellipse(spawn.x, spawn.y + 30, 54, 16, 0x151b14, 0.28)
      .setDepth(19);
    this.horse = this.physics.add
      .sprite(spawn.x, spawn.y, "horse-n-idle")
      .setDepth(20)
      .setCollideWorldBounds(true);
    this.physics.world.setBounds(
      24,
      24,
      this.interiorWidth - 48,
      this.interiorHeight - 48,
    );
    this.physics.add.collider(this.horse, this.wallGroup);
    this.setHorseCollider("n");

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      walk: Phaser.Input.Keyboard.KeyCodes.V,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      exit: Phaser.Input.Keyboard.KeyCodes.E,
    });
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.V,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      Phaser.Input.Keyboard.KeyCodes.E,
    ]);

    this.exitPrompt = this.add
      .text(this.exitPoint.x, this.exitPoint.y - 48, "E  RETURN TO MEADOW", {
        fontFamily: '"Courier New", monospace',
        fontSize: "12px",
        fontStyle: "bold",
        color: "#fff4bd",
        backgroundColor: "#142416",
        padding: { x: 6, y: 4 },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);

    this.add
      .text(18, 18, this.facility.name, {
        fontFamily: '"Courier New", monospace',
        fontSize: "16px",
        fontStyle: "bold",
        color: "#fff4bd",
        backgroundColor: "#142416",
        padding: { x: 8, y: 5 },
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.cameras.main.setBounds(
      0,
      0,
      this.interiorWidth,
      this.interiorHeight,
    );
    this.cameras.main.startFollow(this.horse, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor("#182418");
    this.cameras.main.fadeIn(220, 20, 36, 22);

    this.onFacilityEntered();
    this.progressStore.save(this.progress);
    this.installPageSave(() => ({
      type: "interior",
      id: this.facility.id,
      x: this.horse.x,
      y: this.horse.y,
      entranceId: "front-door",
    }));
  }

  prepareForEntry() {
    const spawn = this.findSafeInteriorSpawn(
      this.progress.location.position,
    );
    this.progress.setLocation(
      "interior",
      this.facility.id,
      spawn.x,
      spawn.y,
      "front-door",
    );
    this.horse.body.reset(spawn.x, spawn.y);
    this.horse.setVelocity(0, 0);
    this.horse.setTexture("horse-n-idle");
    this.horse.setDisplayOrigin(64, 64);
    this.horse.setScale(1);
    this.currentFacing = "n";
    this.currentGait = "idle";
    this.gallopCharge = 0;
    this.movementFrame = 0;
    this.animationAccumulator = 0;
    this.dustTimer = 0;
    this.setHorseCollider("n");
    this.horseShadow.setPosition(spawn.x, spawn.y + 31);
    this.exitPrompt.setVisible(false);
    resetKeys(this.keys, [
      "up",
      "left",
      "down",
      "right",
      "walk",
      "run",
      "exit",
    ]);
    this.isTransitioning = false;
    this.onFacilityEntered();
    this.progressStore.save(this.progress);
    this.cameras.main.fadeIn(180, 20, 36, 22);
  }

  update(time, delta) {
    if (this.isTransitioning || !this.horse) return;

    const horizontal =
      Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical =
      Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const direction = new Phaser.Math.Vector2(horizontal, vertical);
    const isMoving = direction.lengthSq() > 0;
    const gaitState = resolveGaitState({
      isMoving,
      walkHeld: this.keys.walk.isDown,
      runHeld: this.keys.run.isDown,
      gallopCharge: this.gallopCharge,
      delta,
    });
    this.currentGait = gaitState.gait;
    this.gallopCharge = gaitState.gallopCharge;

    if (isMoving) {
      const gait = GAITS[this.currentGait];
      direction.normalize();
      this.horse.setVelocity(
        direction.x * gait.speed,
        direction.y * gait.speed,
      );
      this.currentFacing = this.getFacingDirection(horizontal, vertical);
      this.setHorseCollider(this.currentFacing);
      this.animationAccumulator += delta;
      const frameDuration = 1000 / gait.animationFps;
      while (this.animationAccumulator >= frameDuration) {
        this.animationAccumulator -= frameDuration;
        this.movementFrame = (this.movementFrame + 1) % 4;
      }
      this.horse.setTexture(
        `horse-${this.currentFacing}-walk-${this.movementFrame}`,
      );
      this.emitDust(direction, gait, delta);
    } else {
      this.horse.setVelocity(0, 0);
      this.movementFrame = 0;
      this.animationAccumulator = 0;
      this.dustTimer = 0;
      this.horse.setTexture(`horse-${this.currentFacing}-idle`);
    }

    this.horseShadow.setPosition(this.horse.x, this.horse.y + 31);
    const nearExit =
      Phaser.Math.Distance.Between(
        this.horse.x,
        this.horse.y,
        this.exitPoint.x,
        this.exitPoint.y,
      ) < 92;
    this.exitPrompt.setVisible(nearExit);

    if (
      nearExit &&
      Phaser.Input.Keyboard.JustDown(this.keys.exit)
    ) {
      this.exitFacility();
      return;
    }

    this.saveLocation(
      "interior",
      this.facility.id,
      this.horse.x,
      this.horse.y,
      "front-door",
      false,
      delta,
    );
    this.updateFacility(time, delta);
  }

  createCollisionTexture() {
    if (this.textures.exists("interior-collision")) return;
    const pixel = this.make.graphics({ x: 0, y: 0, add: false });
    pixel.fillStyle(0xffffff);
    pixel.fillRect(0, 0, 4, 4);
    pixel.generateTexture("interior-collision", 4, 4);
    pixel.destroy();
  }

  addCollisionRect(x, y, width, height) {
    return this.wallGroup
      .create(x, y, "interior-collision")
      .setDisplaySize(width, height)
      .setVisible(false)
      .refreshBody();
  }

  createBoundaryWalls() {
    const thickness = 28;
    this.addCollisionRect(
      this.interiorWidth / 2,
      thickness / 2,
      this.interiorWidth,
      thickness,
    );
    this.addCollisionRect(
      this.interiorWidth / 2,
      this.interiorHeight - thickness / 2,
      this.interiorWidth,
      thickness,
    );
    this.addCollisionRect(
      thickness / 2,
      this.interiorHeight / 2,
      thickness,
      this.interiorHeight,
    );
    this.addCollisionRect(
      this.interiorWidth - thickness / 2,
      this.interiorHeight / 2,
      thickness,
      this.interiorHeight,
    );
  }

  isInteriorPositionSafe(x, y) {
    if (
      x < 24 + SPAWN_CLEARANCE ||
      x > this.interiorWidth - 24 - SPAWN_CLEARANCE ||
      y < 24 + SPAWN_CLEARANCE ||
      y > this.interiorHeight - 24 - SPAWN_CLEARANCE
    ) {
      return false;
    }

    for (const wall of this.wallGroup.getChildren()) {
      const body = wall.body;
      if (
        x + SPAWN_CLEARANCE > body.left &&
        x - SPAWN_CLEARANCE < body.right &&
        y + SPAWN_CLEARANCE > body.top &&
        y - SPAWN_CLEARANCE < body.bottom
      ) {
        return false;
      }
    }
    return true;
  }

  findSafeInteriorSpawn(savedPosition) {
    const origin = {
      x: Phaser.Math.Clamp(
        Number.isFinite(savedPosition?.x)
          ? savedPosition.x
          : this.facility.interiorSpawn.x,
        24 + SPAWN_CLEARANCE,
        this.interiorWidth - 24 - SPAWN_CLEARANCE,
      ),
      y: Phaser.Math.Clamp(
        Number.isFinite(savedPosition?.y)
          ? savedPosition.y
          : this.facility.interiorSpawn.y,
        24 + SPAWN_CLEARANCE,
        this.interiorHeight - 24 - SPAWN_CLEARANCE,
      ),
    };
    if (this.isInteriorPositionSafe(origin.x, origin.y)) return origin;

    for (let radius = 64; radius <= 768; radius += 64) {
      for (let offset = -radius; offset <= radius; offset += 64) {
        const candidates = [
          { x: origin.x + offset, y: origin.y - radius },
          { x: origin.x + offset, y: origin.y + radius },
          { x: origin.x - radius, y: origin.y + offset },
          { x: origin.x + radius, y: origin.y + offset },
        ];
        for (const candidate of candidates) {
          if (this.isInteriorPositionSafe(candidate.x, candidate.y)) {
            return candidate;
          }
        }
      }
    }

    return { ...this.facility.interiorSpawn };
  }

  exitFacility() {
    this.isTransitioning = true;
    this.horse.setVelocity(0, 0);
    const returnPosition = this.facility.returnPosition;
    this.progress.setLocation(
      "world",
      "meadow",
      returnPosition.x,
      returnPosition.y,
      this.facility.id,
    );
    this.progressStore.save(this.progress);
    this.cameras.main.fadeOut(220, 20, 36, 22);
    this.time.delayedCall(230, () => {
      const meadow = this.scene.get("meadow");
      if (meadow.sys.isSleeping()) {
        meadow.prepareReturnFromFacility(this.facility);
      }
      this.scene.switch("meadow", {
        returnFromFacility: this.facility.id,
      });
    });
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
    } else if (facing.length === 2) {
      this.horse.body.setSize(66, 66);
      this.horse.body.setOffset(31, 31);
    } else {
      this.horse.body.setSize(38, 84);
      this.horse.body.setOffset(45, 22);
    }
  }

  buildInterior() {}

  onFacilityEntered() {}

  emitDust() {}

  updateFacility() {}
}

class StableInteriorScene extends BaseInteriorScene {
  constructor() {
    super("stable-interior", "stable-main");
  }

  buildInterior() {
    this.exitPoint = { x: 480, y: 590 };
    const room = this.add.graphics().setDepth(0);
    room.fillStyle(0x50351f);
    room.fillRect(0, 0, this.interiorWidth, this.interiorHeight);
    room.fillStyle(0x73502b);
    room.fillRect(28, 28, this.interiorWidth - 56, this.interiorHeight - 56);
    room.lineStyle(3, 0x5f4024, 1);
    for (let y = 42; y < this.interiorHeight - 28; y += 28) {
      room.lineBetween(28, y, this.interiorWidth - 28, y);
    }

    room.fillStyle(0x342419);
    for (const x of [170, 790]) {
      room.fillRect(x - 110, 80, 220, 300);
      room.fillStyle(0x9b6931);
      room.fillRect(x - 96, 94, 192, 272);
      room.fillStyle(0x342419);
      for (let y = 126; y < 360; y += 70) {
        room.fillRect(x - 96, y, 192, 10);
      }
      this.addCollisionRect(x, 230, 220, 300);
    }

    room.fillStyle(0xd5ac54);
    room.fillRect(398, 102, 164, 74);
    room.fillStyle(0xf0cd73);
    room.fillRect(412, 114, 136, 50);
    this.addCollisionRect(480, 139, 164, 74);

    room.fillStyle(0x2d2017);
    room.fillRect(420, 600, 120, 40);
  }
}

class HospitalInteriorScene extends BaseInteriorScene {
  constructor() {
    super("hospital-interior", "horse-hospital");
    this.serviceMessage = null;
  }

  buildInterior() {
    this.exitPoint = { x: 480, y: 590 };
    const room = this.add.graphics().setDepth(0);
    room.fillStyle(0x9ba7a0);
    room.fillRect(0, 0, this.interiorWidth, this.interiorHeight);
    const tileSize = 32;
    for (let y = 28; y < this.interiorHeight - 28; y += tileSize) {
      for (let x = 28; x < this.interiorWidth - 28; x += tileSize) {
        room.fillStyle(
          ((x + y) / tileSize) % 2 === 0 ? 0xe7e5d5 : 0xc9d7d0,
        );
        room.fillRect(x, y, tileSize, tileSize);
      }
    }

    const beds = [
      [170, 160],
      [170, 340],
      [790, 160],
      [790, 340],
    ];
    for (const [x, y] of beds) {
      room.fillStyle(0x3f5963);
      room.fillRect(x - 76, y - 42, 152, 84);
      room.fillStyle(0xf2eed8);
      room.fillRect(x - 66, y - 32, 132, 64);
      room.fillStyle(0x8dc2c8);
      room.fillRect(x - 58, y - 24, 46, 48);
      this.addCollisionRect(x, y, 152, 84);
    }

    room.fillStyle(0xd74747);
    room.fillRect(456, 84, 48, 116);
    room.fillRect(422, 118, 116, 48);
    room.fillStyle(0x324047);
    room.fillRect(360, 232, 240, 58);
    this.addCollisionRect(480, 261, 240, 58);
    room.fillStyle(0x2d3432);
    room.fillRect(420, 600, 120, 40);
  }

  onFacilityEntered() {
    const wasHurt = this.progress.lives < MAX_LIVES;
    this.progress.lives = MAX_LIVES;
    this.progressStore.save(this.progress);
    this.serviceMessage?.destroy();
    this.serviceMessage = this.add
      .text(
        this.interiorWidth / 2,
        330,
        wasHurt ? "ALL HEARTS RESTORED!" : "YOUR HORSE IS HEALTHY!",
        {
          fontFamily: '"Courier New", monospace',
          fontSize: "15px",
          fontStyle: "bold",
          color: "#d9efb0",
          backgroundColor: "#29433a",
          padding: { x: 8, y: 5 },
          resolution: 2,
        },
      )
      .setOrigin(0.5)
      .setDepth(50);
  }
}

class TrackInteriorScene extends BaseInteriorScene {
  constructor() {
    super("track-interior", "trotting-track", TRACK_WIDTH, TRACK_HEIGHT);
    this.checkpoints = [];
    this.nextCheckpoint = 0;
    this.lapStartedAt = null;
    this.trackStatus = null;
    this.arenaGaitText = null;
    this.arenaSpeedText = null;
    this.arenaChargeText = null;
    this.arenaSpeedBar = null;
  }

  buildInterior() {
    const centerX = TRACK_LOGICAL_WIDTH / 2;
    const centerY = 520;
    const worldX = (x) => x * TRACK_SCALE_X;
    const worldY = (y) => y * TRACK_SCALE_Y;
    this.exitPoint = { x: worldX(centerX), y: worldY(1040) };
    const track = this.add
      .graphics()
      .setScale(TRACK_SCALE_X, TRACK_SCALE_Y)
      .setDepth(0);

    // Deep stone ground behind the arena.
    track.fillStyle(0x50372a);
    track.fillRect(0, 0, TRACK_LOGICAL_WIDTH, TRACK_LOGICAL_HEIGHT);

    // Tiered stone stands around the racing sand.
    track.lineStyle(250, 0x8c6947, 1);
    track.strokeEllipse(centerX, centerY, 2570, 920);
    track.lineStyle(205, 0xc29a63, 1);
    track.strokeEllipse(centerX, centerY, 2570, 920);
    track.lineStyle(14, 0x6f4933, 1);
    track.strokeEllipse(centerX, centerY, 2580, 930);
    track.lineStyle(10, 0xe0bd80, 0.85);
    track.strokeEllipse(centerX, centerY, 2400, 770);

    // Long oval dirt course with pale stone curbs.
    track.lineStyle(360, 0x75482c, 1);
    track.strokeEllipse(centerX, centerY, 2320, 700);
    track.lineStyle(320, 0xc58a50, 1);
    track.strokeEllipse(centerX, centerY, 2320, 700);
    track.lineStyle(5, 0xe8cf9b, 0.9);
    track.strokeEllipse(centerX, centerY, 2480, 860);
    track.strokeEllipse(centerX, centerY, 2000, 380);
    track.lineStyle(3, 0x98623c, 0.7);
    track.strokeEllipse(centerX, centerY, 2210, 600);

    // Packed-earth infield and the central Circus Maximus spina.
    track.fillStyle(0x65553a);
    track.fillEllipse(centerX, centerY, 1920, 340);
    track.lineStyle(7, 0xdfc38a, 1);
    track.strokeEllipse(centerX, centerY, 1920, 340);
    track.fillStyle(0x6d3b2d);
    track.fillRect(centerX - 760, centerY - 76, 1520, 152);
    track.fillStyle(0xd2ad6f);
    track.fillRect(centerX - 742, centerY - 62, 1484, 124);
    track.fillStyle(0x9b3330);
    track.fillRect(centerX - 724, centerY - 43, 1448, 86);
    track.fillStyle(0xe2c27e);
    track.fillRect(centerX - 700, centerY - 29, 1400, 58);

    // Turning posts at both ends of the spina.
    for (const x of [centerX - 790, centerX + 790]) {
      track.fillStyle(0x5d3828);
      track.fillCircle(x + 6, centerY + 8, 38);
      track.fillStyle(0xe4c58e);
      track.fillCircle(x, centerY, 34);
      track.fillStyle(0x9c3430);
      track.fillCircle(x, centerY, 20);
      track.fillStyle(0xf0d28e);
      track.fillRect(x - 5, centerY - 30, 10, 60);
      track.fillRect(x - 24, centerY - 5, 48, 10);
    }

    // Obelisk, monuments, and the seven lap counters.
    track.fillStyle(0x4b3026, 0.55);
    track.fillRect(centerX + 8, centerY - 58, 34, 118);
    track.fillStyle(0xefe0b1);
    track.fillRect(centerX - 16, centerY - 58, 32, 116);
    track.fillStyle(0x9e6b43);
    track.fillTriangle(
      centerX - 16,
      centerY - 58,
      centerX,
      centerY - 82,
      centerX + 16,
      centerY - 58,
    );
    track.fillStyle(0x6f2c2b);
    track.fillRect(centerX - 26, centerY + 44, 52, 20);
    for (let i = 0; i < 7; i += 1) {
      const counterX = centerX - 210 + i * 70;
      track.fillStyle(0x5b3826);
      track.fillRect(counterX - 8, centerY - 17, 20, 26);
      track.fillStyle(i % 2 === 0 ? 0xf0cf71 : 0xd7b45f);
      track.fillCircle(counterX, centerY - 14, 9);
    }

    // Marble crowd pixels and crimson imperial banners.
    const crowdColors = [0x463126, 0x704737, 0x315164, 0xd2b378];
    for (let x = 220; x <= 2580; x += 28) {
      const color = crowdColors[Math.floor(x / 28) % crowdColors.length];
      track.fillStyle(color, 0.95);
      track.fillRect(x, 72 + (x % 3) * 7, 6, 6);
      track.fillRect(x + 10, 968 - (x % 4) * 6, 5, 5);
    }
    for (let x = 360; x <= 2440; x += 260) {
      track.fillStyle(0x8f2f2e);
      track.fillRect(x, 106, 86, 22);
      track.fillRect(x, 914, 86, 22);
      track.fillStyle(0xe6bd66);
      track.fillRect(x + 8, 112, 70, 5);
      track.fillRect(x + 8, 920, 70, 5);
    }

    // Direction chevrons: clockwise from the start along the lower straight.
    track.fillStyle(0x8d3b2d, 0.72);
    for (let x = 890; x <= 2200; x += 210) {
      track.fillTriangle(x + 16, 870, x - 12, 856, x - 12, 884);
      track.fillTriangle(
        TRACK_LOGICAL_WIDTH - x - 16,
        170,
        TRACK_LOGICAL_WIDTH - x + 12,
        156,
        TRACK_LOGICAL_WIDTH - x + 12,
        184,
      );
    }

    // Checkered start and finish line across the lower racing lane.
    track.fillStyle(0xf2eed8);
    for (let y = 742; y <= 1000; y += 16) {
      const alternate = Math.floor((y - 742) / 16) % 2;
      track.fillStyle(alternate === 0 ? 0xf2eed8 : 0x51352a);
      track.fillRect(centerX - 12, y, 12, 16);
      track.fillStyle(alternate === 0 ? 0x51352a : 0xf2eed8);
      track.fillRect(centerX, y, 12, 16);
    }

    const logicalCheckpoints = [
      { x: centerX, y: 880 },
      { x: 2050, y: 820 },
      { x: 2460, y: 670 },
      { x: 2520, y: 520 },
      { x: 2460, y: 370 },
      { x: 2050, y: 220 },
      { x: centerX, y: 170 },
      { x: 750, y: 220 },
      { x: 340, y: 370 },
      { x: 280, y: 520 },
      { x: 340, y: 670 },
      { x: 750, y: 820 },
      { x: centerX, y: 880 },
    ];

    // Small painted stones make the checkpoint route readable.
    for (let i = 1; i < logicalCheckpoints.length - 1; i += 1) {
      const checkpoint = logicalCheckpoints[i];
      track.fillStyle(i % 2 === 0 ? 0xe8c46d : 0xa33832, 0.9);
      track.fillRect(checkpoint.x - 5, checkpoint.y - 5, 10, 10);
      track.fillStyle(0xf5e2ae, 0.9);
      track.fillRect(checkpoint.x - 2, checkpoint.y - 2, 4, 4);
    }
    this.checkpoints = logicalCheckpoints.map((checkpoint) => ({
      x: worldX(checkpoint.x),
      y: worldY(checkpoint.y),
    }));

    // The infield is solid, forcing racers around the spina.
    this.addCollisionRect(
      worldX(centerX),
      worldY(centerY),
      worldX(1780),
      worldY(330),
    );

    this.add
      .text(worldX(centerX), worldY(centerY + 1), "SPQR", {
        fontFamily: '"Courier New", monospace',
        fontSize: "24px",
        fontStyle: "bold",
        color: "#6e2828",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.trackStatus = this.add
      .text(18, 56, "CROSS THE STARTING LINE", {
        fontFamily: '"Courier New", monospace',
        fontSize: "12px",
        color: "#fff4bd",
        backgroundColor: "#142416",
        padding: { x: 7, y: 4 },
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.createArenaSpeedHud();
  }

  createArenaSpeedHud() {
    const panelX = 700;
    const panelY = 18;
    const panelWidth = 242;
    const panelHeight = 70;

    this.add
      .rectangle(
        panelX,
        panelY,
        panelWidth,
        panelHeight,
        0x142416,
        0.9,
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(100)
      .setStrokeStyle(2, 0xb7d878);

    this.arenaGaitText = this.add
      .text(panelX + 12, panelY + 9, "STANDING", {
        fontFamily: '"Courier New", monospace',
        fontSize: "13px",
        fontStyle: "bold",
        color: GAITS.idle.color,
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.arenaSpeedText = this.add
      .text(panelX + panelWidth - 12, panelY + 9, "SPEED 0", {
        fontFamily: '"Courier New", monospace',
        fontSize: "13px",
        fontStyle: "bold",
        color: "#fff4bd",
        resolution: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(101);

    this.arenaChargeText = this.add
      .text(panelX + 12, panelY + 33, "HOLD SHIFT TO CANTER", {
        fontFamily: '"Courier New", monospace',
        fontSize: "9px",
        color: "#a9bd9a",
        resolution: 2,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.add
      .rectangle(
        panelX + 12,
        panelY + 53,
        panelWidth - 24,
        7,
        0x324735,
        1,
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(101);

    this.arenaSpeedBar = this.add
      .rectangle(
        panelX + 12,
        panelY + 53,
        panelWidth - 24,
        7,
        0xff8a5b,
        1,
      )
      .setOrigin(0)
      .setScale(0, 1)
      .setScrollFactor(0)
      .setDepth(102);

    this.updateArenaSpeedHud();
  }

  updateArenaSpeedHud() {
    if (!this.arenaGaitText) return;

    const gait = GAITS[this.currentGait];
    const speedProgress = Phaser.Math.Clamp(
      gait.speed / GAITS.gallop.speed,
      0,
      1,
    );
    const gallopProgress = Phaser.Math.Clamp(
      this.gallopCharge / GALLOP_CHARGE_MS,
      0,
      1,
    );

    this.arenaGaitText.setText(gait.label).setColor(gait.color);
    this.arenaSpeedText.setText(`SPEED ${gait.speed}`);
    this.arenaSpeedBar.setScale(speedProgress, 1);

    if (this.currentGait === "gallop") {
      this.arenaChargeText
        .setText("FULL GALLOP!")
        .setColor(GAITS.gallop.color);
    } else if (this.currentGait === "canter") {
      this.arenaChargeText
        .setText(`GALLOP CHARGE ${Math.floor(gallopProgress * 100)}%`)
        .setColor(GAITS.canter.color);
    } else {
      this.arenaChargeText
        .setText("HOLD SHIFT TO CANTER")
        .setColor("#a9bd9a");
    }
  }

  onFacilityEntered() {
    this.nextCheckpoint = 0;
    this.lapStartedAt = null;
    this.dustTimer = 0;
    this.trackStatus?.setText("CROSS THE STARTING LINE");
    this.updateArenaSpeedHud();
  }

  emitDust(direction, gait, delta) {
    this.dustTimer = emitHoofDust(this, direction, gait, delta, 18);
  }

  isWithinCourseOrGate(x, y) {
    const centerX = this.interiorWidth / 2;
    const centerY = 520 * TRACK_SCALE_Y;
    const radiusX = 1240 * TRACK_SCALE_X;
    const radiusY = 430 * TRACK_SCALE_Y;
    const inExitGate =
      Math.abs(x - centerX) <= 120 * TRACK_SCALE_X &&
      y >= centerY + 330 * TRACK_SCALE_Y;
    if (inExitGate) return true;

    const normalizedX = (x - centerX) / radiusX;
    const normalizedY = (y - centerY) / radiusY;
    return normalizedX ** 2 + normalizedY ** 2 <= 1;
  }

  isInteriorPositionSafe(x, y) {
    return (
      super.isInteriorPositionSafe(x, y) &&
      this.isWithinCourseOrGate(x, y)
    );
  }

  constrainHorseToCourse() {
    if (this.isWithinCourseOrGate(this.horse.x, this.horse.y)) return;

    const centerX = this.interiorWidth / 2;
    const centerY = 520 * TRACK_SCALE_Y;
    const radiusX = 1240 * TRACK_SCALE_X;
    const radiusY = 430 * TRACK_SCALE_Y;
    const offsetX = this.horse.x - centerX;
    const offsetY = this.horse.y - centerY;
    const normalizedDistance = Math.sqrt(
      (offsetX / radiusX) ** 2 + (offsetY / radiusY) ** 2,
    );
    if (normalizedDistance === 0) return;

    const velocityX = this.horse.body.velocity.x;
    const velocityY = this.horse.body.velocity.y;
    const boundaryScale = 0.97 / normalizedDistance;
    const constrainedX = centerX + offsetX * boundaryScale;
    const constrainedY = centerY + offsetY * boundaryScale;

    const normal = new Phaser.Math.Vector2(
      offsetX / (radiusX * radiusX),
      offsetY / (radiusY * radiusY),
    ).normalize();
    const outwardSpeed = Math.max(
      0,
      velocityX * normal.x + velocityY * normal.y,
    );

    this.horse.body.reset(constrainedX, constrainedY);
    this.horse.setVelocity(
      velocityX - outwardSpeed * normal.x,
      velocityY - outwardSpeed * normal.y,
    );
    this.horseShadow.setPosition(constrainedX, constrainedY + 31);
  }

  updateFacility(time) {
    this.updateArenaSpeedHud();
    this.constrainHorseToCourse();
    const checkpoint = this.checkpoints[this.nextCheckpoint];
    if (!checkpoint) return;
    if (
      Phaser.Math.Distance.Between(
        this.horse.x,
        this.horse.y,
        checkpoint.x,
        checkpoint.y,
      ) >= 105 * TRACK_SCALE_Y
    ) {
      return;
    }

    if (this.nextCheckpoint === 0) {
      this.lapStartedAt = time;
    }
    this.nextCheckpoint += 1;

    const finishIndex = this.checkpoints.length - 1;
    if (this.nextCheckpoint < finishIndex) {
      this.trackStatus.setText(
        `NEXT MARKER ${this.nextCheckpoint}/${finishIndex - 1}`,
      );
      return;
    }
    if (this.nextCheckpoint === finishIndex) {
      this.trackStatus.setText("RETURN TO THE FINISH");
      return;
    }

    const lapTime = Math.max(0, time - this.lapStartedAt);
    const previousBest = Number(
      this.progress.records.circusTrackBestMs,
    );
    if (!Number.isFinite(previousBest) || lapTime < previousBest) {
      this.progress.records.circusTrackBestMs = Math.round(lapTime);
      this.progressStore.save(this.progress);
      this.trackStatus.setText(
        `NEW BEST: ${(lapTime / 1000).toFixed(2)}s`,
      );
    } else {
      this.trackStatus.setText(
        `LAP: ${(lapTime / 1000).toFixed(2)}s  BEST: ${(previousBest / 1000).toFixed(2)}s`,
      );
    }
    // Crossing the finish also starts the next lap for continuous racing.
    this.nextCheckpoint = 1;
    this.lapStartedAt = time;
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
  scene: [
    BootScene,
    MeadowScene,
    StableInteriorScene,
    HospitalInteriorScene,
    TrackInteriorScene,
  ],
};

new Phaser.Game(config);
