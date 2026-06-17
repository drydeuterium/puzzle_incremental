import { fireEvent, render, screen } from "@testing-library/react";
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
    settings: { ...base.settings, tutorialCompleted: true },
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
    settings: { ...base.settings, tutorialCompleted: true },
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
    settings: { ...base.settings, tutorialCompleted: true },
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

function seedUnsortedPiecePuzzle(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, tutorialCompleted: true },
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
    settings: { ...base.settings, tutorialCompleted: true },
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

function seedContradictionDetector(): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, tutorialCompleted: true },
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

function seedAutoSolverProgress(manualClears: number): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const base = createInitialSave(now);
  const save = {
    ...base,
    settings: { ...base.settings, tutorialCompleted: true },
    progression: {
      ...base.progression,
      upgradeLevels: {
        ...base.progression.upgradeLevels,
        "auto-solver": 1,
      },
    },
    statistics: {
      ...base.statistics,
      manualClearsByTier: { 0: manualClears },
    },
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify(save));
}

describe("App", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders compute, board, pieces, and locked upgrade reasons", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Quick start" })).toBeInTheDocument();
    expect(screen.getByTestId("compute")).toHaveTextContent("0 C");
    expect(screen.getByText("Compute/s")).toBeInTheDocument();
    expect(screen.getByTestId("compute-per-second")).toHaveTextContent("0");
    expect(screen.getByRole("grid", { name: "Puzzle board" })).toBeInTheDocument();
    expect(screen.getAllByText(/Ready|Placed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not enough Compute/).length).toBeGreaterThan(0);
  });

  it("selects and rotates a piece", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start Playing" }));
    await user.click(screen.getByTestId("piece-p0"));
    await user.click(screen.getByText("Rotate Right"));
    expect(screen.getByTestId("piece-p0")).toHaveTextContent("rot");
  });

  it("renders tier selection through Tier 9", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start Playing" }));

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
    await user.click(screen.getByRole("button", { name: "Start Playing" }));
    await user.click(screen.getByText("Settings"));
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
    expect(screen.getByLabelText("Notifications")).toBeChecked();
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
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

  it("switches visible settings copy to Japanese", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start Playing" }));
    await user.click(screen.getByText("Settings"));
    await user.selectOptions(screen.getByLabelText("Language"), "ja");
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("言語")).toHaveValue("ja");
    expect(screen.getByText("配置スキャナー")).toBeInTheDocument();
    expect(screen.getAllByText(/Compute不足/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("solver-status")).toHaveTextContent("待機");
  });

  it("hides purchased upgrades by default and can show them", async () => {
    seedPurchasedUpgrade();
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("Placement Scanner")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide purchased: On" }));
    expect(screen.getByText("Placement Scanner")).toBeInTheDocument();
  });

  it("shows clearer solver efficiency upgrade names and descriptions", () => {
    render(<App />);

    expect(screen.getByText("Solver Efficiency #1")).toBeInTheDocument();
    expect(screen.getByText("Tries the most constrained empty cells first to reduce branching.")).toBeInTheDocument();
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
    expect(screen.getByText("No solver puzzles.")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
  });

  it("starts auto solver work on a mini solver lane", async () => {
    seedAutoSolverProgress(5);
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
    expect(screen.getByRole("grid", { name: "Puzzle board" })).toBeInTheDocument();
    expect(postMessages).toHaveLength(1);
    expect(postMessages[0]).toMatchObject({ type: "START" });
  });
});
