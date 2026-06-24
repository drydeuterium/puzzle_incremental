import { describe, expect, it } from "vitest";
import { applyPlacement, boardFromPlacements, canPlace, createEmptyBoard, createPlacement, enumeratePlacements, isSolved, removePiece } from "./board";
import { generatePuzzle } from "./generator";
import { createPrng, shuffleDeterministic } from "./prng";
import { calculateReward } from "./rewards";
import { enumerateOrientations, TETROMINO_TYPES } from "./tetrominoes";
import type { PuzzleDefinition } from "./types";

function isUsableRegionConnected(puzzle: PuzzleDefinition): boolean {
  const usable = new Set(puzzle.usableCellIndices);
  const first = puzzle.usableCellIndices[0];
  if (first === undefined) {
    return false;
  }
  const visited = new Set<number>();
  const stack = [first];
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined || visited.has(index)) {
      continue;
    }
    visited.add(index);
    const x = index % puzzle.width;
    const y = Math.floor(index / puzzle.width);
    const neighbors = [
      x > 0 ? index - 1 : null,
      x < puzzle.width - 1 ? index + 1 : null,
      y > 0 ? index - puzzle.width : null,
      y < puzzle.height - 1 ? index + puzzle.width : null,
    ];
    for (const neighbor of neighbors) {
      if (neighbor !== null && usable.has(neighbor) && !visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }
  return visited.size === usable.size;
}

function isBoundaryCell(puzzle: PuzzleDefinition, index: number): boolean {
  const x = index % puzzle.width;
  const y = Math.floor(index / puzzle.width);
  return x === 0 || y === 0 || x === puzzle.width - 1 || y === puzzle.height - 1;
}

describe("tetromino orientations", () => {
  it("enumerates the expected unique rotation counts", () => {
    const expected = { I: 2, O: 1, T: 4, L: 4, J: 4, S: 2, Z: 2 };
    for (const type of TETROMINO_TYPES) {
      const orientations = enumerateOrientations(type);
      expect(orientations).toHaveLength(expected[type]);
      expect(orientations.every((orientation) => orientation.cells.length === 4)).toBe(true);
      expect(orientations.every((orientation) => orientation.cells.every((cell) => cell.x >= 0 && cell.y >= 0))).toBe(true);
    }
  });
});

describe("board placement", () => {
  it("accepts legal placement, rejects overlap, and removes immutably", () => {
    const puzzle = generatePuzzle({ tier: 0, seed: "board-test" });
    const piece = puzzle.pieces[0];
    const placement = enumeratePlacements(puzzle, piece)[0];
    const board = createEmptyBoard();
    expect(canPlace(puzzle, board, placement).ok).toBe(true);
    const placed = applyPlacement(puzzle, board, placement);
    expect(board.placementsByPieceId[piece.id]).toBeUndefined();
    const secondPiece = puzzle.pieces[1];
    const overlapping = createPlacement(puzzle, secondPiece, placement.orientationIndex, placement.anchor);
    expect(canPlace(puzzle, placed, overlapping)).toEqual({ ok: false, reason: "overlap" });
    const removed = removePiece(placed, piece.id);
    expect(removed.placementsByPieceId[piece.id]).toBeUndefined();
  });

  it("rejects placements that would wrap past the right board edge", () => {
    const puzzle: PuzzleDefinition = {
      id: "right-edge-wrap-fixture",
      generatorVersion: 1,
      tier: 0,
      seed: "right-edge-wrap-fixture",
      width: 6,
      height: 6,
      usableCellIndices: Array.from({ length: 36 }, (_, index) => index),
      blockedCellIndices: [],
      pieces: [{ id: "p0", type: "T" }],
      difficulty: { score: 1, solutionNodes: 1, backtracks: 0, maxDepth: 1, forcedRatio: 1, initialBranching: 1, capped: false },
    };
    const placement = createPlacement(puzzle, puzzle.pieces[0], 0, { x: 4, y: 0 });

    expect(placement.cellIndices).toContain(6);
    expect(canPlace(puzzle, createEmptyBoard(), placement)).toEqual({ ok: false, reason: "outside" });
    expect(applyPlacement(puzzle, createEmptyBoard(), placement).placementsByPieceId.p0).toBeUndefined();
  });

  it("detects a solved construction fixture", () => {
    const puzzle = generatePuzzle({ tier: 0, seed: "solved-test" });
    expect(puzzle.constructionSolution).toBeDefined();
    const board = boardFromPlacements(puzzle, puzzle.constructionSolution ?? []);
    expect(isSolved(puzzle, board)).toBe(true);
  });
});

