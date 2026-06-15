# Codex向け総合指示

このリポジトリに、仕様書で定義された`puzzle_incremental`のMVPを実装せよ。

## 行動規則

最初に以下をすべて読むこと。

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/UX_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/ALGORITHMS.md`
- `docs/ECONOMY.md`
- `docs/SAVE_AND_COMPATIBILITY.md`
- `docs/TEST_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/NON_GOALS.md`
- `spec/game-config.example.json`
- `spec/domain-types.ts`
- `codex/IMPLEMENTATION_TASKS.md`

不明点があっても、MVPの範囲内で合理的に決め打ちして作業を進める。仕様の優先順位は`README.md`に従う。

実装前に、短い作業計画を`IMPLEMENTATION_STATUS.md`へ作成する。その後、各milestoneの完了状況、残課題、テスト結果を同ファイルへ更新する。

## 必須技術

- Vite
- React
- TypeScript strict mode
- Web Worker
- Vitest
- React Testing Library
- Playwright
- localStorage
- GitHub ActionsによるGitHub Pages deploy

Viteの公式React TypeScriptテンプレートを基礎にする。パッケージは実装時点の安定版を使い、lockfileを生成する。

## 実装上の制約

ゲームロジックをReactから分離する。

パズル生成とソルバはseedに対して決定論的にする。

Auto Solverは実探索する。setIntervalで通貨を増やすだけの代替実装は禁止する。

Solverは明示的stackを持つincremental implementationとし、任意のnode budgetで中断・再開可能にする。

重い探索はWorker内で実行し、メインスレッドを塞がない。

ゲーム生成に`Math.random()`を使わない。

core、solver、persistenceに`any`を使わない。

バランス値は`src/game/config.ts`等へ集約し、`spec/game-config.example.json`を初期値として反映する。

MVP対象外の機能を追加しない。

## 実装の進め方

`codex/IMPLEMENTATION_TASKS.md`のmilestone順に進める。

各milestoneごとに、関連テストを追加してから次へ進む。

途中で設計変更が必要になった場合は、理由と仕様との差分を`IMPLEMENTATION_STATUS.md`へ書く。受入条件を弱める変更は禁止する。

## 最終確認

以下を実行し、成功させる。

```bash
npm ci
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:e2e
```

環境上E2Eブラウザを導入できない場合でも、Playwright test自体と設定を完成させ、実行できなかった理由を記録する。他のテストとbuildは必ず通す。

GitHub PagesのサブパスでWorker URLが壊れないことを確認する。

最終的なREADMEへ以下を書く。

- ゲーム概要
- ローカル起動
- build
- test
- GitHub Pages設定
- セーブ仕様
- 既知の制限

最後に`IMPLEMENTATION_STATUS.md`へ、実装済み機能、テスト結果、未達項目を正直に記載する。未達を完了扱いにしない。
