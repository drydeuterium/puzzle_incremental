import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyPlacement, boardFromPlacements, boardPlacements, canPlace, createEmptyBoard, createPlacement, enumeratePlacements, isSolved, removePiece } from "../core/board";
import { generatePuzzle, dailySeed } from "../core/generator";
import { calculateReward } from "../core/rewards";
import type { BoardState, ClearClassification, Placement, PuzzleDefinition, SaveDataV1, SolverSessionId, SolverStats, UpgradeId } from "../core/types";
import { GAME_CONFIG } from "../game/config";
import { canPurchaseUpgrade, getUpgradeConfig, getUpgradePrice, isTierUnlocked, nodesPerSecond, parallelSessions, queueCapacity, solverOptionsFromUpgrades } from "../game/upgrades";
import { createInitialSave } from "../persistence/schema";
import { eraseSave, exportSave, importSave, loadSave, saveGame } from "../persistence/saveRepository";
import { solveToEnd } from "../solver/incrementalSolver";
import type { WorkerResponse } from "../solver/solverProtocol";
import { createSolverWorkerClient, type SolverWorkerClient } from "../workers/workerClient";

type RuntimePuzzle = Readonly<{
  definition: PuzzleDefinition;
  board: BoardState;
  classification: ClearClassification;
  startedAt: number;
  cleared: boolean;
}>;

type SolverUiState = Readonly<{
  status: SolverStats["status"];
  sessionId: SolverSessionId | null;
  stats: SolverStats | null;
  preview: readonly Placement[];
  queue: readonly PuzzleDefinition[];
  activeSessions: number;
  completedSessionIds: readonly SolverSessionId[];
}>;

type AppState = Readonly<{
  save: SaveDataV1;
  puzzle: RuntimePuzzle;
  selectedPieceId: string | null;
  rotations: Readonly<Record<string, number>>;
  undoStack: readonly BoardState[];
  redoStack: readonly BoardState[];
  scannerEnabled: boolean;
  toast: string | null;
  persistentWarning: string | null;
  clearResult: Readonly<{ reward: number; classification: ClearClassification }> | null;
  settingsOpen: boolean;
  statsOpen: boolean;
  solver: SolverUiState;
}>;

type Action =
  | Readonly<{ type: "select-piece"; pieceId: string | null }>
  | Readonly<{ type: "place"; placement: Placement }>
  | Readonly<{ type: "remove-selected" }>
  | Readonly<{ type: "rotate"; direction: 1 | -1 }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{ type: "reset-board" }>
  | Readonly<{ type: "new-puzzle"; puzzle: PuzzleDefinition }>
  | Readonly<{ type: "set-tier"; tier: number }>
  | Readonly<{ type: "purchase"; upgradeId: UpgradeId }>
  | Readonly<{ type: "scanner" }>
  | Readonly<{ type: "forced-move"; placement: Placement | null }>
  | Readonly<{ type: "contradiction"; message: string }>
  | Readonly<{ type: "set-settings-open"; value: boolean }>
  | Readonly<{ type: "set-stats-open"; value: boolean }>
  | Readonly<{ type: "set-visualization"; value: SaveDataV1["settings"]["visualization"] }>
  | Readonly<{ type: "set-high-contrast"; value: boolean }>
  | Readonly<{ type: "set-theme"; value: SaveDataV1["settings"]["theme"] }>
  | Readonly<{ type: "solver-started"; sessionId: SolverSessionId }>
  | Readonly<{ type: "solver-progress"; sessionId: SolverSessionId; stats: SolverStats; preview?: readonly Placement[] }>
  | Readonly<{ type: "solver-solved"; sessionId: SolverSessionId; stats: SolverStats; solution: readonly Placement[] }>
  | Readonly<{ type: "solver-unsat"; sessionId: SolverSessionId; stats: SolverStats }>
  | Readonly<{ type: "solver-error"; message: string }>
  | Readonly<{ type: "solver-paused" }>
  | Readonly<{ type: "solver-cancelled" }>
  | Readonly<{ type: "enqueue"; puzzle: PuzzleDefinition }>
  | Readonly<{ type: "queue-started"; count: number }>
  | Readonly<{ type: "solver-queue-solved"; sessionId: SolverSessionId; puzzle: PuzzleDefinition; stats: SolverStats }>
  | Readonly<{ type: "solver-queue-unsat"; sessionId: SolverSessionId; stats: SolverStats }>
  | Readonly<{ type: "import"; save: SaveDataV1 }>
  | Readonly<{ type: "erase"; save: SaveDataV1 }>
  | Readonly<{ type: "toast"; message: string | null }>;

