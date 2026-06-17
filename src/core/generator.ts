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

function makeUsableCellIndices(config: TierConfig, blockedCellIndices: readonly number[]): readonly number[] {
  const blocked = new Set(blockedCellIndices);
  return makeRange(config.width * config.height).filter((index) => !blocked.has(index));
}

function isUsableRegionConnected(config: TierConfig, blockedCellIndices: readonly number[]): boolean {
  const usable = new Set(makeUsableCellIndices(config, blockedCellIndices));
  const first = usable.values().next().value as number | undefined;
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
    const x = index % config.width;
    const y = Math.floor(index / config.width);
    const neighbors = [
      x > 0 ? index - 1 : null,
      x < config.width - 1 ? index + 1 : null,
      y > 0 ? index - config.width : null,
      y < config.height - 1 ? index + config.width : null,
    ];
    for (const neighbor of neighbors) {
      if (neighbor !== null && usable.has(neighbor) && !visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return visited.size === usable.size;
}

function isBoundaryCell(config: TierConfig, index: number): boolean {
  const x = index % config.width;
  const y = Math.floor(index / config.width);
  return x === 0 || y === 0 || x === config.width - 1 || y === config.height - 1;
}

function interiorBlockedCountFor(config: TierConfig, blockedCount: number, interiorCellCount: number): number {
  const requested = config.shape?.interiorBlockedCellCount
    ?? Math.round(blockedCount * (config.shape?.interiorBlockedCellRatio ?? 0));
  return Math.min(Math.max(0, requested), blockedCount, interiorCellCount);
}

function chooseJaggedBlockedCells(config: TierConfig, seed: string, blockedCount: number, attempt: number): readonly number[] | null {
  const allCellIndices = makeRange(config.width * config.height);
  const boundaryCells = allCellIndices.filter((index) => isBoundaryCell(config, index));
  const interiorCells = allCellIndices.filter((index) => !isBoundaryCell(config, index));
  const interiorBlockedCount = interiorBlockedCountFor(config, blockedCount, interiorCells.length);
  const boundaryBlockedCount = blockedCount - interiorBlockedCount;
  if (boundaryBlockedCount > boundaryCells.length) {
    return null;
  }

  const blocked = [
    ...shuffleDeterministic(interiorCells, `${seed}:interior-holes:${attempt}`).slice(0, interiorBlockedCount),
    ...shuffleDeterministic(boundaryCells, `${seed}:edge-carve:${attempt}`).slice(0, boundaryBlockedCount),
  ].sort((a, b) => a - b);
  return blocked.length === blockedCount ? blocked : null;
}

function chooseBlockedCells(config: TierConfig, seed: string): readonly number[] | null {
  const blockedCount = compatibleBlockedCount(config, seed);
  if (blockedCount === 0) {
    return [];
  }

  const allCellIndices = makeRange(config.width * config.height);
  const attemptLimit = Math.max(64, config.width * config.height * 4);
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const blocked = config.shape?.style === "jagged"
      ? chooseJaggedBlockedCells(config, seed, blockedCount, attempt)
      : shuffleDeterministic(allCellIndices, `${seed}:blocked-cells:${attempt}`)
        .slice(0, blockedCount)
        .sort((a, b) => a - b);
    if (!blocked) {
      continue;
    }
    if (!GAME_CONFIG.generator.connectedUsableRegionRequired || isUsableRegionConnected(config, blocked)) {
      return blocked;
    }
  }

  return null;
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
  const usableCellIndices = makeUsableCellIndices(config, blockedCellIndices);
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
    if (!blockedCellIndices) {
      continue;
    }
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

  const usableCellIndices = makeUsableCellIndices(config, bestBlocked);
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
