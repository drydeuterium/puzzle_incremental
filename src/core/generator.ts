import { cellIndex, makeRange } from "./coordinates";
import { measureDifficulty } from "./difficulty";
import { shuffleDeterministic } from "./prng";
import { enumerateOrientations, TETROMINO_TYPES } from "./tetrominoes";
import type { Cell, Placement, PuzzleDefinition, TetrominoType } from "./types";
import { GAME_CONFIG, type TierConfig } from "../game/config";

export type GeneratePuzzleInput = Readonly<{
  tier: number;
  seed: string;
}>;

type Candidate = Readonly<{
  pieceType: TetrominoType;
  orientationIndex: number;
  anchor: Cell;
  cellIndices: readonly number[];
  mask: bigint;
}>;

function getTierConfig(tier: number): TierConfig {
  const config = GAME_CONFIG.tiers.find((entry) => entry.id === tier);
  if (!config) {
    throw new Error(`Unknown tier: ${tier}`);
  }
  return config;
}

function maskFromIndices(indices: readonly number[]): bigint {
  return indices.reduce((mask, index) => mask | (1n << BigInt(index)), 0n);
}

function compatibleBlockedCount(config: TierConfig, seed: string): number {
  const compatible = config.allowedBlockedCellCounts.filter((count) => config.width * config.height - count === config.pieceCount * 4);
  if (compatible.length === 0) {
    throw new Error(`Tier ${config.id} has no area-compatible blocked cell count`);
  }
  return shuffleDeterministic(compatible, `${seed}:blocked-count`)[0];
}

function chooseBlockedCells(config: TierConfig, seed: string): readonly number[] {
  const blockedCount = compatibleBlockedCount(config, seed);
  if (blockedCount === 0) {
    return [];
  }
  if (blockedCount === 1) {
    const center = cellIndex(config.width, { x: Math.floor(config.width / 2), y: Math.floor(config.height / 2) });
    const candidates = [center, 0, config.width - 1, config.width * (config.height - 1), config.width * config.height - 1];
    return [shuffleDeterministic(candidates, `${seed}:single-block`)[0]];
  }
  const squareAnchors: Cell[] = [];
  for (let y = 0; y < config.height - 1; y += 1) {
    for (let x = 0; x < config.width - 1; x += 1) {
      squareAnchors.push({ x, y });
    }
  }
  for (const anchor of shuffleDeterministic(squareAnchors, `${seed}:block-square`)) {
    const square = [
      cellIndex(config.width, anchor),
      cellIndex(config.width, { x: anchor.x + 1, y: anchor.y }),
      cellIndex(config.width, { x: anchor.x, y: anchor.y + 1 }),
      cellIndex(config.width, { x: anchor.x + 1, y: anchor.y + 1 }),
    ];
    if (square.length === blockedCount) {
      return square;
    }
  }
  return [];
}

function enumerateFillCandidates(config: TierConfig, usable: ReadonlySet<number>): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (const pieceType of TETROMINO_TYPES) {
    for (const orientation of enumerateOrientations(pieceType)) {
      for (let y = 0; y <= config.height - orientation.height; y += 1) {
        for (let x = 0; x <= config.width - orientation.width; x += 1) {
          const cellIndices = orientation.cells.map((cell) => cellIndex(config.width, { x: x + cell.x, y: y + cell.y }));
          if (cellIndices.every((index) => usable.has(index))) {
            candidates.push({
              pieceType,
              orientationIndex: orientation.index,
              anchor: { x, y },
              cellIndices,
              mask: maskFromIndices(cellIndices),
            });
          }
        }
      }
    }
  }
  return candidates;
}

