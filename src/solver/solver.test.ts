import { describe, expect, it } from "vitest";
import { boardFromPlacements } from "../core/board";
import { generatePuzzle } from "../core/generator";
import { createSolver, solveToEnd } from "./incrementalSolver";
import type { SolverOptions } from "../core/types";

const options: SolverOptions = {
  nodesPerSecond: 1000,
  visualization: "off",
  heuristics: {
    constraintOrdering: true,
    candidateOrdering: false,
    symmetryPruning: true,
    deadStateCacheEntries: 0,
    isolatedRegionPruning: false,
    zeroCandidatePruning: false,
    colorBalancePruning: false,
    partialBoardCacheEntries: 0,
  },
};

describe("incremental solver", () => {
  it("returns the same solved status for step(1) and a large step", () => {
    const puzzle = generatePuzzle({ tier: 0, seed: "solver-step" });
    const tiny = createSolver(puzzle, options);
    let tinyStatus = tiny.step(1);
    for (let guard = 0; tinyStatus.status === "running" && guard < 1000; guard += 1) {
      tinyStatus = tiny.step(1);
    }
    const large = solveToEnd(puzzle, options);
    expect(tinyStatus.status).toBe("solved");
    expect(large.status).toBe("solved");
    if (tinyStatus.status === "solved" && large.status === "solved") {
      expect(boardFromPlacements(puzzle, tinyStatus.solution)).toEqual(boardFromPlacements(puzzle, large.solution));
    }
  });

  it("respects a partially solved board", () => {
    const puzzle = generatePuzzle({ tier: 0, seed: "partial" });
    const first = puzzle.constructionSolution?.[0];
    expect(first).toBeDefined();
    const board = boardFromPlacements(puzzle, first ? [first] : []);
    const result = solveToEnd(puzzle, options, board);
    expect(result.status).toBe("solved");
  });
});
