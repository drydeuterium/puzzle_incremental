# 技術設計

## 1. 技術スタック

- Vite
- React
- TypeScript
- CSS Modulesまたは通常のCSS。CSS-in-JSは使わない
- Vitest
- React Testing Library
- Playwright
- Web Worker
- localStorage

依存ライブラリは最小限にする。状態管理ライブラリ、UIコンポーネントライブラリ、ドラッグ専用ライブラリは、標準APIで実装困難な理由がない限り追加しない。

Node.jsとパッケージのバージョンは、実装時点のVite公式テンプレートが生成する安定版を使い、`package-lock.json`をコミットする。

## 2. 設計原則

パズルの正しさ、生成、探索、報酬計算はReactから独立した純粋なTypeScriptモジュールへ置く。

UIはドメイン状態を直接書き換えず、actionまたはservice関数を介して変更する。

Web Workerとの通信型は共有定義を持ち、`any`を使わない。

乱数はseed付きPRNGだけを使う。ゲームロジック内で`Math.random()`を直接呼ばない。

現在時刻はservice経由で取得し、テスト時に差し替えられるようにする。

バランス値は設定オブジェクトへ集約し、Reactコンポーネントやsolverへ散在させない。

## 3. 推奨ディレクトリ

```text
src/
  app/
    App.tsx
    appReducer.ts
    appActions.ts
    selectors.ts

  core/
    coordinates.ts
    tetrominoes.ts
    orientation.ts
    placement.ts
    board.ts
    puzzle.ts
    validation.ts
    prng.ts
    generator.ts
    difficulty.ts
    rewards.ts

  solver/
    candidateIndex.ts
    searchState.ts
    incrementalSolver.ts
    heuristics.ts
    transpositionCache.ts
    solverProtocol.ts

  workers/
    solver.worker.ts
    workerClient.ts

  game/
    upgrades.ts
    progression.ts
    queue.ts
    clearClassification.ts
    statistics.ts
    config.ts

  persistence/
    schema.ts
    migrate.ts
    saveRepository.ts
    importExport.ts

  components/
    Board/
    PieceTray/
    Controls/
    SolverPanel/
    UpgradePanel/
    Header/
    Modal/
    Toast/

  hooks/
    useAutosave.ts
    useSolverWorker.ts
    useKeyboardControls.ts

  styles/
    globals.css
    tokens.css

  test/
    fixtures/
    generators/

public/
  fallback-puzzles.json

.github/
  workflows/
    deploy.yml
```

実際の分割は変更してよいが、`core`と`solver`をUI非依存に保つこと。

## 4. 状態の分離

永続状態と一時状態を分離する。

永続状態には、通貨、購入済みアップグレード、統計、設定、現在パズルの復元情報を含める。

一時状態には、ドラッグ位置、hoverセル、モーダル開閉、トースト、毎フレーム変わるソルバ可視化、Worker接続状態を含める。

探索スタック全体はlocalStorageへ保存しない。ページ再読み込み後、Automated対象のパズルは同じseedから再生成し、探索を最初から再開する。MVPでは探索途中の完全復元を要件としない。

## 5. Core API

最低限、以下に相当するAPIを持たせる。

```ts
generatePuzzle(input: GeneratePuzzleInput): PuzzleDefinition

enumerateOrientations(type: TetrominoType): readonly Orientation[]

enumeratePlacements(
  puzzle: PuzzleDefinition,
  piece: PieceInstance
): readonly Placement[]

canPlace(
  board: BoardState,
  placement: Placement
): PlacementValidation

applyPlacement(
  board: BoardState,
  placement: Placement
): BoardState

removePiece(
  board: BoardState,
  pieceId: PieceId
): BoardState

isSolved(
  puzzle: PuzzleDefinition,
  board: BoardState
): boolean

createSolver(
  puzzle: PuzzleDefinition,
  options: SolverOptions
): IncrementalSolver

measureDifficulty(
  puzzle: PuzzleDefinition
): DifficultyMeasurement

calculateReward(
  puzzle: PuzzleDefinition,
  classification: ClearClassification
): number
```

純粋関数は入力を変更しない。盤面サイズが小さいため、不変データのコピーコストを過度に最適化しない。ただしsolver内部だけは性能のためmutable構造を使ってよい。

## 6. UI状態管理

Reactの`useReducer`を基準とする。App全体のactionは判別可能unionにする。

通貨付与とアップグレード購入は一つのreducer action内で原子的に行う。購入時に残高が負にならないことをreducer側でも検証する。

Workerから届くメッセージは、request/session IDを照合して古いセッションの結果を無視する。

## 7. Workerプロトコル

メインスレッドからWorkerへ送る代表メッセージは以下とする。

```ts
type WorkerRequest =
  | { type: "START"; sessionId: string; puzzle: PuzzleDefinition; options: SolverOptions }
  | { type: "PAUSE"; sessionId: string }
  | { type: "RESUME"; sessionId: string }
  | { type: "CANCEL"; sessionId: string }
  | { type: "UPDATE_BUDGET"; sessionId: string; nodesPerSecond: number }
  | { type: "SET_VISUALIZATION"; mode: "on" | "reduced" | "off" };
```

Workerからの代表メッセージは以下とする。

```ts
type WorkerResponse =
  | { type: "STARTED"; sessionId: string }
  | { type: "PROGRESS"; sessionId: string; stats: SolverStats; placements?: Placement[] }
  | { type: "SOLVED"; sessionId: string; stats: SolverStats; solution: Placement[] }
  | { type: "UNSAT"; sessionId: string; stats: SolverStats }
  | { type: "ERROR"; sessionId?: string; code: string; message: string };
```

メッセージ受信時に最低限のruntime validationを行う。外部入力ではないため重いschema libraryは不要である。

## 8. 描画

盤面はCSS Gridを基本とする。Canvasは使わない。

各ピースは、占有セルへ共通の`pieceId`とCSS custom propertyを付けて描画する。色はピース型または個体から決定論的に割り当てる。

探索可視化は通常盤面と同じセルグリッド上へabsolute overlayとして描画する。DOM更新頻度を10fps以下に制限する。

## 9. GitHub Pages

Viteの出力先は標準の`dist`とする。

リポジトリ名配下へ配信する場合、Viteの`base`を`/<repository-name>/`へ設定する。ユーザーサイトまたは独自ドメインなら`/`を使う。

実装では環境変数 `VITE_BASE_PATH` があればそれを使い、なければ`/`とする構成を推奨する。

GitHub PagesのSourceはGitHub Actionsを選び、`templates/deploy.yml`を実リポジトリの`.github/workflows/deploy.yml`へ移す。

SPAルーティングを使わないため、404 fallbackは不要である。

## 10. 性能目標

一般的なデスクトップブラウザで以下を満たす。

- 手動操作時、長いメインスレッドブロックを100ms以上発生させない
- Solver動作中も入力とスクロールが応答する
- 探索可視化Onで平均30fps以上、Reduced/Offで50fps以上を目標にする
- localStorage保存データを1MB未満に保つ
- Tier 0〜3のパズル生成を通常500ms以内に終える
- 生成または難易度測定が重い場合はWorkerへ移してよい

## 11. エラーハンドリング

Worker内部例外は捕捉し、`ERROR`メッセージに変換する。メインスレッドでWorkerを再生成できるようにする。

セーブ読み込み失敗時は破損データを`corrupt-save-<timestamp>`キーへ退避し、新規ゲームを開始する。黙って上書きしない。

生成器が解なし問題を返した場合は重大な不変条件違反として扱う。seed、tier、ピース集合、盤面形状をログへ残す。
