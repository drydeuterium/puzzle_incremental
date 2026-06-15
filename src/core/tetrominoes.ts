import { canonicalCells } from "./coordinates";
import type { Cell, Orientation, TetrominoType } from "./types";

const BASE_CELLS: Readonly<Record<TetrominoType, readonly Cell[]>> = {
  I: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
  O: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  T: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }],
  L: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  J: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }],
  S: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  Z: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
};

export const TETROMINO_TYPES: readonly TetrominoType[] = ["I", "O", "T", "L", "J", "S", "Z"];

function rotateClockwise(cells: readonly Cell[]): readonly Cell[] {
  return cells.map((cell) => ({ x: -cell.y, y: cell.x }));
}

export function normalizeCells(cells: readonly Cell[]): readonly Cell[] {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells
    .map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

export function enumerateOrientations(type: TetrominoType): readonly Orientation[] {
  const result: Orientation[] = [];
  const seen = new Set<string>();
  let current = BASE_CELLS[type];
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const cells = normalizeCells(current);
    const canonicalKey = canonicalCells(cells);
    if (!seen.has(canonicalKey)) {
      seen.add(canonicalKey);
      result.push({
        index: result.length,
        cells,
        width: Math.max(...cells.map((cell) => cell.x)) + 1,
        height: Math.max(...cells.map((cell) => cell.y)) + 1,
        canonicalKey,
      });
    }
    current = rotateClockwise(current);
  }
  return result;
}

export function inferTetrominoType(cells: readonly Cell[]): TetrominoType {
  const key = canonicalCells(normalizeCells(cells));
  for (const type of TETROMINO_TYPES) {
    if (enumerateOrientations(type).some((orientation) => orientation.canonicalKey === key)) {
      return type;
    }
  }
  throw new Error(`Unknown tetromino shape: ${key}`);
}
