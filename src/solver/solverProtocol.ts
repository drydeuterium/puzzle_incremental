import type { Placement, PuzzleDefinition, SolverOptions, SolverSessionId, SolverStats } from "../core/types";

export type WorkerRequest =
  | Readonly<{ type: "START"; sessionId: SolverSessionId; puzzle: PuzzleDefinition; options: SolverOptions }>
  | Readonly<{ type: "PAUSE"; sessionId: SolverSessionId }>
  | Readonly<{ type: "RESUME"; sessionId: SolverSessionId }>
  | Readonly<{ type: "CANCEL"; sessionId: SolverSessionId }>
  | Readonly<{ type: "UPDATE_BUDGET"; sessionId: SolverSessionId; nodesPerSecond: number }>
  | Readonly<{ type: "SET_VISUALIZATION"; mode: SolverOptions["visualization"] }>;

export type WorkerResponse =
  | Readonly<{ type: "STARTED"; sessionId: SolverSessionId }>
  | Readonly<{ type: "PROGRESS"; sessionId: SolverSessionId; stats: SolverStats; placements?: readonly Placement[] }>
  | Readonly<{ type: "SOLVED"; sessionId: SolverSessionId; stats: SolverStats; solution: readonly Placement[] }>
  | Readonly<{ type: "UNSAT"; sessionId: SolverSessionId; stats: SolverStats }>
  | Readonly<{ type: "ERROR"; sessionId?: SolverSessionId; code: string; message: string }>;

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.type === "string";
}
