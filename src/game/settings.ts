export const SOLVER_LANE_MIN_SESSION_MS_DEFAULT = 1000;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT = 250;

export const SOLVER_LANE_MIN_SESSION_MS_OPTIONS = [500, 1000, 1600, 2500] as const;
export const SOLVER_LANE_PREVIEW_UPDATE_MS_OPTIONS = [100, 250, 500, 750, 1000] as const;

function normalizeNumberOption(value: unknown, options: readonly number[], fallback: number): number {
  return typeof value === "number" && options.includes(value) ? value : fallback;
}

export function normalizeSolverLaneMinSessionMs(value: unknown): number {
  return normalizeNumberOption(value, SOLVER_LANE_MIN_SESSION_MS_OPTIONS, SOLVER_LANE_MIN_SESSION_MS_DEFAULT);
}

export function normalizeSolverLanePreviewUpdateMs(value: unknown): number {
  return normalizeNumberOption(value, SOLVER_LANE_PREVIEW_UPDATE_MS_OPTIONS, SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT);
}