function puzzleFromSave(save: SaveDataV1): RuntimePuzzle {
  if (save.currentPuzzle && save.currentPuzzle.definition.generatorVersion === GAME_CONFIG.generatorVersion) {
    const currentPuzzle = save.currentPuzzle;
    const placements = save.currentPuzzle.placements.flatMap((saved) => {
      const piece = currentPuzzle.definition.pieces.find((entry) => entry.id === saved.pieceId);
      return piece ? [createPlacement(currentPuzzle.definition, piece, saved.orientationIndex, saved.anchor)] : [];
    });
    return {
      definition: currentPuzzle.definition,
      board: boardFromPlacements(currentPuzzle.definition, placements),
      classification: currentPuzzle.classification,
      startedAt: Date.parse(currentPuzzle.startedAt),
      cleared: currentPuzzle.cleared,
    };
  }
  const definition = generatePuzzle({ tier: save.progression.selectedTier, seed: "initial-tier-0" });
  return { definition, board: createEmptyBoard(), classification: "manual", startedAt: Date.now(), cleared: false };
}

function saveFromState(state: AppState): SaveDataV1 {
  return {
    ...state.save,
    gameConfigVersion: GAME_CONFIG.gameConfigVersion,
    generatorVersion: GAME_CONFIG.generatorVersion,
    currentPuzzle: {
      definition: state.puzzle.definition,
      placements: boardPlacements(state.puzzle.board).map((placement) => ({ pieceId: placement.pieceId, orientationIndex: placement.orientationIndex, anchor: placement.anchor })),
      classification: state.puzzle.classification,
      startedAt: new Date(state.puzzle.startedAt).toISOString(),
      elapsedMilliseconds: Date.now() - state.puzzle.startedAt,
      cleared: state.puzzle.cleared,
    },
  };
}

function createInitialState(): AppState {
  const loaded = loadSave();
  const save = loaded.save;
  return {
    save,
    puzzle: puzzleFromSave(save),
    selectedPieceId: null,
    rotations: {},
    undoStack: [],
    redoStack: [],
    scannerEnabled: false,
    toast: loaded.message,
    persistentWarning: null,
    clearResult: null,
    settingsOpen: false,
    statsOpen: false,
    solver: {
      status: "idle",
      sessionId: null,
      stats: null,
      preview: [],
      queue: [],
      activeSessions: 0,
      completedSessionIds: [],
    },
  };
}

function withSavedPuzzle(state: AppState, patch: Partial<AppState>): AppState {
  const next = { ...state, ...patch };
  return { ...next, save: saveFromState(next) };
}

function classifyAssisted(state: AppState): RuntimePuzzle {
  return state.puzzle.classification === "manual" ? { ...state.puzzle, classification: "assisted" } : state.puzzle;
}

function classifyAutomated(state: AppState): RuntimePuzzle {
  return state.puzzle.classification === "automated" ? state.puzzle : { ...state.puzzle, classification: "automated" };
}

