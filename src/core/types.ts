export type TetrominoType = "I" | "O" | "T" | "L" | "J" | "S" | "Z";
export type PieceId = string;
export type PuzzleId = string;
export type SolverSessionId = string;
export type ClearClassification = "manual" | "assisted" | "automated";

export type Cell = Readonly<{
  x: number;
  y: number;
}>;

export type Orientation = Readonly<{
  index: number;
  cells: readonly Cell[];
  width: number;
  height: number;
  canonicalKey: string;
}>;

export type PieceInstance = Readonly<{
  id: PieceId;
  type: TetrominoType;
}>;

export type Placement = Readonly<{
  pieceId: PieceId;
  pieceType: TetrominoType;
  orientationIndex: number;
  anchor: Cell;
  cellIndices: readonly number[];
}>;

export type DifficultyMeasurement = Readonly<{
  score: number;
  solutionNodes: number;
  backtracks: number;
  maxDepth: number;
  forcedRatio: number;
  initialBranching: number;
  capped: boolean;
}>;

export type PuzzleDefinition = Readonly<{
  id: PuzzleId;
  generatorVersion: number;
  tier: number;
  seed: string;
  width: number;
  height: number;
  usableCellIndices: readonly number[];
  blockedCellIndices: readonly number[];
  pieces: readonly PieceInstance[];
  difficulty: DifficultyMeasurement;
  constructionSolution?: readonly Placement[];
}>;

export type BoardState = Readonly<{
  placementsByPieceId: Readonly<Record<PieceId, Placement>>;
}>;

export type PlacementValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "outside" | "blocked" | "overlap" | "unknown-piece" }>;

export type SolverHeuristics = Readonly<{
  constraintOrdering: boolean;
  candidateOrdering: boolean;
  symmetryPruning: boolean;
  deadStateCacheEntries: number;
  isolatedRegionPruning: boolean;
  zeroCandidatePruning: boolean;
  colorBalancePruning: boolean;
  partialBoardCacheEntries: number;
}>;

export type SolverOptions = Readonly<{
  nodesPerSecond: number;
  heuristics: SolverHeuristics;
  visualization: "on" | "reduced" | "off";
}>;

export type SolverStats = Readonly<{
  status: "idle" | "running" | "paused" | "solved" | "unsat" | "cancelled" | "error";
  nodes: number;
  backtracks: number;
  maxDepth: number;
  currentDepth: number;
  measuredNodesPerSecond: number;
  elapsedMilliseconds: number;
}>;

export type StepResult =
  | Readonly<{ status: "running"; consumedNodes: number; stats: SolverStats; preview: readonly Placement[] }>
  | Readonly<{ status: "solved"; consumedNodes: number; stats: SolverStats; solution: readonly Placement[] }>
  | Readonly<{ status: "unsat"; consumedNodes: number; stats: SolverStats }>;

export type UpgradeId =
  | "placement-scanner"
  | "contradiction-detector"
  | "forced-move"
  | "auto-solver"
  | "solver-throughput"
  | "solver-payout"
  | "constraint-ordering"
  | "candidate-ordering"
  | "symmetry-pruning"
  | "dead-state-cache"
  | "isolated-region-pruning"
  | "zero-candidate-pruning"
  | "color-balance-pruning"
  | "partial-board-cache"
  | "parallel-solvers"
  | "tier-1"
  | "tier-2"
  | "tier-3"
  | "tier-4"
  | "tier-5"
  | "tier-6"
  | "tier-7"
  | "tier-8"
  | "tier-9";

export type UpgradeState = Readonly<Record<UpgradeId, number>>;

export type PrestigeUpgradeId =
  | "reward-analysis"
  | "solver-foundation"
  | "tier-compression";

export type PrestigeUpgradeState = Readonly<Record<PrestigeUpgradeId, number>>;

export type PrestigeState = Readonly<{
  insight: number;
  lifetimeInsight: number;
  count: number;
  pendingInsight: number;
  upgradeLevels: PrestigeUpgradeState;
}>;

export type RunState = Readonly<{
  startedAt: string;
  manualClearsByTier: Readonly<Record<string, number>>;
  clearsByTier: Readonly<Record<string, number>>;
  highestTier: number;
}>;

export type UserSettings = Readonly<{
  visualization: "on" | "reduced" | "off";
  animationSpeed: number;
  highContrast: boolean;
  theme: "system" | "light" | "dark";
  language: "en" | "ja";
  notificationsEnabled: boolean;
  tutorialCompleted: boolean;
  hidePurchasedUpgrades: boolean;
  solverLaneMinSessionMs: number;
  solverLanePreviewUpdateMs: number;
  uiScale: number;
}>;

export type Statistics = Readonly<{
  totalClears: number;
  manualClears: number;
  assistedClears: number;
  automatedClears: number;
  clearsByTier: Readonly<Record<string, number>>;
  manualClearsByTier: Readonly<Record<string, number>>;
  lifetimeSolverNodes: number;
  lifetimeBacktracks: number;
  automatedCellsSolved: number;
  fastestManualClearMilliseconds: number | null;
  maximumDifficultyScore: number;
  startedAt: string;
  lastSavedAt: string;
}>;

export type SavedPlacement = Readonly<{
  pieceId: PieceId;
  orientationIndex: number;
  anchor: Cell;
}>;

export type SavedPuzzle = Readonly<{
  definition: PuzzleDefinition;
  placements: readonly SavedPlacement[];
  classification: ClearClassification;
  startedAt: string;
  elapsedMilliseconds: number;
  cleared: boolean;
}>;

export type SaveDataV1 = Readonly<{
  schemaVersion: 1;
  gameConfigVersion: string;
  generatorVersion: number;
  createdAt: string;
  updatedAt: string;
  economy: Readonly<{
    compute: number;
    lifetimeCompute: number;
  }>;
  progression: Readonly<{
    upgradeLevels: UpgradeState;
    selectedTier: number;
    autoSeedCounters: Readonly<Record<string, number>>;
  }>;
  prestige: PrestigeState;
  run: RunState;
  currentPuzzle: SavedPuzzle | null;
  statistics: Statistics;
  settings: UserSettings;
}>;
