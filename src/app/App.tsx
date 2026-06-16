import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyPlacement, boardFromPlacements, boardPlacements, canPlace, createEmptyBoard, createPlacement, enumeratePlacements, isSolved, removePiece } from "../core/board";
import { generatePuzzle, dailySeed } from "../core/generator";
import { calculateReward } from "../core/rewards";
import { enumerateOrientations } from "../core/tetrominoes";
import type { BoardState, ClearClassification, PieceInstance, Placement, PlacementValidation, PuzzleDefinition, SaveDataV1, SolverSessionId, SolverStats, UpgradeId } from "../core/types";
import { GAME_CONFIG } from "../game/config";
import { automatedRewardMultiplier, canPurchaseUpgrade, getUpgradePrice, isAutoSolverReady, isTierUnlocked, manualClearsForTier, nodesPerSecond, parallelSessions, solverOptionsFromUpgrades, type PurchaseOutcome } from "../game/upgrades";
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

type SolverRun = Readonly<{
  sessionId: SolverSessionId;
  puzzle: PuzzleDefinition;
  status: SolverStats["status"];
  stats: SolverStats | null;
  preview: readonly Placement[];
}>;

type SolverRunSession = Readonly<{
  sessionId: SolverSessionId;
  puzzle: PuzzleDefinition;
}>;

type SolverUiState = Readonly<{
  status: SolverStats["status"];
  sessionId: SolverSessionId | null;
  stats: SolverStats | null;
  preview: readonly Placement[];
  runs: readonly SolverRun[];
  activeSessions: number;
  completedSessionIds: readonly SolverSessionId[];
  autoNext: boolean;
  autoTier: number;
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
  tutorialOpen: boolean;
  solver: SolverUiState;
}>;

type Action =
  | Readonly<{ type: "select-piece"; pieceId: string | null }>
  | Readonly<{ type: "place"; placement: Placement }>
  | Readonly<{ type: "remove-selected" }>
  | Readonly<{ type: "remove-piece"; pieceId: string }>
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
  | Readonly<{ type: "set-language"; value: SaveDataV1["settings"]["language"] }>
  | Readonly<{ type: "set-hide-purchased-upgrades"; value: boolean }>
  | Readonly<{ type: "set-tutorial-open"; value: boolean }>
  | Readonly<{ type: "complete-tutorial" }>
  | Readonly<{ type: "solver-started"; sessionId: SolverSessionId }>
  | Readonly<{ type: "solver-progress"; sessionId: SolverSessionId; stats: SolverStats; preview?: readonly Placement[] }>
  | Readonly<{ type: "solver-solved"; sessionId: SolverSessionId; stats: SolverStats; solution: readonly Placement[] }>
  | Readonly<{ type: "solver-unsat"; sessionId: SolverSessionId; stats: SolverStats }>
  | Readonly<{ type: "solver-error"; message: string }>
  | Readonly<{ type: "solver-paused" }>
  | Readonly<{ type: "solver-resumed" }>
  | Readonly<{ type: "solver-cancelled" }>
  | Readonly<{ type: "set-auto-next"; value: boolean }>
  | Readonly<{ type: "set-auto-tier"; tier: number }>
  | Readonly<{ type: "solver-runs-started"; sessions: readonly SolverRunSession[] }>
  | Readonly<{ type: "solver-run-progress"; sessionId: SolverSessionId; stats: SolverStats; preview?: readonly Placement[] }>
  | Readonly<{ type: "solver-run-solved"; sessionId: SolverSessionId; puzzle: PuzzleDefinition; stats: SolverStats; solution: readonly Placement[] }>
  | Readonly<{ type: "solver-run-unsat"; sessionId: SolverSessionId; stats: SolverStats }>
  | Readonly<{ type: "solver-run-cancelled"; sessionId: SolverSessionId; stats: SolverStats }>
  | Readonly<{ type: "import"; save: SaveDataV1 }>
  | Readonly<{ type: "erase"; save: SaveDataV1 }>
  | Readonly<{ type: "toast"; message: string | null }>;

const UPGRADE_NAMES_EN: Record<UpgradeId, string> = {
  "placement-scanner": "Placement Scanner",
  "contradiction-detector": "Contradiction Detector",
  "forced-move": "Forced Move",
  "auto-solver": "Auto Solver",
  "solver-throughput": "Solver Throughput",
  "solver-payout": "Solver Payout",
  "constraint-ordering": "Constraint Ordering",
  "candidate-ordering": "Candidate Ordering",
  "symmetry-pruning": "Symmetry Pruning",
  "dead-state-cache": "Dead State Cache",
  "parallel-solvers": "Parallel Solvers",
  "tier-1": "Tier 1",
  "tier-2": "Tier 2",
  "tier-3": "Tier 3",
  "tier-4": "Tier 4",
  "tier-5": "Tier 5",
};

const UPGRADE_NAMES_JA: Record<UpgradeId, string> = {
  "placement-scanner": "配置スキャナー",
  "contradiction-detector": "矛盾検出",
  "forced-move": "強制手",
  "auto-solver": "自動ソルバー",
  "solver-throughput": "ソルバー処理速度",
  "solver-payout": "ソルバー報酬",
  "constraint-ordering": "制約順序付け",
  "candidate-ordering": "候補順序付け",
  "symmetry-pruning": "対称性枝刈り",
  "dead-state-cache": "詰み状態キャッシュ",
  "parallel-solvers": "並列ソルバー",
  "tier-1": "Tier 1",
  "tier-2": "Tier 2",
  "tier-3": "Tier 3",
  "tier-4": "Tier 4",
  "tier-5": "Tier 5",
};

