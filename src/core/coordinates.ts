import type { Cell } from "./types";

export function cellIndex(width: number, cell: Cell): number {
  return cell.y * width + cell.x;
}

export function indexToCell(width: number, index: number): Cell {
  return { x: index % width, y: Math.floor(index / width) };
}

export function isInside(width: number, height: number, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height;
}

export function makeRange(length: number): readonly number[] {
  return Array.from({ length }, (_, index) => index);
}

export function canonicalCells(cells: readonly Cell[]): string {
  return [...cells].sort((a, b) => (a.y - b.y) || (a.x - b.x)).map((cell) => `${cell.x},${cell.y}`).join(";");
}
