import type { UpgradeId } from "../core/types";

export type ShapeConfig = Readonly<{
  style: "jagged";
  interiorBlockedCellCount?: number;
  interiorBlockedCellRatio?: number;
}>;

export type TierConfig = Readonly<{
  id: number;
  width: number;
  height: number;
  pieceCount: number;
  allowedBlockedCellCounts: readonly number[];
  shape?: ShapeConfig;
  difficultyScoreMin: number;
  difficultyScoreMax: number;
  unlockUpgradeId: UpgradeId | null;
}>;

export type UpgradeConfig = Readonly<{
  id: UpgradeId;
  name: string;
  maxLevel: number;
  basePrice: number;
  priceMultiplier: number;
  prerequisites: readonly UpgradeId[];
}>;

const DEFAULT_INTERIOR_BLOCKED_CELL_RATIO = 0.4;

type TierInput = Omit<TierConfig, "allowedBlockedCellCounts" | "shape"> & Readonly<{
  shape?: "jagged";
  interiorBlockedCellRatio?: number;
}>;

function blockedCellCountFor(width: number, height: number, pieceCount: number): number {
  const blockedCount = width * height - pieceCount * 4;
  if (blockedCount < 0) {
    throw new Error(`Tier board area ${width}x${height} is too small for ${pieceCount} pieces`);
  }
  return blockedCount;
}

function makeTier(input: TierInput): TierConfig {
  const allowedBlockedCellCounts = [blockedCellCountFor(input.width, input.height, input.pieceCount)];
  return {
    ...input,
    allowedBlockedCellCounts,
    shape: input.shape === "jagged"
      ? { style: "jagged", interiorBlockedCellRatio: input.interiorBlockedCellRatio ?? DEFAULT_INTERIOR_BLOCKED_CELL_RATIO }
      : undefined,
  };
}