const COPY = {
  en: {
    compute: "Compute",
    nodesPerSecond: "nodes/s",
    settings: "Settings",
    stats: "Stats",
    tutorial: "Tutorial",
    pieces: "Pieces",
    ready: "Ready",
    placed: "Placed",
    rotation: "rot",
    newPuzzle: "New Puzzle",
    dailySeed: "Daily Seed",
    resetBoard: "Reset Board",
    undo: "Undo",
    redo: "Redo",
    rotateLeft: "Rotate Left",
    rotateRight: "Rotate Right",
    removePiece: "Remove Piece",
    hint: "Hint",
    check: "Check",
    forcedMove: "Forced Move",
    boardLabel: "Puzzle board",
    tierSelection: "Tier selection",
    tier: "Tier",
    seed: "seed",
    difficulty: "difficulty",
    solver: "Solver",
    status: "Status",
    nodes: "Nodes",
    backtracks: "Backtracks",
    theoryNodesPerSecond: "Theory nodes/s",
    depth: "Depth",
    autoTier: "Auto Tier",
    parallel: "Parallel",
    manualUnlock: "Manual unlock",
    solverPayout: "Solver payout",
    solverLanes: "Solver lanes",
    autoNext: "Auto next",
    lanesFull: "Solver lanes are full.",
    noSolverRuns: "No solver puzzles.",
    startSolver: "Start Solver",
    pause: "Pause",
    resume: "Resume",
    cancel: "Cancel",
    useCurrentTier: "Use current tier",
    upgrades: "Upgrades",
    level: "Level",
    next: "Next",
    buy: "Buy",
    hidePurchased: "Hide purchased",
    noVisibleUpgrades: "All purchased upgrades are hidden.",
    clear: "Clear",
    clearSummary: (classification: string, reward: number) => `${classification} clear, +${reward}C.`,
    nextPuzzle: "Next Puzzle",
    close: "Close",
    theme: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
    language: "Language",
    english: "English",
    japanese: "Japanese",
    visualization: "Visualization",
    on: "On",
    reduced: "Reduced",
    off: "Off",
    highContrast: "High contrast",
    exportSave: "Export Save",
    importSave: "Import Save",
    eraseSave: "Erase Save",
    erasePlaceholder: "Type ERASE",
    version: "Version",
    openTutorial: "Open Tutorial",
    totalClears: "Total clears",
    lifetimeSolverNodes: "Lifetime solver nodes",
    maximumDifficulty: "Maximum difficulty",
    clearCounts: (manual: number, assisted: number, automated: number) => `Manual ${manual}, Assisted ${assisted}, Automated ${automated}`,
    upgradeNames: UPGRADE_NAMES_EN,
    maximumLevel: "maximum level",
    notEnoughCompute: "not enough Compute",
    requiresUpgrade: (name: string) => `requires ${name}`,
    purchasedUpgrade: (name: string) => `Purchased ${name}`,
    lockedUpgrade: (name: string) => `${name} is locked.`,
    tutorialTitle: "Quick start",
    tutorialIntro: "Fill every usable cell exactly once with the available tetromino pieces.",
    tutorialSteps: [
      "Select a piece from the left panel, then click a board cell to place it.",
      "Rotate the selected piece with the buttons, A/D, or the left/right arrow keys.",
      "Placed pieces can be selected on the board, moved by placing them again, or removed.",
      "Clears award Compute. Manual clears pay more; hints and automation lower the classification.",
      "Spend Compute on upgrades to unlock higher tiers, hints, parallel solvers, and the Auto Solver.",
    ],
    startPlaying: "Start Playing",
    later: "Later",
    requiresPlacementScanner: "Requires Placement Scanner",
    requiresContradictionDetector: "Requires Contradiction Detector",
    requiresForcedMove: "Requires Forced Move",
    requiresAutoSolver: "Requires Auto Solver",
    autoSolverLocked: "Auto Solver is locked.",
    autoSolverManualLocked: (tier: number, count: number, required: number) => `Auto Solver requires ${required} manual clears on Tier ${tier} (${count}/${required}).`,
    discardCurrentPuzzle: "Discard current puzzle?",
    contradictionFound: "This position cannot be completed.",
    contradictionClear: "No contradiction found.",
    noLegalPlacement: "No legal placement covers that cell.",
    cannotPlace: (reason: string) => `Cannot place: ${reason}`,
    placementReasons: {
      outside: "outside",
      blocked: "blocked",
      overlap: "overlap",
      "unknown-piece": "unknown piece",
    },
    rotationBlocked: "Rotation blocked.",
    noForcedMove: "No forced move found.",
    autoSolverStarted: "Auto Solver started.",
    solverFailedUnsat: "Solver failed: unsat.",
    automatedPuzzleFailed: "Automated puzzle failed.",
    automatedPuzzleSolved: (tier: number, reward: number) => `Auto solved Tier ${tier}. +${reward}C`,
    saveFailed: "Save failed.",
    saveImported: "Save imported.",
    saveErased: "Save erased.",
    classificationLabels: {
      manual: "manual",
      assisted: "assisted",
      automated: "automated",
    },
    solverStatusLabels: {
      idle: "idle",
      running: "running",
      paused: "paused",
      solved: "solved",
      unsat: "unsat",
      cancelled: "cancelled",
      error: "error",
    },
    invalidSave: "Invalid save file.",
    importFailed: "Import failed.",
  },
  ja: {
    compute: "Compute",
    nodesPerSecond: "nodes/s",
    settings: "設定",
    stats: "統計",
    tutorial: "チュートリアル",
    pieces: "ピース",
    ready: "未配置",
    placed: "配置済み",
    rotation: "回転",
    newPuzzle: "新規パズル",
    dailySeed: "今日のシード",
    resetBoard: "盤面リセット",
    undo: "元に戻す",
    redo: "やり直す",
    rotateLeft: "左回転",
    rotateRight: "右回転",
    removePiece: "ピースを外す",
    hint: "ヒント",
    check: "検査",
    forcedMove: "強制手",
    boardLabel: "パズル盤面",
    tierSelection: "Tier 選択",
    tier: "Tier",
    seed: "シード",
    difficulty: "難易度",
    solver: "ソルバー",
    status: "状態",
    nodes: "ノード",
    backtracks: "バックトラック",
    theoryNodesPerSecond: "理論 nodes/s",
    depth: "深さ",
    autoTier: "自動 Tier",
    parallel: "並列",
    manualUnlock: "手動解放",
    solverPayout: "報酬倍率",
    solverLanes: "ソルバー盤面",
    autoNext: "自動次パズル",
    lanesFull: "ソルバー盤面が埋まっています。",
    noSolverRuns: "ソルバー用パズルなし",
    startSolver: "ソルバー開始",
    pause: "一時停止",
    resume: "再開",
    cancel: "キャンセル",
    useCurrentTier: "現在の Tier にする",
    upgrades: "アップグレード",
    level: "Lv",
    next: "次",
    buy: "購入",
    hidePurchased: "購入済み非表示",
    noVisibleUpgrades: "購入済みアップグレードを非表示にしています。",
    clear: "クリア",
    clearSummary: (classification: string, reward: number) => `${classification} クリア、+${reward}C。`,
    nextPuzzle: "次のパズル",
    close: "閉じる",
    theme: "テーマ",
    system: "システム",
    light: "ライト",
    dark: "ダーク",
    language: "言語",
    english: "英語",
    japanese: "日本語",
    visualization: "可視化",
    on: "オン",
    reduced: "軽量",
    off: "オフ",
    highContrast: "高コントラスト",
    exportSave: "セーブ出力",
    importSave: "セーブ読込",
    eraseSave: "セーブ削除",
    erasePlaceholder: "ERASE と入力",
    version: "バージョン",
    openTutorial: "チュートリアルを開く",
    totalClears: "総クリア数",
    lifetimeSolverNodes: "累計ソルバーノード",
    maximumDifficulty: "最大難易度",
    clearCounts: (manual: number, assisted: number, automated: number) => `手動 ${manual}、補助 ${assisted}、自動 ${automated}`,
    upgradeNames: UPGRADE_NAMES_JA,
    maximumLevel: "最大レベル",
    notEnoughCompute: "Compute不足",
    requiresUpgrade: (name: string) => `${name}が必要`,
    purchasedUpgrade: (name: string) => `${name}を購入しました`,
    lockedUpgrade: (name: string) => `${name}は未解放です。`,
    tutorialTitle: "はじめ方",
    tutorialIntro: "使えるセルを、用意されたテトロミノですべて一度ずつ埋めます。",
    tutorialSteps: [
      "左のパネルからピースを選び、盤面のセルをクリックして配置します。",
      "選択中のピースはボタン、A/D、左右矢印キーで回転できます。",
      "配置済みピースは盤面上で選択し、置き直したり外したりできます。",
      "クリアすると Compute を獲得します。手動クリアほど報酬が高く、ヒントや自動化を使うと分類が下がります。",
      "Compute を使って、高い Tier、ヒント、並列ソルバー、自動ソルバーを解放します。",
    ],
    startPlaying: "始める",
    later: "あとで",
    requiresPlacementScanner: "配置スキャナーが必要",
    requiresContradictionDetector: "矛盾検出が必要",
    requiresForcedMove: "強制手が必要",
    requiresAutoSolver: "自動ソルバーが必要",
    autoSolverLocked: "自動ソルバーは未解放です。",
    autoSolverManualLocked: (tier: number, count: number, required: number) => `自動ソルバーには Tier ${tier} の手動クリアが ${required} 回必要です（${count}/${required}）。`,
    discardCurrentPuzzle: "現在のパズルを破棄しますか?",
    contradictionFound: "この局面は完成できません。",
    contradictionClear: "矛盾は見つかりませんでした。",
    noLegalPlacement: "そのセルを覆える合法配置がありません。",
    cannotPlace: (reason: string) => `配置できません: ${reason}`,
    placementReasons: {
      outside: "盤外",
      blocked: "ブロック済みセル",
      overlap: "重なり",
      "unknown-piece": "不明なピース",
    },
    rotationBlocked: "回転できません。",
    noForcedMove: "強制手は見つかりませんでした。",
    autoSolverStarted: "自動ソルバーを開始しました。",
    solverFailedUnsat: "ソルバー失敗: 解なし。",
    automatedPuzzleFailed: "自動パズルに失敗しました。",
    automatedPuzzleSolved: (tier: number, reward: number) => `Tier ${tier} を自動解決。+${reward}C`,
    saveFailed: "セーブに失敗しました。",
    saveImported: "セーブを読み込みました。",
    saveErased: "セーブを削除しました。",
    classificationLabels: {
      manual: "手動",
      assisted: "補助",
      automated: "自動",
    },
    solverStatusLabels: {
      idle: "待機",
      running: "実行中",
      paused: "一時停止",
      solved: "解決済み",
      unsat: "解なし",
      cancelled: "キャンセル済み",
      error: "エラー",
    },
    invalidSave: "セーブファイルが不正です。",
    importFailed: "読み込みに失敗しました。",
  },
} as const;

