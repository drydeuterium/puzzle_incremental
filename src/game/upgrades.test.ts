import { describe, expect, it } from "vitest";
import { createInitialStatistics } from "../persistence/schema";
import { automatedRewardMultiplier, canPurchaseUpgrade, initialUpgradeState, isAutoSolverReady, isTierUnlocked, nodesPerSecond, solverOptionsFromUpgrades } from "./upgrades";

describe("upgrades", () => {
  it("blocks missing funds and prerequisites", () => {
    const levels = initialUpgradeState();
    expect(canPurchaseUpgrade(levels, 0, "placement-scanner")).toMatchObject({ ok: false, reason: "not-enough-compute" });
    expect(canPurchaseUpgrade(levels, 120, "placement-scanner").ok).toBe(true);
    expect(canPurchaseUpgrade(levels, 10_000, "contradiction-detector")).toMatchObject({ ok: false, reason: "missing-prerequisite", prerequisite: "placement-scanner" });
  });

  it("maps purchased levels to solver options and tier unlocks", () => {
    const levels = { ...initialUpgradeState(), "tier-1": 1, "auto-solver": 1, "constraint-ordering": 1, "dead-state-cache": 2 };
    expect(isTierUnlocked(levels, 1)).toBe(true);
    const options = solverOptionsFromUpgrades(levels, "reduced");
    expect(options.heuristics.constraintOrdering).toBe(true);
    expect(options.heuristics.deadStateCacheEntries).toBe(2000);
  });

  it("unlocks tiers through the linear chain", () => {
    const levels = {
      ...initialUpgradeState(),
      "tier-1": 1,
      "tier-2": 1,
      "auto-solver": 1,
      "tier-3": 1,
    };
    expect(initialUpgradeState()["tier-9"]).toBe(0);
    expect(canPurchaseUpgrade(levels, 9500, "tier-4").ok).toBe(true);
    expect(isTierUnlocked({ ...levels, "tier-4": 1 }, 4)).toBe(true);
    expect(canPurchaseUpgrade({ ...levels, "tier-4": 1 }, 19_000, "tier-5").ok).toBe(true);
    expect(canPurchaseUpgrade({ ...levels, "tier-4": 1, "tier-5": 1 }, 42_000, "tier-6").ok).toBe(true);
    expect(canPurchaseUpgrade({ ...levels, "tier-4": 1, "tier-5": 1, "tier-6": 1, "tier-7": 1, "tier-8": 1 }, 420_000, "tier-9").ok).toBe(true);
  });

  it("uses slower base solver speed and requires manual clears per tier", () => {
    const levels = { ...initialUpgradeState(), "auto-solver": 1 };
    const statistics = {
      ...createInitialStatistics("2026-01-01T00:00:00.000Z"),
      manualClearsByTier: { 0: 4 },
    };
    expect(nodesPerSecond(levels)).toBe(2);
    expect(isAutoSolverReady(levels, statistics, 0)).toBe(false);
    expect(isAutoSolverReady(levels, { ...statistics, manualClearsByTier: { 0: 5 } }, 0)).toBe(true);
  });

  it("starts automated rewards at 0.1x and improves them with solver payout", () => {
    const levels = initialUpgradeState();
    expect(automatedRewardMultiplier(levels)).toBeCloseTo(0.1);
    expect(automatedRewardMultiplier({ ...levels, "solver-payout": 1 })).toBeGreaterThan(0.1);
    expect(automatedRewardMultiplier({ ...levels, "solver-payout": 10 })).toBeCloseTo(1);
  });
});