describe("prng", () => {
  it("is deterministic and does not mutate shuffle input", () => {
    const first = createPrng("same").nextUint32();
    const second = createPrng("same").nextUint32();
    const input = [1, 2, 3, 4];
    const output = shuffleDeterministic(input, "shuffle");
    expect(first).toBe(second);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(output).toHaveLength(4);
  });
});

describe("generation and rewards", () => {
  it("generates deterministic solvable puzzles for all tiers", () => {
    for (let tier = 0; tier <= 11; tier += 1) {
      const a = generatePuzzle({ tier, seed: `tier-${tier}` });
      const b = generatePuzzle({ tier, seed: `tier-${tier}` });
      expect(a).toEqual(b);
      expect(a.usableCellIndices).toHaveLength(a.pieces.length * 4);
      expect(isSolved(a, boardFromPlacements(a, a.constructionSolution ?? []))).toBe(true);
      expect(a.difficulty.score).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses varied pieces early and generates fixed-area jagged tiers", () => {
    const tier0 = generatePuzzle({ tier: 0, seed: "variety-check" });
    const tier0Types = new Set(tier0.pieces.map((piece) => piece.type));
    expect(tier0Types.size).toBeGreaterThanOrEqual(3);

    const planned = [
      { tier: 1, seed: "eight-by-four-jagged", width: 8, height: 4, blocked: 8, interiorBlocked: 3, usable: 24, pieces: 6 },
      { tier: 2, seed: "seven-by-five-jagged", width: 7, height: 5, blocked: 11, interiorBlocked: 4, usable: 24, pieces: 6 },
      { tier: 3, seed: "six-by-six-jagged", width: 6, height: 6, blocked: 8, interiorBlocked: 3, usable: 28, pieces: 7 },
      { tier: 4, seed: "seven-by-six-jagged", width: 7, height: 6, blocked: 10, interiorBlocked: 4, usable: 32, pieces: 8 },
      { tier: 5, seed: "seven-by-seven-jagged", width: 7, height: 7, blocked: 13, interiorBlocked: 5, usable: 36, pieces: 9 },
      { tier: 6, seed: "eight-by-seven-jagged", width: 8, height: 7, blocked: 16, interiorBlocked: 6, usable: 40, pieces: 10 },
      { tier: 7, seed: "nine-by-seven-jagged", width: 9, height: 7, blocked: 19, interiorBlocked: 8, usable: 44, pieces: 11 },
      { tier: 8, seed: "eight-by-eight-jagged", width: 8, height: 8, blocked: 16, interiorBlocked: 6, usable: 48, pieces: 12 },
      { tier: 9, seed: "ten-by-nine-jagged", width: 10, height: 9, blocked: 26, interiorBlocked: 10, usable: 64, pieces: 16 },
      { tier: 10, seed: "fourteen-by-eight-ex-one", width: 14, height: 8, blocked: 28, interiorBlocked: 11, usable: 84, pieces: 21 },
      { tier: 11, seed: "sixteen-by-nine-ex-two", width: 16, height: 9, blocked: 36, interiorBlocked: 14, usable: 108, pieces: 27 },
    ];
    for (const expected of planned) {
      const puzzle = generatePuzzle({ tier: expected.tier, seed: expected.seed });
      const interiorBlocked = puzzle.blockedCellIndices.filter((index) => !isBoundaryCell(puzzle, index)).length;
      expect(puzzle.width).toBe(expected.width);
      expect(puzzle.height).toBe(expected.height);
      expect(puzzle.blockedCellIndices).toHaveLength(expected.blocked);
      expect(interiorBlocked).toBe(expected.interiorBlocked);
      expect(puzzle.usableCellIndices).toHaveLength(expected.usable);
      expect(puzzle.pieces).toHaveLength(expected.pieces);
      expect(isUsableRegionConnected(puzzle)).toBe(true);
    }
  });

  it("calculates classification multipliers", () => {
    const puzzle = generatePuzzle({ tier: 0, seed: "reward" });
    expect(calculateReward(puzzle, "manual")).toBeGreaterThan(calculateReward(puzzle, "assisted"));
    expect(calculateReward(puzzle, "assisted")).toBeGreaterThan(calculateReward(puzzle, "automated"));
  });

  it("scales rewards strongly by tier", () => {
    const tier0 = generatePuzzle({ tier: 0, seed: "reward-tier-0" });
    const tier9 = generatePuzzle({ tier: 9, seed: "reward-tier-9" });
    expect(calculateReward(tier0, "manual")).toBeLessThan(400);
    expect(calculateReward(tier9, "manual")).toBeGreaterThan(calculateReward(tier0, "manual") * 100);
    expect(calculateReward(tier9, "automated")).toBeGreaterThan(calculateReward(tier0, "automated") * 100);
  });
});