type AppCopy = (typeof COPY)[keyof typeof COPY];

function copyForSave(save: SaveDataV1): AppCopy {
  return COPY[save.settings.language ?? "en"];
}

function upgradeName(copy: AppCopy, id: UpgradeId): string {
  return copy.upgradeNames[id];
}

function purchaseReason(copy: AppCopy, outcome: PurchaseOutcome): string {
  if (outcome.ok) {
    return "";
  }
  if (outcome.reason === "maximum-level") {
    return copy.maximumLevel;
  }
  if (outcome.reason === "not-enough-compute") {
    return copy.notEnoughCompute;
  }
  return copy.requiresUpgrade(upgradeName(copy, outcome.prerequisite ?? "auto-solver"));
}

function classificationLabel(copy: AppCopy, classification: ClearClassification): string {
  return copy.classificationLabels[classification];
}

function solverStatusLabel(copy: AppCopy, status: SolverStats["status"]): string {
  return copy.solverStatusLabels[status];
}

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

function createIdleSolverState(autoTier: number): SolverUiState {
  return {
    status: "idle",
    sessionId: null,
    stats: null,
    preview: [],
    runs: [],
    activeSessions: 0,
    completedSessionIds: [],
    autoNext: false,
    autoTier,
  };
}

function isActiveSolverStatus(status: SolverStats["status"]): boolean {
  return status === "running" || status === "paused";
}

