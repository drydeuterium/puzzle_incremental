import { GAME_CONFIG } from "./config";
import { challengeTierPriceMultiplier } from "./challenges";
import { solverFoundationBonus, tierCompressionDiscount } from "./prestige";
import type { ChallengeId, PrestigeUpgradeState, SolverOptions, UpgradeId, UpgradeState } from "../core/types";

export type PurchaseOutcome = Readonly<
  | { ok: true; price: number }
  | { ok: false; reason: "maximum-level" | "missing-prerequisite" | "missing-manual-clear" | "not-enough-compute"; price: number; prerequisite?: UpgradeId; requiredTier?: number }
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

function isTierUpgradeId(id: UpgradeId): boolean {
  return /^tier-\d+$/.test(id);
}

function requiredManualClearTier(id: UpgradeId): number | null {
  const match = /^tier-(\d+)$/.exec(id);
  if (!match) {
    return null;
  }
  return Number(match[1]) - 1;
}

export function getUpgradePrice(id: UpgradeId, level: number, prestigeLevels?: PrestigeUpgradeState, activeChallengeId: ChallengeId | null = null): number {
  const upgrade = getUpgradeConfig(id);
  const basePrice = Math.floor(upgrade.basePrice * upgrade.priceMultiplier ** level);
  if (!isTierUpgradeId(id)) {
    return basePrice;
  }
  const prestigeMultiplier = prestigeLevels ? 1 - tierCompressionDiscount(prestigeLevels) : 1;
  return Math.max(1, Math.floor(basePrice * prestigeMultiplier * challengeTierPriceMultiplier(activeChallengeId)));
}

export function canPurchaseUpgrade(
  levels: UpgradeState,
  compute: number,
  id: UpgradeId,
  manualClearsByTier: Readonly<Record<string, number>> = {},
  prestigeLevels?: PrestigeUpgradeState,
  activeChallengeId: ChallengeId | null = null,
): PurchaseOutcome {
  const upgrade = getUpgradeConfig(id);
  const level = levels[id] ?? 0;
  const price = getUpgradePrice(id, level, prestigeLevels, activeChallengeId);
  if (level >= upgrade.maxLevel) {
    return { ok: false, reason: "maximum-level", price };
  }
  const missing = upgrade.prerequisites.find((prerequisite) => (levels[prerequisite] ?? 0) <= 0);
  if (missing) {
    return { ok: false, reason: "missing-prerequisite", prerequisite: missing, price };
  }
  const manualTier = requiredManualClearTier(id);
  if (manualTier !== null && (manualClearsByTier[String(manualTier)] ?? 0) <= 0) {
    return { ok: false, reason: "missing-manual-clear", requiredTier: manualTier, price };
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

export function nodesPerSecond(levels: UpgradeState, prestigeLevels?: PrestigeUpgradeState): number {
  const level = levels["solver-throughput"] ?? 0;
  const baseNodesPerSecond = GAME_CONFIG.solver.baseNodesPerSecond + (prestigeLevels ? solverFoundationBonus(prestigeLevels) : 0);
  return Math.round(baseNodesPerSecond * GAME_CONFIG.solver.throughputMultiplierPerLevel ** level);
}

export function automatedRewardMultiplier(levels: UpgradeState): number {
  const level = levels["solver-payout"] ?? 0;
  return Math.min(
    GAME_CONFIG.reward.automatedPayoutMaxMultiplier,
    GAME_CONFIG.clearMultipliers.automated * GAME_CONFIG.reward.automatedPayoutMultiplierPerLevel ** level,
  );
}

export function manualClearsForTier(manualClearsByTier: Readonly<Record<string, number>>, tier: number): number {
  return manualClearsByTier[String(tier)] ?? 0;
}

export function isAutoSolverReady(
  levels: UpgradeState,
  manualClearsByTier: Readonly<Record<string, number>>,
  tier: number,
  requiredManualClears: number = GAME_CONFIG.solver.manualClearsRequiredByTierForAutoSolver,
): boolean {
  return (levels["auto-solver"] ?? 0) > 0
    && manualClearsForTier(manualClearsByTier, tier) >= requiredManualClears;
}

const HIGH_TIER_SOLVER_MIN_TIER = 7;

export function solverOptionsFromUpgrades(levels: UpgradeState, visualization: SolverOptions["visualization"], tier = 0, prestigeLevels?: PrestigeUpgradeState): SolverOptions {
  const cacheLevel = levels["dead-state-cache"] ?? 0;
  const partialCacheLevel = levels["partial-board-cache"] ?? 0;
  const highTierHeuristicsEnabled = tier >= HIGH_TIER_SOLVER_MIN_TIER;
  return {
    nodesPerSecond: nodesPerSecond(levels, prestigeLevels),
    visualization,
    heuristics: {
      constraintOrdering: (levels["constraint-ordering"] ?? 0) > 0,
      candidateOrdering: (levels["candidate-ordering"] ?? 0) > 0,
      symmetryPruning: (levels["symmetry-pruning"] ?? 0) > 0,
      deadStateCacheEntries: GAME_CONFIG.cacheEntriesByLevel[cacheLevel] ?? 0,
      isolatedRegionPruning: highTierHeuristicsEnabled && (levels["isolated-region-pruning"] ?? 0) > 0,
      zeroCandidatePruning: highTierHeuristicsEnabled && (levels["zero-candidate-pruning"] ?? 0) > 0,
      colorBalancePruning: highTierHeuristicsEnabled && (levels["color-balance-pruning"] ?? 0) > 0,
      partialBoardCacheEntries: highTierHeuristicsEnabled ? GAME_CONFIG.partialBoardCacheEntriesByLevel[partialCacheLevel] ?? 0 : 0,
    },
  };
}

export function parallelSessions(levels: UpgradeState): number {
  return Math.min(4, 1 + (levels["parallel-solvers"] ?? 0));
}