function fillBoard(config: TierConfig, seed: string, blockedCellIndices: readonly number[]): readonly Placement[] | null {
  const blocked = new Set(blockedCellIndices);
  const usableCellIndices = makeRange(config.width * config.height).filter((index) => !blocked.has(index));
  const usableMask = maskFromIndices(usableCellIndices);
  const usable = new Set(usableCellIndices);
  const allCandidates = enumerateFillCandidates(config, usable);
  const candidatesByCell = new Map<number, readonly Candidate[]>();
  for (const index of usableCellIndices) {
    candidatesByCell.set(index, allCandidates.filter((candidate) => candidate.cellIndices.includes(index)));
  }

  let nodes = 0;
  const selected: Candidate[] = [];
  const typeCounts = new Map<TetrominoType, number>();

  const search = (occupiedMask: bigint): readonly Candidate[] | null => {
    if (occupiedMask === usableMask) {
      return [...selected];
    }
    if (nodes >= GAME_CONFIG.generator.nodesPerAttemptLimit) {
      return null;
    }

    let bestCell: number | null = null;
    let bestCandidates: readonly Candidate[] = [];
    for (const index of usableCellIndices) {
      if ((occupiedMask & (1n << BigInt(index))) !== 0n) {
        continue;
      }
      const legal = (candidatesByCell.get(index) ?? []).filter((candidate) => (candidate.mask & occupiedMask) === 0n);
      if (bestCell === null || legal.length < bestCandidates.length) {
        bestCell = index;
        bestCandidates = legal;
        if (legal.length === 0) {
          break;
        }
      }
    }
    if (bestCell === null || bestCandidates.length === 0) {
      return null;
    }

    const ordered = [...shuffleDeterministic(bestCandidates, `${seed}:depth-${selected.length}:cell-${bestCell}`)].sort((a, b) => {
      const aUsed = typeCounts.get(a.pieceType) ?? 0;
      const bUsed = typeCounts.get(b.pieceType) ?? 0;
      const aPenalty = aUsed * 3 + (a.pieceType === "O" || a.pieceType === "I" ? 1 : 0);
      const bPenalty = bUsed * 3 + (b.pieceType === "O" || b.pieceType === "I" ? 1 : 0);
      return aPenalty - bPenalty;
    });

    for (const candidate of ordered) {
      nodes += 1;
      selected.push(candidate);
      typeCounts.set(candidate.pieceType, (typeCounts.get(candidate.pieceType) ?? 0) + 1);
      const result = search(occupiedMask | candidate.mask);
      if (result) {
        return result;
      }
      selected.pop();
      const nextCount = (typeCounts.get(candidate.pieceType) ?? 1) - 1;
      if (nextCount === 0) {
        typeCounts.delete(candidate.pieceType);
      } else {
        typeCounts.set(candidate.pieceType, nextCount);
      }
    }
    return null;
  };

  const result = search(0n);
  if (!result) {
    return null;
  }
  return shuffleDeterministic(result, `${seed}:piece-order`).map((candidate, index) => ({
    pieceId: `p${index}`,
    pieceType: candidate.pieceType,
    orientationIndex: candidate.orientationIndex,
    anchor: candidate.anchor,
    cellIndices: candidate.cellIndices,
  }));
}

function varietyScore(solution: readonly Placement[]): number {
  const distinct = new Set(solution.map((placement) => placement.pieceType)).size;
  const nonRectangular = solution.filter((placement) => placement.pieceType !== "O" && placement.pieceType !== "I").length;
  return distinct * 10 + nonRectangular;
}

export function generateSeed(prefix = "seed", date = new Date()): string {
  return `${prefix}-${date.toISOString()}-${date.getTime()}`;
}

export function dailySeed(tier: number, date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `daily-${tier}-${year}-${month}-${day}`;
}

export function generatePuzzle(input: GeneratePuzzleInput): PuzzleDefinition {
  const config = getTierConfig(input.tier);
  let bestSolution: readonly Placement[] | null = null;
  let bestBlocked: readonly number[] = [];

  for (let attempt = 0; attempt < GAME_CONFIG.generator.attemptLimit; attempt += 1) {
    const attemptSeed = `${input.seed}:attempt-${attempt}`;
    const blockedCellIndices = chooseBlockedCells(config, attemptSeed);
    const solution = fillBoard(config, attemptSeed, blockedCellIndices);
    if (!solution) {
      continue;
    }
    if (!bestSolution || varietyScore(solution) > varietyScore(bestSolution)) {
      bestSolution = solution;
      bestBlocked = blockedCellIndices;
    }
    const targetDistinct = Math.min(5, config.pieceCount);
    if (new Set(solution.map((placement) => placement.pieceType)).size >= targetDistinct) {
      break;
    }
  }

  if (!bestSolution) {
    throw new Error(`Failed to generate tier ${input.tier} puzzle for seed ${input.seed}`);
  }

  const blocked = new Set(bestBlocked);
  const usableCellIndices = makeRange(config.width * config.height).filter((index) => !blocked.has(index));
  const pieces = bestSolution.map((placement) => ({ id: placement.pieceId, type: placement.pieceType }));
  const withoutDifficulty = {
    id: `${GAME_CONFIG.generatorVersion}:${input.tier}:${input.seed}`,
    generatorVersion: GAME_CONFIG.generatorVersion,
    tier: input.tier,
    seed: input.seed,
    width: config.width,
    height: config.height,
    usableCellIndices,
    blockedCellIndices: bestBlocked,
    pieces,
    constructionSolution: bestSolution,
  };
  const difficulty = measureDifficulty(withoutDifficulty);
  return { ...withoutDifficulty, difficulty };
}
