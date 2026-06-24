import { cellIndex, isInside } from "./coordinates";
import { enumerateOrientations } from "./tetrominoes";
import type { BoardState, PieceId, PieceInstance, Placement, PlacementValidation, PuzzleDefinition } from "./types";

type PlacementGeometry = Extract<PlacementValidation, { ok: false }> | Readonly<{ ok: true; placement: Placement }>;

export function createEmptyBoard(): BoardState {
  return { placementsByPieceId: {} };
}

export function boardPlacements(board: BoardState): readonly Placement[] {
  return Object.values(board.placementsByPieceId);
}

export function occupiedBy(board: BoardState): ReadonlyMap<number, PieceId> {
  const map = new Map<number, PieceId>();
  for (const placement of boardPlacements(board)) {
    for (const index of placement.cellIndices) {
      map.set(index, placement.pieceId);
    }
  }
  return map;
}

export function createPlacement(puzzle: PuzzleDefinition, piece: PieceInstance, orientationIndex: number, anchor: { x: number; y: number }): Placement {
  const orientation = enumerateOrientations(piece.type)[orientationIndex];
  if (!orientation) {
    throw new Error(`Invalid orientation ${orientationIndex} for ${piece.type}`);
  }
  return {
    pieceId: piece.id,
    pieceType: piece.type,
    orientationIndex,
    anchor,
    cellIndices: orientation.cells.map((cell) => cellIndex(puzzle.width, { x: anchor.x + cell.x, y: anchor.y + cell.y })),
  };
}

export function enumeratePlacements(puzzle: PuzzleDefinition, piece: PieceInstance): readonly Placement[] {
  const placements: Placement[] = [];
  const usable = new Set(puzzle.usableCellIndices);
  for (const orientation of enumerateOrientations(piece.type)) {
    for (let y = 0; y <= puzzle.height - orientation.height; y += 1) {
      for (let x = 0; x <= puzzle.width - orientation.width; x += 1) {
        const cellIndices = orientation.cells.map((cell) => cellIndex(puzzle.width, { x: x + cell.x, y: y + cell.y }));
        if (cellIndices.every((index) => usable.has(index))) {
          placements.push({ pieceId: piece.id, pieceType: piece.type, orientationIndex: orientation.index, anchor: { x, y }, cellIndices });
        }
      }
    }
  }
  return placements;
}

function resolvePlacementGeometry(puzzle: PuzzleDefinition, placement: Placement): PlacementGeometry {
  const piece = puzzle.pieces.find((entry) => entry.id === placement.pieceId);
  if (!piece) {
    return { ok: false, reason: "unknown-piece" };
  }
  const orientation = enumerateOrientations(piece.type)[placement.orientationIndex];
  if (!orientation) {
    return { ok: false, reason: "outside" };
  }
  const cells = orientation.cells.map((cell) => ({ x: placement.anchor.x + cell.x, y: placement.anchor.y + cell.y }));
  if (cells.some((cell) => !isInside(puzzle.width, puzzle.height, cell))) {
    return { ok: false, reason: "outside" };
  }
  return {
    ok: true,
    placement: {
      ...placement,
      pieceType: piece.type,
      cellIndices: cells.map((cell) => cellIndex(puzzle.width, cell)),
    },
  };
}

export function canPlace(puzzle: PuzzleDefinition, board: BoardState, placement: Placement): PlacementValidation {
  const resolved = resolvePlacementGeometry(puzzle, placement);
  if (!resolved.ok) {
    return resolved;
  }
  const blocked = new Set(puzzle.blockedCellIndices);
  const usable = new Set(puzzle.usableCellIndices);
  const occupied = occupiedBy(removePiece(board, resolved.placement.pieceId));
  for (const index of resolved.placement.cellIndices) {
    if (blocked.has(index) || !usable.has(index)) {
      return { ok: false, reason: "blocked" };
    }
    if (occupied.has(index)) {
      return { ok: false, reason: "overlap" };
    }
  }
  return { ok: true };
}

export function applyPlacement(puzzle: PuzzleDefinition, board: BoardState, placement: Placement): BoardState {
  const validation = canPlace(puzzle, board, placement);
  if (!validation.ok) {
    return board;
  }
  const resolved = resolvePlacementGeometry(puzzle, placement);
  if (!resolved.ok) {
    return board;
  }
  return {
    placementsByPieceId: {
      ...board.placementsByPieceId,
      [resolved.placement.pieceId]: resolved.placement,
    },
  };
}

export function removePiece(board: BoardState, pieceId: PieceId): BoardState {
  const next = { ...board.placementsByPieceId };
  delete next[pieceId];
  return { placementsByPieceId: next };
}

export function isSolved(puzzle: PuzzleDefinition, board: BoardState): boolean {
  const placements = boardPlacements(board);
  if (placements.length !== puzzle.pieces.length) {
    return false;
  }
  const occupied = occupiedBy(board);
  if (occupied.size !== puzzle.usableCellIndices.length) {
    return false;
  }
  return puzzle.usableCellIndices.every((index) => occupied.has(index));
}

export function boardFromPlacements(puzzle: PuzzleDefinition, placements: readonly Placement[]): BoardState {
  return placements.reduce((board, placement) => applyPlacement(puzzle, board, placement), createEmptyBoard());
}
