import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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
    window.localStorage.clear();
  });

  it("renders compute, board, pieces, and locked upgrade reasons", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Quick start" })).toBeInTheDocument();
    expect(screen.getByTestId("compute")).toHaveTextContent("0 C");
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

  it("shows theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start Playing" }));
    await user.click(screen.getByText("Settings"));
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });

  it("switches visible settings copy to Japanese", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Start Playing" }));
    await user.click(screen.getByText("Settings"));
    await user.selectOptions(screen.getByLabelText("Language"), "ja");
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("言語")).toHaveValue("ja");
  });

  it("hides purchased upgrades by default and can show them", async () => {
    seedPurchasedUpgrade();
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("Placement Scanner")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide purchased: On" }));
    expect(screen.getByText("Placement Scanner")).toBeInTheDocument();
  });

  it("requires five manual clears on the current tier before auto solver starts", () => {
    seedAutoSolverProgress(4);
    const { unmount } = render(<App />);
    expect(screen.getByRole("button", { name: "Start Solver" })).toBeDisabled();
    expect(screen.getByText("4/5")).toBeInTheDocument();
    unmount();

    window.localStorage.clear();
    seedAutoSolverProgress(5);
    render(<App />);
    expect(screen.getByRole("button", { name: "Start Solver" })).toBeEnabled();
    expect(screen.getByText("5/5")).toBeInTheDocument();
  });
});
