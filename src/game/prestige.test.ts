import { describe, expect, it } from "vitest";
import {
  canPurchasePrestigeUpgrade,
  createInitialPrestigeState,
  getPrestigeUpgradePrice,
  initialPrestigeUpgradeState,
  prestigeRewardMultiplier,
  tierCompressionDiscount,
} from "./prestige";

describe("prestige", () => {
  it("creates an empty prestige state", () => {
    const state = createInitialPrestigeState();
    expect(state.insight).toBe(0);
    expect(state.lifetimeInsight).toBe(0);
    expect(state.count).toBe(0);
    expect(state.pendingInsight).toBe(0);
    expect(state.upgradeLevels).toEqual({
      "reward-analysis": 0,
      "solver-foundation": 0,
      "tier-compression": 0,
    });
  });

  it("prices permanent upgrades from their current level", () => {
    expect(getPrestigeUpgradePrice("reward-analysis", 0)).toBe(1);
    expect(getPrestigeUpgradePrice("reward-analysis", 4)).toBe(5);
    expect(getPrestigeUpgradePrice("tier-compression", 0)).toBe(2);
    expect(getPrestigeUpgradePrice("tier-compression", 4)).toBe(6);
  });

  it("blocks permanent purchases without enough Insight or above max level", () => {
    const empty = createInitialPrestigeState();
    expect(canPurchasePrestigeUpgrade(empty, "reward-analysis")).toMatchObject({ ok: false, reason: "not-enough-insight", price: 1 });

    const funded = { ...empty, insight: 1 };
    expect(canPurchasePrestigeUpgrade(funded, "reward-analysis")).toMatchObject({ ok: true, price: 1 });

    const maxed = {
      ...funded,
      upgradeLevels: { ...funded.upgradeLevels, "reward-analysis": 10 },
    };
    expect(canPurchasePrestigeUpgrade(maxed, "reward-analysis")).toMatchObject({ ok: false, reason: "maximum-level" });
  });

  it("maps permanent levels to reward and tier price effects", () => {
    const levels = { ...initialPrestigeUpgradeState(), "reward-analysis": 3, "tier-compression": 8 };
    expect(prestigeRewardMultiplier(levels)).toBeCloseTo(1.3);
    expect(tierCompressionDiscount(levels)).toBe(0.25);
  });
});
