import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyPlacement, boardFromPlacements, boardPlacements, canPlace, createEmptyBoard, createPlacement, enumeratePlacements, isSolved, removePiece } from "../core/board";
import { indexToCell } from "../core/coordinates";
import { generatePuzzle, dailySeed } from "../core/generator";
import { calculateReward } from "../core/rewards";
import { enumerateOrientations, TETROMINO_TYPES } from "../core/tetrominoes";
import type { BoardState, ClearClassification, PieceInstance, Placement, PlacementValidation, PrestigeUpgradeId, PuzzleDefinition, SaveDataV1, SolverSessionId, SolverStats, UpgradeId } from "../core/types";
import { GAME_CONFIG } from "../game/config";
import {
  SOLVER_LANE_MIN_SESSION_MS_MAX,
  SOLVER_LANE_MIN_SESSION_MS_MIN,
  SOLVER_LANE_MIN_SESSION_MS_STEP,
  SOLVER_LANE_PREVIEW_UPDATE_MS_MAX,
  SOLVER_LANE_PREVIEW_UPDATE_MS_MIN,
  SOLVER_LANE_PREVIEW_UPDATE_MS_STEP,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  normalizeSolverLaneMinSessionMs,
  normalizeSolverLanePreviewUpdateMs,
  normalizeUiScale,
} from "../game/settings";
import { canPurchasePrestigeUpgrade, getPrestigeUpgradePrice, prestigeRewardMultiplier, PRESTIGE_UPGRADES, type PrestigePurchaseOutcome } from "../game/prestige";
import { automatedRewardMultiplier, canPurchaseUpgrade, getUpgradePrice, initialUpgradeState, isAutoSolverReady, isTierUnlocked, manualClearsForTier, nodesPerSecond, parallelSessions, solverOptionsFromUpgrades, type PurchaseOutcome } from "../game/upgrades";
import { createInitialRunState, createInitialSave } from "../persistence/schema";
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
  laneIndex: number;
  status: SolverStats["status"];
  stats: SolverStats | null;
  preview: readonly Placement[];
}>;

type ComputeRateSample = Readonly<{
  time: number;
  lifetimeCompute: number;
}>;

type SolverRunSession = Readonly<{
  sessionId: SolverSessionId;
  puzzle: PuzzleDefinition;
  laneIndex: number;
}>;

type UpgradeTabId = "feature" | "tier" | "solver";
type UpgradeSortOrder = "price-asc" | "config";
type PendingConfirmation =
  | Readonly<{ type: "reset-board" }>
  | Readonly<{ type: "new-puzzle"; daily: boolean }>
  | Readonly<{ type: "switch-tier"; tier: number; timestamp: number }>
  | Readonly<{ type: "prestige" }>;

const SOLVER_LANE_SLOT_COUNT = 4;
const SOLVER_LANE_SESSION_STAGGER_MS = 140;

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
  inspectionMessage: string | null;
  persistentWarning: string | null;
  clearResult: Readonly<{ reward: number; classification: ClearClassification; tier: number; insightEarned: boolean; insightReward: number }> | null;
  settingsOpen: boolean;
  statsOpen: boolean;
  prestigeOpen: boolean;
  tutorialOpen: boolean;
  solver: SolverUiState;
}>;

const UPGRADE_TABS: readonly UpgradeTabId[] = ["feature", "tier", "solver"];

const UPGRADE_TAB_BY_ID: Record<UpgradeId, UpgradeTabId> = {
  "placement-scanner": "feature",
  "contradiction-detector": "feature",
  "forced-move": "feature",
  "auto-solver": "solver",
  "solver-throughput": "solver",
  "solver-payout": "solver",
  "constraint-ordering": "solver",
  "candidate-ordering": "solver",
  "symmetry-pruning": "solver",
  "dead-state-cache": "solver",
  "isolated-region-pruning": "solver",
  "zero-candidate-pruning": "solver",
  "color-balance-pruning": "solver",
  "partial-board-cache": "solver",
  "parallel-solvers": "solver",
  "tier-1": "tier",
  "tier-2": "tier",
  "tier-3": "tier",
  "tier-4": "tier",
  "tier-5": "tier",
  "tier-6": "tier",
  "tier-7": "tier",
  "tier-8": "tier",
  "tier-9": "tier",
};

const UPGRADE_ORDER_INDEX = new Map<UpgradeId, number>(GAME_CONFIG.upgrades.map((upgrade, index) => [upgrade.id, index]));

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
  | Readonly<{ type: "dismiss-inspection-message" }>
  | Readonly<{ type: "dismiss-clear-result" }>
  | Readonly<{ type: "set-settings-open"; value: boolean }>
  | Readonly<{ type: "set-stats-open"; value: boolean }>
  | Readonly<{ type: "set-prestige-open"; value: boolean }>
  | Readonly<{ type: "purchase-prestige"; upgradeId: PrestigeUpgradeId }>
  | Readonly<{ type: "prestige"; puzzle: PuzzleDefinition; nowIso: string }>
  | Readonly<{ type: "set-visualization"; value: SaveDataV1["settings"]["visualization"] }>
  | Readonly<{ type: "set-high-contrast"; value: boolean }>
  | Readonly<{ type: "set-theme"; value: SaveDataV1["settings"]["theme"] }>
  | Readonly<{ type: "set-language"; value: SaveDataV1["settings"]["language"] }>
  | Readonly<{ type: "set-notifications-enabled"; value: boolean }>
  | Readonly<{ type: "set-hide-purchased-upgrades"; value: boolean }>
  | Readonly<{ type: "set-solver-lane-min-session-ms"; value: number }>
  | Readonly<{ type: "set-solver-lane-preview-update-ms"; value: number }>
  | Readonly<{ type: "set-ui-scale"; value: number }>
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
  "constraint-ordering": "Solver Efficiency #1",
  "candidate-ordering": "Solver Efficiency #3",
  "symmetry-pruning": "Solver Efficiency #2",
  "dead-state-cache": "Solver Efficiency #4",
  "isolated-region-pruning": "High Tier Solver #1",
  "zero-candidate-pruning": "High Tier Solver #2",
  "color-balance-pruning": "High Tier Solver #3",
  "partial-board-cache": "High Tier Solver #4",
  "parallel-solvers": "Parallel Solvers",
  "tier-1": "Tier 1",
  "tier-2": "Tier 2",
  "tier-3": "Tier 3",
  "tier-4": "Tier 4",
  "tier-5": "Tier 5",
  "tier-6": "Tier 6",
  "tier-7": "Tier 7",
  "tier-8": "Tier 8",
  "tier-9": "Tier 9",
};

const UPGRADE_NAMES_JA: Record<UpgradeId, string> = {
  "placement-scanner": "配置スキャナー",
  "contradiction-detector": "矛盾検出",
  "forced-move": "強制手",
  "auto-solver": "自動ソルバー",
  "solver-throughput": "ソルバー処理速度",
  "solver-payout": "ソルバー報酬",
  "constraint-ordering": "ソルバ効率化 #1",
  "candidate-ordering": "ソルバ効率化 #3",
  "symmetry-pruning": "ソルバ効率化 #2",
  "dead-state-cache": "ソルバ効率化 #4",
  "isolated-region-pruning": "上位ソルバ効率化 #1",
  "zero-candidate-pruning": "上位ソルバ効率化 #2",
  "color-balance-pruning": "上位ソルバ効率化 #3",
  "partial-board-cache": "上位ソルバ効率化 #4",
  "parallel-solvers": "並列ソルバー",
  "tier-1": "Tier 1",
  "tier-2": "Tier 2",
  "tier-3": "Tier 3",
  "tier-4": "Tier 4",
  "tier-5": "Tier 5",
  "tier-6": "Tier 6",
  "tier-7": "Tier 7",
  "tier-8": "Tier 8",
  "tier-9": "Tier 9",
};

const UPGRADE_DESCRIPTIONS_EN: Record<UpgradeId, string> = {
  "placement-scanner": "Highlights cells where the selected piece has at least one legal placement.",
  "contradiction-detector": "Checks whether the current board can still be solved. Using it marks the clear as assisted.",
  "forced-move": "Places a move that is forced in the current position, if one exists.",
  "auto-solver": "Unlocks background solver puzzles after five manual clears on that tier.",
  "solver-throughput": "Increases the work rate budget used by automated solver runs.",
  "solver-payout": "Raises automated clear rewards up to the configured cap.",
  "constraint-ordering": "Tries the most constrained empty cells first to reduce branching.",
  "candidate-ordering": "Reorders candidate placements so dead ends are found earlier.",
  "symmetry-pruning": "Skips equivalent symmetric branches when possible.",
  "dead-state-cache": "Remembers failed partial boards to avoid solving the same dead state again.",
  "isolated-region-pruning": "Tier 7+ only: cuts branches where empty regions cannot be tiled by four-cell pieces.",
  "zero-candidate-pruning": "Tier 7+ only: cuts branches as soon as an empty cell has no remaining legal placement.",
  "color-balance-pruning": "Tier 7+ only: rejects branches whose remaining color pattern cannot match the remaining pieces.",
  "partial-board-cache": "Tier 7+ only: remembers failed empty-board shapes by remaining piece types.",
  "parallel-solvers": "Adds one background solver lane per level.",
  "tier-1": "Unlocks Tier 1 puzzles.",
  "tier-2": "Unlocks Tier 2 puzzles.",
  "tier-3": "Unlocks Tier 3 puzzles.",
  "tier-4": "Unlocks Tier 4 puzzles.",
  "tier-5": "Unlocks Tier 5 puzzles.",
  "tier-6": "Unlocks Tier 6 puzzles.",
  "tier-7": "Unlocks Tier 7 puzzles.",
  "tier-8": "Unlocks Tier 8 puzzles.",
  "tier-9": "Unlocks Tier 9 puzzles.",
};

