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
  gameConfigVersion: "1.2.0-tier-rebalance",
  generatorVersion: 3,
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
    difficultySqrtMultiplier: 12,
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
    { id: 3, width: 5, height: 6, pieceCount: 7, allowedBlockedCellCounts: [2], difficultyScoreMin: 55, difficultyScoreMax: 420, unlockUpgradeId: "tier-3" },
    { id: 4, width: 6, height: 6, pieceCount: 8, allowedBlockedCellCounts: [4], difficultyScoreMin: 70, difficultyScoreMax: 500, unlockUpgradeId: "tier-4" },
    { id: 5, width: 6, height: 6, pieceCount: 9, allowedBlockedCellCounts: [0], difficultyScoreMin: 90, difficultyScoreMax: 580, unlockUpgradeId: "tier-5" },
    { id: 6, width: 6, height: 7, pieceCount: 10, allowedBlockedCellCounts: [2], difficultyScoreMin: 110, difficultyScoreMax: 680, unlockUpgradeId: "tier-6" },
    { id: 7, width: 7, height: 7, pieceCount: 11, allowedBlockedCellCounts: [5], difficultyScoreMin: 130, difficultyScoreMax: 800, unlockUpgradeId: "tier-7" },
    { id: 8, width: 8, height: 6, pieceCount: 12, allowedBlockedCellCounts: [0], difficultyScoreMin: 150, difficultyScoreMax: 920, unlockUpgradeId: "tier-8" },
    { id: 9, width: 8, height: 8, pieceCount: 16, allowedBlockedCellCounts: [0], difficultyScoreMin: 190, difficultyScoreMax: 1200, unlockUpgradeId: "tier-9" },
  ] satisfies readonly TierConfig[],
  upgrades: [
    { id: "placement-scanner", name: "Placement Scanner", maxLevel: 1, basePrice: 120, priceMultiplier: 1, prerequisites: [] },
    { id: "tier-1", name: "Tier 1", maxLevel: 1, basePrice: 150, priceMultiplier: 1, prerequisites: [] },
    { id: "contradiction-detector", name: "Contradiction Detector", maxLevel: 1, basePrice: 300, priceMultiplier: 1, prerequisites: ["placement-scanner"] },
    { id: "tier-2", name: "Tier 2", maxLevel: 1, basePrice: 500, priceMultiplier: 1, prerequisites: ["tier-1"] },
    { id: "forced-move", name: "Forced Move", maxLevel: 1, basePrice: 800, priceMultiplier: 1, prerequisites: ["contradiction-detector"] },
    { id: "auto-solver", name: "Auto Solver", maxLevel: 1, basePrice: 1200, priceMultiplier: 1, prerequisites: ["tier-2"] },
    { id: "solver-throughput", name: "Solver Throughput", maxLevel: 30, basePrice: 700, priceMultiplier: 1.82, prerequisites: ["auto-solver"] },
    { id: "solver-payout", name: "Solver Payout", maxLevel: 10, basePrice: 1200, priceMultiplier: 1.9, prerequisites: ["auto-solver"] },
    { id: "tier-3", name: "Tier 3", maxLevel: 1, basePrice: 2500, priceMultiplier: 1, prerequisites: ["tier-2", "auto-solver"] },
    { id: "constraint-ordering", name: "Constraint Ordering", maxLevel: 1, basePrice: 3200, priceMultiplier: 1, prerequisites: ["auto-solver"] },
    { id: "tier-4", name: "Tier 4", maxLevel: 1, basePrice: 4500, priceMultiplier: 1, prerequisites: ["tier-3"] },
    { id: "tier-5", name: "Tier 5", maxLevel: 1, basePrice: 7500, priceMultiplier: 1, prerequisites: ["tier-4"] },
    { id: "symmetry-pruning", name: "Symmetry Pruning", maxLevel: 1, basePrice: 9000, priceMultiplier: 1, prerequisites: ["constraint-ordering"] },
    { id: "dead-state-cache", name: "Dead State Cache", maxLevel: 5, basePrice: 10000, priceMultiplier: 3, prerequisites: ["constraint-ordering"] },
    { id: "tier-6", name: "Tier 6", maxLevel: 1, basePrice: 12000, priceMultiplier: 1, prerequisites: ["tier-5"] },
    { id: "parallel-solvers", name: "Parallel Solvers", maxLevel: 3, basePrice: 14000, priceMultiplier: 4, prerequisites: ["auto-solver"] },
    { id: "candidate-ordering", name: "Candidate Ordering", maxLevel: 1, basePrice: 18000, priceMultiplier: 1, prerequisites: ["constraint-ordering"] },
    { id: "tier-7", name: "Tier 7", maxLevel: 1, basePrice: 20000, priceMultiplier: 1, prerequisites: ["tier-6"] },
    { id: "tier-8", name: "Tier 8", maxLevel: 1, basePrice: 32000, priceMultiplier: 1, prerequisites: ["tier-7"] },
    { id: "tier-9", name: "Tier 9", maxLevel: 1, basePrice: 60000, priceMultiplier: 1, prerequisites: ["tier-8"] },
  ] satisfies readonly UpgradeConfig[],
  cacheEntriesByLevel: [0, 500, 2000, 8000, 32000, 128000],
} as const;

export const ALL_UPGRADE_IDS = GAME_CONFIG.upgrades.map((upgrade) => upgrade.id);
