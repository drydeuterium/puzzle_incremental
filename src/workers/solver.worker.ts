/// <reference lib="webworker" />
import { createSolver, type IncrementalSolver } from "../solver/incrementalSolver";
import type { WorkerRequest, WorkerResponse } from "../solver/solverProtocol";
import type { SolverOptions, SolverSessionId } from "../core/types";
import { GAME_CONFIG } from "../game/config";

type Session = {
  solver: IncrementalSolver;
  options: SolverOptions;
  timer: number | null;
  lastVisualAt: number;
};

const sessions = new Map<SolverSessionId, Session>();

function send(message: WorkerResponse): void {
  self.postMessage(message);
}

function runSlice(sessionId: SolverSessionId): void {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  const budget = Math.max(1, Math.round(session.options.nodesPerSecond * GAME_CONFIG.solver.workerQuantumMilliseconds / 1000));
  const result = session.solver.step(budget);
  const now = performance.now();
  if (result.status === "solved") {
    send({ type: "SOLVED", sessionId, stats: result.stats, solution: result.solution });
    sessions.delete(sessionId);
    return;
  }
  if (result.status === "unsat") {
    send({ type: "UNSAT", sessionId, stats: result.stats });
    sessions.delete(sessionId);
    return;
  }
  const visualInterval = session.options.visualization === "on" ? 100 : session.options.visualization === "reduced" ? 500 : Number.POSITIVE_INFINITY;
  if (now - session.lastVisualAt >= visualInterval) {
    session.lastVisualAt = now;
    send({ type: "PROGRESS", sessionId, stats: result.stats, placements: result.preview });
  } else {
    send({ type: "PROGRESS", sessionId, stats: result.stats });
  }
  session.timer = self.setTimeout(() => runSlice(sessionId), GAME_CONFIG.solver.workerQuantumMilliseconds);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "START") {
      const existing = sessions.get(request.sessionId);
      if (existing && existing.timer !== null) {
        self.clearTimeout(existing.timer);
      }
      const solver = createSolver(request.puzzle, request.options);
      sessions.set(request.sessionId, { solver, options: request.options, timer: null, lastVisualAt: 0 });
      send({ type: "STARTED", sessionId: request.sessionId });
      runSlice(request.sessionId);
      return;
    }
    const session = "sessionId" in request ? sessions.get(request.sessionId) : undefined;
    if (request.type === "PAUSE" && session) {
      if (session.timer !== null) {
        self.clearTimeout(session.timer);
      }
      session.timer = null;
      session.solver.pause();
      send({ type: "PROGRESS", sessionId: request.sessionId, stats: session.solver.getStats() });
    } else if (request.type === "RESUME" && session) {
      session.solver.resume();
      runSlice(request.sessionId);
    } else if (request.type === "CANCEL" && session) {
      if (session.timer !== null) {
        self.clearTimeout(session.timer);
      }
      session.solver.cancel();
      sessions.delete(request.sessionId);
      send({ type: "PROGRESS", sessionId: request.sessionId, stats: session.solver.getStats() });
    } else if (request.type === "UPDATE_BUDGET" && session) {
      session.options = { ...session.options, nodesPerSecond: request.nodesPerSecond };
    } else if (request.type === "SET_VISUALIZATION") {
      for (const active of sessions.values()) {
        active.options = { ...active.options, visualization: request.mode };
      }
    }
  } catch (error) {
    send({ type: "ERROR", sessionId: "sessionId" in request ? request.sessionId : undefined, code: "worker-error", message: error instanceof Error ? error.message : "Unknown worker error" });
  }
};