const UPGRADE_DESCRIPTIONS_JA: Record<UpgradeId, string> = {
  "placement-scanner": "選択中のピースを置けるセルを盤面上でハイライトします。",
  "contradiction-detector": "今の盤面がまだ解けるか検査します。使うと補助クリア扱いになります。",
  "forced-move": "現局面で1通りしかない手があれば自動で置きます。",
  "auto-solver": "各Tierで手動クリア5回後に、裏側のソルバー盤面を動かせます。",
  "solver-throughput": "自動ソルバーが1秒あたりに進める探索量を増やします。",
  "solver-payout": "自動クリア報酬の倍率を上げます。",
  "constraint-ordering": "空きマスの候補が少ない場所から調べ、分岐を減らします。",
  "candidate-ordering": "候補手の順番を並べ替え、行き止まりを早めに見つけます。",
  "symmetry-pruning": "同じ意味になる対称な探索枝を省き、無駄な探索を減らします。",
  "dead-state-cache": "失敗した途中盤面を記録し、同じ詰みを再探索しにくくします。",
  "isolated-region-pruning": "Tier 7 以上で有効。空き領域が4マス単位で埋まらない分岐を捨てます。",
  "zero-candidate-pruning": "Tier 7 以上で有効。置ける候補がない空きマスを見つけた時点で分岐を捨てます。",
  "color-balance-pruning": "Tier 7 以上で有効。残りピースでは色数パターンを満たせない分岐を捨てます。",
  "partial-board-cache": "Tier 7 以上で有効。失敗した空き盤面形状を残りピース種類ごとに記録します。",
  "parallel-solvers": "同時に走らせられる自動ソルバー盤面を増やします。",
  "tier-1": "Tier 1 のパズルを解放します。",
  "tier-2": "Tier 2 のパズルを解放します。",
  "tier-3": "Tier 3 のパズルを解放します。",
  "tier-4": "Tier 4 のパズルを解放します。",
  "tier-5": "Tier 5 のパズルを解放します。",
  "tier-6": "Tier 6 のパズルを解放します。",
  "tier-7": "Tier 7 のパズルを解放します。",
  "tier-8": "Tier 8 のパズルを解放します。",
  "tier-9": "Tier 9 のパズルを解放します。",
};

const PRESTIGE_UPGRADE_NAMES_EN: Record<PrestigeUpgradeId, string> = {
  "reward-analysis": "Reward Analysis",
  "solver-foundation": "Solver Foundation",
  "tier-compression": "Tier Compression",
};

const PRESTIGE_UPGRADE_NAMES_JA: Record<PrestigeUpgradeId, string> = {
  "reward-analysis": "報酬解析",
  "solver-foundation": "ソルバー基盤",
  "tier-compression": "Tier圧縮",
};

const PRESTIGE_UPGRADE_DESCRIPTIONS_EN: Record<PrestigeUpgradeId, string> = {
  "reward-analysis": "Permanent +10% Compute reward per level.",
  "solver-foundation": "Permanent +1 base solver node/s per level before throughput multipliers.",
  "tier-compression": "Permanent -5% Tier upgrade cost per level, up to -25%.",
};

const PRESTIGE_UPGRADE_DESCRIPTIONS_JA: Record<PrestigeUpgradeId, string> = {
  "reward-analysis": "恒久的にCompute報酬をLvごとに+10%します。",
  "solver-foundation": "恒久的にソルバー基礎nodes/sをLvごとに+1します。処理速度倍率の前に加算されます。",
  "tier-compression": "恒久的にTier解放価格をLvごとに-5%します。最大-25%。",
};