export const GAME_CONFIG = {
  gameConfigVersion: "1.6.0-high-tier-pruning",
  generatorVersion: 6,
  currency: {
    name: "Compute",
    symbol: "C",
    startingAmount: 0,
    maxSafeAmount: 9_000_000_000_000_000,
  },
  clearMultipliers: {
    manual: 3,
    assisted: 1.5,
    automated: 0.1,
  },
  reward: {
    cellRewardMultiplier: 2,
    difficultyRewardMultiplier: 1.4,
    tierRewardBaseMultiplier: 0.38,
    tierRewardGrowthFactor: 1.65,
    tierRewardMaxMultiplier: 42,
    automatedPayoutMultiplierPerLevel: 1.26,
    automatedPayoutMaxMultiplier: 1,
  },
  generator: {
    attemptLimit: 50,
    nodesPerAttemptLimit: 100_000,
    difficultyMeasurementNodeLimit: 2_000_000,
    connectedUsableRegionRequired: true,
  },
  solver: {
    workerQuantumMilliseconds: 100,
    visualizationMaxFps: 4,
    baseNodesPerSecond: 2,
    throughputMultiplierPerLevel: 1.55,
    manualClearsRequiredByTierForAutoSolver: 5,
  },
  save: {
    schemaVersion: 1,
    autosaveIntervalMilliseconds: 5000,
    placementSaveDebounceMilliseconds: 500,
    undoHistoryLimit: 100,
  },
  tiers: [
    makeTier({ id: 0, width: 4, height: 4, pieceCount: 4, difficultyScoreMin: 1, difficultyScoreMax: 180, unlockUpgradeId: null }),
    makeTier({ id: 1, width: 8, height: 4, pieceCount: 6, shape: "jagged", difficultyScoreMin: 20, difficultyScoreMax: 320, unlockUpgradeId: "tier-1" }),
    makeTier({ id: 2, width: 7, height: 5, pieceCount: 6, shape: "jagged", difficultyScoreMin: 40, difficultyScoreMax: 360, unlockUpgradeId: "tier-2" }),
    makeTier({ id: 3, width: 6, height: 6, pieceCount: 7, shape: "jagged", difficultyScoreMin: 55, difficultyScoreMax: 420, unlockUpgradeId: "tier-3" }),
    makeTier({ id: 4, width: 7, height: 6, pieceCount: 8, shape: "jagged", difficultyScoreMin: 70, difficultyScoreMax: 500, unlockUpgradeId: "tier-4" }),
    makeTier({ id: 5, width: 7, height: 7, pieceCount: 9, shape: "jagged", difficultyScoreMin: 90, difficultyScoreMax: 580, unlockUpgradeId: "tier-5" }),
    makeTier({ id: 6, width: 8, height: 7, pieceCount: 10, shape: "jagged", difficultyScoreMin: 110, difficultyScoreMax: 680, unlockUpgradeId: "tier-6" }),
    makeTier({ id: 7, width: 9, height: 7, pieceCount: 11, shape: "jagged", difficultyScoreMin: 130, difficultyScoreMax: 800, unlockUpgradeId: "tier-7" }),
    makeTier({ id: 8, width: 8, height: 8, pieceCount: 12, shape: "jagged", difficultyScoreMin: 150, difficultyScoreMax: 920, unlockUpgradeId: "tier-8" }),
    makeTier({ id: 9, width: 10, height: 9, pieceCount: 16, shape: "jagged", difficultyScoreMin: 190, difficultyScoreMax: 1200, unlockUpgradeId: "tier-9" }),
  ] satisfies readonly TierConfig[],
  upgrades: [
    { id: "placement-scanner", name: "Placement Scanner", maxLevel: 1, basePrice: 120, priceMultiplier: 1, prerequisites: [] },
    { id: "tier-1", name: "Tier 1", maxLevel: 1, basePrice: 350, priceMultiplier: 1, prerequisites: [] },
    { id: "contradiction-detector", name: "Contradiction Detector", maxLevel: 1, basePrice: 450, priceMultiplier: 1, prerequisites: ["placement-scanner"] },
    { id: "tier-2", name: "Tier 2", maxLevel: 1, basePrice: 1100, priceMultiplier: 1, prerequisites: ["tier-1"] },
    { id: "forced-move", name: "Forced Move", maxLevel: 1, basePrice: 1500, priceMultiplier: 1, prerequisites: ["contradiction-detector"] },
    { id: "auto-solver", name: "Auto Solver", maxLevel: 1, basePrice: 2600, priceMultiplier: 1, prerequisites: ["tier-2"] },
    { id: "solver-throughput", name: "Solver Throughput", maxLevel: 30, basePrice: 1100, priceMultiplier: 1.88, prerequisites: ["auto-solver"] },
    { id: "solver-payout", name: "Solver Payout", maxLevel: 10, basePrice: 2200, priceMultiplier: 2.05, prerequisites: ["auto-solver"] },
    { id: "tier-3", name: "Tier 3", maxLevel: 1, basePrice: 4500, priceMultiplier: 1, prerequisites: ["tier-2", "auto-solver"] },
    { id: "constraint-ordering", name: "Constraint Ordering", maxLevel: 1, basePrice: 6500, priceMultiplier: 1, prerequisites: ["auto-solver"] },
    { id: "tier-4", name: "Tier 4", maxLevel: 1, basePrice: 9500, priceMultiplier: 1, prerequisites: ["tier-3"] },
    { id: "tier-5", name: "Tier 5", maxLevel: 1, basePrice: 19000, priceMultiplier: 1, prerequisites: ["tier-4"] },
    { id: "symmetry-pruning", name: "Symmetry Pruning", maxLevel: 1, basePrice: 28000, priceMultiplier: 1, prerequisites: ["constraint-ordering"] },
    { id: "dead-state-cache", name: "Dead State Cache", maxLevel: 5, basePrice: 24000, priceMultiplier: 3.2, prerequisites: ["constraint-ordering"] },
    { id: "tier-6", name: "Tier 6", maxLevel: 1, basePrice: 42000, priceMultiplier: 1, prerequisites: ["tier-5"] },
    { id: "parallel-solvers", name: "Parallel Solvers", maxLevel: 3, basePrice: 52000, priceMultiplier: 4.5, prerequisites: ["auto-solver"] },
    { id: "candidate-ordering", name: "Candidate Ordering", maxLevel: 1, basePrice: 72000, priceMultiplier: 1, prerequisites: ["constraint-ordering"] },
    { id: "tier-7", name: "Tier 7", maxLevel: 1, basePrice: 90000, priceMultiplier: 1, prerequisites: ["tier-6"] },
    { id: "isolated-region-pruning", name: "Isolated Region Pruning", maxLevel: 1, basePrice: 130000, priceMultiplier: 1, prerequisites: ["tier-7", "constraint-ordering"] },
    { id: "zero-candidate-pruning", name: "Zero Candidate Pruning", maxLevel: 1, basePrice: 170000, priceMultiplier: 1, prerequisites: ["isolated-region-pruning"] },
    { id: "tier-8", name: "Tier 8", maxLevel: 1, basePrice: 190000, priceMultiplier: 1, prerequisites: ["tier-7"] },
    { id: "color-balance-pruning", name: "Color Balance Pruning", maxLevel: 1, basePrice: 260000, priceMultiplier: 1, prerequisites: ["tier-8", "zero-candidate-pruning"] },
    { id: "partial-board-cache", name: "Partial Board Cache", maxLevel: 4, basePrice: 320000, priceMultiplier: 3.1, prerequisites: ["tier-8", "dead-state-cache"] },
    { id: "tier-9", name: "Tier 9", maxLevel: 1, basePrice: 420000, priceMultiplier: 1, prerequisites: ["tier-8"] },
  ] satisfies readonly UpgradeConfig[],
  cacheEntriesByLevel: [0, 500, 2000, 8000, 32000, 128000],
  partialBoardCacheEntriesByLevel: [0, 1000, 4000, 16000, 64000],
} as const;

export const ALL_UPGRADE_IDS = GAME_CONFIG.upgrades.map((upgrade) => upgrade.id);
