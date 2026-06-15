import { describe, expect, it } from "vitest";
import { canPurchaseUpgrade, initialUpgradeState, isTierUnlocked, solverOptionsFromUpgrades } from "./upgrades";

describe("upgrades", () => {
  it("blocks missing funds and prerequisites", () => {
    const levels = initialUpgradeState();
    expect(canPurchaseUpgrade(levels, 0, "placement-scanner").ok).toBe(false);
    expect(canPurchaseUpgrade(levels, 120, "placement-scanner").ok).toBe(true);
    expect(canPurchaseUpgrade(levels, 10_000, "contradiction-detector").ok).toBe(false);
  });

  it("maps purchased levels to solver options and tier unlocks", () => {
    const levels = { ...initialUpgradeState(), "tier-1": 1, "auto-solver": 1, "constraint-ordering": 1, "dead-state-cache": 2 };
    expect(isTierUnlocked(levels, 1)).toBe(true);
    const options = solverOptionsFromUpgrades(levels, "reduced");
    expect(options.heuristics.constraintOrdering).toBe(true);
    expect(options.heuristics.deadStateCacheEntries).toBe(2000);
  });
});
