import { describe, expect, it } from "vitest";
import { createInitialSave } from "./schema";
import { exportSave, importSave, loadSave, saveGame } from "./saveRepository";

describe("save repository", () => {
  it("round trips a valid save", () => {
    const storage = window.localStorage;
    storage.clear();
    const save = createInitialSave(new Date("2026-01-01T00:00:00.000Z"));
    saveGame(save, storage);
    const loaded = loadSave(storage);
    expect(loaded.save.schemaVersion).toBe(1);
    expect(importSave(exportSave(loaded.save))).not.toBeNull();
  });

  it("recovers from backup when primary is corrupt", () => {
    const storage = window.localStorage;
    storage.clear();
    const save = createInitialSave();
    saveGame(save, storage);
    storage.setItem("puzzle_incremental.save.v1", "{bad");
    const loaded = loadSave(storage);
    expect(loaded.recovered).toBe(true);
  });

  it("fills new settings fields for older saves", () => {
    const storage = window.localStorage;
    storage.clear();
    const save = createInitialSave(new Date("2026-01-01T00:00:00.000Z"));
    const legacyUpgradeLevels = Object.fromEntries(
      Object.entries(save.progression.upgradeLevels).filter(([upgradeId]) => !["tier-6", "tier-7", "tier-8", "tier-9"].includes(upgradeId)),
    );
    const legacySave = {
      ...save,
      progression: {
        ...save.progression,
        upgradeLevels: legacyUpgradeLevels,
      },
      statistics: {
        ...save.statistics,
        manualClearsByTier: { 0: 2, 1: 1 },
      },
      settings: {
        visualization: save.settings.visualization,
        animationSpeed: save.settings.animationSpeed,
        highContrast: save.settings.highContrast,
        theme: save.settings.theme,
      },
    };
    delete (legacySave as Record<string, unknown>).prestige;
    delete (legacySave as Record<string, unknown>).run;
    storage.setItem("puzzle_incremental.save.v1", JSON.stringify(legacySave));
    const loaded = loadSave(storage);
    expect(loaded.save.settings.language).toBe("ja");
    expect(loaded.save.settings.notificationsEnabled).toBe(true);
    expect(loaded.save.settings.tutorialCompleted).toBe(false);
    expect(loaded.save.settings.hidePurchasedUpgrades).toBe(true);
    expect(loaded.save.settings.solverLaneMinSessionMs).toBe(1000);
    expect(loaded.save.settings.solverLanePreviewUpdateMs).toBe(250);
    expect(loaded.save.settings.uiScale).toBe(1);
    expect(loaded.save.statistics.manualClearsByTier).toEqual({ 0: 2, 1: 1 });
    expect(loaded.save.run.manualClearsByTier).toEqual({ 0: 2, 1: 1 });
    expect(loaded.save.run.clearsByTier).toEqual({});
    expect(loaded.save.run.highestTier).toBe(1);
    expect(loaded.save.prestige.insight).toBe(0);
    expect(loaded.save.prestige.pendingInsight).toBe(0);
    expect(loaded.save.prestige.upgradeLevels["reward-analysis"]).toBe(0);
    expect(loaded.save.prestige.upgradeLevels["tier-compression"]).toBe(0);
    expect(loaded.save.progression.upgradeLevels["tier-6"]).toBe(0);
    expect(loaded.save.progression.upgradeLevels["tier-9"]).toBe(0);
  });
});
