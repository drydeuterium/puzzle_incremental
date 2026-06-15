# 実装タスク

## Milestone 0 — 初期化

- Vite React TypeScriptプロジェクトを作る
- strict TypeScript、ESLint、Vitest、Testing Library、Playwrightを設定する
- CSS tokenと基本レイアウトを作る
- `game-config.example.json`をTypeScript configへ移す
- GitHub Pages用base pathとActionsを設定する
- `IMPLEMENTATION_STATUS.md`を作る

完了条件は、空のアプリがlint、typecheck、unit test、buildを通ること。

## Milestone 1 — Core Model

- 座標、テトロミノ型、回転、正規化
- PuzzleDefinition
- BoardState
- 配置候補列挙
- canPlace、apply、remove
- clear判定
- seed付きPRNG
- unit test

完了条件は、手書きfixtureをコード上で配置して正しくclear判定できること。

## Milestone 2 — Manual Puzzle UI

- Board
- Piece Tray
- ピース選択
- click/tap配置
- drag移動
- 回転
- remove
- Undo/Redo/Reset
- キーボード操作
- レスポンシブ表示
- Manual分類
- component test

完了条件は、固定Tier 0 fixtureをブラウザ上で手動クリアできること。

## Milestone 3 — Generator and Difficulty

- 充填から逆生成するgenerator
- tier設定
- ブロックテンプレート
- construction solution検証
- 固定基準solver
- difficulty measurement
- fallback puzzle
- seed表示とcopy
- Daily Seed
- generator stress test

完了条件は、Tier 0〜5をseedから決定論的に生成し、独立solverで解けること。

## Milestone 4 — Economy and Progression

- Compute
- reward calculation
- upgrade model
- prerequisite
- purchase
- tier unlock
- Statistics
- clear result UI
- Assisted分類
- upgrade test

完了条件は、新規状態から手動クリアと購入によりTier 1へ進めること。

## Milestone 5 — Incremental Solver

- 明示的探索stack
- step(nodeBudget)
- solver stats
- pause/resume/cancel
- MRV option
- candidate ordering option
- symmetry pruning option
- dead-state cache option
- synchronous referenceとの比較test

完了条件は、同一fixtureで小刻みstepと一括stepが同じsolved/unsat判定を返すこと。

## Milestone 6 — Worker and Auto Solver

- Worker protocol
- Worker client
- session ID
- node budget scheduling
- progress throttling
- visualization overlay
- Start/Pause/Resume/Cancel UI
- Automated分類
- completion reward deduplication
- stale message rejection
- Worker error recovery

完了条件は、Worker動作中にUIが応答し、Tier 0問題を解いて一度だけ報酬を得ること。

## Milestone 7 — Solver Upgrades and Queue

- Solver Throughput
- Constraint Ordering
- Candidate Ordering
- Symmetry Pruning
- Dead State Cache
- Queue Capacity
- Parallel Solvers
- autoSeedCounter
- queue auto refill
- Solver panel
- statistics

完了条件は、upgradeがWorker optionと処理予算へ反映され、最大4論理セッションが動くこと。

## Milestone 8 — Hints

- Placement Scanner
- Contradiction Detector
- Forced Move
- Assisted classification lock
- inconclusive判定
- UI説明

完了条件は、各支援を一度使用すると、その盤面がManualへ戻らないこと。

## Milestone 9 — Persistence

- schema v1
- validation
- autosave
- backup
- corrupt recovery
- migration dispatcher
- Import/Export
- Erase Save
- current puzzle restore
- save tests

完了条件は、reload後に進行と途中盤面を復元し、クリア報酬が重複しないこと。

## Milestone 10 — Polish and Delivery

- onboardingの短い説明
- Settings
- Stats
- reduced motion
- high contrast
- error boundaries
- toast
- E2E
- README
- GitHub Pages deploy確認
- performance確認
- 最終Acceptance Criteria確認

完了条件は、`docs/ACCEPTANCE_CRITERIA.md`を項目ごとに確認し、未達がないこと。未達がある場合はMVP完成と宣言しない。
