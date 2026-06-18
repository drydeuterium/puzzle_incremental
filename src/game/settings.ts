export const SOLVER_LANE_MIN_SESSION_MS_DEFAULT = 1000;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT = 250;
export const UI_SCALE_DEFAULT = 1;

export const SOLVER_LANE_MIN_SESSION_MS_MIN = 300;
export const SOLVER_LANE_MIN_SESSION_MS_MAX = 3000;
export const SOLVER_LANE_MIN_SESSION_MS_STEP = 50;

export const SOLVER_LANE_PREVIEW_UPDATE_MS_MIN = 50;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_MAX = 1000;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_STEP = 25;

export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.25;
export const UI_SCALE_STEP = 0.05;

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

export function normalizeUiScale(value: unknown): number {
  return normalizeNumberRange(
    value,
    UI_SCALE_MIN,
    UI_SCALE_MAX,
    UI_SCALE_STEP,
    UI_SCALE_DEFAULT,
  );
}