function trimSolverRuns(runs: readonly SolverRun[]): readonly SolverRun[] {
  const active = runs.filter((run) => isActiveSolverStatus(run.status));
  const completed = runs.filter((run) => !isActiveSolverStatus(run.status)).slice(-2);
  return [...completed, ...active];
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
    tutorialOpen: !save.settings.tutorialCompleted,
    solver: createIdleSolverState(save.progression.selectedTier),
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
  const copy = copyForSave(state.save);
  if (state.puzzle.cleared || !isSolved(state.puzzle.definition, board)) {
    return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board } });
  }
  const classification = state.puzzle.classification;
  const reward = calculateReward(
    state.puzzle.definition,
    classification,
    classification === "automated" ? automatedRewardMultiplier(state.save.progression.upgradeLevels) : undefined,
  );
  const clearsByTier = {
    ...state.save.statistics.clearsByTier,
    [state.puzzle.definition.tier]: (state.save.statistics.clearsByTier[String(state.puzzle.definition.tier)] ?? 0) + 1,
  };
  const manualClearsByTier = classification === "manual"
    ? {
        ...state.save.statistics.manualClearsByTier,
        [state.puzzle.definition.tier]: (state.save.statistics.manualClearsByTier[String(state.puzzle.definition.tier)] ?? 0) + 1,
      }
    : state.save.statistics.manualClearsByTier;
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
      manualClearsByTier,
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
    toast: copy.clearSummary(classificationLabel(copy, classification), reward),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "select-piece":
      return { ...state, selectedPieceId: action.pieceId };
    case "place": {
      const copy = copyForSave(state.save);
      const validation = canPlace(state.puzzle.definition, state.puzzle.board, action.placement);
      if (!validation.ok) {
        return { ...state, toast: copy.cannotPlace(copy.placementReasons[validation.reason]) };
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
      if (!state.puzzle.board.placementsByPieceId[state.selectedPieceId]) {
        return state;
      }
      const board = removePiece(state.puzzle.board, state.selectedPieceId);
      return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board, cleared: false }, undoStack: [...state.undoStack, state.puzzle.board], redoStack: [] });
    }
    case "remove-piece": {
      if (!state.puzzle.board.placementsByPieceId[action.pieceId]) {
        return state;
      }
      const board = removePiece(state.puzzle.board, action.pieceId);
      return withSavedPuzzle(state, {
        puzzle: { ...state.puzzle, board, cleared: false },
        selectedPieceId: action.pieceId,
        undoStack: [...state.undoStack, state.puzzle.board],
        redoStack: [],
      });
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
          return { ...state, toast: copyForSave(state.save).rotationBlocked };
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
      const copy = copyForSave(state.save);
      const levels = state.save.progression.upgradeLevels;
      const outcome = canPurchaseUpgrade(levels, state.save.economy.compute, action.upgradeId);
      if (!outcome.ok) {
        return { ...state, toast: purchaseReason(copy, outcome) };
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
        toast: copy.purchasedUpgrade(upgradeName(copy, action.upgradeId)),
      };
    }
    case "scanner":
      if ((state.save.progression.upgradeLevels["placement-scanner"] ?? 0) <= 0) {
        const copy = copyForSave(state.save);
        return { ...state, toast: copy.lockedUpgrade(upgradeName(copy, "placement-scanner")) };
      }
      return withSavedPuzzle({ ...state, puzzle: classifyAssisted(state) }, { scannerEnabled: !state.scannerEnabled });
    case "forced-move": {
      if ((state.save.progression.upgradeLevels["forced-move"] ?? 0) <= 0) {
        const copy = copyForSave(state.save);
        return { ...state, toast: copy.lockedUpgrade(upgradeName(copy, "forced-move")) };
      }
      if (!action.placement) {
        return withSavedPuzzle({ ...state, puzzle: classifyAssisted(state) }, { toast: copyForSave(state.save).noForcedMove });
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
    case "set-language":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, language: action.value } } };
    case "set-hide-purchased-upgrades":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, hidePurchasedUpgrades: action.value } } };
    case "set-tutorial-open":
      return { ...state, tutorialOpen: action.value };
    case "complete-tutorial":
      return { ...state, tutorialOpen: false, save: { ...state.save, settings: { ...state.save.settings, tutorialCompleted: true } } };
    case "solver-started":
      return withSavedPuzzle({ ...state, puzzle: classifyAutomated(state) }, { solver: { ...state.solver, status: "running", sessionId: action.sessionId, stats: null, preview: [], activeSessions: 1 }, toast: copyForSave(state.save).autoSolverStarted });
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
        solver: { ...state.solver, status: "solved", sessionId: null, stats: action.stats, preview: [], activeSessions: 0, completedSessionIds: [...state.solver.completedSessionIds, action.sessionId] },
      });
      return awardClear(next, board, action.stats);
    }
    case "solver-unsat":
      return { ...state, solver: { ...state.solver, status: "unsat", sessionId: null, stats: action.stats, preview: [], activeSessions: 0 }, toast: copyForSave(state.save).solverFailedUnsat };
    case "solver-error":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: "error",
          sessionId: null,
          preview: [],
          activeSessions: 0,
          runs: trimSolverRuns(state.solver.runs.map((run) => isActiveSolverStatus(run.status) ? { ...run, status: "error" } : run)),
        },
        persistentWarning: action.message,
      };
    case "solver-paused":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: "paused",
          runs: state.solver.runs.map((run) => run.status === "running" ? { ...run, status: "paused" } : run),
        },
      };
    case "solver-resumed":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: "running",
          runs: state.solver.runs.map((run) => run.status === "paused" ? { ...run, status: "running" } : run),
        },
      };
    case "solver-cancelled":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: "cancelled",
          sessionId: null,
          preview: [],
          activeSessions: 0,
          runs: trimSolverRuns(state.solver.runs.map((run) => isActiveSolverStatus(run.status) ? { ...run, status: "cancelled" } : run)),
        },
      };
    case "set-auto-next":
      return { ...state, solver: { ...state.solver, autoNext: action.value } };
    case "set-auto-tier":
      return { ...state, solver: { ...state.solver, autoTier: action.tier } };
    case "solver-runs-started":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: "running",
          runs: trimSolverRuns([
            ...state.solver.runs,
            ...action.sessions.map((session): SolverRun => ({
              sessionId: session.sessionId,
              puzzle: session.puzzle,
              status: "running",
              stats: null,
              preview: [],
            })),
          ]),
          activeSessions: state.solver.activeSessions + action.sessions.length,
        },
      };
    case "solver-run-progress":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: action.stats.status === "paused" ? "paused" : state.solver.status,
          stats: action.stats,
          runs: state.solver.runs.map((run) => run.sessionId === action.sessionId
            ? { ...run, status: action.stats.status, stats: action.stats, preview: action.preview ?? run.preview }
            : run),
        },
      };
    case "solver-run-solved": {
      if (state.solver.completedSessionIds.includes(action.sessionId)) {
        return state;
      }
      const reward = calculateReward(action.puzzle, "automated", automatedRewardMultiplier(state.save.progression.upgradeLevels));
      const remainingActiveSessions = Math.max(0, state.solver.activeSessions - 1);
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
          status: remainingActiveSessions === 0 ? "solved" : state.solver.status,
          stats: action.stats,
          runs: trimSolverRuns(state.solver.runs.map((run) => run.sessionId === action.sessionId
            ? { ...run, status: "solved", stats: action.stats, preview: action.solution }
            : run)),
          activeSessions: remainingActiveSessions,
          completedSessionIds: [...state.solver.completedSessionIds, action.sessionId],
        },
        toast: copyForSave(state.save).automatedPuzzleSolved(action.puzzle.tier, reward),
      };
    }
    case "solver-run-unsat":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: state.solver.activeSessions <= 1 ? "unsat" : state.solver.status,
          stats: action.stats,
          runs: trimSolverRuns(state.solver.runs.map((run) => run.sessionId === action.sessionId ? { ...run, status: "unsat", stats: action.stats } : run)),
          activeSessions: Math.max(0, state.solver.activeSessions - 1),
        },
        toast: copyForSave(state.save).automatedPuzzleFailed,
      };
    case "solver-run-cancelled":
      return {
        ...state,
        solver: {
          ...state.solver,
          status: state.solver.activeSessions <= 1 ? "cancelled" : state.solver.status,
          stats: action.stats,
          runs: trimSolverRuns(state.solver.runs.map((run) => run.sessionId === action.sessionId ? { ...run, status: "cancelled", stats: action.stats } : run)),
          activeSessions: Math.max(0, state.solver.activeSessions - 1),
        },
      };
    case "import":
      return { ...createInitialState(), save: action.save, puzzle: puzzleFromSave(action.save), tutorialOpen: !action.save.settings.tutorialCompleted, toast: copyForSave(action.save).saveImported };
    case "erase":
      return { ...createInitialState(), save: action.save, puzzle: puzzleFromSave(action.save), tutorialOpen: !action.save.settings.tutorialCompleted, toast: copyForSave(action.save).saveErased };
    case "toast":
      return { ...state, toast: action.message };
    default:
      return state;
  }
}

