import { GAME_CONFIG } from "../game/config";
import { initialUpgradeState } from "../game/upgrades";
import type { SaveDataV1, Statistics, UserSettings } from "../core/types";

export const SAVE_KEY = "puzzle_incremental.save.v1";
export const BACKUP_SAVE_KEY = "puzzle_incremental.save.backup";
export const CORRUPT_SAVE_PREFIX = "puzzle_incremental.save.corrupt.";

export function defaultSettings(): UserSettings {
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    visualization: prefersReduced ? "reduced" : "on",
    animationSpeed: 1,
    highContrast: false,
    theme: "system",
  };
}

export function createInitialStatistics(nowIso: string): Statistics {
  return {
    totalClears: 0,
    manualClears: 0,
    assistedClears: 0,
    automatedClears: 0,
    clearsByTier: {},
    lifetimeSolverNodes: 0,
    lifetimeBacktracks: 0,
    automatedCellsSolved: 0,
    fastestManualClearMilliseconds: null,
    maximumDifficultyScore: 0,
    startedAt: nowIso,
    lastSavedAt: nowIso,
  };
}

export function createInitialSave(now = new Date()): SaveDataV1 {
  const iso = now.toISOString();
  return {
    schemaVersion: 1,
    gameConfigVersion: GAME_CONFIG.gameConfigVersion,
    generatorVersion: GAME_CONFIG.generatorVersion,
    createdAt: iso,
    updatedAt: iso,
    economy: {
      compute: GAME_CONFIG.currency.startingAmount,
      lifetimeCompute: 0,
    },
    progression: {
      upgradeLevels: initialUpgradeState(),
      selectedTier: 0,
      autoSeedCounters: {},
    },
    currentPuzzle: null,
    statistics: createInitialStatistics(iso),
    settings: defaultSettings(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function validateSaveData(value: unknown): SaveDataV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }
  const economy = value.economy;
  const progression = value.progression;
  const statistics = value.statistics;
  const settings = value.settings;
  if (!isRecord(economy) || !isSafeNonNegativeInteger(economy.compute) || !isSafeNonNegativeInteger(economy.lifetimeCompute)) {
    return null;
  }
  if (!isRecord(progression) || !isRecord(progression.upgradeLevels) || !isSafeNonNegativeInteger(progression.selectedTier)) {
    return null;
  }
  if (!isRecord(statistics) || !isSafeNonNegativeInteger(statistics.totalClears)) {
    return null;
  }
  if (!isRecord(settings)) {
    return null;
  }
  return value as SaveDataV1;
}
