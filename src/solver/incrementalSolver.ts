import { enumeratePlacements } from "../core/board";
import type { BoardState, Placement, PuzzleDefinition, SolverOptions, SolverStats, StepResult } from "../core/types";

type Candidate = Readonly<{
  id: number;
  pieceIndex: number;
  pieceType: string;
  pieceMask: bigint;
  mask: bigint;
  placement: Placement;
}>;

type Frame = {
  stateKey: string;
  appliedCandidate: Candidate | null;
  candidates: readonly Candidate[];
  nextCandidateIndex: number;
};

export type IncrementalSolver = Readonly<{
  step: (nodeBudget: number) => StepResult;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  getStats: () => SolverStats;
}>;

function maskFromIndices(indices: readonly number[]): bigint {
  return indices.reduce((mask, index) => mask | (1n << BigInt(index)), 0n);
}

function now(): number {
  return performance.now();
}

export function createSolver(puzzle: PuzzleDefinition, options: SolverOptions, initialBoard?: BoardState): IncrementalSolver {
  const usableMask = maskFromIndices(puzzle.usableCellIndices);
  const allCandidates = puzzle.pieces.flatMap((piece, pieceIndex) =>
    enumeratePlacements(puzzle, piece).map((placement, candidateOffset) => ({
      id: pieceIndex * 10_000 + candidateOffset,
      pieceIndex,
      pieceType: piece.type,
      pieceMask: 1n << BigInt(pieceIndex),
      mask: maskFromIndices(placement.cellIndices),
      placement,
    })),
  );
  const candidatesByCell = new Map<number, Candidate[]>();
  for (const candidate of allCandidates) {
    for (const index of candidate.placement.cellIndices) {
      const list = candidatesByCell.get(index) ?? [];
      list.push(candidate);
      candidatesByCell.set(index, list);
    }
  }

  let occupiedMask = 0n;
  let usedPieceMask = 0n;
  const selected: Candidate[] = [];
  if (initialBoard) {
    for (const placement of Object.values(initialBoard.placementsByPieceId)) {
      const pieceIndex = puzzle.pieces.findIndex((piece) => piece.id === placement.pieceId);
      if (pieceIndex >= 0) {
        occupiedMask |= maskFromIndices(placement.cellIndices);
        usedPieceMask |= 1n << BigInt(pieceIndex);
        selected.push({ id: -selected.length - 1, pieceIndex, pieceType: placement.pieceType, pieceMask: 1n << BigInt(pieceIndex), mask: maskFromIndices(placement.cellIndices), placement });
      }
    }
  }

  let status: SolverStats["status"] = "running";
  let nodes = 0;
  let backtracks = 0;
  let maxDepth = selected.length;
  let latestVisiblePreview: readonly Placement[] = selected.map((candidate) => candidate.placement);
  const startedAt = now();
  const deadKeys: string[] = [];
  const deadSet = new Set<string>();

  const stats = (): SolverStats => ({
    status,
    nodes,
    backtracks,
    maxDepth,
    currentDepth: selected.length,
    measuredNodesPerSecond: Math.round(nodes / Math.max(0.001, (now() - startedAt) / 1000)),
    elapsedMilliseconds: Math.round(now() - startedAt),
  });

  const stateKey = (): string => `${occupiedMask.toString(16)}:${usedPieceMask.toString(16)}`;

  const preview = (): readonly Placement[] => {
    const current = selected.map((candidate) => candidate.placement);
    if (current.length > 0 || latestVisiblePreview.length === 0) {
      latestVisiblePreview = current;
    }
    return latestVisiblePreview;
  };

  const markDead = (key: string): void => {
    const limit = options.heuristics.deadStateCacheEntries;
    if (limit <= 0 || deadSet.has(key)) {
      return;
    }
    deadSet.add(key);
    deadKeys.push(key);
    while (deadKeys.length > limit) {
      const removed = deadKeys.shift();
      if (removed) {
        deadSet.delete(removed);
      }
    }
  };

  const isPieceUsed = (pieceIndex: number): boolean => (usedPieceMask & (1n << BigInt(pieceIndex))) !== 0n;
  const canUseCandidate = (candidate: Candidate): boolean => !isPieceUsed(candidate.pieceIndex) && (candidate.mask & occupiedMask) === 0n;

  const candidateAllowedBySymmetry = (candidate: Candidate): boolean => {
    if (!options.heuristics.symmetryPruning) {
      return true;
    }
    for (let index = 0; index < candidate.pieceIndex; index += 1) {
      const piece = puzzle.pieces[index];
      if (piece.type === candidate.pieceType && !isPieceUsed(index)) {
        return false;
      }
    }
    return true;
  };

  const legalCandidatesForCell = (cellIndex: number): readonly Candidate[] => {
    const candidates = candidatesByCell.get(cellIndex) ?? [];
    const legal = candidates.filter((candidate) => canUseCandidate(candidate) && candidateAllowedBySymmetry(candidate));
    if (!options.heuristics.candidateOrdering) {
      return legal;
    }
    return legal
      .map((candidate) => ({ candidate, score: futureFreedomScore(candidate) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.candidate);
  };

  const futureFreedomScore = (candidate: Candidate): number => {
    const nextOccupied = occupiedMask | candidate.mask;
    const nextUsedPieceMask = usedPieceMask | candidate.pieceMask;
    let score = 0;
    for (const index of puzzle.usableCellIndices) {
      if ((nextOccupied & (1n << BigInt(index))) === 0n) {
        for (const inner of candidatesByCell.get(index) ?? []) {
          if ((inner.pieceMask & nextUsedPieceMask) === 0n && (inner.mask & nextOccupied) === 0n) {
            score += 1;
          }
        }
      }
    }
    return score;
  };

  const chooseFrame = (appliedCandidate: Candidate | null): Frame => {
    const key = stateKey();
    if (deadSet.has(key)) {
      return { stateKey: key, appliedCandidate, candidates: [], nextCandidateIndex: 0 };
    }
    let bestCell: number | null = null;
    let bestCandidates: readonly Candidate[] = [];
    for (const index of puzzle.usableCellIndices) {
      if ((occupiedMask & (1n << BigInt(index))) !== 0n) {
        continue;
      }
      const candidates = legalCandidatesForCell(index);
      if (bestCell === null || (options.heuristics.constraintOrdering && candidates.length < bestCandidates.length)) {
        bestCell = index;
        bestCandidates = candidates;
        if (!options.heuristics.constraintOrdering) {
          break;
        }
      }
    }
    if (bestCell === null) {
      return { stateKey: key, appliedCandidate, candidates: [], nextCandidateIndex: 0 };
    }
    return { stateKey: key, appliedCandidate, candidates: bestCandidates, nextCandidateIndex: 0 };
  };

  const frames: Frame[] = [chooseFrame(null)];

  const applyCandidate = (candidate: Candidate): void => {
    occupiedMask |= candidate.mask;
    usedPieceMask |= candidate.pieceMask;
    selected.push(candidate);
    maxDepth = Math.max(maxDepth, selected.length);
  };

  const undoCandidate = (candidate: Candidate): void => {
    occupiedMask &= ~candidate.mask;
    usedPieceMask &= ~candidate.pieceMask;
    const removed = selected.pop();
    if (!removed || removed.id !== candidate.id) {
      throw new Error("Solver stack corruption");
    }
  };

  const isSolvedState = (): boolean => occupiedMask === usableMask && selected.length === puzzle.pieces.length;

  return {
    step: (nodeBudget: number): StepResult => {
      if (status === "paused" || status === "cancelled") {
        return { status: "running", consumedNodes: 0, stats: stats(), preview: preview() };
      }
      status = "running";
      let consumedNodes = 0;
      while (consumedNodes < Math.max(1, nodeBudget)) {
        if (isSolvedState()) {
          status = "solved";
          return { status: "solved", consumedNodes, stats: stats(), solution: selected.map((candidate) => candidate.placement) };
        }
        const top = frames[frames.length - 1];
        if (!top) {
          status = "unsat";
          return { status: "unsat", consumedNodes, stats: stats() };
        }
        if (top.nextCandidateIndex >= top.candidates.length) {
          frames.pop();
          markDead(top.stateKey);
          if (top.appliedCandidate) {
            undoCandidate(top.appliedCandidate);
          }
          backtracks += 1;
          continue;
        }
        const candidate = top.candidates[top.nextCandidateIndex];
        top.nextCandidateIndex += 1;
        if (!canUseCandidate(candidate)) {
          continue;
        }
        applyCandidate(candidate);
        nodes += 1;
        consumedNodes += 1;
        frames.push(chooseFrame(candidate));
      }
      return { status: "running", consumedNodes, stats: stats(), preview: preview() };
    },
    pause: () => {
      if (status === "running") {
        status = "paused";
      }
    },
    resume: () => {
      if (status === "paused") {
        status = "running";
      }
    },
    cancel: () => {
      status = "cancelled";
    },
    getStats: stats,
  };
}

export function solveToEnd(puzzle: PuzzleDefinition, options: SolverOptions, initialBoard?: BoardState, nodeLimit = 2_000_000): StepResult {
  const solver = createSolver(puzzle, options, initialBoard);
  let consumed = 0;
  while (consumed < nodeLimit) {
    const result = solver.step(10_000);
    consumed += result.consumedNodes;
    if (result.status !== "running") {
      return result;
    }
  }
  return { status: "unsat", consumedNodes: consumed, stats: solver.getStats() };
}
