import { GAME_CONFIG } from "./config";
import type { PrestigeState, PrestigeUpgradeId, PrestigeUpgradeState } from "../core/types";

export type PrestigeUpgradeConfig = Readonly<{
  id: PrestigeUpgradeId;
  name: string;
  maxLevel: number;
  basePrice: number;
  priceStep: number;
}>;

export type PrestigePurchaseOutcome = Readonly<
  | { ok: true; price: number }
  | { ok: false; reason: "maximum-level" | "not-enough-insight"; price: number }
>;

export const PRESTIGE_UPGRADES = [
  { id: "reward-analysis", name: "Reward Analysis", maxLevel: 10, basePrice: 1, priceStep: 1 },
  { id: "solver-foundation", name: "Solver Foundation", maxLevel: 8, basePrice: 1, priceStep: 1 },
  { id: "tier-compression", name: "Tier Compression", maxLevel: 5, basePrice: 2, priceStep: 1 },
] satisfies readonly PrestigeUpgradeConfig[];

export function initialPrestigeUpgradeState(): PrestigeUpgradeState {
  return Object.fromEntries(PRESTIGE_UPGRADES.map((upgrade) => [upgrade.id, 0])) as PrestigeUpgradeState;
}

export function createInitialPrestigeState(): PrestigeState {
  return {
    insight: 0,
    lifetimeInsight: 0,
    count: 0,
    pendingInsight: 0,
    upgradeLevels: initialPrestigeUpgradeState(),
  };
}

export function getPrestigeUpgradeConfig(id: PrestigeUpgradeId): PrestigeUpgradeConfig {
  const upgrade = PRESTIGE_UPGRADES.find((entry) => entry.id === id);
  if (!upgrade) {
    throw new Error(`Unknown prestige upgrade ${id}`);
  }
  return upgrade;
}

export function getPrestigeUpgradePrice(id: PrestigeUpgradeId, level: number): number {
  const upgrade = getPrestigeUpgradeConfig(id);
  return upgrade.basePrice + level * upgrade.priceStep;
}

export function canPurchasePrestigeUpgrade(prestige: PrestigeState, id: PrestigeUpgradeId): PrestigePurchaseOutcome {
  const upgrade = getPrestigeUpgradeConfig(id);
  const level = prestige.upgradeLevels[id] ?? 0;
  const price = getPrestigeUpgradePrice(id, level);
  if (level >= upgrade.maxLevel) {
    return { ok: false, reason: "maximum-level", price };
  }
  if (prestige.insight < price) {
    return { ok: false, reason: "not-enough-insight", price };
  }
  return { ok: true, price };
}

export function prestigeRewardMultiplier(levels: PrestigeUpgradeState): number {
  return 1 + (levels["reward-analysis"] ?? 0) * GAME_CONFIG.reward.prestigeRewardMultiplierPerLevel;
}

export function solverFoundationBonus(levels: PrestigeUpgradeState): number {
  return (levels["solver-foundation"] ?? 0) * GAME_CONFIG.prestige.solverFoundationNodesPerSecondPerLevel;
}

export function tierCompressionDiscount(levels: PrestigeUpgradeState): number {
  return Math.min(
    GAME_CONFIG.prestige.tierPriceMaxDiscount,
    (levels["tier-compression"] ?? 0) * GAME_CONFIG.prestige.tierPriceDiscountPerLevel,
  );
}
