/* global console, process */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "src/game/config.ts");
const prestigePath = resolve(root, "src/game/prestige.ts");
const outputPath = resolve(root, process.argv[2] ?? "codex/cheat-save.json");

const configText = await readFile(configPath, "utf8");
const prestigeText = await readFile(prestigePath, "utf8");

const gameConfigVersion = /gameConfigVersion:\s*"([^"]+)"/.exec(configText)?.[1];
const generatorVersion = Number(/generatorVersion:\s*(\d+)/.exec(configText)?.[1]);
const tierIds = [...configText.matchAll(/makeTier\(\{\s*id:\s*(\d+)/g)].map((match) => Number(match[1]));
const upgradeLevels = Object.fromEntries(
  [...configText.matchAll(/\{\s*id:\s*"([^"]+)"[^}]*maxLevel:\s*(\d+)/g)]
    .map((match) => [match[1], Number(match[2])]),
);
const prestigeUpgradeLevels = Object.fromEntries(
  [...prestigeText.matchAll(/\{\s*id:\s*"([^"]+)"[^}]*maxLevel:\s*(\d+)/g)]
    .map((match) => [match[1], Number(match[2])]),
);

if (
  !gameConfigVersion
  || !Number.isSafeInteger(generatorVersion)
  || tierIds.length === 0
  || Object.keys(upgradeLevels).length === 0
  || Object.keys(prestigeUpgradeLevels).length === 0
) {
  throw new Error("Could not parse game config for cheat save generation.");
}

const now = new Date().toISOString();
const manualClearsByTier = Object.fromEntries(tierIds.map((tier) => [String(tier), 25]));

const save = {
  schemaVersion: 1,
  gameConfigVersion,
  generatorVersion,
  createdAt: now,
  updatedAt: now,
  economy: {
    compute: 1_000_000_000,
    lifetimeCompute: 1_000_000_000,
  },
  progression: {
    upgradeLevels,
    selectedTier: Math.max(...tierIds),
    autoSeedCounters: {},
  },
  prestige: {
    insight: 1000,
    lifetimeInsight: 1000,
    count: 10,
    pendingInsight: 1,
    upgradeLevels: prestigeUpgradeLevels,
  },
  run: {
    startedAt: now,
    manualClearsByTier,
    clearsByTier: Object.fromEntries(tierIds.map((tier) => [String(tier), 25])),
    highestTier: Math.max(...tierIds),
  },
  currentPuzzle: null,
  statistics: {
    totalClears: 0,
    manualClears: 0,
    assistedClears: 0,
    automatedClears: 0,
    clearsByTier: {},
    manualClearsByTier,
    lifetimeSolverNodes: 0,
    lifetimeBacktracks: 0,
    automatedCellsSolved: 0,
    fastestManualClearMilliseconds: null,
    maximumDifficultyScore: 0,
    startedAt: now,
    lastSavedAt: now,
  },
  settings: {
    visualization: "on",
    animationSpeed: 1,
    highContrast: false,
    theme: "system",
    language: "ja",
    notificationsEnabled: true,
    tutorialCompleted: true,
    hidePurchasedUpgrades: false,
    solverLaneMinSessionMs: 1000,
    solverLanePreviewUpdateMs: 250,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(save, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