const COPY = {
  en: {
    compute: "Compute",
    computePerSecond: "Compute/s",
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
    resetConfirmBody: "Remove all placed pieces from this puzzle? This keeps the current tier and seed.",
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
    solverLaneIdle: "Idle lane",
    solverLaneUnassigned: "Unassigned",
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
    hideCompletedTabs: "Hide complete tabs",
    upgradeSort: "Sort",
    upgradeSortPriceAsc: "Lowest price",
    upgradeSortConfig: "Default order",
    upgradeTabs: {
      feature: "Function",
      tier: "Tier",
      solver: "Solver",
    },
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
    notifications: "Notifications",
    uiScale: "UI size",
    solverLaneHoldTime: "Solver lane hold",
    solverLaneUpdateInterval: "Solver preview interval",
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
    upgradeDescriptions: UPGRADE_DESCRIPTIONS_EN,
    prestigeUpgradeNames: PRESTIGE_UPGRADE_NAMES_EN,
    prestigeUpgradeDescriptions: PRESTIGE_UPGRADE_DESCRIPTIONS_EN,
    dismissMessage: "Dismiss message",
    resizeLeftPanel: "Resize left panel",
    resizeRightPanel: "Resize right panel",
    resizeCenterPanels: "Resize puzzle and solver panels",
    resizeRightPanels: "Resize solver status and upgrades",
    maximumLevel: "maximum level",
    notEnoughCompute: "not enough Compute",
    notEnoughInsight: "not enough Insight",
    manualClearRequired: (tier: number) => `requires a manual Tier ${tier} clear this prestige`,
    requiresUpgrade: (name: string) => `requires ${name}`,
    insight: "Insight",
    prestige: "Prestige",
    lifetimeInsight: "Lifetime Insight",
    prestigeCount: "Prestige count",
    pendingInsight: "Pending Insight",
    prestigeCondition: "Manual clear Tier 9 to gain Insight +1. EX tiers unlock after your first Prestige and can hold more pending Insight.",
    prestigeResetBody: "Reset Compute, normal upgrades, tier unlocks, current puzzle, and this run's manual clears. Insight and permanent upgrades remain.",
    prestigeConfirmAction: "Prestige reset",
    prestigeNoPending: "No pending Insight yet.",
    prestigePending: (amount: number) => `Insight +${amount} is pending.`,
    prestigeManualOnly: "Insight is earned only from manual Tier 9 clears.",
    prestigeEarned: (amount: number) => `Insight +${amount} is pending.`,
    permanentUpgrades: "Permanent upgrades",
    purchasedPrestigeUpgrade: (name: string) => `Purchased ${name}`,
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
    autoSolverTierUnsupported: (tier: string) => `${tier} cannot be automated.`,
    autoSolverManualLocked: (tier: number, count: number, required: number) => `Auto Solver requires ${required} manual clears on Tier ${tier} (${count}/${required}).`,
    discardCurrentPuzzle: "Discard current puzzle?",
    discardConfirmBody: "Placed pieces and current progress will be lost.",
    discardConfirmAction: "Discard and continue",
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
    computePerSecond: "Compute/s",
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
    resetConfirmBody: "配置済みピースをすべて外します。現在の Tier とシードは維持されます。",
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
    solverLaneIdle: "待機レーン",
    solverLaneUnassigned: "割り当てなし",
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
    hideCompletedTabs: "完了タブ非表示",
    upgradeSort: "並び順",
    upgradeSortPriceAsc: "価格の安い順",
    upgradeSortConfig: "基本順",
    upgradeTabs: {
      feature: "機能",
      tier: "Tier",
      solver: "ソルバ",
    },
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
    notifications: "通知",
    solverLaneHoldTime: "ソルバー枠の保持時間",
    solverLaneUpdateInterval: "ソルバー表示の更新間隔",
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
    upgradeDescriptions: UPGRADE_DESCRIPTIONS_JA,
    prestigeUpgradeNames: PRESTIGE_UPGRADE_NAMES_JA,
    prestigeUpgradeDescriptions: PRESTIGE_UPGRADE_DESCRIPTIONS_JA,
    dismissMessage: "メッセージを閉じる",
    resizeLeftPanel: "左パネルの幅を変更",
    resizeRightPanel: "右パネルの幅を変更",
    resizeCenterPanels: "パズルとソルバー盤面の高さを変更",
    resizeRightPanels: "ソルバー状態とアップグレードの高さを変更",
    maximumLevel: "最大レベル",
    notEnoughCompute: "Compute不足",
    notEnoughInsight: "Insight不足",
    manualClearRequired: (tier: number) => `Tier ${tier} の手動クリアが必要`,
    requiresUpgrade: (name: string) => `${name}が必要`,
    insight: "Insight",
    prestige: "Prestige",
    lifetimeInsight: "累計Insight",
    prestigeCount: "Prestige回数",
    pendingInsight: "保留中Insight",
    prestigeCondition: "Tier 9を手動クリアすると Insight +1。",
    prestigeResetBody: "Compute、通常アップグレード、Tier解放、現在盤面、この周回の手動クリア状況をリセットします。Insightと恒久アップグレードは残ります。",
    prestigeConfirmAction: "Prestige実行",
    prestigeNoPending: "保留中Insightはありません。",
    prestigePending: (amount: number) => `Insight +${amount} が保留中です。`,
    prestigeManualOnly: "InsightはTier 9の手動クリアで獲得できます。",
    prestigeEarned: (amount: number) => `Insight +${amount} が保留されました。`,
    permanentUpgrades: "恒久アップグレード",
    purchasedPrestigeUpgrade: (name: string) => `${name}を購入しました`,
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
    discardConfirmBody: "配置済みピースと進行中の状態は失われます。",
    discardConfirmAction: "破棄して続行",
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

const COMPUTE_RATE_WINDOW_MS = 60_000;
const COMPUTE_RATE_TICK_MS = 1_000;
const PANEL_LAYOUT_STORAGE_KEY = "puzzle_incremental.panelLayout.v2";
const BOARD_GAP_PIXELS = 4;
const BOARD_MAX_CELL_PIXELS_BY_TIER = [88, 70, 76, 82, 76, 72, 66, 62, 60, 54] as const;
const BOARD_DEFAULT_MAX_CELL_PIXELS = 54;
const BOARD_MIN_CELL_PIXELS = 10;

type PanelLayout = Readonly<{
  left: number;
  right: number;
  centerSolver: number;
  rightStatus: number;
}>;

type PanelResizeKind = "left" | "right" | "center-solver" | "right-status";

type ElementSize = Readonly<{
  width: number;
  height: number;
}>;

const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  left: 330,
  right: 360,
  centerSolver: 150,
  rightStatus: 300,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sanitizePanelLayout(value: Partial<PanelLayout>): PanelLayout {
  return {
    left: clamp(value.left ?? DEFAULT_PANEL_LAYOUT.left, 240, 460),
    right: clamp(value.right ?? DEFAULT_PANEL_LAYOUT.right, 300, 500),
    centerSolver: clamp(value.centerSolver ?? DEFAULT_PANEL_LAYOUT.centerSolver, 110, 380),
    rightStatus: clamp(value.rightStatus ?? DEFAULT_PANEL_LAYOUT.rightStatus, 160, 430),
  };
}

function loadPanelLayout(): PanelLayout {
  try {
    const raw = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PANEL_LAYOUT;
    }
    return sanitizePanelLayout(JSON.parse(raw) as Partial<PanelLayout>);
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

function savePanelLayout(layout: PanelLayout): void {
  try {
    window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Panel sizes are a local preference; ignore storage failures.
  }
}

function panelLayoutStyle(layout: PanelLayout): React.CSSProperties {
  return {
    "--left-panel-width": `${layout.left}px`,
    "--right-panel-width": `${layout.right}px`,
    "--center-solver-height": `${layout.centerSolver}px`,
    "--right-status-height": `${layout.rightStatus}px`,
  } as React.CSSProperties;
}

function useMeasuredElement<T extends HTMLElement>(): readonly [React.RefObject<T | null>, ElementSize] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const update = (width: number, height: number) => {
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    const rect = element.getBoundingClientRect();
    update(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        update(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function boardMaxCellPixels(tier: number): number {
  return BOARD_MAX_CELL_PIXELS_BY_TIER[tier] ?? BOARD_DEFAULT_MAX_CELL_PIXELS;
}

function boardCellSize(size: ElementSize, columns: number, rows: number, tier: number): number | null {
  if (size.width <= 0 || size.height <= 0 || columns <= 0 || rows <= 0) {
    return null;
  }
  const usableWidth = size.width - BOARD_GAP_PIXELS * (columns - 1);
  const usableHeight = size.height - BOARD_GAP_PIXELS * (rows - 1);
  const rawSize = Math.min(usableWidth / columns, usableHeight / rows, boardMaxCellPixels(tier));
  if (!Number.isFinite(rawSize)) {
    return null;
  }
  return Math.max(BOARD_MIN_CELL_PIXELS, Math.floor(rawSize));
}

function pieceIdSortValue(id: string): number {
  const numeric = Number.parseInt(id.replace(/^\D+/, ""), 10);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function comparePieceTrayOrder(a: PieceInstance, b: PieceInstance): number {
  const typeDiff = TETROMINO_TYPES.indexOf(a.type) - TETROMINO_TYPES.indexOf(b.type);
  if (typeDiff !== 0) {
    return typeDiff;
  }
  const idDiff = pieceIdSortValue(a.id) - pieceIdSortValue(b.id);
  return idDiff !== 0 ? idDiff : a.id.localeCompare(b.id);
}

function copyForSave(save: SaveDataV1): AppCopy {
  return COPY[save.settings.language ?? "en"];
}

function upgradeName(copy: AppCopy, id: UpgradeId): string {
  return copy.upgradeNames[id];
}

function tierConfigFor(tier: number) {
  return GAME_CONFIG.tiers.find((entry) => entry.id === tier) ?? null;
}

function tierLabel(copy: AppCopy, tier: number): string {
  return tierConfigFor(tier)?.label ?? `${copy.tier} ${tier}`;
}

function isTierVisibleForSave(save: SaveDataV1, tier: number): boolean {
  const config = tierConfigFor(tier);
  if (!config) {
    return false;
  }
  return (config.prestigeUnlockCount ?? 0) <= save.prestige.count;
}

function isTierAvailableForSave(save: SaveDataV1, tier: number): boolean {
  return isTierVisibleForSave(save, tier) && isTierUnlocked(save.progression.upgradeLevels, tier);
}

function insightRewardForTier(tier: number): number {
  return tierConfigFor(tier)?.insightReward ?? (tier === GAME_CONFIG.prestige.requiredTier ? GAME_CONFIG.prestige.manualClearInsight : 0);
}

function isAutoSolverTierSupported(tier: number): boolean {
  return tierConfigFor(tier)?.autoSolverAllowed !== false;
}

function uiScaleLabel(language: SaveDataV1["settings"]["language"]): string {
  return language === "en" ? "UI size" : "UIサイズ";
}

function unsupportedAutoTierMessage(language: SaveDataV1["settings"]["language"], label: string): string {
  return language === "en" ? `${label} cannot be automated.` : `${label} は自動ソルバー対象外です。`;
}

function manualClearProgressLabel(language: SaveDataV1["settings"]["language"], count: number, required: number): string {
  const cappedCount = Math.min(count, required);
  return language === "en" ? `Manual clears ${cappedCount}/${required}` : `手動クリア ${cappedCount}/${required}`;
}

function prestigeUpgradeName(copy: AppCopy, id: PrestigeUpgradeId): string {
  return copy.prestigeUpgradeNames[id];
}

function upgradeTabFor(id: UpgradeId): UpgradeTabId {
  return UPGRADE_TAB_BY_ID[id];
}

function isUpgradeComplete(levels: SaveDataV1["progression"]["upgradeLevels"], id: UpgradeId): boolean {
  const upgrade = GAME_CONFIG.upgrades.find((entry) => entry.id === id);
  return Boolean(upgrade && (levels[id] ?? 0) >= upgrade.maxLevel);
}

function isUpgradeTabComplete(levels: SaveDataV1["progression"]["upgradeLevels"], tab: UpgradeTabId): boolean {
  const upgrades = GAME_CONFIG.upgrades.filter((upgrade) => upgradeTabFor(upgrade.id) === tab);
  return upgrades.length > 0 && upgrades.every((upgrade) => isUpgradeComplete(levels, upgrade.id));
}

function compareUpgradeOrder(a: (typeof GAME_CONFIG.upgrades)[number], b: (typeof GAME_CONFIG.upgrades)[number]): number {
  return (UPGRADE_ORDER_INDEX.get(a.id) ?? 0) - (UPGRADE_ORDER_INDEX.get(b.id) ?? 0);
}

function compareUpgradePrice(
  levels: SaveDataV1["progression"]["upgradeLevels"],
  prestigeLevels: SaveDataV1["prestige"]["upgradeLevels"],
  a: (typeof GAME_CONFIG.upgrades)[number],
  b: (typeof GAME_CONFIG.upgrades)[number],
): number {
  const priceDiff = getUpgradePrice(a.id, levels[a.id] ?? 0, prestigeLevels) - getUpgradePrice(b.id, levels[b.id] ?? 0, prestigeLevels);
  return priceDiff !== 0 ? priceDiff : compareUpgradeOrder(a, b);
}

function sortUpgrades(
  levels: SaveDataV1["progression"]["upgradeLevels"],
  prestigeLevels: SaveDataV1["prestige"]["upgradeLevels"],
  upgrades: readonly (typeof GAME_CONFIG.upgrades)[number][],
  order: UpgradeSortOrder,
): (typeof GAME_CONFIG.upgrades)[number][] {
  return [...upgrades].sort((a, b) => order === "price-asc" ? compareUpgradePrice(levels, prestigeLevels, a, b) : compareUpgradeOrder(a, b));
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
  if (outcome.reason === "missing-manual-clear") {
    return copy.manualClearRequired(outcome.requiredTier ?? 0);
  }
  return copy.requiresUpgrade(upgradeName(copy, outcome.prerequisite ?? "auto-solver"));
}

function prestigePurchaseReason(copy: AppCopy, outcome: PrestigePurchaseOutcome): string {
  if (outcome.ok) {
    return "";
  }
  return outcome.reason === "maximum-level" ? copy.maximumLevel : copy.notEnoughInsight;
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

function isRetainedSolverStatus(status: SolverStats["status"]): boolean {
  return isActiveSolverStatus(status) || status === "solved" || status === "unsat";
}

function trimSolverRuns(runs: readonly SolverRun[]): readonly SolverRun[] {
  const retainedByLane = new Map<number, SolverRun>();
  for (const run of runs) {
    if (isRetainedSolverStatus(run.status)) {
      retainedByLane.set(run.laneIndex, run);
    }
  }
  return [...retainedByLane.values()].sort((a, b) => a.laneIndex - b.laneIndex);
}

function mergeRunningPreview(current: readonly Placement[], incoming: readonly Placement[] | undefined, status: SolverStats["status"]): readonly Placement[] {
  if (!incoming) {
    return current;
  }
  return isActiveSolverStatus(status) && incoming.length === 0 ? current : incoming;
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
    inspectionMessage: null,
    persistentWarning: null,
    clearResult: null,
    settingsOpen: false,
    statsOpen: false,
    prestigeOpen: false,
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
  if (state.puzzle.cleared || !isSolved(state.puzzle.definition, board)) {
    return withSavedPuzzle(state, { puzzle: { ...state.puzzle, board } });
  }
  const classification = state.puzzle.classification;
  const reward = calculateReward(
    state.puzzle.definition,
    classification,
    classification === "automated" ? automatedRewardMultiplier(state.save.progression.upgradeLevels) : undefined,
    prestigeRewardMultiplier(state.save.prestige.upgradeLevels),
  );
  const tierKey = String(state.puzzle.definition.tier);
  const clearsByTier = {
    ...state.save.statistics.clearsByTier,
    [state.puzzle.definition.tier]: (state.save.statistics.clearsByTier[tierKey] ?? 0) + 1,
  };
  const manualClearsByTier = classification === "manual"
    ? {
        ...state.save.statistics.manualClearsByTier,
        [state.puzzle.definition.tier]: (state.save.statistics.manualClearsByTier[tierKey] ?? 0) + 1,
      }
    : state.save.statistics.manualClearsByTier;
  const runClearsByTier = {
    ...state.save.run.clearsByTier,
    [state.puzzle.definition.tier]: (state.save.run.clearsByTier[tierKey] ?? 0) + 1,
  };
  const runManualClearsByTier = classification === "manual"
    ? {
        ...state.save.run.manualClearsByTier,
        [state.puzzle.definition.tier]: (state.save.run.manualClearsByTier[tierKey] ?? 0) + 1,
      }
    : state.save.run.manualClearsByTier;
  const insightReward = classification === "manual" ? insightRewardForTier(state.puzzle.definition.tier) : 0;
  const insightEarned = insightReward > 0;
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
    prestige: {
      ...state.save.prestige,
      pendingInsight: insightEarned
        ? Math.max(state.save.prestige.pendingInsight, insightReward)
        : state.save.prestige.pendingInsight,
    },
    run: {
      ...state.save.run,
      clearsByTier: runClearsByTier,
      manualClearsByTier: runManualClearsByTier,
      highestTier: Math.max(state.save.run.highestTier, state.puzzle.definition.tier),
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
    clearResult: { reward, classification, tier: state.puzzle.definition.tier, insightEarned, insightReward },
    toast: null,
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
    case "reset-board": {
      const hasPlacements = boardPlacements(state.puzzle.board).length > 0;
      return withSavedPuzzle(state, {
        puzzle: { ...state.puzzle, board: createEmptyBoard(), cleared: false },
        undoStack: hasPlacements ? [...state.undoStack, state.puzzle.board] : state.undoStack,
        redoStack: [],
        clearResult: null,
        inspectionMessage: null,
        scannerEnabled: false,
      });
    }
    case "new-puzzle":
      return withSavedPuzzle(state, {
        puzzle: { definition: action.puzzle, board: createEmptyBoard(), classification: "manual", startedAt: Date.now(), cleared: false },
        selectedPieceId: null,
        rotations: {},
        undoStack: [],
        redoStack: [],
        scannerEnabled: false,
        clearResult: null,
        inspectionMessage: null,
      });
    case "set-tier":
      return { ...state, save: { ...state.save, progression: { ...state.save.progression, selectedTier: action.tier } } };
    case "purchase": {
      const copy = copyForSave(state.save);
      const levels = state.save.progression.upgradeLevels;
      const outcome = canPurchaseUpgrade(levels, state.save.economy.compute, action.upgradeId, state.save.run.manualClearsByTier, state.save.prestige.upgradeLevels);
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
    case "purchase-prestige": {
      const copy = copyForSave(state.save);
      const outcome = canPurchasePrestigeUpgrade(state.save.prestige, action.upgradeId);
      if (!outcome.ok) {
        return { ...state, toast: prestigePurchaseReason(copy, outcome) };
      }
      return {
        ...state,
        save: {
          ...state.save,
          prestige: {
            ...state.save.prestige,
            insight: state.save.prestige.insight - outcome.price,
            upgradeLevels: {
              ...state.save.prestige.upgradeLevels,
              [action.upgradeId]: (state.save.prestige.upgradeLevels[action.upgradeId] ?? 0) + 1,
            },
          },
        },
        toast: copy.purchasedPrestigeUpgrade(prestigeUpgradeName(copy, action.upgradeId)),
      };
    }
    case "prestige": {
      const gainedInsight = state.save.prestige.pendingInsight;
      return {
        ...state,
        save: {
          ...state.save,
          economy: {
            compute: 0,
            lifetimeCompute: state.save.economy.lifetimeCompute,
          },
          progression: {
            upgradeLevels: initialUpgradeState(),
            selectedTier: 0,
            autoSeedCounters: {},
          },
          prestige: {
            ...state.save.prestige,
            insight: state.save.prestige.insight + gainedInsight,
            lifetimeInsight: state.save.prestige.lifetimeInsight + gainedInsight,
            count: state.save.prestige.count + 1,
            pendingInsight: 0,
          },
          run: createInitialRunState(action.nowIso),
        },
        puzzle: { definition: action.puzzle, board: createEmptyBoard(), classification: "manual", startedAt: Date.now(), cleared: false },
        selectedPieceId: null,
        rotations: {},
        undoStack: [],
        redoStack: [],
        scannerEnabled: false,
        clearResult: null,
        inspectionMessage: null,
        prestigeOpen: false,
        solver: createIdleSolverState(0),
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
      return withSavedPuzzle({ ...state, puzzle: classifyAssisted(state) }, { inspectionMessage: action.message });
    case "dismiss-inspection-message":
      return { ...state, inspectionMessage: null };
    case "dismiss-clear-result":
      return { ...state, clearResult: null };
    case "set-settings-open":
      return { ...state, settingsOpen: action.value };
    case "set-stats-open":
      return { ...state, statsOpen: action.value };
    case "set-prestige-open":
      return { ...state, prestigeOpen: action.value };
    case "set-visualization":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, visualization: action.value } } };
    case "set-high-contrast":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, highContrast: action.value } } };
    case "set-theme":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, theme: action.value } } };
    case "set-language":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, language: action.value } } };
    case "set-notifications-enabled":
      return { ...state, toast: null, save: { ...state.save, settings: { ...state.save.settings, notificationsEnabled: action.value } } };
    case "set-hide-purchased-upgrades":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, hidePurchasedUpgrades: action.value } } };
    case "set-solver-lane-min-session-ms":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, solverLaneMinSessionMs: normalizeSolverLaneMinSessionMs(action.value) } } };
    case "set-solver-lane-preview-update-ms":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, solverLanePreviewUpdateMs: normalizeSolverLanePreviewUpdateMs(action.value) } } };
    case "set-ui-scale":
      return { ...state, save: { ...state.save, settings: { ...state.save.settings, uiScale: normalizeUiScale(action.value) } } };
    case "set-tutorial-open":
      return { ...state, tutorialOpen: action.value };
    case "complete-tutorial":
      return { ...state, tutorialOpen: false, save: { ...state.save, settings: { ...state.save.settings, tutorialCompleted: true } } };
    case "solver-started":
      return withSavedPuzzle({ ...state, puzzle: classifyAutomated(state) }, { solver: { ...state.solver, status: "running", sessionId: action.sessionId, stats: null, preview: [], activeSessions: 1 } });
    case "solver-progress":
      if (state.solver.sessionId !== action.sessionId) {
        return state;
      }
      return { ...state, solver: { ...state.solver, status: action.stats.status, stats: action.stats, preview: mergeRunningPreview(state.solver.preview, action.preview, action.stats.status) } };
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
      return { ...state, solver: { ...state.solver, status: "unsat", sessionId: null, stats: action.stats, preview: [], activeSessions: 0 } };
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
              laneIndex: session.laneIndex,
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
            ? { ...run, status: action.stats.status, stats: action.stats, preview: mergeRunningPreview(run.preview, action.preview, action.stats.status) }
            : run),
        },
      };
    case "solver-run-solved": {
      if (state.solver.completedSessionIds.includes(action.sessionId)) {
        return state;
      }
      const reward = calculateReward(
        action.puzzle,
        "automated",
        automatedRewardMultiplier(state.save.progression.upgradeLevels),
        prestigeRewardMultiplier(state.save.prestige.upgradeLevels),
      );
      const remainingActiveSessions = Math.max(0, state.solver.activeSessions - 1);
      const tierKey = String(action.puzzle.tier);
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
              [action.puzzle.tier]: (state.save.statistics.clearsByTier[tierKey] ?? 0) + 1,
            },
            lifetimeSolverNodes: state.save.statistics.lifetimeSolverNodes + action.stats.nodes,
            lifetimeBacktracks: state.save.statistics.lifetimeBacktracks + action.stats.backtracks,
            automatedCellsSolved: state.save.statistics.automatedCellsSolved + action.puzzle.usableCellIndices.length,
            maximumDifficultyScore: Math.max(state.save.statistics.maximumDifficultyScore, action.puzzle.difficulty.score),
          },
          run: {
            ...state.save.run,
            clearsByTier: {
              ...state.save.run.clearsByTier,
              [action.puzzle.tier]: (state.save.run.clearsByTier[tierKey] ?? 0) + 1,
            },
            highestTier: Math.max(state.save.run.highestTier, action.puzzle.tier),
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

function formatRate(value: number, language: SaveDataV1["settings"]["language"]): string {
  return new Intl.NumberFormat(language === "ja" ? "ja-JP" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMilliseconds(value: number): string {
  return value >= 1000 && value % 1000 === 0 ? `${value / 1000}s` : `${value}ms`;
}

function measuredComputePerSecond(samples: readonly ComputeRateSample[]): number {
  if (samples.length < 2) {
    return 0;
  }
  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  const elapsedSeconds = (newest.time - oldest.time) / 1000;
  if (elapsedSeconds <= 0) {
    return 0;
  }
  return Math.max(0, (newest.lifetimeCompute - oldest.lifetimeCompute) / elapsedSeconds);
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

function distanceToRect(x: number, y: number, rect: Readonly<{ left: number; top: number; right: number; bottom: number }>): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

function findPlacementAtBoardPoint(
  puzzle: PuzzleDefinition,
  placements: readonly Placement[],
  boardElement: HTMLElement,
  clientX: number,
  clientY: number,
): Placement | null {
  const rect = boardElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }
  const computed = window.getComputedStyle(boardElement);
  const columnGap = Number.parseFloat(computed.columnGap || computed.gap || "0") || 0;
  const rowGap = Number.parseFloat(computed.rowGap || computed.gap || "0") || columnGap;
  const cellWidth = (rect.width - columnGap * (puzzle.width - 1)) / puzzle.width;
  const cellHeight = (rect.height - rowGap * (puzzle.height - 1)) / puzzle.height;
  if (cellWidth <= 0 || cellHeight <= 0) {
    return null;
  }
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const stepX = cellWidth + columnGap;
  const stepY = cellHeight + rowGap;
  const col = Math.floor(localX / stepX);
  const row = Math.floor(localY / stepY);
  const insideCell = col >= 0
    && row >= 0
    && col < puzzle.width
    && row < puzzle.height
    && localX - col * stepX <= cellWidth
    && localY - row * stepY <= cellHeight;
  if (insideCell) {
    const index = row * puzzle.width + col;
    return placements.find((placement) => placement.cellIndices.includes(index)) ?? null;
  }

  let best: Readonly<{ placement: Placement; distance: number }> | null = null;
  for (const placement of placements) {
    const cells = placement.cellIndices.map((index) => indexToCell(puzzle.width, index));
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    const maxY = Math.max(...cells.map((cell) => cell.y));
    const bounds = {
      left: minX * stepX,
      top: minY * stepY,
      right: maxX * stepX + cellWidth,
      bottom: maxY * stepY + cellHeight,
    };
    if (localX < bounds.left || localX > bounds.right || localY < bounds.top || localY > bounds.bottom) {
      continue;
    }
    const distance = Math.min(...cells.map((cell) => distanceToRect(localX, localY, {
      left: cell.x * stepX,
      top: cell.y * stepY,
      right: cell.x * stepX + cellWidth,
      bottom: cell.y * stepY + cellHeight,
    })));
    if (!best || distance < best.distance) {
      best = { placement, distance };
    }
  }
  return best?.placement ?? null;
}

function SolverLaneSlot({
  run,
  laneIndex,
  isUnlockedLane,
  minSessionMs,
  previewUpdateMs,
  language,
  copy,
}: Readonly<{
  run: SolverRun | null;
  laneIndex: number;
  isUnlockedLane: boolean;
  minSessionMs: number;
  previewUpdateMs: number;
  language: SaveDataV1["settings"]["language"];
  copy: AppCopy;
}>) {
  const [displayRun, setDisplayRun] = useState<SolverRun | null>(run);
  const displayRunRef = useRef<SolverRun | null>(run);
  const pendingRunRef = useRef<SolverRun | null>(run);
  const displayedSinceRef = useRef(0);
  const previewUpdatedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commitDisplayRun = useCallback((nextRun: SolverRun | null) => {
    clearPendingTimer();
    displayRunRef.current = nextRun;
    pendingRunRef.current = nextRun;
    displayedSinceRef.current = Date.now();
    previewUpdatedAtRef.current = Date.now();
    setDisplayRun(nextRun);
  }, [clearPendingTimer]);

  const scheduleDisplayRun = useCallback((nextRun: SolverRun | null, delay: number) => {
    clearPendingTimer();
    timerRef.current = setTimeout(() => {
      commitDisplayRun(nextRun);
      timerRef.current = null;
    }, Math.max(0, delay));
  }, [clearPendingTimer, commitDisplayRun]);

  useEffect(() => {
    pendingRunRef.current = run;
    const currentRun = displayRunRef.current;
    const currentSessionId = currentRun?.sessionId ?? null;
    const nextSessionId = run?.sessionId ?? null;

    if (currentSessionId === nextSessionId) {
      if (!run) {
        scheduleDisplayRun(null, 0);
        return clearPendingTimer;
      }
      const elapsedSincePreview = Date.now() - previewUpdatedAtRef.current;
      if (!isActiveSolverStatus(run.status) || elapsedSincePreview >= previewUpdateMs) {
        scheduleDisplayRun(run, 0);
        return clearPendingTimer;
      }
      scheduleDisplayRun(run, previewUpdateMs - elapsedSincePreview);
      return clearPendingTimer;
    }

    if (currentRun && !isActiveSolverStatus(currentRun.status) && run) {
      scheduleDisplayRun(run, 0);
      return clearPendingTimer;
    }

    const elapsedSinceSessionShown = displayedSinceRef.current === 0
      ? minSessionMs
      : Date.now() - displayedSinceRef.current;
    if (!currentRun || elapsedSinceSessionShown >= minSessionMs) {
      scheduleDisplayRun(run, currentRun ? laneIndex * SOLVER_LANE_SESSION_STAGGER_MS : 0);
      return clearPendingTimer;
    }

    clearPendingTimer();
    timerRef.current = setTimeout(() => {
      const latestRun = pendingRunRef.current;
      commitDisplayRun(latestRun);
      timerRef.current = null;
    }, minSessionMs - elapsedSinceSessionShown + laneIndex * SOLVER_LANE_SESSION_STAGGER_MS);
    return clearPendingTimer;
  }, [clearPendingTimer, commitDisplayRun, laneIndex, minSessionMs, previewUpdateMs, run, scheduleDisplayRun]);

  if (displayRun) {
    return <MiniSolverBoard run={displayRun} language={language} copy={copy} />;
  }

  return (
    <article className={`solver-run solver-run-placeholder ${isUnlockedLane ? "" : "solver-run-unassigned"}`}>
      <span>{isUnlockedLane ? copy.solverLaneIdle : copy.solverLaneUnassigned}</span>
    </article>
  );
}

function MiniSolverBoard({ run, language, copy }: Readonly<{ run: SolverRun; language: SaveDataV1["settings"]["language"]; copy: AppCopy }>) {
  const placedByCell = new Map<number, Placement>();
  for (const placement of run.preview) {
    for (const index of placement.cellIndices) {
      placedByCell.set(index, placement);
    }
  }
  return (
    <article className={`solver-run ${isActiveSolverStatus(run.status) ? "active" : "terminal"}`} data-testid="solver-run">
      <div className="solver-run-header">
        <strong>{tierLabel(copy, run.puzzle.tier)}</strong>
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
  const nextSolverLaneRef = useRef(0);
  const computeRateSamplesRef = useRef<ComputeRateSample[]>([]);
  const computeRateSaveCreatedAtRef = useRef<string | null>(null);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [eraseText, setEraseText] = useState("");
  const [computePerSecond, setComputePerSecond] = useState(0);
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(loadPanelLayout);
  const [activeUpgradeTab, setActiveUpgradeTab] = useState<UpgradeTabId>("feature");
  const [upgradeSortOrder, setUpgradeSortOrder] = useState<UpgradeSortOrder>("price-asc");
  const [hideCompletedUpgradeTabs, setHideCompletedUpgradeTabs] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [boardViewportRef, boardViewportSize] = useMeasuredElement<HTMLDivElement>();

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

  useEffect(() => {
    savePanelLayout(panelLayout);
  }, [panelLayout]);

  useEffect(() => {
    const sampleComputeRate = () => {
      const now = Date.now();
      const lifetimeCompute = state.save.economy.lifetimeCompute;
      if (computeRateSaveCreatedAtRef.current !== state.save.createdAt) {
        computeRateSaveCreatedAtRef.current = state.save.createdAt;
        computeRateSamplesRef.current = [{ time: now, lifetimeCompute }];
        setComputePerSecond(0);
        return;
      }
      const previous = computeRateSamplesRef.current[computeRateSamplesRef.current.length - 1];
      if (previous && lifetimeCompute < previous.lifetimeCompute) {
        computeRateSamplesRef.current = [{ time: now, lifetimeCompute }];
        setComputePerSecond(0);
        return;
      }
      const cutoff = now - COMPUTE_RATE_WINDOW_MS;
      const samples = [
        ...computeRateSamplesRef.current.filter((sample) => sample.time >= cutoff),
        { time: now, lifetimeCompute },
      ];
      computeRateSamplesRef.current = samples;
      setComputePerSecond(measuredComputePerSecond(samples));
    };
    sampleComputeRate();
    const interval = window.setInterval(sampleComputeRate, COMPUTE_RATE_TICK_MS);
    return () => window.clearInterval(interval);
  }, [state.save.createdAt, state.save.economy.lifetimeCompute]);

  const puzzle = state.puzzle.definition;
  const visibleTiers = useMemo(() => GAME_CONFIG.tiers.filter((tier) => isTierVisibleForSave(state.save, tier.id)), [state.save]);
  const measuredBoardCellSize = useMemo(
    () => boardCellSize(boardViewportSize, puzzle.width, puzzle.height, puzzle.tier),
    [boardViewportSize, puzzle.height, puzzle.tier, puzzle.width],
  );
  const boardStyle = useMemo(() => {
    const measuredStyle = measuredBoardCellSize
      ? {
          "--board-cell-size": `${measuredBoardCellSize}px`,
          gridTemplateRows: `repeat(${puzzle.height}, var(--board-cell-size))`,
        }
      : {};
    return {
      ...measuredStyle,
      gridTemplateColumns: measuredBoardCellSize
        ? `repeat(${puzzle.width}, var(--board-cell-size))`
        : `repeat(${puzzle.width}, minmax(28px, 1fr))`,
    } as React.CSSProperties;
  }, [measuredBoardCellSize, puzzle.height, puzzle.width]);
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
  const trayPieces = useMemo(() => [...puzzle.pieces].sort(comparePieceTrayOrder), [puzzle.pieces]);
  const selectedPlacementPreview = useMemo(() => {
    if (!selectedPiece || hoverCell === null || state.puzzle.cleared) {
      return null;
    }
    return choosePlacementPreviewForCell(puzzle, state.puzzle.board, selectedPiece, state.rotations[selectedPiece.id] ?? 0, hoverCell);
  }, [hoverCell, puzzle, selectedPiece, state.puzzle.board, state.puzzle.cleared, state.rotations]);
  const language = state.save.settings.language ?? "en";
  const copy = COPY[language];
  const upgradeLevels = state.save.progression.upgradeLevels;
  const solverParallelSessions = parallelSessions(upgradeLevels);
  const visibleUpgradeTabs = UPGRADE_TABS.filter((tab) => !hideCompletedUpgradeTabs || !isUpgradeTabComplete(upgradeLevels, tab));
  const selectedUpgradeTab = visibleUpgradeTabs.includes(activeUpgradeTab)
    ? activeUpgradeTab
    : visibleUpgradeTabs[0] ?? null;
  const visibleUpgrades = selectedUpgradeTab
    ? sortUpgrades(
      upgradeLevels,
      state.save.prestige.upgradeLevels,
      GAME_CONFIG.upgrades.filter((upgrade) => {
        const level = upgradeLevels[upgrade.id] ?? 0;
        return upgradeTabFor(upgrade.id) === selectedUpgradeTab
          && (!state.save.settings.hidePurchasedUpgrades || level < upgrade.maxLevel);
      }),
      upgradeSortOrder,
    )
    : [];
  const manualClearsAutoTier = manualClearsForTier(state.save.run.manualClearsByTier, state.solver.autoTier);
  const autoSolverRequiredManualClears = GAME_CONFIG.solver.manualClearsRequiredByTierForAutoSolver;
  const manualClearsPuzzleTier = manualClearsForTier(state.save.run.manualClearsByTier, puzzle.tier);
  const autoSolverTierSupported = isAutoSolverTierSupported(state.solver.autoTier);
  const selectedTierAutoSolverSupported = isAutoSolverTierSupported(state.save.progression.selectedTier);
  const autoSolverReady = autoSolverTierSupported
    && isAutoSolverReady(state.save.progression.upgradeLevels, state.save.run.manualClearsByTier, state.solver.autoTier);
  const autoSolverLockMessage = !autoSolverTierSupported
    ? unsupportedAutoTierMessage(language, tierLabel(copy, state.solver.autoTier))
    : (state.save.progression.upgradeLevels["auto-solver"] ?? 0) <= 0
    ? copy.autoSolverLocked
    : copy.autoSolverManualLocked(state.solver.autoTier, manualClearsAutoTier, autoSolverRequiredManualClears);
  const activeSolverRunCount = state.solver.runs.filter((run) => isActiveSolverStatus(run.status)).length;
  const solverLaneCapacity = Math.max(0, solverParallelSessions - activeSolverRunCount);
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
    const laneCount = parallelSessions(state.save.progression.upgradeLevels);
    const usedLaneIndices = new Set(state.solver.runs.filter((run) => isActiveSolverStatus(run.status)).map((run) => run.laneIndex));
    let nextLaneIndex = nextSolverLaneRef.current % Math.max(1, laneCount);
    const sessions = puzzles.map((automatedPuzzle, index): SolverRunSession => {
      const sessionId = `auto-${automatedPuzzle.tier}-${automatedPuzzle.seed}-${stamp}-${index}`;
      let laneIndex = index % Math.max(1, laneCount);
      for (let offset = 0; offset < laneCount; offset += 1) {
        const candidateLane = (nextLaneIndex + offset) % laneCount;
        if (!usedLaneIndices.has(candidateLane)) {
          laneIndex = candidateLane;
          break;
        }
      }
      usedLaneIndices.add(laneIndex);
      nextLaneIndex = (laneIndex + 1) % Math.max(1, laneCount);
      solverSessionsRef.current.set(sessionId, automatedPuzzle);
      worker.post({ type: "START", sessionId, puzzle: automatedPuzzle, options: solverOptionsFromUpgrades(state.save.progression.upgradeLevels, state.save.settings.visualization, automatedPuzzle.tier, state.save.prestige.upgradeLevels) });
      return { sessionId, puzzle: automatedPuzzle, laneIndex };
    });
    nextSolverLaneRef.current = nextLaneIndex;
    dispatch({ type: "solver-runs-started", sessions });
  }, [ensureWorker, state.save.prestige.upgradeLevels, state.save.progression.upgradeLevels, state.save.settings.visualization, state.solver.runs]);

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
    if (
      state.solver.autoNext
      || activeSolverRunCount > 0
      || state.solver.autoTier === state.save.progression.selectedTier
      || !selectedTierAutoSolverSupported
    ) {
      return;
    }
    dispatch({ type: "set-auto-tier", tier: state.save.progression.selectedTier });
  }, [activeSolverRunCount, selectedTierAutoSolverSupported, state.save.progression.selectedTier, state.solver.autoNext, state.solver.autoTier]);

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
    if (activeSolverRunCount === 0 || !workerRef.current) {
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
    if (activeSolverRunCount > 0 && workerRef.current) {
      dispatch({ type: "set-auto-next", value: false });
      for (const run of state.solver.runs.filter((entry) => isActiveSolverStatus(entry.status))) {
        workerRef.current.post({ type: "CANCEL", sessionId: run.sessionId });
      }
    }
  };

  const requestResetBoard = () => {
    if (boardPlacements(state.puzzle.board).length > 0) {
      setPendingConfirmation({ type: "reset-board" });
      return;
    }
    dispatch({ type: "reset-board" });
  };

  const createNewPuzzle = (daily: boolean) => {
    const seed = daily ? dailySeed(state.save.progression.selectedTier) : `seed-${state.save.progression.selectedTier}-${Date.now()}`;
    dispatch({ type: "new-puzzle", puzzle: generatePuzzle({ tier: state.save.progression.selectedTier, seed }) });
  };

  const startNewPuzzle = (daily: boolean) => {
    if (boardPlacements(state.puzzle.board).length > 0 && !state.puzzle.cleared) {
      setPendingConfirmation({ type: "new-puzzle", daily });
      return;
    }
    createNewPuzzle(daily);
  };

  const applyTierSwitch = (tier: number, timestamp: number) => {
    dispatch({ type: "set-tier", tier });
    dispatch({ type: "new-puzzle", puzzle: generatePuzzle({ tier, seed: `tier-${tier}-${timestamp}` }) });
  };

  const executePrestige = () => {
    if (state.save.prestige.pendingInsight <= 0) {
      return;
    }
    workerRef.current?.dispose();
    workerRef.current = null;
    solverSessionsRef.current.clear();
    nextSolverLaneRef.current = 0;
    const now = new Date();
    dispatch({
      type: "prestige",
      puzzle: generatePuzzle({ tier: 0, seed: `prestige-${state.save.prestige.count + 1}-${now.getTime()}` }),
      nowIso: now.toISOString(),
    });
  };

  const switchTier = (tier: number, timestamp: number) => {
    if (!isTierAvailableForSave(state.save, tier)) {
      return;
    }
    if (state.save.progression.selectedTier === tier && puzzle.tier === tier) {
      return;
    }
    if (boardPlacements(state.puzzle.board).length > 0 && !state.puzzle.cleared) {
      setPendingConfirmation({ type: "switch-tier", tier, timestamp });
      return;
    }
    applyTierSwitch(tier, timestamp);
  };

  const confirmPendingAction = () => {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (!action) {
      return;
    }
    if (action.type === "reset-board") {
      dispatch({ type: "reset-board" });
    } else if (action.type === "new-puzzle") {
      createNewPuzzle(action.daily);
    } else if (action.type === "switch-tier") {
      applyTierSwitch(action.tier, action.timestamp);
    } else {
      executePrestige();
    }
  };

  const useContradictionDetector = () => {
    if ((state.save.progression.upgradeLevels["contradiction-detector"] ?? 0) <= 0) {
      dispatch({ type: "toast", message: copy.lockedUpgrade(upgradeName(copy, "contradiction-detector")) });
      return;
    }
    const result = solveToEnd(puzzle, solverOptionsFromUpgrades(state.save.progression.upgradeLevels, "off", puzzle.tier, state.save.prestige.upgradeLevels), state.puzzle.board, 100_000);
    dispatch({ type: "contradiction", message: result.status === "unsat" ? copy.contradictionFound : copy.contradictionClear });
  };

  const startPanelResize = (kind: PanelResizeKind, event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = panelLayout;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const viewportWidth = window.innerWidth || 1280;
      const minCenterWidth = 460;
      if (kind === "left") {
        const maxLeft = Math.max(240, Math.min(460, viewportWidth - start.right - minCenterWidth));
        setPanelLayout((current) => sanitizePanelLayout({
          ...current,
          left: clamp(start.left + deltaX, 240, maxLeft),
        }));
      } else if (kind === "right") {
        const maxRight = Math.max(300, Math.min(500, viewportWidth - start.left - minCenterWidth));
        setPanelLayout((current) => sanitizePanelLayout({
          ...current,
          right: clamp(start.right - deltaX, 300, maxRight),
        }));
      } else if (kind === "center-solver") {
        setPanelLayout((current) => sanitizePanelLayout({
          ...current,
          centerSolver: start.centerSolver - deltaY,
        }));
      } else {
        setPanelLayout((current) => sanitizePanelLayout({
          ...current,
          rightStatus: start.rightStatus + deltaY,
        }));
      }
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.body.classList.remove("resizing-panel");
    };
    document.body.classList.add("resizing-panel");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
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

  const handleBoardContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const targetCell = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-testid^='cell-']") : null;
    const targetIndex = targetCell?.dataset.testid?.startsWith("cell-") ? Number.parseInt(targetCell.dataset.testid.slice(5), 10) : Number.NaN;
    const placed = Number.isFinite(targetIndex)
      ? placedByCell.get(targetIndex)
      : findPlacementAtBoardPoint(puzzle, boardPlacements(state.puzzle.board), event.currentTarget, event.clientX, event.clientY);
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
      if ((event.key === "r" || event.key === "R") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        requestResetBoard();
      } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D" || event.key === "E") {
        event.preventDefault();
        dispatch({ type: "rotate", direction: 1 });
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A" || event.key === "Q") {
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
  const displaySolverRuns = state.solver.runs.filter((run) => isRetainedSolverStatus(run.status));
  const solverRunSlots = Array.from({ length: SOLVER_LANE_SLOT_COUNT }, (_, laneIndex) => displaySolverRuns.find((run) => run.laneIndex === laneIndex) ?? null);

  const theme = state.save.settings.theme ?? "system";
  const appClassName = ["app", state.save.settings.highContrast ? "high-contrast" : "", theme === "dark" ? "dark" : "", theme === "light" ? "light" : ""].filter(Boolean).join(" ");
  const appStyle = { "--ui-scale": state.save.settings.uiScale } as React.CSSProperties;
  const prestigeVisible = (state.save.progression.upgradeLevels["tier-9"] ?? 0) > 0
    || state.save.prestige.count > 0
    || state.save.prestige.insight > 0
    || state.save.prestige.lifetimeInsight > 0
    || state.save.prestige.pendingInsight > 0;
  const prestigeButtonLabel = state.save.prestige.pendingInsight > 0
    ? `${copy.prestige} +${state.save.prestige.pendingInsight}`
    : copy.prestige;

  return (
    <main className={appClassName} style={appStyle}>
      <header className="topbar">
        <h1>puzzle_incremental</h1>
        <div className="topbar-prestige">
          {prestigeVisible && (
            <button type="button" onClick={() => dispatch({ type: "set-prestige-open", value: true })}>
              {prestigeButtonLabel}
            </button>
          )}
        </div>
        <div className="topbar-actions">
          <div className="metric"><span>{copy.compute}</span><strong data-testid="compute">{formatNumber(state.save.economy.compute, language)} C</strong></div>
          <div className="metric"><span>{copy.computePerSecond}</span><strong data-testid="compute-per-second">{formatRate(computePerSecond, language)}</strong></div>
          <div className="metric"><span>{copy.nodesPerSecond}</span><strong>{formatNumber(state.solver.stats?.measuredNodesPerSecond ?? 0, language)}</strong></div>
          {prestigeVisible && (
            <div className="metric"><span>{copy.insight}</span><strong data-testid="insight">{formatNumber(state.save.prestige.insight, language)}</strong></div>
          )}
          <button type="button" onClick={() => dispatch({ type: "set-tutorial-open", value: true })}>{copy.tutorial}</button>
          <button type="button" onClick={() => dispatch({ type: "set-settings-open", value: true })}>{copy.settings}</button>
          <button type="button" onClick={() => dispatch({ type: "set-stats-open", value: true })}>{copy.stats}</button>
        </div>
      </header>
      {state.persistentWarning && <div className="warning" role="alert">{state.persistentWarning}</div>}
      {state.save.settings.notificationsEnabled && state.toast && <div className="toast" role="status" aria-live="polite" onClick={() => dispatch({ type: "toast", message: null })}>{state.toast}</div>}

      <section className="layout" style={panelLayoutStyle(panelLayout)}>
        <aside className="panel left-panel">
          <h2>{copy.pieces}</h2>
          <div className="piece-tray">
            {trayPieces.map((piece) => {
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
            <button type="button" onClick={requestResetBoard}>{copy.resetBoard}</button>
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

        <div
          className="resize-handle resize-handle-vertical"
          role="separator"
          aria-orientation="vertical"
          aria-label={copy.resizeLeftPanel}
          onPointerDown={(event) => startPanelResize("left", event)}
        />

        <section className="board-panel">
          <section className="panel puzzle-panel">
            <div className="board-top">
              <div className="board-header">
                <span className="board-tier-summary">
                  <span>{tierLabel(copy, puzzle.tier)}</span>
                  <span className="board-tier-manual-clears" data-testid="puzzle-manual-clears">
                    {manualClearProgressLabel(language, manualClearsPuzzleTier, autoSolverRequiredManualClears)}
                  </span>
                </span>
                <button type="button" onClick={() => navigator.clipboard?.writeText(puzzle.seed)}>{copy.seed}: {puzzle.seed}</button>
                <span>{copy.difficulty} {puzzle.difficulty.score}</span>
                <span>{classificationLabel(copy, state.puzzle.classification)}</span>
              </div>
              <div className="tier-switcher" aria-label={copy.tierSelection}>
                {visibleTiers.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    disabled={!isTierAvailableForSave(state.save, tier.id)}
                    className={state.save.progression.selectedTier === tier.id ? "selected" : ""}
                    onClick={() => switchTier(tier.id, Date.now())}
                  >
                    {tierLabel(copy, tier.id)}
                  </button>
                ))}
              </div>
            </div>
            <div className="board-viewport" ref={boardViewportRef}>
              <div
                className={`board ${measuredBoardCellSize ? "board-measured" : ""}`}
                style={boardStyle}
                role="grid"
                aria-label={copy.boardLabel}
                onMouseLeave={() => setHoverCell(null)}
                onWheel={handleBoardWheel}
                onContextMenu={handleBoardContextMenu}
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
                    >
                      {placed?.pieceType ?? ""}
                    </button>
                  );
                })}
              </div>
            </div>
            {state.inspectionMessage && (
              <div className="inspection-message" role="status" aria-live="polite">
                <span>{state.inspectionMessage}</span>
                <button type="button" aria-label={copy.dismissMessage} onClick={() => dispatch({ type: "dismiss-inspection-message" })}>×</button>
              </div>
            )}
          </section>
          <div
            className="resize-handle resize-handle-horizontal"
            role="separator"
            aria-orientation="horizontal"
            aria-label={copy.resizeCenterPanels}
            onPointerDown={(event) => startPanelResize("center-solver", event)}
          />
          <section className="panel solver-lane" aria-label={copy.solverLanes}>
            <div className="solver-lane-header">
              <h2>{copy.solverLanes}</h2>
              <span>{activeSolverRunCount}/{solverParallelSessions}</span>
            </div>
            <div className="solver-run-list">
              {solverRunSlots.map((run, laneIndex) => {
                const isUnlockedLane = laneIndex < solverParallelSessions;
                return (
                  <SolverLaneSlot
                    key={`solver-lane-${laneIndex}`}
                    run={run}
                    laneIndex={laneIndex}
                    isUnlockedLane={isUnlockedLane}
                    minSessionMs={state.save.settings.solverLaneMinSessionMs}
                    previewUpdateMs={state.save.settings.solverLanePreviewUpdateMs}
                    language={language}
                    copy={copy}
                  />
                );
              })}
            </div>
          </section>
        </section>

        <div
          className="resize-handle resize-handle-vertical"
          role="separator"
          aria-orientation="vertical"
          aria-label={copy.resizeRightPanel}
          onPointerDown={(event) => startPanelResize("right", event)}
        />

        <aside className="side-panel">
          <section className="panel solver-section">
            <h2>{copy.solver}</h2>
            <div className="solver-grid">
              <span>{copy.status}</span><strong data-testid="solver-status">{solverStatusLabel(copy, state.solver.status)}</strong>
              <span>{copy.nodes}</span><strong>{formatNumber(state.solver.stats?.nodes ?? 0, language)}</strong>
              <span>{copy.backtracks}</span><strong>{formatNumber(state.solver.stats?.backtracks ?? 0, language)}</strong>
              <span>{copy.theoryNodesPerSecond}</span><strong>{formatNumber(nodesPerSecond(state.save.progression.upgradeLevels, state.save.prestige.upgradeLevels), language)}</strong>
              <span>{copy.depth}</span><strong>{state.solver.stats?.currentDepth ?? 0}</strong>
              <span>{copy.autoTier}</span><strong>{tierLabel(copy, state.solver.autoTier)}</strong>
              <span>{copy.parallel}</span><strong>{solverParallelSessions}</strong>
              <span>{copy.manualUnlock}</span><strong>{Math.min(manualClearsAutoTier, autoSolverRequiredManualClears)}/{autoSolverRequiredManualClears}</strong>
              <span>{copy.solverPayout}</span><strong>{solverPayoutMultiplier.toFixed(2)}x</strong>
            </div>
            <div className="controls solver-controls">
              <button type="button" onClick={startSolver} disabled={!autoSolverReady || solverLaneCapacity <= 0} title={autoSolverReady ? undefined : autoSolverLockMessage}>{copy.startSolver}</button>
              <button type="button" onClick={pauseOrResumeSolver} disabled={activeSolverRunCount === 0}>{state.solver.status === "paused" ? copy.resume : copy.pause}</button>
              <button type="button" onClick={cancelSolver} disabled={activeSolverRunCount === 0}>{copy.cancel}</button>
              <button
                type="button"
                onClick={() => dispatch({ type: "set-auto-tier", tier: state.save.progression.selectedTier })}
                disabled={state.solver.autoTier === state.save.progression.selectedTier || !selectedTierAutoSolverSupported}
                title={selectedTierAutoSolverSupported ? undefined : unsupportedAutoTierMessage(language, tierLabel(copy, state.save.progression.selectedTier))}
              >
                {copy.useCurrentTier}
              </button>
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

          <div
            className="resize-handle resize-handle-horizontal"
            role="separator"
            aria-orientation="horizontal"
            aria-label={copy.resizeRightPanels}
            onPointerDown={(event) => startPanelResize("right-status", event)}
          />

          <section className="panel upgrade-section">
            <div className="panel-heading-row">
              <h2>{copy.upgrades}</h2>
              <span>{formatNumber(state.save.economy.compute, language)} C</span>
            </div>
            <div className="upgrade-toolbar">
              <button
                type="button"
                className={`toggle-button ${state.save.settings.hidePurchasedUpgrades ? "selected" : ""}`}
                onClick={() => dispatch({ type: "set-hide-purchased-upgrades", value: !state.save.settings.hidePurchasedUpgrades })}
              >
                {copy.hidePurchased}: {state.save.settings.hidePurchasedUpgrades ? copy.on : copy.off}
              </button>
              <button
                type="button"
                className={`toggle-button ${hideCompletedUpgradeTabs ? "selected" : ""}`}
                onClick={() => setHideCompletedUpgradeTabs((value) => !value)}
              >
                {copy.hideCompletedTabs}: {hideCompletedUpgradeTabs ? copy.on : copy.off}
              </button>
              <label className="upgrade-sort">
                <span>{copy.upgradeSort}</span>
                <select value={upgradeSortOrder} onChange={(event) => setUpgradeSortOrder(event.target.value as UpgradeSortOrder)}>
                  <option value="price-asc">{copy.upgradeSortPriceAsc}</option>
                  <option value="config">{copy.upgradeSortConfig}</option>
                </select>
              </label>
            </div>
            <div className="upgrade-tabs" role="tablist" aria-label={copy.upgrades}>
              {visibleUpgradeTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selectedUpgradeTab === tab}
                  className={`upgrade-tab ${selectedUpgradeTab === tab ? "selected" : ""}`}
                  onClick={() => setActiveUpgradeTab(tab)}
                >
                  {copy.upgradeTabs[tab]}
                </button>
              ))}
            </div>
            <div className="upgrade-list" role="tabpanel" aria-label={selectedUpgradeTab ? copy.upgradeTabs[selectedUpgradeTab] : copy.upgrades}>
              {visibleUpgrades.length === 0 && <p className="empty-state">{copy.noVisibleUpgrades}</p>}
              {visibleUpgrades.map((upgrade) => {
                const level = state.save.progression.upgradeLevels[upgrade.id] ?? 0;
                const outcome = canPurchaseUpgrade(
                  state.save.progression.upgradeLevels,
                  state.save.economy.compute,
                  upgrade.id,
                  state.save.run.manualClearsByTier,
                  state.save.prestige.upgradeLevels,
                );
                const price = getUpgradePrice(upgrade.id, level, state.save.prestige.upgradeLevels);
                return (
                  <article className={`upgrade ${level >= upgrade.maxLevel ? "owned" : ""}`} key={upgrade.id}>
                    <div className="upgrade-header">
                      <strong>{upgradeName(copy, upgrade.id)}</strong>
                      <span>{copy.level} {level}/{upgrade.maxLevel}</span>
                    </div>
                    <p className="upgrade-description">{copy.upgradeDescriptions[upgrade.id]}</p>
                    <p>{outcome.ok ? `${copy.next}: ${outcome.price}C` : `${price}C, ${purchaseReason(copy, outcome)}`}</p>
                    <button type="button" onClick={() => dispatch({ type: "purchase", upgradeId: upgrade.id })} disabled={!outcome.ok}>{copy.buy}</button>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </section>

      {pendingConfirmation && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>{pendingConfirmation.type === "reset-board" ? copy.resetBoard : pendingConfirmation.type === "prestige" ? copy.prestige : copy.discardCurrentPuzzle}</h2>
            <p>{pendingConfirmation.type === "reset-board" ? copy.resetConfirmBody : pendingConfirmation.type === "prestige" ? copy.prestigeResetBody : copy.discardConfirmBody}</p>
            <button type="button" onClick={confirmPendingAction}>
              {pendingConfirmation.type === "reset-board" ? copy.resetBoard : pendingConfirmation.type === "prestige" ? copy.prestigeConfirmAction : copy.discardConfirmAction}
            </button>
            <button type="button" onClick={() => setPendingConfirmation(null)}>{copy.cancel}</button>
          </div>
        </div>
      )}

      {state.prestigeOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body prestige-body">
            <h2>{copy.prestige}</h2>
            <div className="prestige-summary">
              <div className="metric"><span>{copy.insight}</span><strong>{formatNumber(state.save.prestige.insight, language)}</strong></div>
              <div className="metric"><span>{copy.lifetimeInsight}</span><strong>{formatNumber(state.save.prestige.lifetimeInsight, language)}</strong></div>
              <div className="metric"><span>{copy.prestigeCount}</span><strong>{formatNumber(state.save.prestige.count, language)}</strong></div>
              <div className="metric"><span>{copy.pendingInsight}</span><strong>{formatNumber(state.save.prestige.pendingInsight, language)}</strong></div>
            </div>
            <p>{copy.prestigeCondition}</p>
            <p>{state.save.prestige.pendingInsight > 0 ? copy.prestigePending(state.save.prestige.pendingInsight) : copy.prestigeNoPending}</p>
            <button
              type="button"
              disabled={state.save.prestige.pendingInsight <= 0}
              onClick={() => {
                dispatch({ type: "set-prestige-open", value: false });
                setPendingConfirmation({ type: "prestige" });
              }}
            >
              {copy.prestigeConfirmAction}
            </button>
            <h3>{copy.permanentUpgrades}</h3>
            <div className="prestige-upgrade-list">
              {PRESTIGE_UPGRADES.map((upgrade) => {
                const level = state.save.prestige.upgradeLevels[upgrade.id] ?? 0;
                const outcome = canPurchasePrestigeUpgrade(state.save.prestige, upgrade.id);
                const price = getPrestigeUpgradePrice(upgrade.id, level);
                return (
                  <article className={`upgrade ${level >= upgrade.maxLevel ? "owned" : ""}`} key={upgrade.id}>
                    <div className="upgrade-header">
                      <strong>{prestigeUpgradeName(copy, upgrade.id)}</strong>
                      <span>{copy.level} {level}/{upgrade.maxLevel}</span>
                    </div>
                    <p className="upgrade-description">{copy.prestigeUpgradeDescriptions[upgrade.id]}</p>
                    <p>{outcome.ok ? `${copy.next}: ${outcome.price} ${copy.insight}` : `${price} ${copy.insight}, ${prestigePurchaseReason(copy, outcome)}`}</p>
                    <button type="button" onClick={() => dispatch({ type: "purchase-prestige", upgradeId: upgrade.id })} disabled={!outcome.ok}>{copy.buy}</button>
                  </article>
                );
              })}
            </div>
            <button type="button" onClick={() => dispatch({ type: "set-prestige-open", value: false })}>{copy.close}</button>
          </div>
        </div>
      )}

      {state.clearResult && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>{copy.clear}</h2>
            <p>{copy.clearSummary(classificationLabel(copy, state.clearResult.classification), state.clearResult.reward)}</p>
            <p>{copy.difficulty} {puzzle.difficulty.score}</p>
            {insightRewardForTier(state.clearResult.tier) > 0 && (
              <p>{state.clearResult.insightEarned ? copy.prestigeEarned(state.clearResult.insightReward) : copy.prestigeManualOnly}</p>
            )}
            {state.clearResult.insightEarned && (
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "dismiss-clear-result" });
                  dispatch({ type: "set-prestige-open", value: true });
                }}
              >
                {copy.prestige}
              </button>
            )}
            <button type="button" onClick={() => startNewPuzzle(false)}>{copy.nextPuzzle}</button>
            <button type="button" onClick={() => dispatch({ type: "dismiss-clear-result" })}>{copy.close}</button>
          </div>
        </div>
      )}

      {state.settingsOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-body">
            <h2>{copy.settings}</h2>
            <label className="setting-field">{copy.theme}
              <select value={theme} onChange={(event) => dispatch({ type: "set-theme", value: event.target.value as SaveDataV1["settings"]["theme"] })}>
                <option value="system">{copy.system}</option>
                <option value="light">{copy.light}</option>
                <option value="dark">{copy.dark}</option>
              </select>
            </label>
            <label className="setting-field">{copy.language}
              <select value={language} onChange={(event) => dispatch({ type: "set-language", value: event.target.value as SaveDataV1["settings"]["language"] })}>
                <option value="en">{copy.english}</option>
                <option value="ja">{copy.japanese}</option>
              </select>
            </label>
            <label className="setting-field">{copy.visualization}
              <select value={state.save.settings.visualization} onChange={(event) => dispatch({ type: "set-visualization", value: event.target.value as SaveDataV1["settings"]["visualization"] })}>
                <option value="on">{copy.on}</option>
                <option value="reduced">{copy.reduced}</option>
                <option value="off">{copy.off}</option>
              </select>
            </label>
            <label className="setting-field setting-range-field">
              <span className="setting-range-header">
                <span>{uiScaleLabel(language)}</span>
                <strong>{Math.round(state.save.settings.uiScale * 100)}%</strong>
              </span>
              <input
                aria-label={uiScaleLabel(language)}
                type="range"
                min={UI_SCALE_MIN}
                max={UI_SCALE_MAX}
                step={UI_SCALE_STEP}
                value={state.save.settings.uiScale}
                onChange={(event) => dispatch({ type: "set-ui-scale", value: Number(event.target.value) })}
              />
            </label>
            <label className="setting-field setting-range-field">
              <span className="setting-range-header">
                <span>{copy.solverLaneHoldTime}</span>
                <strong>{formatMilliseconds(state.save.settings.solverLaneMinSessionMs)}</strong>
              </span>
              <input
                aria-label={copy.solverLaneHoldTime}
                type="range"
                min={SOLVER_LANE_MIN_SESSION_MS_MIN}
                max={SOLVER_LANE_MIN_SESSION_MS_MAX}
                step={SOLVER_LANE_MIN_SESSION_MS_STEP}
                value={state.save.settings.solverLaneMinSessionMs}
                onChange={(event) => dispatch({ type: "set-solver-lane-min-session-ms", value: Number(event.target.value) })}
              />
            </label>
            <label className="setting-field setting-range-field">
              <span className="setting-range-header">
                <span>{copy.solverLaneUpdateInterval}</span>
                <strong>{formatMilliseconds(state.save.settings.solverLanePreviewUpdateMs)}</strong>
              </span>
              <input
                aria-label={copy.solverLaneUpdateInterval}
                type="range"
                min={SOLVER_LANE_PREVIEW_UPDATE_MS_MIN}
                max={SOLVER_LANE_PREVIEW_UPDATE_MS_MAX}
                step={SOLVER_LANE_PREVIEW_UPDATE_MS_STEP}
                value={state.save.settings.solverLanePreviewUpdateMs}
                onChange={(event) => dispatch({ type: "set-solver-lane-preview-update-ms", value: Number(event.target.value) })}
              />
            </label>
            <label className="setting-toggle-row">
              <span>{copy.highContrast}</span>
              <input type="checkbox" checked={state.save.settings.highContrast} onChange={(event) => dispatch({ type: "set-high-contrast", value: event.target.checked })} />
              <span className="switch" aria-hidden="true" />
            </label>
            <label className="setting-toggle-row">
              <span>{copy.notifications}</span>
              <input type="checkbox" checked={state.save.settings.notificationsEnabled} onChange={(event) => dispatch({ type: "set-notifications-enabled", value: event.target.checked })} />
              <span className="switch" aria-hidden="true" />
            </label>
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
            <label className="setting-field">{copy.eraseSave}
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
