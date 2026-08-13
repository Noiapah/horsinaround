import {
  GALLOP_CHARGE_MS,
  getHorseColliderGeometry,
  getHorseFacingDirection,
  mergeProgressRecords,
  reconcileStoredProgress,
  resolveGaitState,
} from "./game-core.js";

export function runGameCoreTests() {
  let assertions = 0;
  const equal = (actual, expected, message) => {
    assertions += 1;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
      );
    }
  };

  equal(
    resolveGaitState({
      isMoving: false,
      walkHeld: false,
      runHeld: true,
      gallopCharge: 1000,
      delta: 16,
    }),
    { gait: "idle", gallopCharge: 0 },
    "Standing resets gallop charge.",
  );
  equal(
    resolveGaitState({
      isMoving: true,
      walkHeld: true,
      runHeld: true,
      gallopCharge: 1000,
      delta: 16,
    }),
    { gait: "walk", gallopCharge: 0 },
    "Walk takes priority and resets gallop charge.",
  );
  equal(
    resolveGaitState({
      isMoving: true,
      walkHeld: false,
      runHeld: true,
      gallopCharge: GALLOP_CHARGE_MS - 10,
      delta: 20,
    }),
    { gait: "gallop", gallopCharge: GALLOP_CHARGE_MS },
    "Cantering promotes to a capped gallop.",
  );
  equal(
    resolveGaitState({
      isMoving: true,
      walkHeld: false,
      runHeld: false,
      gallopCharge: 1000,
      delta: 16,
    }),
    { gait: "trot", gallopCharge: 0 },
    "Ordinary movement trots and resets gallop charge.",
  );

  equal(
    [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ].map(([horizontal, vertical]) =>
      getHorseFacingDirection(horizontal, vertical),
    ),
    ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
    "Facing covers all eight movement directions.",
  );
  equal(
    getHorseColliderGeometry("e"),
    { width: 84, height: 38, offsetX: 22, offsetY: 45 },
    "Side-facing horses use the horizontal collider.",
  );
  equal(
    getHorseColliderGeometry("nw"),
    { width: 66, height: 66, offsetX: 31, offsetY: 31 },
    "Diagonal horses use the square collider.",
  );
  equal(
    getHorseColliderGeometry("s"),
    { width: 38, height: 84, offsetX: 45, offsetY: 22 },
    "Front-facing horses use the vertical collider.",
  );

  equal(
    mergeProgressRecords(
      { circusTrackBestMs: 4200, localOnly: true },
      { circusTrackBestMs: 3900, storedOnly: true },
    ),
    {
      circusTrackBestMs: 3900,
      storedOnly: true,
      localOnly: true,
    },
    "Record merging keeps the fastest best time and unrelated records.",
  );

  const local = {
    revision: 2,
    lives: 3,
    coins: 4,
    selectedHorseSkinId: "chestnut",
    records: { circusTrackBestMs: 4500 },
  };
  reconcileStoredProgress(local, {
    revision: 3,
    lives: 1,
    coins: 9,
    selectedHorseSkinId: "midnight",
    records: { circusTrackBestMs: 4100 },
  });
  equal(local.lives, 1, "A newer tab's heart state is preserved.");
  equal(local.coins, 9, "A newer tab's coin balance is preserved.");
  equal(
    local.selectedHorseSkinId,
    "midnight",
    "A newer tab's horse selection is preserved.",
  );
  equal(local.revision, 3, "The newest save revision is retained.");
  equal(
    local.records.circusTrackBestMs,
    4100,
    "The fastest record survives reconciliation.",
  );

  return assertions;
}
