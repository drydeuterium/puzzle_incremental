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
    const legacySave = {
      ...save,
      settings: {
        visualization: save.settings.visualization,
        animationSpeed: save.settings.animationSpeed,
        highContrast: save.settings.highContrast,
        theme: save.settings.theme,
      },
    };
    storage.setItem("puzzle_incremental.save.v1", JSON.stringify(legacySave));
    const loaded = loadSave(storage);
    expect(loaded.save.settings.language).toBe("en");
    expect(loaded.save.settings.tutorialCompleted).toBe(false);
  });
});
