import { describe, expect, it } from "vitest";
import {
  autoSolverManualClearRequirement,
  canPurchaseChallengeUpgrade,
  challengeSealReward,
  createInitialChallengeState,
  getChallengeUpgradePrice,
  initialChallengeUpgradeState,
  insightMinimumTier,
  insightRewardForClear,
  manualInsightRewardForTier,
} from "./challenges";

describe("challenges", () => {
  it("creates an empty challenge state", () => {
    const state = createInitialChallengeState();
    expect(state.seals).toBe(0);
    expect(state.lifetimeSeals).toBe(0);
    expect(state.completions["manual-only"]).toBe(0);
    expect(state.upgradeLevels["insight-ladder"]).toBe(0);
  });

  it("prices and gates seal upgrades", () => {
    const empty = createInitialChallengeState();
    expect(getChallengeUpgradePrice("insight-ladder", 0)).toBe(2);
    expect(getChallengeUpgradePrice("insight-ladder", 3)).toBe(5);
    expect(canPurchaseChallengeUpgrade(empty, "insight-ladder")).toMatchObject({ ok: false, reason: "not-enough-seals", price: 2 });

    const funded = { ...empty, seals: 12 };
    expect(canPurchaseChallengeUpgrade(funded, "assisted-insight")).toMatchObject({ ok: true, price: 12 });
    expect(canPurchaseChallengeUpgrade(funded, "automated-insight")).toMatchObject({ ok: false, reason: "missing-prerequisite" });
  });

  it("maps insight ladder levels to the minimum eligible tier", () => {
    const levels = initialChallengeUpgradeState();
    expect(insightMinimumTier(levels)).toBe(9);
    expect(manualInsightRewardForTier(8, levels)).toBe(0);
    expect(manualInsightRewardForTier(9, levels)).toBe(1);

    const maxed = { ...levels, "insight-ladder": 8 };
    expect(insightMinimumTier(maxed)).toBe(1);
    expect(Array.from({ length: 9 }, (_, index) => manualInsightRewardForTier(index + 1, maxed))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("requires seal upgrades before assisted or automated clears generate insight", () => {
    const ladder = { ...initialChallengeUpgradeState(), "insight-ladder": 8 };
    expect(insightRewardForClear(9, "assisted", ladder)).toBe(0);
    expect(insightRewardForClear(9, "automated", ladder)).toBe(0);

    const assisted = { ...ladder, "assisted-insight": 1 };
    expect(insightRewardForClear(9, "assisted", assisted)).toBe(4);
    expect(insightRewardForClear(1, "assisted", assisted)).toBe(1);

    const automated = { ...assisted, "automated-insight": 1 };
    expect(insightRewardForClear(9, "automated", automated)).toBe(1);
  });

  it("reduces auto solver manual clear requirements", () => {
    const levels = initialChallengeUpgradeState();
    expect(autoSolverManualClearRequirement(levels)).toBe(5);
    expect(autoSolverManualClearRequirement({ ...levels, "automation-procedure": 3 })).toBe(2);
  });

  it("awards first and repeat seal rewards for challenges", () => {
    const empty = createInitialChallengeState();
    expect(challengeSealReward(empty, "manual-only")).toBe(1);
    expect(challengeSealReward(empty, "low-reward")).toBe(3);

    const completed = { ...empty, completions: { ...empty.completions, "low-reward": 1 } };
    expect(challengeSealReward(completed, "low-reward")).toBe(1);
  });
});