function formatNumber(value: number, language: SaveDataV1["settings"]["language"]): string {
  return new Intl.NumberFormat(language === "ja" ? "ja-JP" : "en-US").format(value);
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

function choosePlacementPreviewForCell(
  puzzle: PuzzleDefinition,
  board: BoardState,
  piece: PuzzleDefinition["pieces"][number],
  orientationIndex: number,
  targetCellIndex: number,
): Readonly<{ placement: Placement; validation: PlacementValidation }> | null {
  const candidates = enumeratePlacements(puzzle, piece)
    .filter((placement) => placement.orientationIndex === orientationIndex)
    .filter((placement) => placement.cellIndices.includes(targetCellIndex));
  if (candidates.length === 0) {
    return null;
  }
  const legal = candidates.filter((placement) => canPlace(puzzle, board, placement).ok);
  const pool = legal.length > 0 ? legal : candidates;
  const exactAnchor = pool.find((placement) => placement.anchor.y * puzzle.width + placement.anchor.x === targetCellIndex);
  const placement = exactAnchor ?? pool[0];
  return { placement, validation: canPlace(puzzle, board, placement) };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pieceColorCss(piece: PieceInstance, seed: string): string {
  const hash = hashString(`${seed}:${piece.id}:${piece.type}`);
  const mixColors = ["white", "black", "var(--accent)", "var(--accent-2)"];
  const mixColor = mixColors[hash % mixColors.length];
  const mixWeight = 10 + ((hash >>> 3) % 14);
  return `color-mix(in srgb, var(--piece-${piece.type}) ${100 - mixWeight}%, ${mixColor} ${mixWeight}%)`;
}

function pieceColorVariables(piece: PieceInstance, seed: string, prefix: "piece" | "preview-piece" = "piece"): React.CSSProperties {
  return {
    [`--${prefix}-color`]: pieceColorCss(piece, seed),
    [`--${prefix}-border`]: `color-mix(in srgb, var(--piece-${piece.type}) 72%, black 28%)`,
  } as React.CSSProperties;
}

function mergeCellStyle(placed: Placement | undefined, previewPiece: PieceInstance | null, seed: string): React.CSSProperties | undefined {
  const style = {
    ...(placed ? pieceColorVariables({ id: placed.pieceId, type: placed.pieceType }, seed) : {}),
    ...(previewPiece ? pieceColorVariables(previewPiece, seed, "preview-piece") : {}),
  };
  return Object.keys(style).length > 0 ? style as React.CSSProperties : undefined;
}

function MiniSolverBoard({ run, language, copy }: Readonly<{ run: SolverRun; language: SaveDataV1["settings"]["language"]; copy: AppCopy }>) {
  const placedByCell = new Map<number, Placement>();
  for (const placement of run.preview) {
    for (const index of placement.cellIndices) {
      placedByCell.set(index, placement);
    }
  }
  return (
    <article className={`solver-run ${isActiveSolverStatus(run.status) ? "active" : ""}`} data-testid="solver-run">
      <div className="solver-run-header">
        <strong>{copy.tier} {run.puzzle.tier}</strong>
        <span>{solverStatusLabel(copy, run.status)}</span>
      </div>
      <div className="solver-run-meta">
        <span>{formatNumber(run.stats?.nodes ?? 0, language)} {copy.nodes}</span>
        <span>{run.puzzle.seed}</span>
      </div>
      <div
        className="mini-board"
        style={{ gridTemplateColumns: `repeat(${run.puzzle.width}, minmax(8px, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: run.puzzle.width * run.puzzle.height }, (_, index) => {
          const placed = placedByCell.get(index);
          const blocked = run.puzzle.blockedCellIndices.includes(index);
          return (
            <span
              key={index}
              className={`mini-cell ${blocked ? "blocked" : ""} ${placed ? "placed" : ""}`}
              style={mergeCellStyle(placed, null, run.puzzle.seed)}
            />
          );
        })}
      </div>
    </article>
  );
}

function orientationForPiece(piece: PieceInstance, orientationIndex: number) {
  const orientations = enumerateOrientations(piece.type);
  return orientations[orientationIndex % orientations.length] ?? orientations[0];
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const workerRef = useRef<SolverWorkerClient | null>(null);
  const solverSessionsRef = useRef<Map<SolverSessionId, PuzzleDefinition>>(new Map());
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [eraseText, setEraseText] = useState("");

  useEffect(() => {
    try {
      saveGame(saveFromState(state));
    } catch (error) {
      dispatch({ type: "solver-error", message: error instanceof Error ? error.message : copyForSave(state.save).saveFailed });
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
    if (!selectedPiece || hoverCell === null || state.puzzle.cleared) {
      return null;
    }
    return choosePlacementPreviewForCell(puzzle, state.puzzle.board, selectedPiece, state.rotations[selectedPiece.id] ?? 0, hoverCell);
  }, [hoverCell, puzzle, selectedPiece, state.puzzle.board, state.puzzle.cleared, state.rotations]);
  const language = state.save.settings.language ?? "en";
  const copy = COPY[language];
  const visibleUpgrades = GAME_CONFIG.upgrades.filter((upgrade) => {
    const level = state.save.progression.upgradeLevels[upgrade.id] ?? 0;
    return !state.save.settings.hidePurchasedUpgrades || level < upgrade.maxLevel;
  });
  const manualClearsAutoTier = manualClearsForTier(state.save.statistics, state.solver.autoTier);
  const autoSolverRequiredManualClears = GAME_CONFIG.solver.manualClearsRequiredByTierForAutoSolver;
  const autoSolverReady = isAutoSolverReady(state.save.progression.upgradeLevels, state.save.statistics, state.solver.autoTier);
  const autoSolverLockMessage = (state.save.progression.upgradeLevels["auto-solver"] ?? 0) <= 0
    ? copy.autoSolverLocked
    : copy.autoSolverManualLocked(state.solver.autoTier, manualClearsAutoTier, autoSolverRequiredManualClears);
  const solverLaneCapacity = Math.max(0, parallelSessions(state.save.progression.upgradeLevels) - state.solver.activeSessions);
  const solverPayoutMultiplier = automatedRewardMultiplier(state.save.progression.upgradeLevels);

  const handleWorkerMessage = useCallback((message: WorkerResponse) => {
    if (message.type === "STARTED") {
      if (!solverSessionsRef.current.has(message.sessionId)) {
        dispatch({ type: "solver-started", sessionId: message.sessionId });
      }
    } else if (message.type === "PROGRESS") {
      if (solverSessionsRef.current.has(message.sessionId)) {
        if (message.stats.status === "cancelled") {
          solverSessionsRef.current.delete(message.sessionId);
          dispatch({ type: "solver-run-cancelled", sessionId: message.sessionId, stats: message.stats });
        } else {
          dispatch({ type: "solver-run-progress", sessionId: message.sessionId, stats: message.stats, preview: message.placements });
        }
      } else {
        dispatch({ type: "solver-progress", sessionId: message.sessionId, stats: message.stats, preview: message.placements });
      }
    } else if (message.type === "SOLVED") {
      const automatedPuzzle = solverSessionsRef.current.get(message.sessionId);
      if (automatedPuzzle) {
        solverSessionsRef.current.delete(message.sessionId);
        dispatch({ type: "solver-run-solved", sessionId: message.sessionId, puzzle: automatedPuzzle, stats: message.stats, solution: message.solution });
      } else {
        dispatch({ type: "solver-solved", sessionId: message.sessionId, stats: message.stats, solution: message.solution });
      }
    } else if (message.type === "UNSAT") {
      if (solverSessionsRef.current.has(message.sessionId)) {
        solverSessionsRef.current.delete(message.sessionId);
        dispatch({ type: "solver-run-unsat", sessionId: message.sessionId, stats: message.stats });
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

  const startSolverRuns = useCallback((puzzles: readonly PuzzleDefinition[]) => {
    if (puzzles.length === 0) {
      return;
    }
    const worker = ensureWorker();
    const stamp = Date.now();
    const sessions = puzzles.map((automatedPuzzle, index): SolverRunSession => {
      const sessionId = `auto-${automatedPuzzle.tier}-${automatedPuzzle.seed}-${stamp}-${index}`;
      solverSessionsRef.current.set(sessionId, automatedPuzzle);
      worker.post({ type: "START", sessionId, puzzle: automatedPuzzle, options: solverOptionsFromUpgrades(state.save.progression.upgradeLevels, state.save.settings.visualization) });
      return { sessionId, puzzle: automatedPuzzle };
    });
    dispatch({ type: "solver-runs-started", sessions });
  }, [ensureWorker, state.save.progression.upgradeLevels, state.save.settings.visualization]);

  useEffect(() => {
    if (!state.solver.autoNext || !autoSolverReady || solverLaneCapacity <= 0) {
      return;
    }
    const stamp = Date.now();
    const puzzles = Array.from({ length: solverLaneCapacity }, (_, index) => generatePuzzle({
      tier: state.solver.autoTier,
      seed: `auto-next-${state.solver.autoTier}-${stamp}-${index}`,
    }));
    startSolverRuns(puzzles);
  }, [autoSolverReady, solverLaneCapacity, startSolverRuns, state.solver.autoNext, state.solver.autoTier]);

  useEffect(() => {
    if (state.solver.autoNext || state.solver.activeSessions > 0 || state.solver.autoTier === state.save.progression.selectedTier) {
      return;
    }
    dispatch({ type: "set-auto-tier", tier: state.save.progression.selectedTier });
  }, [state.save.progression.selectedTier, state.solver.activeSessions, state.solver.autoNext, state.solver.autoTier]);

  const startSolver = () => {
    if (!autoSolverReady) {
      dispatch({ type: "toast", message: autoSolverLockMessage });
      return;
    }
    if (solverLaneCapacity <= 0) {
      dispatch({ type: "toast", message: copy.lanesFull });
      return;
    }
    const stamp = Date.now();
    startSolverRuns([generatePuzzle({ tier: state.solver.autoTier, seed: `auto-${state.solver.autoTier}-${stamp}` })]);
  };

  const pauseOrResumeSolver = () => {
    if (state.solver.activeSessions === 0 || !workerRef.current) {
      return;
    }
    if (state.solver.status === "paused") {
      for (const run of state.solver.runs.filter((entry) => entry.status === "paused")) {
        workerRef.current.post({ type: "RESUME", sessionId: run.sessionId });
      }
      dispatch({ type: "solver-resumed" });
    } else {
      for (const run of state.solver.runs.filter((entry) => entry.status === "running")) {
        workerRef.current.post({ type: "PAUSE", sessionId: run.sessionId });
      }
      dispatch({ type: "solver-paused" });
    }
  };

  const cancelSolver = () => {
    if (state.solver.activeSessions > 0 && workerRef.current) {
      dispatch({ type: "set-auto-next", value: false });
      for (const run of state.solver.runs.filter((entry) => isActiveSolverStatus(entry.status))) {
        workerRef.current.post({ type: "CANCEL", sessionId: run.sessionId });
      }
    }
  };

  const startNewPuzzle = (daily: boolean) => {
    if (boardPlacements(state.puzzle.board).length > 0 && !state.puzzle.cleared && !window.confirm(copy.discardCurrentPuzzle)) {
      return;
    }
    const seed = daily ? dailySeed(state.save.progression.selectedTier) : `seed-${state.save.progression.selectedTier}-${Date.now()}`;
    dispatch({ type: "new-puzzle", puzzle: generatePuzzle({ tier: state.save.progression.selectedTier, seed }) });
  };

  const switchTier = (tier: number, timestamp: number) => {
    if (!isTierUnlocked(state.save.progression.upgradeLevels, tier)) {
      return;
    }
    if (state.save.progression.selectedTier === tier && puzzle.tier === tier) {
      return;
    }
    if (boardPlacements(state.puzzle.board).length > 0 && !state.puzzle.cleared && !window.confirm(copy.discardCurrentPuzzle)) {
      return;
    }
    dispatch({ type: "set-tier", tier });
    dispatch({ type: "new-puzzle", puzzle: generatePuzzle({ tier, seed: `tier-${tier}-${timestamp}` }) });
  };

  const useContradictionDetector = () => {
    if ((state.save.progression.upgradeLevels["contradiction-detector"] ?? 0) <= 0) {
      dispatch({ type: "toast", message: copy.lockedUpgrade(upgradeName(copy, "contradiction-detector")) });
      return;
    }
    const result = solveToEnd(puzzle, solverOptionsFromUpgrades(state.save.progression.upgradeLevels, "off"), state.puzzle.board, 100_000);
    dispatch({ type: "contradiction", message: result.status === "unsat" ? copy.contradictionFound : copy.contradictionClear });
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
    const preview = choosePlacementPreviewForCell(puzzle, state.puzzle.board, selectedPiece, state.rotations[selectedPiece.id] ?? 0, index);
    if (!preview) {
      dispatch({ type: "toast", message: copy.noLegalPlacement });
      return;
    }
    dispatch({ type: "place", placement: preview.placement });
  };

  const handleCellContextMenu = (event: React.MouseEvent, index: number) => {
    event.preventDefault();
    const placed = placedByCell.get(index);
    if (placed && !state.puzzle.cleared) {
      dispatch({ type: "remove-piece", pieceId: placed.pieceId });
    }
  };

  const handleBoardWheel = (event: React.WheelEvent) => {
    if (!selectedPiece || state.puzzle.cleared || event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    dispatch({ type: "rotate", direction: event.deltaY > 0 ? 1 : -1 });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D" || event.key === "r" || event.key === "E") {
        event.preventDefault();
        dispatch({ type: "rotate", direction: 1 });
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A" || event.key === "Q" || (event.key === "R" && event.shiftKey)) {
        event.preventDefault();
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
  const previewCells = new Set(selectedPlacementPreview?.placement.cellIndices ?? []);
  const invalidPreview = Boolean(selectedPlacementPreview && !selectedPlacementPreview.validation.ok);
  const showSolverPreview = state.solver.status === "running" || state.solver.status === "paused";
  const solverPreviewCells = new Set(showSolverPreview ? state.solver.preview.flatMap((placement) => placement.cellIndices) : []);

  const theme = state.save.settings.theme ?? "system";
  const appClassName = ["app", state.save.settings.highContrast ? "high-contrast" : "", theme === "dark" ? "dark" : "", theme === "light" ? "light" : ""].filter(Boolean).join(" ");

  return (
    <main className={appClassName}>
      <header className="topbar">
        <h1>puzzle_incremental</h1>
        <div className="metric"><span>{copy.compute}</span><strong data-testid="compute">{formatNumber(state.save.economy.compute, language)} C</strong></div>
        <div className="metric"><span>{copy.nodesPerSecond}</span><strong>{formatNumber(state.solver.stats?.measuredNodesPerSecond ?? 0, language)}</strong></div>
        <button type="button" onClick={() => dispatch({ type: "set-tutorial-open", value: true })}>{copy.tutorial}</button>
        <button type="button" onClick={() => dispatch({ type: "set-settings-open", value: true })}>{copy.settings}</button>
        <button type="button" onClick={() => dispatch({ type: "set-stats-open", value: true })}>{copy.stats}</button>
      </header>
      {state.persistentWarning && <div className="warning" role="alert">{state.persistentWarning}</div>}
      {state.toast && <div className="toast" role="status" aria-live="polite" onClick={() => dispatch({ type: "toast", message: null })}>{state.toast}</div>}

      <section className="layout">
        <aside className="panel">
          <h2>{copy.pieces}</h2>
          <div className="piece-tray">
            {puzzle.pieces.map((piece) => {
              const placedPlacement = state.puzzle.board.placementsByPieceId[piece.id];
              const placed = Boolean(placedPlacement);
              const orientationIndex = placedPlacement?.orientationIndex ?? state.rotations[piece.id] ?? 0;
              const orientation = orientationForPiece(piece, orientationIndex);
              const occupiedMiniCells = new Set(orientation.cells.map((cell) => `${cell.x}:${cell.y}`));
              return (
                <button
                  key={piece.id}
                  type="button"
                  data-testid={`piece-${piece.id}`}
                  className={`piece-card ${state.selectedPieceId === piece.id ? "selected" : ""} ${placed ? "placed-card" : ""}`}
                  style={pieceColorVariables(piece, puzzle.seed)}
                  disabled={state.puzzle.cleared}
                  onClick={() => dispatch({ type: "select-piece", pieceId: piece.id })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (placed) {
                      dispatch({ type: "remove-piece", pieceId: piece.id });
                    } else {
                      dispatch({ type: "rotate", direction: 1 });
                    }
                  }}
                >
                  <span className="piece-mini" data-testid={`piece-shape-${piece.id}`} aria-hidden="true">
                    {Array.from({ length: 16 }, (_, miniIndex) => {
                      const x = miniIndex % 4;
                      const y = Math.floor(miniIndex / 4);
                      return <span key={miniIndex} className={`piece-mini-cell ${occupiedMiniCells.has(`${x}:${y}`) ? "filled" : ""}`} />;
                    })}
                  </span>
                  <span className="piece-info">
                    <strong>{piece.type} #{piece.id.slice(1)}</strong>
                    <span>{copy.rotation} {orientationIndex}</span>
                  </span>
                  <span className="piece-status">{placed ? copy.placed : copy.ready}</span>
                </button>
              );
            })}
          </div>
          <div className="controls">
            <button type="button" onClick={() => startNewPuzzle(false)}>{copy.newPuzzle}</button>
            <button type="button" onClick={() => startNewPuzzle(true)}>{copy.dailySeed}</button>
            <button type="button" onClick={() => dispatch({ type: "reset-board" })}>{copy.resetBoard}</button>
            <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={state.undoStack.length === 0}>{copy.undo}</button>
            <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={state.redoStack.length === 0}>{copy.redo}</button>
            <button type="button" onClick={() => dispatch({ type: "rotate", direction: -1 })}>{copy.rotateLeft}</button>
            <button type="button" onClick={() => dispatch({ type: "rotate", direction: 1 })}>{copy.rotateRight}</button>
            <button type="button" onClick={() => dispatch({ type: "remove-selected" })}>{copy.removePiece}</button>
            <button type="button" onClick={() => dispatch({ type: "scanner" })} disabled={(state.save.progression.upgradeLevels["placement-scanner"] ?? 0) <= 0} title={copy.requiresUpgrade(upgradeName(copy, "placement-scanner"))}>{copy.hint}</button>
            <button type="button" onClick={useContradictionDetector} disabled={(state.save.progression.upgradeLevels["contradiction-detector"] ?? 0) <= 0} title={copy.requiresUpgrade(upgradeName(copy, "contradiction-detector"))}>{copy.check}</button>
            <button type="button" onClick={() => dispatch({ type: "forced-move", placement: findForcedMove(puzzle, state.puzzle.board) })} disabled={(state.save.progression.upgradeLevels["forced-move"] ?? 0) <= 0} title={copy.requiresUpgrade(upgradeName(copy, "forced-move"))}>{copy.forcedMove}</button>
          </div>
        </aside>

        <section className="board-panel">
          <div className="board-top">
            <div className="board-header">
              <span>{copy.tier} {puzzle.tier}</span>
              <button type="button" onClick={() => navigator.clipboard?.writeText(puzzle.seed)}>{copy.seed}: {puzzle.seed}</button>
              <span>{copy.difficulty} {puzzle.difficulty.score}</span>
              <span>{classificationLabel(copy, state.puzzle.classification)}</span>
            </div>
            <div className="tier-switcher" aria-label={copy.tierSelection}>
              {GAME_CONFIG.tiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  disabled={!isTierUnlocked(state.save.progression.upgradeLevels, tier.id)}
                  className={state.save.progression.selectedTier === tier.id ? "selected" : ""}
                  onClick={() => switchTier(tier.id, Date.now())}
                >
                  {copy.tier} {tier.id}
                </button>
              ))}
            </div>
          </div>
          <div
            className="board"
            style={{ gridTemplateColumns: `repeat(${puzzle.width}, minmax(28px, 1fr))` }}
            role="grid"
            aria-label={copy.boardLabel}
            onMouseLeave={() => setHoverCell(null)}
            onWheel={handleBoardWheel}
          >
            {Array.from({ length: puzzle.width * puzzle.height }, (_, index) => {
              const placed = placedByCell.get(index);
              const blocked = puzzle.blockedCellIndices.includes(index);
              const preview = previewCells.has(index);
              const scanner = scannerCells.has(index);
              const solverPreview = solverPreviewCells.has(index);
              const selectedPlacement = placed?.pieceId === state.selectedPieceId;
              return (
                <button
                  key={index}
                  type="button"
                  data-testid={`cell-${index}`}
                  role="gridcell"
                  className={`cell ${blocked ? "blocked" : ""} ${placed ? "placed" : ""} ${selectedPlacement ? "selected-placement" : ""} ${preview && !invalidPreview ? "preview" : ""} ${preview && invalidPreview ? "invalid-preview" : ""} ${scanner ? "scanner" : ""} ${solverPreview ? "solver-preview" : ""}`}
                  style={mergeCellStyle(placed, preview && selectedPiece ? selectedPiece : null, puzzle.seed)}
                  disabled={blocked || state.puzzle.cleared}
                  onMouseEnter={() => setHoverCell(index)}
                  onFocus={() => setHoverCell(index)}
                  onClick={() => handleCellClick(index)}
                  onContextMenu={(event) => handleCellContextMenu(event, index)}
                >
                  {placed?.pieceType ?? ""}
                </button>
              );
            })}
          </div>
          <section className="solver-lane" aria-label={copy.solverLanes}>
            <div className="solver-lane-header">
              <h2>{copy.solverLanes}</h2>
              <span>{state.solver.activeSessions}/{parallelSessions(state.save.progression.upgradeLevels)}</span>
            </div>
            <div className="solver-run-list">
              {state.solver.runs.length === 0 && <p className="empty-state">{copy.noSolverRuns}</p>}
              {state.solver.runs.map((run) => <MiniSolverBoard key={run.sessionId} run={run} language={language} copy={copy} />)}
            </div>
          </section>
        </section>

        <aside className="panel side-panel">
          <section className="solver-section">
            <h2>{copy.solver}</h2>
            <div className="solver-grid">
              <span>{copy.status}</span><strong data-testid="solver-status">{solverStatusLabel(copy, state.solver.status)}</strong>
              <span>{copy.nodes}</span><strong>{formatNumber(state.solver.stats?.nodes ?? 0, language)}</strong>
              <span>{copy.backtracks}</span><strong>{formatNumber(state.solver.stats?.backtracks ?? 0, language)}</strong>
              <span>{copy.theoryNodesPerSecond}</span><strong>{formatNumber(nodesPerSecond(state.save.progression.upgradeLevels), language)}</strong>
              <span>{copy.depth}</span><strong>{state.solver.stats?.currentDepth ?? 0}</strong>
              <span>{copy.autoTier}</span><strong>{copy.tier} {state.solver.autoTier}</strong>
              <span>{copy.parallel}</span><strong>{parallelSessions(state.save.progression.upgradeLevels)}</strong>
              <span>{copy.manualUnlock}</span><strong>{Math.min(manualClearsAutoTier, autoSolverRequiredManualClears)}/{autoSolverRequiredManualClears}</strong>
              <span>{copy.solverPayout}</span><strong>{solverPayoutMultiplier.toFixed(2)}x</strong>
            </div>
            <div className="controls solver-controls">
              <button type="button" onClick={startSolver} disabled={!autoSolverReady || solverLaneCapacity <= 0} title={autoSolverReady ? undefined : autoSolverLockMessage}>{copy.startSolver}</button>
              <button type="button" onClick={pauseOrResumeSolver} disabled={state.solver.activeSessions === 0}>{state.solver.status === "paused" ? copy.resume : copy.pause}</button>
              <button type="button" onClick={cancelSolver} disabled={state.solver.activeSessions === 0}>{copy.cancel}</button>
              <button type="button" onClick={() => dispatch({ type: "set-auto-tier", tier: state.save.progression.selectedTier })} disabled={state.solver.autoTier === state.save.progression.selectedTier}>{copy.useCurrentTier}</button>
              <button
                type="button"
                className={state.solver.autoNext ? "selected" : ""}
                onClick={() => dispatch({ type: "set-auto-next", value: !state.solver.autoNext })}
                disabled={!autoSolverReady}
                title={autoSolverReady ? undefined : autoSolverLockMessage}
              >
                {copy.autoNext}: {state.solver.autoNext ? copy.on : copy.off}
              </button>
            </div>
          </section>

          <section className="upgrade-section">
            <div className="panel-heading-row">
              <h2>{copy.upgrades}</h2>
              <span>{formatNumber(state.save.economy.compute, language)} C</span>
            </div>
            <button
              type="button"
              className={`toggle-button ${state.save.settings.hidePurchasedUpgrades ? "selected" : ""}`}
              onClick={() => dispatch({ type: "set-hide-purchased-upgrades", value: !state.save.settings.hidePurchasedUpgrades })}
            >
              {copy.hidePurchased}: {state.save.settings.hidePurchasedUpgrades ? copy.on : copy.off}
            </button>
            <div className="upgrade-list">
              {visibleUpgrades.length === 0 && <p className="empty-state">{copy.noVisibleUpgrades}</p>}
              {visibleUpgrades.map((upgrade) => {
                const level = state.save.progression.upgradeLevels[upgrade.id] ?? 0;
                const outcome = canPurchaseUpgrade(state.save.progression.upgradeLevels, state.save.economy.compute, upgrade.id);
                const price = getUpgradePrice(upgrade.id, level);
                return (
                  <article className={`upgrade ${level >= upgrade.maxLevel ? "owned" : ""}`} key={upgrade.id}>
                    <div className="upgrade-header">
                      <strong>{upgradeName(copy, upgrade.id)}</strong>
                      <span>{copy.level} {level}/{upgrade.maxLevel}</span>
                    </div>
                    <p>{outcome.ok ? `${copy.next}: ${outcome.price}C` : `${price}C, ${purchaseReason(copy, outcome)}`}</p>
                    <button type="button" onClick={() => dispatch({ type: "purchase", upgradeId: upgrade.id })} disabled={!outcome.ok}>{copy.buy}</button>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </section>

      {state.clearResult && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>{copy.clear}</h2>
            <p>{copy.clearSummary(classificationLabel(copy, state.clearResult.classification), state.clearResult.reward)}</p>
            <p>{copy.difficulty} {puzzle.difficulty.score}</p>
            <button type="button" onClick={() => startNewPuzzle(false)}>{copy.nextPuzzle}</button>
            <button type="button" onClick={() => dispatch({ type: "toast", message: null })}>{copy.close}</button>
          </div>
        </div>
      )}

      {state.settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>{copy.settings}</h2>
            <label>{copy.theme}
              <select value={theme} onChange={(event) => dispatch({ type: "set-theme", value: event.target.value as SaveDataV1["settings"]["theme"] })}>
                <option value="system">{copy.system}</option>
                <option value="light">{copy.light}</option>
                <option value="dark">{copy.dark}</option>
              </select>
            </label>
            <label>{copy.language}
              <select value={language} onChange={(event) => dispatch({ type: "set-language", value: event.target.value as SaveDataV1["settings"]["language"] })}>
                <option value="en">{copy.english}</option>
                <option value="ja">{copy.japanese}</option>
              </select>
            </label>
            <label>{copy.visualization}
              <select value={state.save.settings.visualization} onChange={(event) => dispatch({ type: "set-visualization", value: event.target.value as SaveDataV1["settings"]["visualization"] })}>
                <option value="on">{copy.on}</option>
                <option value="reduced">{copy.reduced}</option>
                <option value="off">{copy.off}</option>
              </select>
            </label>
            <label><input type="checkbox" checked={state.save.settings.highContrast} onChange={(event) => dispatch({ type: "set-high-contrast", value: event.target.checked })} /> {copy.highContrast}</label>
            <button type="button" onClick={() => {
              const blob = new Blob([exportSave(saveFromState(state))], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
              link.href = url;
              link.download = `puzzle_incremental-save-${stamp}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}>{copy.exportSave}</button>
            <label className="file-button">{copy.importSave}
              <input type="file" accept="application/json" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                file.text().then((text) => {
                  const imported = importSave(text);
                  dispatch(imported ? { type: "import", save: imported } : { type: "toast", message: copy.invalidSave });
                }).catch(() => dispatch({ type: "toast", message: copy.importFailed }));
              }} />
            </label>
            <label>{copy.eraseSave}
              <input value={eraseText} onChange={(event) => setEraseText(event.target.value)} placeholder={copy.erasePlaceholder} />
            </label>
            <button type="button" disabled={eraseText !== "ERASE"} onClick={() => {
              eraseSave();
              const fresh = createInitialSave();
              dispatch({ type: "erase", save: fresh });
              setEraseText("");
            }}>{copy.eraseSave}</button>
            <button type="button" onClick={() => dispatch({ type: "set-tutorial-open", value: true })}>{copy.openTutorial}</button>
            <p>{copy.version} {GAME_CONFIG.gameConfigVersion}</p>
            <button type="button" onClick={() => dispatch({ type: "set-settings-open", value: false })}>{copy.close}</button>
          </div>
        </div>
      )}

      {state.statsOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>{copy.stats}</h2>
            <p>{copy.totalClears} {state.save.statistics.totalClears}</p>
            <p>{copy.clearCounts(state.save.statistics.manualClears, state.save.statistics.assistedClears, state.save.statistics.automatedClears)}</p>
            <p>{copy.lifetimeSolverNodes} {formatNumber(state.save.statistics.lifetimeSolverNodes, language)}</p>
            <p>{copy.maximumDifficulty} {state.save.statistics.maximumDifficultyScore}</p>
            <button type="button" onClick={() => dispatch({ type: "set-stats-open", value: false })}>{copy.close}</button>
          </div>
        </div>
      )}
      {state.tutorialOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
          <div className="modal-body tutorial-body">
            <h2 id="tutorial-title">{copy.tutorialTitle}</h2>
            <p>{copy.tutorialIntro}</p>
            <ol className="tutorial-list">
              {copy.tutorialSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <div className="modal-actions">
              <button type="button" onClick={() => dispatch({ type: "complete-tutorial" })}>{copy.startPlaying}</button>
              <button type="button" onClick={() => dispatch({ type: "set-tutorial-open", value: false })}>{copy.later}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
