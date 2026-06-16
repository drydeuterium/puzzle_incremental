import type { UpgradeId } from "../core/types";

export type TierConfig = Readonly<{
  id: number;
  width: number;
  height: number;
  pieceCount: number;
  allowedBlockedCellCounts: readonly number[];
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

export const GAME_CONFIG = {
  gameConfigVersion: "1.1.0-mvp",
  generatorVersion: 2,
  currency: {
    name: "Compute",
    symbol: "C",
    startingAmount: 0,
    maxSafeAmount: 9_000_000_000_000_000,
  },
  clearMultipliers: {
    manual: 3,
    assisted: 1.5,
    automated: 1,
  },
  reward: {
    cellRewardMultiplier: 2,
    difficultySqrtMultiplier: 12,
  },
  generator: {
    attemptLimit: 50,
    nodesPerAttemptLimit: 100_000,
    difficultyMeasurementNodeLimit: 2_000_000,
    connectedUsableRegionRequired: true,
  },
  solver: {
    workerQuantumMilliseconds: 100,
    visualizationMaxFps: 10,
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
    { id: 0, width: 4, height: 4, pieceCount: 4, allowedBlockedCellCounts: [0], difficultyScoreMin: 1, difficultyScoreMax: 180, unlockUpgradeId: null },
    { id: 1, width: 5, height: 5, pieceCount: 6, allowedBlockedCellCounts: [1], difficultyScoreMin: 20, difficultyScoreMax: 320, unlockUpgradeId: "tier-1" },
    { id: 2, width: 6, height: 4, pieceCount: 6, allowedBlockedCellCounts: [0], difficultyScoreMin: 40, difficultyScoreMax: 360, unlockUpgradeId: "tier-2" },
    { id: 3, width: 6, height: 6, pieceCount: 9, allowedBlockedCellCounts: [0, 4], difficultyScoreMin: 80, difficultyScoreMax: 520, unlockUpgradeId: "tier-3" },
    { id: 4, width: 8, height: 6, pieceCount: 12, allowedBlockedCellCounts: [0, 4, 8], difficultyScoreMin: 120, difficultyScoreMax: 760, unlockUpgradeId: "tier-4" },
    { id: 5, width: 8, height: 8, pieceCount: 16, allowedBlockedCellCounts: [0, 4, 8, 12], difficultyScoreMin: 180, difficultyScoreMax: 1100, unlockUpgradeId: "tier-5" },
  ] satisfies readonly TierConfig[],
  upgrades: [
    { id: "placement-scanner", name: "Placement Scanner", maxLevel: 1, basePrice: 60, priceMultiplier: 1, prerequisites: [] },
    { id: "tier-1", name: "Tier 1", maxLevel: 1, basePrice: 90, priceMultiplier: 1, prerequisites: [] },
    { id: "contradiction-detector", name: "Contradiction Detector", maxLevel: 1, basePrice: 180, priceMultiplier: 1, prerequisites: ["placement-scanner"] },
    { id: "tier-2", name: "Tier 2", maxLevel: 1, basePrice: 240, priceMultiplier: 1, prerequisites: ["tier-1"] },
    { id: "forced-move", name: "Forced Move", maxLevel: 1, basePrice: 380, priceMultiplier: 1, prerequisites: ["contradiction-detector"] },
    { id: "auto-solver", name: "Auto Solver", maxLevel: 1, basePrice: 700, priceMultiplier: 1, prerequisites: ["tier-2"] },
    { id: "solver-throughput", name: "Solver Throughput", maxLevel: 30, basePrice: 500, priceMultiplier: 1.82, prerequisites: ["auto-solver"] },
    { id: "constraint-ordering", name: "Constraint Ordering", maxLevel: 1, basePrice: 1200, priceMultiplier: 1, prerequisites: ["auto-solver"] },
    { id: "tier-3", name: "Tier 3", maxLevel: 1, basePrice: 1500, priceMultiplier: 1, prerequisites: ["tier-2", "auto-solver"] },
    { id: "queue-capacity", name: "Queue Capacity", maxLevel: 10, basePrice: 2000, priceMultiplier: 2.1, prerequisites: ["auto-solver"] },
    { id: "symmetry-pruning", name: "Symmetry Pruning", maxLevel: 1, basePrice: 12000, priceMultiplier: 1, prerequisites: ["constraint-ordering"] },
    { id: "candidate-ordering", name: "Candidate Ordering", maxLevel: 1, basePrice: 18000, priceMultiplier: 1, prerequisites: ["constraint-ordering"] },
    { id: "dead-state-cache", name: "Dead State Cache", maxLevel: 5, basePrice: 10000, priceMultiplier: 3, prerequisites: ["constraint-ordering"] },
    { id: "parallel-solvers", name: "Parallel Solvers", maxLevel: 3, basePrice: 30000, priceMultiplier: 4, prerequisites: ["queue-capacity"] },
    { id: "tier-4", name: "Tier 4", maxLevel: 1, basePrice: 50000, priceMultiplier: 1, prerequisites: ["tier-3", "symmetry-pruning"] },
    { id: "tier-5", name: "Tier 5", maxLevel: 1, basePrice: 250000, priceMultiplier: 1, prerequisites: ["tier-4", "dead-state-cache"] },
  ] satisfies readonly UpgradeConfig[],
  cacheEntriesByLevel: [0, 500, 2000, 8000, 32000, 128000],
} as const;

export const ALL_UPGRADE_IDS = GAME_CONFIG.upgrades.map((upgrade) => upgrade.id);
