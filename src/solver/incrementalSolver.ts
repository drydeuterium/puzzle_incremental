import { enumeratePlacements } from "../core/board";
import { indexToCell } from "../core/coordinates";
import type { BoardState, Placement, PuzzleDefinition, SolverOptions, SolverStats, StepResult } from "../core/types";

type Candidate = Readonly<{
  id: number;
  pieceIndex: number;
  pieceType: string;
  pieceMask: bigint;
  mask: bigint;
  colorCounts: readonly [number, number, number, number];
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

function colorIndex(width: number, index: number): number {
  const cell = indexToCell(width, index);
  return (cell.x % 2) + (cell.y % 2) * 2;
}

function colorCountsFor(width: number, indices: readonly number[]): readonly [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const index of indices) {
    counts[colorIndex(width, index)] += 1;
  }
  return counts;
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
      colorCounts: colorCountsFor(puzzle.width, placement.cellIndices),
      placement,
    })),
  );
  const candidatesByPiece = new Map<number, Candidate[]>();
  const candidatesByCell = new Map<number, Candidate[]>();
  for (const candidate of allCandidates) {
    const pieceCandidates = candidatesByPiece.get(candidate.pieceIndex) ?? [];
    pieceCandidates.push(candidate);
    candidatesByPiece.set(candidate.pieceIndex, pieceCandidates);
    for (const index of candidate.placement.cellIndices) {
      const list = candidatesByCell.get(index) ?? [];
      list.push(candidate);
      candidatesByCell.set(index, list);
    }
  }
  const usableSet = new Set(puzzle.usableCellIndices);
  const neighborsByCell = new Map<number, readonly number[]>();
  for (const index of puzzle.usableCellIndices) {
    const cell = indexToCell(puzzle.width, index);
    const neighbors = [
      { x: cell.x - 1, y: cell.y },
      { x: cell.x + 1, y: cell.y },
      { x: cell.x, y: cell.y - 1 },
      { x: cell.x, y: cell.y + 1 },
    ]
      .filter((neighbor) => neighbor.x >= 0 && neighbor.x < puzzle.width && neighbor.y >= 0 && neighbor.y < puzzle.height)
      .map((neighbor) => neighbor.y * puzzle.width + neighbor.x)
      .filter((neighborIndex) => usableSet.has(neighborIndex));
    neighborsByCell.set(index, neighbors);
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
        selected.push({
          id: -selected.length - 1,
          pieceIndex,
          pieceType: placement.pieceType,
          pieceMask: 1n << BigInt(pieceIndex),
          mask: maskFromIndices(placement.cellIndices),
          colorCounts: colorCountsFor(puzzle.width, placement.cellIndices),
          placement,
        });
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
  const partialDeadKeys: string[] = [];
  const partialDeadSet = new Set<string>();

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
  const emptyMask = (): bigint => usableMask & ~occupiedMask;

  const remainingPieceTypeKey = (): string => {
    const counts = new Map<string, number>();
    for (let index = 0; index < puzzle.pieces.length; index += 1) {
      if ((usedPieceMask & (1n << BigInt(index))) === 0n) {
        const type = puzzle.pieces[index].type;
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `${type}${count}`).join("");
  };

  const partialStateKey = (): string => `${emptyMask().toString(16)}:${remainingPieceTypeKey()}`;

  const preview = (): readonly Placement[] => {
    const current = selected.map((candidate) => candidate.placement);
    if (current.length > 0 || latestVisiblePreview.length === 0) {
      latestVisiblePreview = current;
    }
    return latestVisiblePreview;
  };

  const markPartialDead = (): void => {
    const limit = options.heuristics.partialBoardCacheEntries;
    if (limit <= 0) {
      return;
    }
    const key = partialStateKey();
    if (partialDeadSet.has(key)) {
      return;
    }
    partialDeadSet.add(key);
    partialDeadKeys.push(key);
    while (partialDeadKeys.length > limit) {
      const removed = partialDeadKeys.shift();
      if (removed) {
        partialDeadSet.delete(removed);
      }
    }
  };

  const markDead = (key: string): void => {
    markPartialDead();
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

  const emptyComponents = (): readonly Readonly<{ mask: bigint; size: number }>[] => {
    const empty = emptyMask();
    const components: { mask: bigint; size: number }[] = [];
    let visited = 0n;
    for (const start of puzzle.usableCellIndices) {
      const startBit = 1n << BigInt(start);
      if ((empty & startBit) === 0n || (visited & startBit) !== 0n) {
        continue;
      }
      let componentMask = 0n;
      let size = 0;
      const queue = [start];
      visited |= startBit;
      for (let offset = 0; offset < queue.length; offset += 1) {
        const current = queue[offset];
        const currentBit = 1n << BigInt(current);
        componentMask |= currentBit;
        size += 1;
        for (const neighbor of neighborsByCell.get(current) ?? []) {
          const neighborBit = 1n << BigInt(neighbor);
          if ((empty & neighborBit) !== 0n && (visited & neighborBit) === 0n) {
            visited |= neighborBit;
            queue.push(neighbor);
          }
        }
      }
      components.push({ mask: componentMask, size });
    }
    return components;
  };

  const hasInvalidEmptyRegion = (): boolean => emptyComponents().some((component) => component.size % 4 !== 0);

  const hasEmptyCellWithoutCandidate = (): boolean => {
    for (const index of puzzle.usableCellIndices) {
      if ((occupiedMask & (1n << BigInt(index))) !== 0n) {
        continue;
      }
      const hasCandidate = (candidatesByCell.get(index) ?? [])
        .some((candidate) => canUseCandidate(candidate) && candidateAllowedBySymmetry(candidate));
      if (!hasCandidate) {
        return true;
      }
    }
    return false;
  };

  const hasImpossibleColorBalance = (): boolean => {
    const needed: [number, number, number, number] = [0, 0, 0, 0];
    const empty = emptyMask();
    for (const index of puzzle.usableCellIndices) {
      if ((empty & (1n << BigInt(index))) !== 0n) {
        needed[colorIndex(puzzle.width, index)] += 1;
      }
    }

    const minimum: [number, number, number, number] = [0, 0, 0, 0];
    const maximum: [number, number, number, number] = [0, 0, 0, 0];
    for (let pieceIndex = 0; pieceIndex < puzzle.pieces.length; pieceIndex += 1) {
      if (isPieceUsed(pieceIndex)) {
        continue;
      }
      const pieceMinimum: [number, number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      const pieceMaximum: [number, number, number, number] = [0, 0, 0, 0];
      let hasCandidate = false;
      for (const candidate of candidatesByPiece.get(pieceIndex) ?? []) {
        if (!canUseCandidate(candidate)) {
          continue;
        }
        hasCandidate = true;
        for (let color = 0; color < 4; color += 1) {
          pieceMinimum[color] = Math.min(pieceMinimum[color], candidate.colorCounts[color]);
          pieceMaximum[color] = Math.max(pieceMaximum[color], candidate.colorCounts[color]);
        }
      }
      if (!hasCandidate) {
        return true;
      }
      for (let color = 0; color < 4; color += 1) {
        minimum[color] += pieceMinimum[color];
        maximum[color] += pieceMaximum[color];
      }
    }
    return needed.some((count, color) => count < minimum[color] || count > maximum[color]);
  };

  const isPrunedState = (): boolean => {
    if (options.heuristics.partialBoardCacheEntries > 0 && partialDeadSet.has(partialStateKey())) {
      return true;
    }
    if (options.heuristics.isolatedRegionPruning && hasInvalidEmptyRegion()) {
      return true;
    }
    if (options.heuristics.zeroCandidatePruning && hasEmptyCellWithoutCandidate()) {
      return true;
    }
    return options.heuristics.colorBalancePruning && hasImpossibleColorBalance();
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
    if (deadSet.has(key) || isPrunedState()) {
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
