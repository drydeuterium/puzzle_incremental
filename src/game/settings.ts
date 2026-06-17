export const SOLVER_LANE_MIN_SESSION_MS_DEFAULT = 1000;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT = 250;

export const SOLVER_LANE_MIN_SESSION_MS_MIN = 300;
export const SOLVER_LANE_MIN_SESSION_MS_MAX = 3000;
export const SOLVER_LANE_MIN_SESSION_MS_STEP = 50;

export const SOLVER_LANE_PREVIEW_UPDATE_MS_MIN = 50;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_MAX = 1000;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_STEP = 25;

function normalizeNumberRange(value: unknown, min: number, max: number, step: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped / step) * step;
}

export function normalizeSolverLaneMinSessionMs(value: unknown): number {
  return normalizeNumberRange(
    value,
    SOLVER_LANE_MIN_SESSION_MS_MIN,
    SOLVER_LANE_MIN_SESSION_MS_MAX,
    SOLVER_LANE_MIN_SESSION_MS_STEP,
    SOLVER_LANE_MIN_SESSION_MS_DEFAULT,
  );
}

export function normalizeSolverLanePreviewUpdateMs(value: unknown): number {
  return normalizeNumberRange(
    value,
    SOLVER_LANE_PREVIEW_UPDATE_MS_MIN,
    SOLVER_LANE_PREVIEW_UPDATE_MS_MAX,
    SOLVER_LANE_PREVIEW_UPDATE_MS_STEP,
    SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT,
  );
}