function awardClear(state: AppState, board: BoardState, stats?: SolverStats): AppState {
  if (state.puzzle.cleared || !isSolved(state.puzzle.definition, board)) {
    return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board } });
  }
  const reward = calculateReward(state.puzzle.definition, state.puzzle.classification);
  const classification = state.puzzle.classification;
  const clearsByTier = {
    ...state.save.statistics.clearsByTier,
    [state.puzzle.definition.tier]: (state.save.statistics.clearsByTier[String(state.puzzle.definition.tier)] ?? 0) + 1,
  };
  const elapsed = Date.now() - state.puzzle.startedAt;
  const fastestManualClearMilliseconds = classification === "manual"
    ? Math.min(state.save.statistics.fastestManualClearMilliseconds ?? elapsed, elapsed)
    : state.save.statistics.fastestManualClearMilliseconds;
  const nextSave: SaveDataV1 = {
    ...state.save,
    economy: {
      compute: Math.min(GAME_CONFIG.currency.maxSafeAmount, state.save.economy.compute + reward),
      lifetimeCompute: Math.min(GAME_CONFIG.currency.maxSafeAmount, state.save.economy.lifetimeCompute + reward),
    },
    statistics: {
      ...state.save.statistics,
      totalClears: state.save.statistics.totalClears + 1,
      manualClears: state.save.statistics.manualClears + (classification === "manual" ? 1 : 0),
      assistedClears: state.save.statistics.assistedClears + (classification === "assisted" ? 1 : 0),
      automatedClears: state.save.statistics.automatedClears + (classification === "automated" ? 1 : 0),
      clearsByTier,
      lifetimeSolverNodes: state.save.statistics.lifetimeSolverNodes + (stats?.nodes ?? 0),
      lifetimeBacktracks: state.save.statistics.lifetimeBacktracks + (stats?.backtracks ?? 0),
      automatedCellsSolved: state.save.statistics.automatedCellsSolved + (classification === "automated" ? state.puzzle.definition.usableCellIndices.length : 0),
      fastestManualClearMilliseconds,
      maximumDifficultyScore: Math.max(state.save.statistics.maximumDifficultyScore, state.puzzle.definition.difficulty.score),
    },
  };
  return {
    ...state,
    save: nextSave,
    puzzle: { ...state.puzzle, board, cleared: true },
    clearResult: { reward, classification },
    toast: `Cleared as ${classification}. +${reward}C`,
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "select-piece":
      return { ...state, selectedPieceId: action.pieceId };
    case "place": {
      const validation = canPlace(state.puzzle.definition, state.puzzle.board, action.placement);
      if (!validation.ok) {
        return { ...state, toast: `Cannot place: ${validation.reason}` };
      }
      const board = applyPlacement(state.puzzle.definition, state.puzzle.board, action.placement);
      const next = withSavedPuzzle(state, {
        puzzle: { ...state.puzzle, board },
        undoStack: [...state.undoStack.slice(-GAME_CONFIG.save.undoHistoryLimit + 1), state.puzzle.board],
        redoStack: [],
        selectedPieceId: action.placement.pieceId,
      });
      return awardClear(next, board);
    }
    case "remove-selected": {
      if (!state.selectedPieceId) {
        return state;
      }
      const board = removePiece(state.puzzle.board, state.selectedPieceId);
      return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board }, undoStack: [...state.undoStack, state.puzzle.board], redoStack: [] });
    }
    case "rotate": {
      if (!state.selectedPieceId) {
        return state;
      }
      const piece = state.puzzle.definition.pieces.find((entry) => entry.id === state.selectedPieceId);
      if (!piece) {
        return state;
      }
      const current = state.puzzle.board.placementsByPieceId[piece.id];
      const orientationCount = new Set(enumeratePlacements(state.puzzle.definition, piece).map((placement) => placement.orientationIndex)).size;
      const nextOrientation = ((current?.orientationIndex ?? state.rotations[piece.id] ?? 0) + action.direction + orientationCount) % orientationCount;
      if (current) {
        const placement = createPlacement(state.puzzle.definition, piece, nextOrientation, current.anchor);
        if (!canPlace(state.puzzle.definition, state.puzzle.board, placement).ok) {
          return { ...state, toast: "Rotation blocked." };
        }
        const board = applyPlacement(state.puzzle.definition, state.puzzle.board, placement);
        return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board }, undoStack: [...state.undoStack, state.puzzle.board], redoStack: [] });
      }
      return { ...state, rotations: { ...state.rotations, [piece.id]: nextOrientation } };
    }
    case "undo": {
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) {
        return state;
      }
      return withSavedPuzzle(state, {
        puzzle: { ...state.puzzle, board: previous, cleared: false },
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.puzzle.board],
      });
    }
    case "redo": {
      const nextBoard = state.redoStack[state.redoStack.length - 1];
      if (!nextBoard) {
        return state;
      }
      return withSavedPuzzle(state, {
        puzzle: { ...state.puzzle, board: nextBoard },
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.puzzle.board],
      });
    }
    case "reset-board":
      return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board: createEmptyBoard(), cleared: false }, undoStack: [...state.undoStack, state.puzzle.board], redoStack: [] });
    case "new-puzzle":
      return withSavedPuzzle(state, {
        puzzle: { definition: action.puzzle, board: createEmptyBoard(), classification: "manual", startedAt: Date.now(), cleared: false },
        selectedPieceId: null,
        rotations: {},
        undoStack: [],
        redoStack: [],
        scannerEnabled: false,
        clearResult: null,
      });
    case "set-tier":
      return { ...state, save: { ...state.save, progression: { ...state.save.progression, selectedTier: action.tier } } };
    case "purchase": {
      const levels = state.save.progression.upgradeLevels;
      const outcome = canPurchaseUpgrade(levels, state.save.economy.compute, action.upgradeId);
      if (!outcome.ok) {
        return { ...state, toast: outcome.reason };
      }
      return {
        ...state,
        save: {
          ...state.save,
          economy: { ...state.save.economy, compute: state.save.economy.compute - outcome.price },
          progression: {
            ...state.save.progression,
            upgradeLevels: { ...levels, [action.upgradeId]: (levels[action.upgradeId] ?? 0) + 1 },
          },
        },
        toast: `Purchased ${getUpgradeConfig(action.upgradeId).name}`,
      };
    }
    case "scanner":
      if ((state.save.progression.upgradeLevels["placement-scanner"] ?? 0) <= 0) {
        return { ...state, toast: "Placement Scanner is locked." };
      }
      return withSavedPuzzle({ ...state, puzzle: classifyAssisted(state) }, { scannerEnabled: !state.scannerEnabled });
    case "forced-move": {
      if ((state.save.progression.upgradeLevels["forced-move"] ?? 0) <= 0) {
        return { ...state, toast: "Forced Move is locked." };
      }
      if (!action.placement) {
        return withSavedPuzzle({ ...state, puzzle: classifyAssisted(state) }, { toast: "No forced move found." });
      }
      const assistedState = { ...state, puzzle: classifyAssisted(state) };
      const board = applyPlacement(assistedState.puzzle.definition, assistedState.puzzle.board, action.placement);
      return awardClear(withSavedPuzzle(assistedState, { puzzle: { ...assistedState.puzzle, board }, undoStack: [...state.undoStack, state.puzzle.board], redoStack: [] }), board);
    }
    case "contradiction":
      return withSavedPuzzle({ ...state, puzzle: classifyAssisted(state) }, { toast: action.message });
    case "set-settings-open":
      return { ...state, settingsOpen: action.value };
    case "set-stats-open":
      return { ...state, statsOpen: action.value };
    case "set-visualization":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, visualization: action.value } } };
    case "set-high-contrast":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, highContrast: action.value } } };
    case "set-theme":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, theme: action.value } } };
    case "solver-started":
      return withSavedPuzzle({ ...state, puzzle: classifyAutomated(state) }, { solver: { ...state.solver, status: "running", sessionId: action.sessionId, activeSessions: 1 }, toast: "Auto Solver started." });
    case "solver-progress":
      if (state.solver.sessionId !== action.sessionId) {
        return state;
      }
      return { ...state, solver: { ...state.solver, status: action.stats.status, stats: action.stats, preview: action.preview ?? state.solver.preview } };
    case "solver-solved": {
      if (state.solver.completedSessionIds.includes(action.sessionId) || state.solver.sessionId !== action.sessionId) {
        return state;
      }
      const board = boardFromPlacements(state.puzzle.definition, action.solution);
      const next = withSavedPuzzle(state, {
        puzzle: { ...state.puzzle, board, classification: "automated" },
        solver: { ...state.solver, status: "solved", stats: action.stats, preview: action.solution, activeSessions: 0, completedSessionIds: [...state.solver.completedSessionIds, action.sessionId] },
      });
      return awardClear(next, board, action.stats);
    }
    case "solver-unsat":
      return { ...state, solver: { ...state.solver, status: "unsat", stats: action.stats, activeSessions: 0 }, toast: "Solver failed: unsat." };
    case "solver-error":
      return { ...state, solver: { ...state.solver, status: "error", activeSessions: 0 }, persistentWarning: action.message };
    case "solver-paused":
      return { ...state, solver: { ...state.solver, status: "paused" } };
    case "solver-cancelled":
      return { ...state, solver: { ...state.solver, status: "cancelled", activeSessions: 0 } };
    case "enqueue":
      return { ...state, solver: { ...state.solver, queue: [...state.solver.queue, action.puzzle] } };
    case "queue-started":
      return { ...state, solver: { ...state.solver, status: "running", queue: state.solver.queue.slice(action.count), activeSessions: state.solver.activeSessions + action.count } };
    case "solver-queue-solved": {
      if (state.solver.completedSessionIds.includes(action.sessionId)) {
        return state;
      }
      const reward = calculateReward(action.puzzle, "automated");
      return {
        ...state,
        save: {
          ...state.save,
          economy: {
            compute: Math.min(GAME_CONFIG.currency.maxSafeAmount, state.save.economy.compute + reward),
            lifetimeCompute: Math.min(GAME_CONFIG.currency.maxSafeAmount, state.save.economy.lifetimeCompute + reward),
          },
          statistics: {
            ...state.save.statistics,
            totalClears: state.save.statistics.totalClears + 1,
            automatedClears: state.save.statistics.automatedClears + 1,
            clearsByTier: {
              ...state.save.statistics.clearsByTier,
              [action.puzzle.tier]: (state.save.statistics.clearsByTier[String(action.puzzle.tier)] ?? 0) + 1,
            },
            lifetimeSolverNodes: state.save.statistics.lifetimeSolverNodes + action.stats.nodes,
            lifetimeBacktracks: state.save.statistics.lifetimeBacktracks + action.stats.backtracks,
            automatedCellsSolved: state.save.statistics.automatedCellsSolved + action.puzzle.usableCellIndices.length,
            maximumDifficultyScore: Math.max(state.save.statistics.maximumDifficultyScore, action.puzzle.difficulty.score),
          },
        },
        solver: {
          ...state.solver,
          status: state.solver.activeSessions <= 1 ? "solved" : state.solver.status,
          stats: action.stats,
          activeSessions: Math.max(0, state.solver.activeSessions - 1),
          completedSessionIds: [...state.solver.completedSessionIds, action.sessionId],
        },
        toast: `Queue solved Tier ${action.puzzle.tier}. +${reward}C`,
      };
    }
    case "solver-queue-unsat":
      return { ...state, solver: { ...state.solver, stats: action.stats, activeSessions: Math.max(0, state.solver.activeSessions - 1) }, toast: "Queued puzzle failed." };
    case "import":
      return { ...createInitialState(), save: action.save, puzzle: puzzleFromSave(action.save), toast: "Save imported." };
    case "erase":
      return { ...createInitialState(), save: action.save, puzzle: puzzleFromSave(action.save), toast: "Save erased." };
    case "toast":
      return { ...state, toast: action.message };
    default:
      return state;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function findForcedMove(puzzle: PuzzleDefinition, board: BoardState): Placement | null {
  for (const index of puzzle.usableCellIndices) {
    if (boardPlacements(board).some((placement) => placement.cellIndices.includes(index))) {
      continue;
    }
    const candidates = puzzle.pieces
      .filter((piece) => !board.placementsByPieceId[piece.id])
      .flatMap((piece) => enumeratePlacements(puzzle, piece))
      .filter((placement) => placement.cellIndices.includes(index) && canPlace(puzzle, board, placement).ok);
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length === 0) {
      return null;
    }
  }
  return null;
}

