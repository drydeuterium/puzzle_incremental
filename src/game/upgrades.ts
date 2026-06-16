import { GAME_CONFIG } from "./config";
import type { SolverOptions, Statistics, UpgradeId, UpgradeState } from "../core/types";

export type PurchaseOutcome = Readonly<
  | { ok: true; price: number }
  | { ok: false; reason: "maximum-level" | "missing-prerequisite" | "not-enough-compute"; price: number; prerequisite?: UpgradeId }
>;

export function initialUpgradeState(): UpgradeState {
  return Object.fromEntries(GAME_CONFIG.upgrades.map((upgrade) => [upgrade.id, 0])) as UpgradeState;
}

export function getUpgradeConfig(id: UpgradeId) {
  const upgrade = GAME_CONFIG.upgrades.find((entry) => entry.id === id);
  if (!upgrade) {
    throw new Error(`Unknown upgrade ${id}`);
  }
  return upgrade;
}

export function getUpgradePrice(id: UpgradeId, level: number): number {
  const upgrade = getUpgradeConfig(id);
  return Math.floor(upgrade.basePrice * upgrade.priceMultiplier ** level);
}

export function canPurchaseUpgrade(levels: UpgradeState, compute: number, id: UpgradeId): PurchaseOutcome {
  const upgrade = getUpgradeConfig(id);
  const level = levels[id] ?? 0;
  const price = getUpgradePrice(id, level);
  if (level >= upgrade.maxLevel) {
    return { ok: false, reason: "maximum-level", price };
  }
  const missing = upgrade.prerequisites.find((prerequisite) => (levels[prerequisite] ?? 0) <= 0);
  if (missing) {
    return { ok: false, reason: "missing-prerequisite", prerequisite: missing, price };
  }
  if (compute < price) {
    return { ok: false, reason: "not-enough-compute", price };
  }
  return { ok: true, price };
}

export function isTierUnlocked(levels: UpgradeState, tier: number): boolean {
  const config = GAME_CONFIG.tiers.find((entry) => entry.id === tier);
  if (!config) {
    return false;
  }
  return config.unlockUpgradeId === null || (levels[config.unlockUpgradeId] ?? 0) > 0;
}

export function nodesPerSecond(levels: UpgradeState): number {
  const level = levels["solver-throughput"] ?? 0;
  return Math.round(GAME_CONFIG.solver.baseNodesPerSecond * GAME_CONFIG.solver.throughputMultiplierPerLevel ** level);
}

export function automatedRewardMultiplier(levels: UpgradeState): number {
  const level = levels["solver-payout"] ?? 0;
  return Math.min(
    GAME_CONFIG.reward.automatedPayoutMaxMultiplier,
    GAME_CONFIG.clearMultipliers.automated * GAME_CONFIG.reward.automatedPayoutMultiplierPerLevel ** level,
  );
}

export function manualClearsForTier(statistics: Statistics, tier: number): number {
  return statistics.manualClearsByTier[String(tier)] ?? 0;
}

export function isAutoSolverReady(levels: UpgradeState, statistics: Statistics, tier: number): boolean {
  return (levels["auto-solver"] ?? 0) > 0
    && manualClearsForTier(statistics, tier) >= GAME_CONFIG.solver.manualClearsRequiredByTierForAutoSolver;
}

export function solverOptionsFromUpgrades(levels: UpgradeState, visualization: SolverOptions["visualization"]): SolverOptions {
  const cacheLevel = levels["dead-state-cache"] ?? 0;
  return {
    nodesPerSecond: nodesPerSecond(levels),
    visualization,
    heuristics: {
      constraintOrdering: (levels["constraint-ordering"] ?? 0) > 0,
      candidateOrdering: (levels["candidate-ordering"] ?? 0) > 0,
      symmetryPruning: (levels["symmetry-pruning"] ?? 0) > 0,
      deadStateCacheEntries: GAME_CONFIG.cacheEntriesByLevel[cacheLevel] ?? 0,
    },
  };
}

export function parallelSessions(levels: UpgradeState): number {
  return Math.min(4, 1 + (levels["parallel-solvers"] ?? 0));
}
