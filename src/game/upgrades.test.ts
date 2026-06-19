import { describe, expect, it } from "vitest";
import { initialPrestigeUpgradeState } from "./prestige";
import { automatedRewardMultiplier, canPurchaseUpgrade, getUpgradePrice, initialUpgradeState, isAutoSolverReady, isTierUnlocked, nodesPerSecond, solverOptionsFromUpgrades } from "./upgrades";

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

  it("enables high-tier pruning only on tier seven and above", () => {
    const levels = {
      ...initialUpgradeState(),
      "isolated-region-pruning": 1,
      "zero-candidate-pruning": 1,
      "color-balance-pruning": 1,
      "partial-board-cache": 2,
    };
    const tierSixOptions = solverOptionsFromUpgrades(levels, "off", 6);
    expect(tierSixOptions.heuristics.isolatedRegionPruning).toBe(false);
    expect(tierSixOptions.heuristics.zeroCandidatePruning).toBe(false);
    expect(tierSixOptions.heuristics.colorBalancePruning).toBe(false);
    expect(tierSixOptions.heuristics.partialBoardCacheEntries).toBe(0);

    const tierSevenOptions = solverOptionsFromUpgrades(levels, "off", 7);
    expect(tierSevenOptions.heuristics.isolatedRegionPruning).toBe(true);
    expect(tierSevenOptions.heuristics.zeroCandidatePruning).toBe(true);
    expect(tierSevenOptions.heuristics.colorBalancePruning).toBe(true);
    expect(tierSevenOptions.heuristics.partialBoardCacheEntries).toBe(4000);
  });

  it("unlocks tiers through the linear chain", () => {
    const manualClearsByTier = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 };
    const levels = {
      ...initialUpgradeState(),
      "tier-1": 1,
      "tier-2": 1,
      "auto-solver": 1,
      "tier-3": 1,
    };
    expect(initialUpgradeState()["tier-9"]).toBe(0);
    expect(canPurchaseUpgrade(levels, 9500, "tier-4", manualClearsByTier).ok).toBe(true);
    expect(isTierUnlocked({ ...levels, "tier-4": 1 }, 4)).toBe(true);
    expect(canPurchaseUpgrade({ ...levels, "tier-4": 1 }, 19_000, "tier-5", manualClearsByTier).ok).toBe(true);
    expect(canPurchaseUpgrade({ ...levels, "tier-4": 1, "tier-5": 1 }, 42_000, "tier-6", manualClearsByTier).ok).toBe(true);
    expect(canPurchaseUpgrade({ ...levels, "tier-4": 1, "tier-5": 1, "tier-6": 1, "tier-7": 1, "tier-8": 1 }, 420_000, "tier-9", manualClearsByTier).ok).toBe(true);
  });

  it("requires a manual clear on the previous tier before buying the next tier", () => {
    const levels = initialUpgradeState();
    expect(canPurchaseUpgrade(levels, 350, "tier-1")).toMatchObject({ ok: false, reason: "missing-manual-clear", requiredTier: 0 });
    expect(canPurchaseUpgrade(levels, 350, "tier-1", { 0: 1 }).ok).toBe(true);
  });

  it("uses slower base solver speed and requires manual clears per tier", () => {
    const levels = { ...initialUpgradeState(), "auto-solver": 1 };
    expect(nodesPerSecond(levels)).toBe(2);
    expect(isAutoSolverReady(levels, { 0: 4 }, 0)).toBe(false);
    expect(isAutoSolverReady(levels, { 0: 5 }, 0)).toBe(true);
    expect(isAutoSolverReady(levels, { 0: 2 }, 0, 2)).toBe(true);
  });

  it("applies prestige solver foundation before throughput multipliers", () => {
    const levels = { ...initialUpgradeState(), "solver-throughput": 1 };
    const prestigeLevels = { ...initialPrestigeUpgradeState(), "solver-foundation": 3 };
    expect(nodesPerSecond(levels, prestigeLevels)).toBe(Math.round(5 * 1.55));
  });

  it("applies tier compression only to tier unlock prices", () => {
    const prestigeLevels = { ...initialPrestigeUpgradeState(), "tier-compression": 2 };
    expect(getUpgradePrice("tier-1", 0, prestigeLevels)).toBe(315);
    expect(getUpgradePrice("placement-scanner", 0, prestigeLevels)).toBe(120);
  });

  it("applies expensive tier challenge only to tier unlock prices", () => {
    const prestigeLevels = initialPrestigeUpgradeState();
    expect(getUpgradePrice("tier-1", 0, prestigeLevels, "expensive-tiers")).toBe(525);
    expect(getUpgradePrice("placement-scanner", 0, prestigeLevels, "expensive-tiers")).toBe(120);
  });

  it("starts automated rewards at 0.1x and improves them with solver payout", () => {
    const levels = initialUpgradeState();
    expect(automatedRewardMultiplier(levels)).toBeCloseTo(0.1);
    expect(automatedRewardMultiplier({ ...levels, "solver-payout": 1 })).toBeGreaterThan(0.1);
    expect(automatedRewardMultiplier({ ...levels, "solver-payout": 10 })).toBeCloseTo(1);
  });
});
