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
    language: "en",
    notificationsEnabled: true,
    tutorialCompleted: false,
    hidePurchasedUpgrades: true,
  };
}

export function createInitialStatistics(nowIso: string): Statistics {
  return {
    totalClears: 0,
    manualClears: 0,
    assistedClears: 0,
    automatedClears: 0,
    clearsByTier: {},
    manualClearsByTier: {},
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

function isVisualization(value: unknown): value is UserSettings["visualization"] {
  return value === "on" || value === "reduced" || value === "off";
}

function isTheme(value: unknown): value is UserSettings["theme"] {
  return value === "system" || value === "light" || value === "dark";
}

function isLanguage(value: unknown): value is UserSettings["language"] {
  return value === "en" || value === "ja";
}

function normalizeCountRecord(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([, count]) => isSafeNonNegativeInteger(count))) as Record<string, number>;
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
  const defaults = defaultSettings();
  const defaultStatistics = createInitialStatistics(typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString());
  const normalized: SaveDataV1 = {
    ...(value as SaveDataV1),
    statistics: {
      ...(value as SaveDataV1).statistics,
      manualClearsByTier: isRecord(statistics.manualClearsByTier) ? normalizeCountRecord(statistics.manualClearsByTier) : defaultStatistics.manualClearsByTier,
    },
    settings: {
      visualization: isVisualization(settings.visualization) ? settings.visualization : defaults.visualization,
      animationSpeed: typeof settings.animationSpeed === "number" ? settings.animationSpeed : defaults.animationSpeed,
      highContrast: typeof settings.highContrast === "boolean" ? settings.highContrast : defaults.highContrast,
      theme: isTheme(settings.theme) ? settings.theme : defaults.theme,
      language: isLanguage(settings.language) ? settings.language : defaults.language,
      notificationsEnabled: typeof settings.notificationsEnabled === "boolean" ? settings.notificationsEnabled : defaults.notificationsEnabled,
      tutorialCompleted: typeof settings.tutorialCompleted === "boolean" ? settings.tutorialCompleted : defaults.tutorialCompleted,
      hidePurchasedUpgrades: typeof settings.hidePurchasedUpgrades === "boolean" ? settings.hidePurchasedUpgrades : defaults.hidePurchasedUpgrades,
    },
  };
  return normalized;
}
