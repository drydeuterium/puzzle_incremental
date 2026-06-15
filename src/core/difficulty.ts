import { GAME_CONFIG } from "../game/config";
import { solveToEnd } from "../solver/incrementalSolver";
import type { DifficultyMeasurement, PuzzleDefinition, SolverOptions } from "./types";

export const BASELINE_SOLVER_OPTIONS: SolverOptions = {
  nodesPerSecond: GAME_CONFIG.solver.baseNodesPerSecond,
  visualization: "off",
  heuristics: {
    constraintOrdering: true,
    candidateOrdering: false,
    symmetryPruning: true,
    deadStateCacheEntries: 0,
  },
};

export function measureDifficulty(puzzle: Omit<PuzzleDefinition, "difficulty">): DifficultyMeasurement {
  const provisional: PuzzleDefinition = {
    ...puzzle,
    difficulty: {
      score: 1,
      solutionNodes: 0,
      backtracks: 0,
      maxDepth: 0,
      forcedRatio: 0,
      initialBranching: puzzle.pieces.length,
      capped: false,
    },
  };
  const result = solveToEnd(provisional, BASELINE_SOLVER_OPTIONS, undefined, GAME_CONFIG.generator.difficultyMeasurementNodeLimit);
  const stats = result.stats;
  const forcedRatio = stats.maxDepth === 0 ? 0 : Math.min(1, Math.max(0, (stats.maxDepth - Math.log2(stats.nodes + 1)) / stats.maxDepth));
  const initialBranching = puzzle.pieces.length;
  const raw =
    Math.log10(stats.nodes + 1) * 100 +
    Math.log10(stats.backtracks + 1) * 60 +
    stats.maxDepth * 2 +
    initialBranching * 5 -
    forcedRatio * 40;
  return {
    score: Math.max(1, Math.round(raw)),
    solutionNodes: stats.nodes,
    backtracks: stats.backtracks,
    maxDepth: stats.maxDepth,
    forcedRatio,
    initialBranching,
    capped: result.status === "running",
  };
}