function choosePlacementForCell(
  puzzle: PuzzleDefinition,
  board: BoardState,
  piece: PuzzleDefinition["pieces"][number],
  orientationIndex: number,
  targetCellIndex: number,
): Placement | null {
  const legal = enumeratePlacements(puzzle, piece)
    .filter((placement) => placement.orientationIndex === orientationIndex)
    .filter((placement) => placement.cellIndices.includes(targetCellIndex))
    .filter((placement) => canPlace(puzzle, board, placement).ok);
  if (legal.length === 0) {
    return null;
  }
  const exactAnchor = legal.find((placement) => placement.anchor.y * puzzle.width + placement.anchor.x === targetCellIndex);
  return exactAnchor ?? legal[0];
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const workerRef = useRef<SolverWorkerClient | null>(null);
  const queueSessionsRef = useRef<Map<SolverSessionId, PuzzleDefinition>>(new Map());
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [eraseText, setEraseText] = useState("");

  useEffect(() => {
    try {
      saveGame(saveFromState(state));
    } catch (error) {
      dispatch({ type: "solver-error", message: error instanceof Error ? error.message : "Save failed." });
    }
  }, [state]);

  useEffect(() => {
    const interval = window.setInterval(() => saveGame(saveFromState(state)), GAME_CONFIG.save.autosaveIntervalMilliseconds);
    const flush = () => saveGame(saveFromState(state));
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [state]);

  useEffect(() => {
    return () => workerRef.current?.dispose();
  }, []);

  const puzzle = state.puzzle.definition;
  const placedByCell = useMemo(() => {
    const map = new Map<number, Placement>();
    for (const placement of boardPlacements(state.puzzle.board)) {
      for (const index of placement.cellIndices) {
        map.set(index, placement);
      }
    }
    return map;
  }, [state.puzzle.board]);
  const selectedPiece = puzzle.pieces.find((piece) => piece.id === state.selectedPieceId) ?? null;
  const selectedPlacementPreview = useMemo(() => {
    if (!selectedPiece || hoverCell === null || state.puzzle.board.placementsByPieceId[selectedPiece.id]) {
      return null;
    }
    return choosePlacementForCell(puzzle, state.puzzle.board, selectedPiece, state.rotations[selectedPiece.id] ?? 0, hoverCell);
  }, [hoverCell, puzzle, selectedPiece, state.puzzle.board, state.rotations]);

  const handleWorkerMessage = useCallback((message: WorkerResponse) => {
    if (message.type === "STARTED") {
      if (!queueSessionsRef.current.has(message.sessionId)) {
        dispatch({ type: "solver-started", sessionId: message.sessionId });
      }
    } else if (message.type === "PROGRESS") {
      if (!queueSessionsRef.current.has(message.sessionId)) {
        dispatch({ type: "solver-progress", sessionId: message.sessionId, stats: message.stats, preview: message.placements });
      }
    } else if (message.type === "SOLVED") {
      const queuedPuzzle = queueSessionsRef.current.get(message.sessionId);
      if (queuedPuzzle) {
        queueSessionsRef.current.delete(message.sessionId);
        dispatch({ type: "solver-queue-solved", sessionId: message.sessionId, puzzle: queuedPuzzle, stats: message.stats });
      } else {
        dispatch({ type: "solver-solved", sessionId: message.sessionId, stats: message.stats, solution: message.solution });
      }
    } else if (message.type === "UNSAT") {
      if (queueSessionsRef.current.has(message.sessionId)) {
        queueSessionsRef.current.delete(message.sessionId);
        dispatch({ type: "solver-queue-unsat", sessionId: message.sessionId, stats: message.stats });
      } else {
        dispatch({ type: "solver-unsat", sessionId: message.sessionId, stats: message.stats });
      }
    } else if (message.type === "ERROR") {
      dispatch({ type: "solver-error", message: message.message });
    }
  }, []);

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = createSolverWorkerClient(handleWorkerMessage);
    }
    return workerRef.current;
  }, [handleWorkerMessage]);

  const startSolver = () => {
    if ((state.save.progression.upgradeLevels["auto-solver"] ?? 0) <= 0) {
      dispatch({ type: "toast", message: "Auto Solver is locked." });
      return;
    }
    const sessionId = `session-${Date.now()}`;
    ensureWorker().post({ type: "START", sessionId, puzzle, options: solverOptionsFromUpgrades(state.save.progression.upgradeLevels, state.save.settings.visualization) });
  };

  const pauseOrResumeSolver = () => {
    if (!state.solver.sessionId || !workerRef.current) {
      return;
    }
    if (state.solver.status === "paused") {
      workerRef.current.post({ type: "RESUME", sessionId: state.solver.sessionId });
    } else {
      workerRef.current.post({ type: "PAUSE", sessionId: state.solver.sessionId });
      dispatch({ type: "solver-paused" });
    }
  };

  const cancelSolver = () => {
    if (state.solver.sessionId && workerRef.current) {
      workerRef.current.post({ type: "CANCEL", sessionId: state.solver.sessionId });
      dispatch({ type: "solver-cancelled" });
    }
  };

  const startQueue = () => {
    if ((state.save.progression.upgradeLevels["auto-solver"] ?? 0) <= 0) {
      dispatch({ type: "toast", message: "Auto Solver is locked." });
      return;
    }
    const available = Math.max(0, parallelSessions(state.save.progression.upgradeLevels) - state.solver.activeSessions);
    const queued = state.solver.queue.slice(0, available);
    if (queued.length === 0) {
      dispatch({ type: "toast", message: "Queue is empty." });
      return;
    }
    const worker = ensureWorker();
    for (const queuedPuzzle of queued) {
      const sessionId = `queue-${queuedPuzzle.tier}-${queuedPuzzle.seed}-${Date.now()}-${queueSessionsRef.current.size}`;
      queueSessionsRef.current.set(sessionId, queuedPuzzle);
      worker.post({ type: "START", sessionId, puzzle: queuedPuzzle, options: solverOptionsFromUpgrades(state.save.progression.upgradeLevels, state.save.settings.visualization) });
    }
    dispatch({ type: "queue-started", count: queued.length });
  };

  const startNewPuzzle = (daily: boolean) => {
    if (boardPlacements(state.puzzle.board).length > 0 && !state.puzzle.cleared && !window.confirm("Discard current puzzle?")) {
      return;
    }
    const seed = daily ? dailySeed(state.save.progression.selectedTier) : `seed-${state.save.progression.selectedTier}-${Date.now()}`;
    dispatch({ type: "new-puzzle", puzzle: generatePuzzle({ tier: state.save.progression.selectedTier, seed }) });
  };

  const useContradictionDetector = () => {
    if ((state.save.progression.upgradeLevels["contradiction-detector"] ?? 0) <= 0) {
      dispatch({ type: "toast", message: "Contradiction Detector is locked." });
      return;
    }
    const result = solveToEnd(puzzle, solverOptionsFromUpgrades(state.save.progression.upgradeLevels, "off"), state.puzzle.board, 100_000);
    dispatch({ type: "contradiction", message: result.status === "unsat" ? "This position cannot be completed." : "No contradiction found." });
  };

  const handleCellClick = (index: number) => {
    const placed = placedByCell.get(index);
    if (placed) {
      dispatch({ type: "select-piece", pieceId: placed.pieceId });
      return;
    }
    if (!selectedPiece) {
      return;
    }
    const placement = choosePlacementForCell(puzzle, state.puzzle.board, selectedPiece, state.rotations[selectedPiece.id] ?? 0, index);
    if (!placement) {
      dispatch({ type: "toast", message: "No legal placement covers that cell." });
      return;
    }
    dispatch({ type: "place", placement });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key === "r" || event.key === "E") {
        dispatch({ type: "rotate", direction: 1 });
      } else if (event.key === "Q" || (event.key === "R" && event.shiftKey)) {
        dispatch({ type: "rotate", direction: -1 });
      } else if (event.key === "z" || (event.key === "z" && event.ctrlKey)) {
        dispatch({ type: "undo" });
      } else if (event.key === "y" || (event.key === "Z" && event.ctrlKey && event.shiftKey)) {
        dispatch({ type: "redo" });
      } else if (event.key === "Escape") {
        dispatch({ type: "select-piece", pieceId: null });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        dispatch({ type: "remove-selected" });
      } else if (event.key === "h") {
        dispatch({ type: "scanner" });
      } else if (event.key === " ") {
        event.preventDefault();
        if (state.solver.status === "running") {
          pauseOrResumeSolver();
        } else {
          startSolver();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const scannerCells = new Set<number>();
  if (state.scannerEnabled && selectedPiece) {
    for (const placement of enumeratePlacements(puzzle, selectedPiece)) {
      if (canPlace(puzzle, state.puzzle.board, placement).ok) {
        placement.cellIndices.forEach((index) => scannerCells.add(index));
      }
    }
  }
  const previewCells = new Set(selectedPlacementPreview?.cellIndices ?? []);
  const solverPreviewCells = new Set(state.solver.preview.flatMap((placement) => placement.cellIndices));

  const theme = state.save.settings.theme ?? "system";
  const appClassName = ["app", state.save.settings.highContrast ? "high-contrast" : "", theme === "dark" ? "dark" : "", theme === "light" ? "light" : ""].filter(Boolean).join(" ");

  return (
    <main className={appClassName}>
      <header className="topbar">
        <h1>puzzle_incremental</h1>
        <div className="metric"><span>Compute</span><strong data-testid="compute">{formatNumber(state.save.economy.compute)} C</strong></div>
        <div className="metric"><span>nodes/s</span><strong>{formatNumber(state.solver.stats?.measuredNodesPerSecond ?? 0)}</strong></div>
        <button type="button" onClick={() => dispatch({ type: "set-settings-open", value: true })}>Settings</button>
        <button type="button" onClick={() => dispatch({ type: "set-stats-open", value: true })}>Stats</button>
      </header>
      {state.persistentWarning && <div className="warning" role="alert">{state.persistentWarning}</div>}
      {state.toast && <div className="toast" role="status" aria-live="polite" onClick={() => dispatch({ type: "toast", message: null })}>{state.toast}</div>}

      <section className="layout">
        <aside className="panel">
          <h2>Pieces</h2>
          <div className="piece-tray">
            {puzzle.pieces.map((piece) => {
              const placed = Boolean(state.puzzle.board.placementsByPieceId[piece.id]);
              return (
                <button
                  key={piece.id}
                  type="button"
                  data-testid={`piece-${piece.id}`}
                  className={`piece-card ${state.selectedPieceId === piece.id ? "selected" : ""}`}
                  disabled={state.puzzle.cleared}
                  onClick={() => dispatch({ type: "select-piece", pieceId: piece.id })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    dispatch({ type: "rotate", direction: 1 });
                  }}
                >
                  <strong>{piece.type} #{piece.id.slice(1)}</strong>
                  <span>{placed ? "Placed" : "Ready"}</span>
                  <span>rot {state.puzzle.board.placementsByPieceId[piece.id]?.orientationIndex ?? state.rotations[piece.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
          <div className="controls">
            <button type="button" onClick={() => startNewPuzzle(false)}>New Puzzle</button>
            <button type="button" onClick={() => startNewPuzzle(true)}>Daily Seed</button>
            <button type="button" onClick={() => dispatch({ type: "reset-board" })}>Reset Board</button>
            <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={state.undoStack.length === 0}>Undo</button>
            <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={state.redoStack.length === 0}>Redo</button>
            <button type="button" onClick={() => dispatch({ type: "rotate", direction: -1 })}>Rotate Left</button>
            <button type="button" onClick={() => dispatch({ type: "rotate", direction: 1 })}>Rotate Right</button>
            <button type="button" onClick={() => dispatch({ type: "remove-selected" })}>Remove Piece</button>
            <button type="button" onClick={() => dispatch({ type: "scanner" })} disabled={(state.save.progression.upgradeLevels["placement-scanner"] ?? 0) <= 0} title="Requires Placement Scanner">Hint</button>
            <button type="button" onClick={useContradictionDetector} disabled={(state.save.progression.upgradeLevels["contradiction-detector"] ?? 0) <= 0} title="Requires Contradiction Detector">Check</button>
            <button type="button" onClick={() => dispatch({ type: "forced-move", placement: findForcedMove(puzzle, state.puzzle.board) })} disabled={(state.save.progression.upgradeLevels["forced-move"] ?? 0) <= 0} title="Requires Forced Move">Forced Move</button>
          </div>
        </aside>

        <section className="board-panel">
          <div className="board-header">
            <span>Tier {puzzle.tier}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(puzzle.seed)}>seed: {puzzle.seed}</button>
            <span>difficulty {puzzle.difficulty.score}</span>
            <span>{state.puzzle.classification}</span>
          </div>
          <div
            className="board"
            style={{ gridTemplateColumns: `repeat(${puzzle.width}, minmax(28px, 1fr))` }}
            role="grid"
            aria-label="Puzzle board"
          >
            {Array.from({ length: puzzle.width * puzzle.height }, (_, index) => {
              const placed = placedByCell.get(index);
              const blocked = puzzle.blockedCellIndices.includes(index);
              const preview = previewCells.has(index);
              const scanner = scannerCells.has(index);
              const solverPreview = solverPreviewCells.has(index);
              return (
                <button
                  key={index}
                  type="button"
                  data-testid={`cell-${index}`}
                  role="gridcell"
                  className={`cell ${blocked ? "blocked" : ""} ${placed ? "placed" : ""} ${preview ? "preview" : ""} ${scanner ? "scanner" : ""} ${solverPreview ? "solver-preview" : ""}`}
                  style={placed ? { "--piece-color": `var(--piece-${placed.pieceType})` } as React.CSSProperties : undefined}
                  disabled={blocked || state.puzzle.cleared}
                  onMouseEnter={() => setHoverCell(index)}
                  onFocus={() => setHoverCell(index)}
                  onClick={() => handleCellClick(index)}
                >
                  {placed?.pieceType ?? ""}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="panel">
          <h2>Solver</h2>
          <div className="solver-grid">
            <span>Status</span><strong data-testid="solver-status">{state.solver.status}</strong>
            <span>Nodes</span><strong>{formatNumber(state.solver.stats?.nodes ?? 0)}</strong>
            <span>Backtracks</span><strong>{formatNumber(state.solver.stats?.backtracks ?? 0)}</strong>
            <span>Theory nodes/s</span><strong>{formatNumber(nodesPerSecond(state.save.progression.upgradeLevels))}</strong>
            <span>Depth</span><strong>{state.solver.stats?.currentDepth ?? 0}</strong>
            <span>Queue</span><strong>{state.solver.queue.length}/{queueCapacity(state.save.progression.upgradeLevels)}</strong>
            <span>Parallel</span><strong>{parallelSessions(state.save.progression.upgradeLevels)}</strong>
          </div>
          <div className="controls">
            <button type="button" onClick={startSolver} disabled={(state.save.progression.upgradeLevels["auto-solver"] ?? 0) <= 0 || state.solver.status === "running"} title="Requires Auto Solver">Start Solver</button>
            <button type="button" onClick={pauseOrResumeSolver} disabled={!state.solver.sessionId}>{state.solver.status === "paused" ? "Resume" : "Pause"}</button>
            <button type="button" onClick={cancelSolver} disabled={!state.solver.sessionId}>Cancel</button>
            <button
              type="button"
              disabled={queueCapacity(state.save.progression.upgradeLevels) <= state.solver.queue.length}
              onClick={() => dispatch({ type: "enqueue", puzzle: generatePuzzle({ tier: state.save.progression.selectedTier, seed: `auto-${Date.now()}` }) })}
            >
              Enqueue
            </button>
            <button type="button" onClick={startQueue} disabled={state.solver.queue.length === 0 || (state.save.progression.upgradeLevels["auto-solver"] ?? 0) <= 0}>Start Queue</button>
          </div>

          <h2>Upgrades</h2>
          <div className="upgrade-list">
            {GAME_CONFIG.upgrades.map((upgrade) => {
              const level = state.save.progression.upgradeLevels[upgrade.id] ?? 0;
              const outcome = canPurchaseUpgrade(state.save.progression.upgradeLevels, state.save.economy.compute, upgrade.id);
              return (
                <article className="upgrade" key={upgrade.id}>
                  <div>
                    <strong>{upgrade.name}</strong>
                    <span>Level {level}/{upgrade.maxLevel}</span>
                  </div>
                  <p>{outcome.ok ? `Next: ${outcome.price}C` : `${getUpgradePrice(upgrade.id, level)}C, ${outcome.reason}`}</p>
                  <button type="button" onClick={() => dispatch({ type: "purchase", upgradeId: upgrade.id })} disabled={!outcome.ok}>Buy</button>
                </article>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="tier-row" aria-label="Tier selection">
        {GAME_CONFIG.tiers.map((tier) => (
          <button key={tier.id} type="button" disabled={!isTierUnlocked(state.save.progression.upgradeLevels, tier.id)} className={state.save.progression.selectedTier === tier.id ? "selected" : ""} onClick={() => dispatch({ type: "set-tier", tier: tier.id })}>
            Tier {tier.id}
          </button>
        ))}
      </section>

      {state.clearResult && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>Clear</h2>
            <p>{state.clearResult.classification} clear, +{state.clearResult.reward}C.</p>
            <p>Difficulty {puzzle.difficulty.score}</p>
            <button type="button" onClick={() => startNewPuzzle(false)}>Next Puzzle</button>
            <button type="button" onClick={() => dispatch({ type: "toast", message: null })}>Close</button>
          </div>
        </div>
      )}

      {state.settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>Settings</h2>
            <label>Theme
              <select value={theme} onChange={(event) => dispatch({ type: "set-theme", value: event.target.value as SaveDataV1["settings"]["theme"] })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>Visualization
              <select value={state.save.settings.visualization} onChange={(event) => dispatch({ type: "set-visualization", value: event.target.value as SaveDataV1["settings"]["visualization"] })}>
                <option value="on">On</option>
                <option value="reduced">Reduced</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label><input type="checkbox" checked={state.save.settings.highContrast} onChange={(event) => dispatch({ type: "set-high-contrast", value: event.target.checked })} /> High contrast</label>
            <button type="button" onClick={() => {
              const blob = new Blob([exportSave(saveFromState(state))], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
              link.href = url;
              link.download = `puzzle_incremental-save-${stamp}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}>Export Save</button>
            <label className="file-button">Import Save
              <input type="file" accept="application/json" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                file.text().then((text) => {
                  const imported = importSave(text);
                  dispatch(imported ? { type: "import", save: imported } : { type: "toast", message: "Invalid save file." });
                }).catch(() => dispatch({ type: "toast", message: "Import failed." }));
              }} />
            </label>
            <label>Erase Save
              <input value={eraseText} onChange={(event) => setEraseText(event.target.value)} placeholder="Type ERASE" />
            </label>
            <button type="button" disabled={eraseText !== "ERASE"} onClick={() => {
              eraseSave();
              const fresh = createInitialSave();
              dispatch({ type: "erase", save: fresh });
              setEraseText("");
            }}>Erase Save</button>
            <p>Version {GAME_CONFIG.gameConfigVersion}</p>
            <button type="button" onClick={() => dispatch({ type: "set-settings-open", value: false })}>Close</button>
          </div>
        </div>
      )}

      {state.statsOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>Stats</h2>
            <p>Total clears {state.save.statistics.totalClears}</p>
            <p>Manual {state.save.statistics.manualClears}, Assisted {state.save.statistics.assistedClears}, Automated {state.save.statistics.automatedClears}</p>
            <p>Lifetime solver nodes {formatNumber(state.save.statistics.lifetimeSolverNodes)}</p>
            <p>Maximum difficulty {state.save.statistics.maximumDifficultyScore}</p>
            <button type="button" onClick={() => dispatch({ type: "set-stats-open", value: false })}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}
