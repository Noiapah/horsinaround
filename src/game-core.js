export const GALLOP_CHARGE_MS = 4500;
export const HORSE_SKIN_COSTS = Object.freeze({
  chestnut: 0,
  palomino: 10,
  midnight: 20,
});
export const TRACK_OBSTACLES = Object.freeze([
  { x: 850, y: 835, orientation: "vertical" },
  { x: 1850, y: 865, orientation: "vertical" },
  { x: 2320, y: 700, orientation: "horizontal" },
  { x: 1900, y: 190, orientation: "vertical" },
  { x: 1250, y: 170, orientation: "vertical" },
  { x: 470, y: 320, orientation: "horizontal" },
]);

export function isWithinTrackCourse(x, y) {
  const normalizedX = (x - 1400) / 1240;
  const normalizedY = (y - 520) / 430;
  return normalizedX ** 2 + normalizedY ** 2 <= 1;
}

export function resolveHorseAcquisition({
  isOwned,
  isSelected,
  balance,
  cost,
}) {
  if (isSelected) return "unchanged";
  if (isOwned) return "selected";
  if (!Number.isSafeInteger(cost) || cost < 0) return "invalid";
  return balance >= cost ? "purchased" : "insufficient";
}

export function resolveGaitState({
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

export function getHorseFacingDirection(horizontal, vertical) {
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

export function getHorseColliderGeometry(facing) {
  if (facing === "e" || facing === "w") {
    return { width: 84, height: 38, offsetX: 22, offsetY: 45 };
  }
  if (facing.length === 2) {
    return { width: 66, height: 66, offsetX: 31, offsetY: 31 };
  }
  return { width: 38, height: 84, offsetX: 45, offsetY: 22 };
}

export function mergeProgressRecords(localRecords = {}, storedRecords = {}) {
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

export function reconcileStoredProgress(progress, storedProgress) {
  progress.ownedHorseSkinIds = [
    ...new Set([
      ...(progress.ownedHorseSkinIds ?? []),
      ...(storedProgress.ownedHorseSkinIds ?? []),
    ]),
  ];
  const storedIsNewer = storedProgress.revision > progress.revision;
  if (storedIsNewer) {
    // Durable account state belongs to the newest lease owner. In particular,
    // adopting lives prevents a stale tab from undoing damage or healing.
    progress.lives = storedProgress.lives;
    progress.coins = storedProgress.coins;
    progress.selectedHorseSkinId = storedProgress.selectedHorseSkinId;
  }
  progress.revision = Math.max(
    progress.revision,
    storedProgress.revision,
  );
  progress.records = mergeProgressRecords(
    progress.records,
    storedProgress.records,
  );
  return progress;
}
