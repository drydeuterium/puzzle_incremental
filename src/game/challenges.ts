import { GAME_CONFIG } from "./config";
import type { ChallengeId, ChallengeState, ChallengeUpgradeId, ChallengeUpgradeState, ClearClassification } from "../core/types";

export type ChallengeConfig = Readonly<{
  id: ChallengeId;
  firstSealReward: number;
  replaySealReward: number;
  tierPriceMultiplier: number;
  computeRewardMultiplier: number;
  autoSolverAllowed: boolean;
}>;

export type ChallengeUpgradeConfig = Readonly<{
  id: ChallengeUpgradeId;
  maxLevel: number;
  basePrice: number;
  priceStep: number;
  prerequisite?: ChallengeUpgradeId;
}>;

export type ChallengePurchaseOutcome = Readonly<
  | { ok: true; price: number }
  | { ok: false; reason: "maximum-level" | "missing-prerequisite" | "not-enough-seals"; price: number; prerequisite?: ChallengeUpgradeId }
>;

export const CHALLENGES = [
  { id: "manual-only", firstSealReward: 1, replaySealReward: 1, tierPriceMultiplier: 1, computeRewardMultiplier: 1, autoSolverAllowed: false },
  { id: "expensive-tiers", firstSealReward: 2, replaySealReward: 1, tierPriceMultiplier: 1.5, computeRewardMultiplier: 1, autoSolverAllowed: true },
  { id: "low-reward", firstSealReward: 3, replaySealReward: 1, tierPriceMultiplier: 1, computeRewardMultiplier: 0.5, autoSolverAllowed: true },
] satisfies readonly ChallengeConfig[];

export const CHALLENGE_UPGRADES = [
  { id: "automation-procedure", maxLevel: 3, basePrice: 1, priceStep: 1 },
  { id: "insight-ladder", maxLevel: 8, basePrice: 2, priceStep: 1 },
  { id: "assisted-insight", maxLevel: 1, basePrice: 12, priceStep: 0 },
  { id: "automated-insight", maxLevel: 1, basePrice: 24, priceStep: 0, prerequisite: "assisted-insight" },
  { id: "initial-analysis", maxLevel: 5, basePrice: 1, priceStep: 1 },
] satisfies readonly ChallengeUpgradeConfig[];

export function initialChallengeUpgradeState(): ChallengeUpgradeState {
  return Object.fromEntries(CHALLENGE_UPGRADES.map((upgrade) => [upgrade.id, 0])) as ChallengeUpgradeState;
}

export function createInitialChallengeState(): ChallengeState {
  return {
    seals: 0,
    lifetimeSeals: 0,
    completions: {
      "manual-only": 0,
      "expensive-tiers": 0,
      "low-reward": 0,
    },
    upgradeLevels: initialChallengeUpgradeState(),
  };
}

export function getChallengeConfig(id: ChallengeId): ChallengeConfig {
  const challenge = CHALLENGES.find((entry) => entry.id === id);
  if (!challenge) {
    throw new Error(`Unknown challenge ${id}`);
  }
  return challenge;
}

export function getChallengeUpgradeConfig(id: ChallengeUpgradeId): ChallengeUpgradeConfig {
  const upgrade = CHALLENGE_UPGRADES.find((entry) => entry.id === id);
  if (!upgrade) {
    throw new Error(`Unknown challenge upgrade ${id}`);
  }
  return upgrade;
}

export function getChallengeUpgradePrice(id: ChallengeUpgradeId, level: number): number {
  const upgrade = getChallengeUpgradeConfig(id);
  return upgrade.basePrice + level * upgrade.priceStep;
}

export function canPurchaseChallengeUpgrade(challenge: ChallengeState, id: ChallengeUpgradeId): ChallengePurchaseOutcome {
  const upgrade = getChallengeUpgradeConfig(id);
  const level = challenge.upgradeLevels[id] ?? 0;
  const price = getChallengeUpgradePrice(id, level);
  if (level >= upgrade.maxLevel) {
    return { ok: false, reason: "maximum-level", price };
  }
  if (upgrade.prerequisite && (challenge.upgradeLevels[upgrade.prerequisite] ?? 0) <= 0) {
    return { ok: false, reason: "missing-prerequisite", prerequisite: upgrade.prerequisite, price };
  }
  if (challenge.seals < price) {
    return { ok: false, reason: "not-enough-seals", price };
  }
  return { ok: true, price };
}

export function challengeTierPriceMultiplier(activeChallengeId: ChallengeId | null): number {
  return activeChallengeId ? getChallengeConfig(activeChallengeId).tierPriceMultiplier : 1;
}

export function challengeComputeRewardMultiplier(activeChallengeId: ChallengeId | null): number {
  return activeChallengeId ? getChallengeConfig(activeChallengeId).computeRewardMultiplier : 1;
}

export function isAutoSolverAllowedForChallenge(activeChallengeId: ChallengeId | null): boolean {
  return activeChallengeId ? getChallengeConfig(activeChallengeId).autoSolverAllowed : true;
}

export function autoSolverManualClearRequirement(levels: ChallengeUpgradeState): number {
  return Math.max(2, GAME_CONFIG.solver.manualClearsRequiredByTierForAutoSolver - (levels["automation-procedure"] ?? 0));
}

export function insightMinimumTier(levels: ChallengeUpgradeState): number {
  return Math.max(1, GAME_CONFIG.prestige.requiredTier - (levels["insight-ladder"] ?? 0));
}

export function initialComputeBonus(levels: ChallengeUpgradeState): number {
  return (levels["initial-analysis"] ?? 0) * 300;
}

function regularTierManualInsightReward(tier: number, levels: ChallengeUpgradeState): number {
  if (tier <= 0 || tier > GAME_CONFIG.prestige.requiredTier) {
    return 0;
  }
  const minimumTier = insightMinimumTier(levels);
  return tier >= minimumTier ? tier - minimumTier + 1 : 0;
}

function fixedTierInsightReward(tier: number): number {
  return GAME_CONFIG.tiers.find((entry) => entry.id === tier)?.insightReward ?? 0;
}

export function manualInsightRewardForTier(tier: number, levels: ChallengeUpgradeState): number {
  return fixedTierInsightReward(tier) || regularTierManualInsightReward(tier, levels);
}

export function insightRewardForClear(tier: number, classification: ClearClassification, levels: ChallengeUpgradeState): number {
  const baseReward = manualInsightRewardForTier(tier, levels);
  if (baseReward <= 0) {
    return 0;
  }
  if (classification === "manual") {
    return baseReward;
  }
  if (fixedTierInsightReward(tier) > 0) {
    return 0;
  }
  if (classification === "assisted" && (levels["assisted-insight"] ?? 0) > 0) {
    return Math.max(1, Math.floor(baseReward * 0.5));
  }
  if (classification === "automated" && (levels["automated-insight"] ?? 0) > 0) {
    return Math.max(1, Math.floor(baseReward * 0.1));
  }
  return 0;
}

export function challengeSealReward(challenge: ChallengeState, id: ChallengeId): number {
  return (challenge.completions[id] ?? 0) > 0 ? getChallengeConfig(id).replaySealReward : getChallengeConfig(id).firstSealReward;
}
