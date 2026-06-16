import { render, screen } from "@testing-library/react";
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

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders compute, board, pieces, and locked upgrade reasons", () => {
    render(<App />);
    expect(screen.getByTestId("compute")).toHaveTextContent("0 C");
    expect(screen.getByRole("grid", { name: "Puzzle board" })).toBeInTheDocument();
    expect(screen.getAllByText(/Ready|Placed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not enough Compute/).length).toBeGreaterThan(0);
  });

  it("selects and rotates a piece", async () => {
    const user = userEvent.setup();
    render(<App />);
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

  it("shows theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText("Settings"));
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });
});
