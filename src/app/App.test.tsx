import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { BACKUP_SAVE_KEY, createInitialSave, SAVE_KEY } from "../persistence/schema";
import { App } from "./App";

function seedKeyboardRotationPuzzle(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    currentPuzzle: {
      definition: {
        id: "keyboard-rotation-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 0,
        seed: "keyboard-rotation-fixture",
        width: 4,
        height: 4,
        usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
        blockedCellIndices: [],
        pieces: [{ id: "p0", type: "I" }],
        difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 1, forcedRatio: 1, initialBranching: 1, capped: false },
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedTwoPiecePuzzle(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    currentPuzzle: {
      definition: {
        id: "two-piece-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 0,
        seed: "two-piece-fixture",
        width: 4,
        height: 4,
        usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
        blockedCellIndices: [],
        pieces: [{ id: "p0", type: "I" }, { id: "p1", type: "I" }],
        difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 2, forcedRatio: 1, initialBranching: 2, capped: false },
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedClearPuzzle(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const placements = [
    { pieceId: "p0", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 0 }, cellIndices: [0, 1, 4, 5] },
    { pieceId: "p1", pieceType: "O", orientationIndex: 0, anchor: { x: 2, y: 0 }, cellIndices: [2, 3, 6, 7] },
    { pieceId: "p2", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 2 }, cellIndices: [8, 9, 12, 13] },
    { pieceId: "p3", pieceType: "O", orientationIndex: 0, anchor: { x: 2, y: 2 }, cellIndices: [10, 11, 14, 15] },
  ];
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    currentPuzzle: {
      definition: {
        id: "clear-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 0,
        seed: "clear-fixture",
        width: 4,
        height: 4,
        usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
        blockedCellIndices: [],
        pieces: placements.map((placement) => ({ id: placement.pieceId, type: "O" })),
        difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 4, forcedRatio: 1, initialBranching: 4, capped: false },
        constructionSolution: placements,
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedTierGatePuzzle(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const placements = [
    { pieceId: "p0", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 0 }, cellIndices: [0, 1, 4, 5] },
    { pieceId: "p1", pieceType: "O", orientationIndex: 0, anchor: { x: 2, y: 0 }, cellIndices: [2, 3, 6, 7] },
    { pieceId: "p2", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 2 }, cellIndices: [8, 9, 12, 13] },
    { pieceId: "p3", pieceType: "O", orientationIndex: 0, anchor: { x: 2, y: 2 }, cellIndices: [10, 11, 14, 15] },
  ];
  const save = {
    ...base,
    economy: { ...base.economy, compute: 1000 },
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    currentPuzzle: {
      definition: {
        id: "tier-gate-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 0,
        seed: "tier-gate-fixture",
        width: 4,
        height: 4,
        usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
        blockedCellIndices: [],
        pieces: placements.map((placement) => ({ id: placement.pieceId, type: "O" })),
        difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 4, forcedRatio: 1, initialBranching: 4, capped: false },
        constructionSolution: placements,
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedTierNineClearPuzzle(assisted = false): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    progression: {
      ...base.progression,
      selectedTier: 9,
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        ...(assisted
          ? {
              "placement-scanner": 1,
              "contradiction-detector": 1,
              "forced-move": 1,
            }
          : {}),
        "tier-1": 1,
        "tier-2": 1,
        "tier-3": 1,
        "tier-4": 1,
        "tier-5": 1,
        "tier-6": 1,
        "tier-7": 1,
        "tier-8": 1,
        "tier-9": 1,
      },
    },
    currentPuzzle: {
      definition: {
        id: "tier-nine-clear-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 9,
        seed: "tier-nine-clear-fixture",
        width: 2,
        height: 2,
        usableCellIndices: [0, 1, 2, 3],
        blockedCellIndices: [],
        pieces: [{ id: "p0", type: "O" }],
        difficulty: { score: 1200, solutionNodes: 1, backtracks: 0, maxDepth: 1, forcedRatio: 1, initialBranching: 1, capped: false },
        constructionSolution: [{ pieceId: "p0", pieceType: "O", orientationIndex: 0, anchor: { x: 0, y: 0 }, cellIndices: [0, 1, 2, 3] }],
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedPrestigeReadySave(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    economy: { compute: 1234, lifetimeCompute: 9876 },
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    progression: {
      ...base.progression,
      selectedTier: 9,
      autoSeedCounters: { 9: 3 },
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        "placement-scanner": 1,
        "tier-1": 1,
        "tier-2": 1,
        "tier-3": 1,
        "tier-4": 1,
        "tier-5": 1,
        "tier-6": 1,
        "tier-7": 1,
        "tier-8": 1,
        "tier-9": 1,
      },
    },
    prestige: {
      ...base.prestige,
      insight: 2,
      lifetimeInsight: 4,
      count: 1,
      pendingInsight: 1,
      upgradeLevels: {
        ...base.prestige.upgradeLevels,
        "reward-analysis": 1,
        "solver-foundation": 1,
        "tier-compression": 1,
      },
    },
    run: {
      ...base.run,
      manualClearsByTier: { 0: 1, 8: 1, 9: 1 },
      clearsByTier: { 0: 1, 9: 1 },
      highestTier: 9,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedUnsortedPiecePuzzle(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    currentPuzzle: {
      definition: {
        id: "unsorted-piece-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 0,
        seed: "unsorted-piece-fixture",
        width: 4,
        height: 4,
        usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
        blockedCellIndices: [],
        pieces: [
          { id: "p0", type: "Z" },
          { id: "p1", type: "I" },
          { id: "p2", type: "J" },
          { id: "p3", type: "I" },
        ],
        difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 4, forcedRatio: 1, initialBranching: 4, capped: false },
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedPurchasedUpgrade(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    progression: {
      ...base.progression,
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        "placement-scanner": 1,
      },
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedPurchasedFeatureUpgrades(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "ja", tutorialCompleted: true },
    progression: {
      ...base.progression,
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        "placement-scanner": 1,
        "contradiction-detector": 1,
        "forced-move": 1,
      },
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedContradictionDetector(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    progression: {
      ...base.progression,
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        "contradiction-detector": 1,
      },
    },
    currentPuzzle: {
      definition: {
        id: "contradiction-fixture",
        generatorVersion: GAME_CONFIG.generatorVersion,
        tier: 0,
        seed: "contradiction-fixture",
        width: 4,
        height: 4,
        usableCellIndices: Array.from({ length: 16 }, (_, index) => index),
        blockedCellIndices: [],
        pieces: [{ id: "p0", type: "I" }],
        difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 1, forcedRatio: 1, initialBranching: 1, capped: false },
      },
      placements: [],
      classification: "manual",
      startedAt: now.toISOString(),
      elapsedMilliseconds: 0,
      cleared: false,
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function seedAutoSolverProgress(manualClears: number, parallelSolverLevel = 0): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, language: "en", tutorialCompleted: true },
    progression: {
      ...base.progression,
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        "auto-solver": 1,
        "parallel-solvers": parallelSolverLevel,
      },
    },
    statistics: {
      ...base.statistics,
      manualClearsByTier: { 0: manualClears },
    },
    run: {
      ...base.run,
      manualClearsByTier: { 0: manualClears },
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

function upgradeNamesInPanel(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll(".upgrade-header strong")).map((element) => element.textContent ?? "");
}

describe("App", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders compute, board, pieces, and locked upgrade reasons", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "はじめ方" })).toBeInTheDocument();
    expect(screen.getByTestId("compute")).toHaveTextContent("0 C");
    expect(screen.getByText("Compute/s")).toBeInTheDocument();
    expect(screen.getByTestId("compute-per-second")).toHaveTextContent("0");
    expect(screen.getByRole("grid", { name: "パズル盤面" })).toBeInTheDocument();
    expect(screen.getAllByText(/未配置|配置済み/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Compute不足/).length).toBeGreaterThan(0);
  });

  it("selects and rotates a piece", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "始める" }));
    await user.click(screen.getByTestId("piece-p0"));
    await user.click(screen.getByText("右回転"));
    expect(screen.getByTestId("piece-p0")).toHaveTextContent("回転");
  });

  it("renders tier selection through Tier 9", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "始める" }));

    expect(screen.getByRole("button", { name: "Tier 0" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tier 9" })).toBeDisabled();
  });

  it("rotates the selected piece with arrow keys and A/D", async () => {
    seedKeyboardRotationPuzzle();
    const user = userEvent.setup();
    render(<App />);
    const piece = screen.getByTestId("piece-p0");

    await user.click(piece);
    expect(piece).toHaveTextContent("rot 0");

    await user.keyboard("d");
    expect(piece).toHaveTextContent("rot 1");

    await user.keyboard("a");
    expect(piece).toHaveTextContent("rot 0");

    await user.keyboard("{ArrowRight}");
    expect(piece).toHaveTextContent("rot 1");

    await user.keyboard("{ArrowLeft}");
    expect(piece).toHaveTextContent("rot 0");
  });

  it("uses R for board reset with an in-app confirmation dialog", async () => {
    seedTwoPiecePuzzle();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    const piece = screen.getByTestId("piece-p0");
    const cell = screen.getByTestId("cell-0");

    await user.click(piece);
    await user.click(cell);
    expect(piece).toHaveTextContent("Placed");

    await user.keyboard("r");
    expect(confirmSpy).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Reset Board");
    expect(dialog).toHaveTextContent("Remove all placed pieces");
    expect(piece).toHaveTextContent("Placed");

    await user.click(within(dialog).getByRole("button", { name: "Reset Board" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(piece).toHaveTextContent("Ready");
    expect(cell).toHaveTextContent("");
  });

  it("uses an in-app confirmation dialog before discarding the current puzzle", async () => {
    seedTwoPiecePuzzle();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    const piece = screen.getByTestId("piece-p0");

    await user.click(piece);
    await user.click(screen.getByTestId("cell-0"));
    await user.click(screen.getByRole("button", { name: "New Puzzle" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Discard current puzzle?");
    expect(dialog).toHaveTextContent("Placed pieces and current progress will be lost.");
    expect(piece).toHaveTextContent("Placed");

    await user.click(within(dialog).getByRole("button", { name: "Discard and continue" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("two-piece-fixture")).not.toBeInTheDocument();
  });

  it("rotates the selected piece with board wheel direction", async () => {
    seedKeyboardRotationPuzzle();
    const user = userEvent.setup();
    render(<App />);
    const piece = screen.getByTestId("piece-p0");
    const board = screen.getByRole("grid", { name: "Puzzle board" });

    await user.click(piece);
    fireEvent.wheel(board, { deltaY: 100 });
    expect(piece).toHaveTextContent("rot 1");

    fireEvent.wheel(board, { deltaY: -100 });
    expect(piece).toHaveTextContent("rot 0");
  });

  it("shows piece silhouettes in the tray", () => {
    seedTwoPiecePuzzle();
    render(<App />);

    expect(screen.getByTestId("piece-shape-p0")).toBeInTheDocument();
    expect(screen.getByTestId("piece-shape-p1")).toBeInTheDocument();
  });

  it("groups tray pieces by tetromino type", () => {
    seedUnsortedPiecePuzzle();
    render(<App />);

    const labels = Array.from(document.querySelectorAll(".piece-card strong")).map((entry) => entry.textContent);
    expect(labels).toEqual(["I #1", "I #3", "J #2", "Z #0"]);
  });

  it("removes a placed piece from the board with right click", async () => {
    seedTwoPiecePuzzle();
    const user = userEvent.setup();
    render(<App />);
    const piece = screen.getByTestId("piece-p0");
    const cell = screen.getByTestId("cell-0");

    await user.click(piece);
    await user.click(cell);
    expect(piece).toHaveTextContent("Placed");

    fireEvent.contextMenu(cell);
    expect(piece).toHaveTextContent("Ready");
    expect(cell).toHaveTextContent("");
  });

  it("removes a placed piece when right clicking an internal board gap", async () => {
    seedTwoPiecePuzzle();
    const user = userEvent.setup();
    render(<App />);
    const piece = screen.getByTestId("piece-p0");
    const board = screen.getByRole("grid", { name: "Puzzle board" });

    Object.defineProperty(board, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 132,
        bottom: 132,
        width: 132,
        height: 132,
        toJSON: () => ({}),
      }),
    });

    await user.click(piece);
    await user.click(screen.getByTestId("cell-0"));
    expect(piece).toHaveTextContent("Placed");

    fireEvent.contextMenu(board, { clientX: 32, clientY: 15 });
    expect(piece).toHaveTextContent("Ready");
  });

  it("closes the clear dialog without replacing the solved board", async () => {
    seedClearPuzzle();
    const user = userEvent.setup();
    render(<App />);
    const anchors = [0, 2, 8, 10];

    for (let index = 0; index < anchors.length; index += 1) {
      await user.click(screen.getByTestId(`piece-p${index}`));
      await user.click(screen.getByTestId(`cell-${anchors[index]}`));
    }

    expect(screen.getByRole("dialog")).toHaveTextContent("manual clear");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("cell-0")).toHaveTextContent("O");
    expect(screen.getByTestId("cell-15")).toHaveTextContent("O");
  });

  it("marks overlapping placement previews as invalid", async () => {
    seedTwoPiecePuzzle();
    const user = userEvent.setup();
    render(<App />);
    const cell = screen.getByTestId("cell-0");

    await user.click(screen.getByTestId("piece-p0"));
    await user.click(cell);
    await user.click(screen.getByTestId("piece-p1"));
    await user.hover(cell);

    expect(cell).toHaveClass("invalid-preview");
  });

  it("shows contradiction checks below the puzzle instead of the global toast", async () => {
    seedContradictionDetector();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("This position cannot be completed.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toHaveClass("toast");
  });

  it("shows theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "始める" }));
    await user.click(screen.getByText("設定"));
    expect(screen.getByLabelText("テーマ")).toHaveValue("system");
    expect(screen.getByLabelText("通知")).toBeChecked();
    await user.selectOptions(screen.getByLabelText("テーマ"), "dark");
    expect(screen.getByLabelText("テーマ")).toHaveValue("dark");
  });

  it("can hide toast notifications", async () => {
    seedTwoPiecePuzzle();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText("Settings"));
    await user.click(screen.getByLabelText("Notifications"));
    await user.click(screen.getByText("Close"));
    await user.click(screen.getByTestId("piece-p0"));
    await user.click(screen.getByTestId("cell-0"));
    await user.click(screen.getByTestId("piece-p1"));
    await user.click(screen.getByTestId("cell-0"));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can adjust solver lane timing settings", async () => {
    seedTwoPiecePuzzle();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText("Settings"));
    expect(screen.getByLabelText("Solver lane hold")).toHaveValue("1000");
    expect(screen.getByLabelText("Solver preview interval")).toHaveValue("250");

    fireEvent.change(screen.getByLabelText("Solver lane hold"), { target: { value: "2350" } });
    fireEvent.change(screen.getByLabelText("Solver preview interval"), { target: { value: "725" } });

    expect(screen.getByLabelText("Solver lane hold")).toHaveValue("2350");
    expect(screen.getByLabelText("Solver preview interval")).toHaveValue("725");
    expect(screen.getByText("2350ms")).toBeInTheDocument();
    expect(screen.getByText("725ms")).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "{}");
      expect(saved.settings.solverLaneMinSessionMs).toBe(2350);
      expect(saved.settings.solverLanePreviewUpdateMs).toBe(725);
    });
  });

  it("starts with Japanese settings copy and can switch to English", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "始める" }));
    await user.click(screen.getByText("設定"));
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("言語")).toHaveValue("ja");
    expect(screen.getByText("配置スキャナー")).toBeInTheDocument();
    expect(screen.getAllByText(/Compute不足/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("solver-status")).toHaveTextContent("待機");

    await user.selectOptions(screen.getByLabelText("言語"), "en");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toHaveValue("en");
  });

  it("hides purchased upgrades by default and can show them", async () => {
    seedPurchasedUpgrade();
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("Placement Scanner")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide purchased: On" }));
    expect(screen.getByText("Placement Scanner")).toBeInTheDocument();
  });

  it("requires the previous tier's manual clear before buying a tier unlock", async () => {
    seedTierGatePuzzle();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Tier" }));
    const tierPanel = screen.getByRole("tabpanel", { name: "Tier" });
    const tierOneCard = within(tierPanel).getByText("Tier 1").closest("article") as HTMLElement;
    expect(tierOneCard).toHaveTextContent("requires a manual Tier 0 clear this prestige");
    expect(within(tierOneCard).getByRole("button", { name: "Buy" })).toBeDisabled();

    for (const [pieceId, anchor] of [["p0", 0], ["p1", 2], ["p2", 8], ["p3", 10]] as const) {
      await user.click(screen.getByTestId(`piece-${pieceId}`));
      await user.click(screen.getByTestId(`cell-${anchor}`));
    }
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(within(tierOneCard).getByRole("button", { name: "Buy" })).toBeEnabled();
  });

  it("shows prestige state and permanent upgrades in a separate modal", async () => {
    seedTwoPiecePuzzle();
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("insight")).toHaveTextContent("0");
    await user.click(screen.getByRole("button", { name: "Prestige" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Manual clear Tier 9 to gain Insight +1.");
    expect(dialog).toHaveTextContent("Permanent upgrades");
    const rewardCard = within(dialog).getByText("Reward Analysis").closest("article") as HTMLElement;
    expect(rewardCard).toHaveTextContent("1 Insight, not enough Insight");
    expect(within(rewardCard).getByRole("button", { name: "Buy" })).toBeDisabled();
  });

  it("marks Tier 9 manual clears as pending Insight and opens the prestige modal from clear", async () => {
    seedTierNineClearPuzzle();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("piece-p0"));
    await user.click(screen.getByTestId("cell-0"));

    expect(screen.getByRole("dialog")).toHaveTextContent("Insight +1 is pending.");
    await user.click(screen.getByRole("button", { name: "Prestige" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Pending Insight");
    expect(within(dialog).getByRole("button", { name: "Prestige reset" })).toBeEnabled();
  });

  it("does not grant Insight for assisted Tier 9 clears", async () => {
    seedTierNineClearPuzzle(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Forced Move" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Insight is earned only from manual Tier 9 clears.");
    expect(within(dialog).queryByRole("button", { name: "Prestige" })).not.toBeInTheDocument();
  });

  it("resets normal progression on prestige while keeping Insight and permanent upgrades", async () => {
    seedPrestigeReadySave();
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("compute")).toHaveTextContent("1,234 C");
    expect(screen.getByTestId("insight")).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "Prestige +1" }));
    await user.click(screen.getByRole("button", { name: "Prestige reset" }));
    await user.click(screen.getByRole("button", { name: "Prestige reset" }));

    expect(screen.getByTestId("compute")).toHaveTextContent("0 C");
    expect(screen.getByTestId("insight")).toHaveTextContent("3");
    expect(screen.getByText("Placement Scanner")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Prestige" }));
    const rewardCard = screen.getByText("Reward Analysis").closest("article") as HTMLElement;
    expect(rewardCard).toHaveTextContent("Level 1/10");
    expect(screen.getByText("No pending Insight yet.")).toBeInTheDocument();
  });

  it("groups upgrades into tabs and sorts the default tab by lowest price", async () => {
    const user = userEvent.setup();
    render(<App />);

    const featurePanel = screen.getByRole("tabpanel", { name: "機能" });
    expect(upgradeNamesInPanel(featurePanel)).toEqual(["配置スキャナー", "矛盾検出", "強制手"]);
    expect(within(featurePanel).queryByText("Tier 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Tier" }));
    const tierPanel = screen.getByRole("tabpanel", { name: "Tier" });
    expect(within(tierPanel).getByText("Tier 1")).toBeInTheDocument();
    expect(within(tierPanel).queryByText("自動ソルバー")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "ソルバ" }));
    const solverPanel = screen.getByRole("tabpanel", { name: "ソルバ" });
    expect(upgradeNamesInPanel(solverPanel).slice(0, 3)).toEqual(["ソルバー処理速度", "ソルバー報酬", "自動ソルバー"]);
  });

  it("can hide completed upgrade tabs", async () => {
    seedPurchasedFeatureUpgrades();
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("tab", { name: "機能" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "完了タブ非表示: オフ" }));
    expect(screen.queryByRole("tab", { name: "機能" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tier" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("tabpanel", { name: "Tier" })).getByText("Tier 1")).toBeInTheDocument();
  });

  it("shows clearer solver efficiency upgrade names and descriptions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "ソルバ" }));
    const solverPanel = screen.getByRole("tabpanel", { name: "ソルバ" });
    expect(within(solverPanel).getByText("ソルバ効率化 #1")).toBeInTheDocument();
    expect(within(solverPanel).getByText("空きマスの候補が少ない場所から調べ、分岐を減らします。")).toBeInTheDocument();
  });

  it("requires five manual clears on the current tier before auto solver starts", () => {
    seedAutoSolverProgress(4);
    const { unmount } = render(<App />);
    expect(screen.getByRole("button", { name: "Start Solver" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auto next: Off" })).toBeDisabled();
    expect(screen.getByText("4/5")).toBeInTheDocument();
    unmount();

    window.localStorage.clear();
    seedAutoSolverProgress(5);
    render(<App />);
    expect(screen.getByRole("button", { name: "Start Solver" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Auto next: Off" })).toBeEnabled();
    expect(screen.getByText("Idle lane")).toBeInTheDocument();
    expect(screen.getAllByText("Unassigned")).toHaveLength(3);
    expect(screen.getByText("5/5")).toBeInTheDocument();
  });

  it("starts auto solver work on a mini solver lane", async () => {
    seedAutoSolverProgress(5, 1);
    const user = userEvent.setup();
    const postMessages: unknown[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      postMessage(message: unknown): void {
        postMessages.push(message);
      }

      terminate(): void {}
    }
    vi.stubGlobal("Worker", FakeWorker);

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start Solver" }));

    expect(screen.getByTestId("solver-run")).toHaveTextContent("Tier 0");
    expect(screen.getByText("Idle lane")).toBeInTheDocument();
    expect(screen.getAllByText("Unassigned")).toHaveLength(2);
    expect(screen.getByRole("grid", { name: "Puzzle board" })).toBeInTheDocument();
    expect(postMessages).toHaveLength(1);
    expect(postMessages[0]).toMatchObject({ type: "START" });
  });
});
