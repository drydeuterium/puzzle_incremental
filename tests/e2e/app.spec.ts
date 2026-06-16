import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("fresh start manual clear", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const placements = [
      { pieceId: "p0", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 0 }, cellIndices: [0, 1, 4, 5] },
      { pieceId: "p1", pieceType: "O", orientationIndex: 0, anchor: { x: 2, y: 0 }, cellIndices: [2, 3, 6, 7] },
      { pieceId: "p2", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 2 }, cellIndices: [8, 9, 12, 13] },
      { pieceId: "p3", pieceType: "O", orientationIndex: 0, anchor: { x: 2, y: 2 }, cellIndices: [10, 11, 14, 15] },
    ];
    const save = {
      schemaVersion: 1,
      gameConfigVersion: "1.3.0-shape-complexity",
      generatorVersion: 4,
      createdAt: now,
      updatedAt: now,
      economy: { compute: 0, lifetimeCompute: 0 },
      progression: {
        upgradeLevels: {
          "placement-scanner": 0,
          "contradiction-detector": 0,
          "forced-move": 0,
          "auto-solver": 0,
          "solver-throughput": 0,
          "solver-payout": 0,
          "constraint-ordering": 0,
          "candidate-ordering": 0,
          "symmetry-pruning": 0,
          "dead-state-cache": 0,
          "parallel-solvers": 0,
          "tier-1": 0,
          "tier-2": 0,
          "tier-3": 0,
          "tier-4": 0,
          "tier-5": 0,
          "tier-6": 0,
          "tier-7": 0,
          "tier-8": 0,
          "tier-9": 0,
        },
        selectedTier: 0,
        autoSeedCounters: {},
      },
      currentPuzzle: {
        definition: {
          id: "e2e-fixture",
          generatorVersion: 4,
          tier: 0,
          seed: "e2e-fixture",
          width: 4,
          height: 4,
          usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
          blockedCellIndices: [],
          pieces: placements.map((placement) => ({ id: placement.pieceId, type: "O" })),
          difficulty: { score: 81, solutionNodes: 4, backtracks: 0, maxDepth: 4, forcedRatio: 1, initialBranching: 4, capped: false },
          constructionSolution: placements,
        },
        placements: [],
        classification: "manual",
        startedAt: now,
        elapsedMilliseconds: 0,
        cleared: false,
      },
      statistics: {
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
        startedAt: now,
        lastSavedAt: now,
      },
      settings: {
        visualization: "on",
        animationSpeed: 1,
        highContrast: false,
        theme: "system",
        language: "en",
        notificationsEnabled: true,
        tutorialCompleted: true,
        hidePurchasedUpgrades: true,
      },
    };
    localStorage.setItem("puzzle_incremental.save.v1", JSON.stringify(save));
    localStorage.setItem("puzzle_incremental.save.backup", JSON.stringify(save));
  });
  await page.reload();
  const anchors = [0, 2, 8, 10];
  for (let index = 0; index < anchors.length; index += 1) {
    await page.getByTestId(`piece-p${index}`).click();
    await page.getByTestId(`cell-${anchors[index]}`).click();
  }
  await expect(page.getByRole("dialog").getByText(/manual clear/i)).toBeVisible();
  await expect(page.getByTestId("compute")).not.toHaveText("0 C");
});

test("settings and persistence shell work", async ({ page }) => {
  await page.getByRole("button", { name: "Start Playing" }).click();
  await page.getByText("Settings").click();
  await page.getByLabel("Visualization").selectOption("off");
  await page.getByLabel("Theme").selectOption("dark");
  await page.getByLabel("Language").selectOption("ja");
  await page.getByText("閉じる").click();
  await page.reload();
  await page.getByText("設定").click();
  await expect(page.getByLabel("可視化")).toHaveValue("off");
  await expect(page.getByLabel("テーマ")).toHaveValue("dark");
  await expect(page.getByLabel("言語")).toHaveValue("ja");
});
