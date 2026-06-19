import { GAME_CONFIG } from "../game/config";
import {
  SOLVER_LANE_MIN_SESSION_MS_DEFAULT,
  SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT,
  UI_SCALE_DEFAULT,
  normalizeSolverLaneMinSessionMs,
  normalizeSolverLanePreviewUpdateMs,
  normalizeUiScale,
} from "../game/settings";
import { CHALLENGES, createInitialChallengeState, initialChallengeUpgradeState } from "../game/challenges";
import { createInitialPrestigeState, initialPrestigeUpgradeState } from "../game/prestige";
import { initialUpgradeState } from "../game/upgrades";
import type { ChallengeId, ChallengeState, ChallengeUpgradeState, PrestigeState, PrestigeUpgradeState, RunState, SaveDataV1, Statistics, UpgradeState, UserSettings } from "../core/types";

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
    language: "ja",
    notificationsEnabled: true,
    tutorialCompleted: false,
    hidePurchasedUpgrades: true,
    solverLaneMinSessionMs: SOLVER_LANE_MIN_SESSION_MS_DEFAULT,
    solverLanePreviewUpdateMs: SOLVER_LANE_PREVIEW_UPDATE_MS_DEFAULT,
    uiScale: UI_SCALE_DEFAULT,
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

export function createInitialRunState(nowIso: string, activeChallengeId: ChallengeId | null = null): RunState {
  return {
    startedAt: nowIso,
    manualClearsByTier: {},
    clearsByTier: {},
    highestTier: 0,
    activeChallengeId,
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
    prestige: createInitialPrestigeState(),
    challenge: createInitialChallengeState(),
    run: createInitialRunState(iso),
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

function normalizeUpgradeState(value: Record<string, unknown>): UpgradeState {
  const defaults = initialUpgradeState();
  return Object.fromEntries(
    Object.entries(defaults).map(([upgradeId, defaultLevel]) => [
      upgradeId,
      isSafeNonNegativeInteger(value[upgradeId]) ? value[upgradeId] : defaultLevel,
    ]),
  ) as UpgradeState;
}

function normalizePrestigeUpgradeState(value: Record<string, unknown>): PrestigeUpgradeState {
  const defaults = initialPrestigeUpgradeState();
  return Object.fromEntries(
    Object.entries(defaults).map(([upgradeId, defaultLevel]) => [
      upgradeId,
      isSafeNonNegativeInteger(value[upgradeId]) ? value[upgradeId] : defaultLevel,
    ]),
  ) as PrestigeUpgradeState;
}

function isChallengeId(value: unknown): value is ChallengeId {
  return typeof value === "string" && CHALLENGES.some((challenge) => challenge.id === value);
}

function normalizeChallengeUpgradeState(value: Record<string, unknown>): ChallengeUpgradeState {
  const defaults = initialChallengeUpgradeState();
  return Object.fromEntries(
    Object.entries(defaults).map(([upgradeId, defaultLevel]) => [
      upgradeId,
      isSafeNonNegativeInteger(value[upgradeId]) ? value[upgradeId] : defaultLevel,
    ]),
  ) as ChallengeUpgradeState;
}

function normalizeChallengeState(value: unknown): ChallengeState {
  const defaults = createInitialChallengeState();
  if (!isRecord(value)) {
    return defaults;
  }
  const rawCompletions = isRecord(value.completions) ? value.completions : {};
  return {
    seals: isSafeNonNegativeInteger(value.seals) ? value.seals : defaults.seals,
    lifetimeSeals: isSafeNonNegativeInteger(value.lifetimeSeals) ? value.lifetimeSeals : defaults.lifetimeSeals,
    completions: Object.fromEntries(
      Object.keys(defaults.completions).map((challengeId) => [
        challengeId,
        isSafeNonNegativeInteger(rawCompletions[challengeId]) ? rawCompletions[challengeId] : defaults.completions[challengeId as ChallengeId],
      ]),
    ) as Readonly<Record<ChallengeId, number>>,
    upgradeLevels: isRecord(value.upgradeLevels) ? normalizeChallengeUpgradeState(value.upgradeLevels) : defaults.upgradeLevels,
  };
}

function normalizePrestigeState(value: unknown): PrestigeState {
  const defaults = createInitialPrestigeState();
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    insight: isSafeNonNegativeInteger(value.insight) ? value.insight : defaults.insight,
    lifetimeInsight: isSafeNonNegativeInteger(value.lifetimeInsight) ? value.lifetimeInsight : defaults.lifetimeInsight,
    count: isSafeNonNegativeInteger(value.count) ? value.count : defaults.count,
    pendingInsight: isSafeNonNegativeInteger(value.pendingInsight) ? value.pendingInsight : defaults.pendingInsight,
    upgradeLevels: isRecord(value.upgradeLevels) ? normalizePrestigeUpgradeState(value.upgradeLevels) : defaults.upgradeLevels,
  };
}

function normalizeRunState(value: unknown, fallbackStartedAt: string, legacyManualClearsByTier: Readonly<Record<string, number>>): RunState {
  const defaults = createInitialRunState(fallbackStartedAt);
  if (!isRecord(value)) {
    const highestLegacyTier = Object.keys(legacyManualClearsByTier).reduce((highest, tier) => {
      const parsed = Number(tier);
      return Number.isSafeInteger(parsed) ? Math.max(highest, parsed) : highest;
    }, 0);
    return {
      ...defaults,
      manualClearsByTier: legacyManualClearsByTier,
      clearsByTier: {},
      highestTier: highestLegacyTier,
    };
  }
  return {
    startedAt: typeof value.startedAt === "string" ? value.startedAt : defaults.startedAt,
    manualClearsByTier: isRecord(value.manualClearsByTier) ? normalizeCountRecord(value.manualClearsByTier) : legacyManualClearsByTier,
    clearsByTier: isRecord(value.clearsByTier) ? normalizeCountRecord(value.clearsByTier) : defaults.clearsByTier,
    highestTier: isSafeNonNegativeInteger(value.highestTier) ? value.highestTier : defaults.highestTier,
    activeChallengeId: isChallengeId(value.activeChallengeId) ? value.activeChallengeId : defaults.activeChallengeId,
  };
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
  const normalizedManualClearsByTier = isRecord(statistics.manualClearsByTier) ? normalizeCountRecord(statistics.manualClearsByTier) : defaultStatistics.manualClearsByTier;
  const fallbackStartedAt = typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString();
  const normalized: SaveDataV1 = {
    ...(value as SaveDataV1),
    progression: {
      ...(value as SaveDataV1).progression,
      upgradeLevels: normalizeUpgradeState(progression.upgradeLevels),
    },
    prestige: normalizePrestigeState(value.prestige),
    challenge: normalizeChallengeState(value.challenge),
    run: normalizeRunState(value.run, fallbackStartedAt, normalizedManualClearsByTier),
    statistics: {
      ...(value as SaveDataV1).statistics,
      manualClearsByTier: normalizedManualClearsByTier,
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
      solverLaneMinSessionMs: normalizeSolverLaneMinSessionMs(settings.solverLaneMinSessionMs),
      solverLanePreviewUpdateMs: normalizeSolverLanePreviewUpdateMs(settings.solverLanePreviewUpdateMs),
      uiScale: normalizeUiScale(settings.uiScale),
    },
  };
  return normalized;
}
