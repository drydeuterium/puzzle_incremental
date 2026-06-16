# puzzle_incremental

`puzzle_incremental` は、テトロミノ配置パズルにインクリメンタルゲームの成長要素を組み合わせた、ブラウザだけで動く React/Vite 製ゲームです。

盤面上の使えるセルを、用意されたテトロミノで重複なくすべて埋めるとクリアです。クリア報酬として `Compute` を獲得し、より高い Tier、ヒント系機能、矛盾検出、強制手、自動ソルバー、ソルバー高速化などを解放していきます。

## 公開ページ

GitHub Pages での公開を想定しています。

https://drydeuterium.github.io/puzzle_incremental/

現在は開発中です。ゲームバランス、UI、アップグレード内容は今後変わる可能性があります。

## 遊び方

1. 左側のピース一覧からピースを選びます。
2. 盤面のセルをクリックして配置します。
3. すべての有効セルをちょうど一度ずつ埋めるとクリアです。
4. 獲得した `Compute` を使ってアップグレードを購入します。
5. Tier を解放すると、より大きく複雑な盤面に挑戦できます。

主な操作:

- 左回転: `左回転` ボタン、左矢印キー、`A`、盤面上で上方向スクロール
- 右回転: `右回転` ボタン、右矢印キー、`D`、盤面上で下方向スクロール
- 配置済みピースの取り外し: ピースを選んで `ピースを外す`、または盤面上で右クリック
- やり直し: `元に戻す`
- 最初から: `やり直す`
- ヒント: `Placement Scanner` 解放後に使用可能
- 検査: `Contradiction Detector` 解放後に使用可能
- 強制手: `Forced Move` 解放後に使用可能

## 成長要素

クリア報酬はプレイ内容によって分類されます。

- 手動クリア: 報酬が高い
- 補助クリア: ヒントや検査などを使ったクリア
- 自動クリア: 自動ソルバーによるクリア。初期報酬は低めで、`Solver Payout` で改善できます。

アップグレードで解放できる主な要素:

- `Tier 1` から `Tier 5`: 新しい難度帯
- `Placement Scanner`: 置ける候補を探す
- `Contradiction Detector`: 現在の局面が解けるか検査する
- `Forced Move`: 必ず必要になる配置を探す
- `Auto Solver`: Web Worker 上で実際にバックトラック探索を走らせる
- `Solver Throughput`: 自動ソルバーの探索速度を上げる
- `Solver Payout`: 自動クリア報酬を改善する
- `Constraint Ordering` など: ソルバーの探索効率を改善する
- `Parallel Solvers`: 自動ソルバーを並列に走らせる

## 自動ソルバー

自動ソルバーは報酬タイマーではなく、パズルを実際に探索して解きます。

`Auto Solver` を購入しただけでは、すべての Tier ですぐ使えるわけではありません。対象 Tier を手動で 5 回クリアすると、その Tier の自動ソルバーが解放されます。

自動ソルバーには `自動 Tier` があります。プレイヤーが手動で解いている Tier とは独立しているため、手動プレイ中に別 Tier へ切り替えても、実行中の自動ソルバーや `自動次パズル` は止まりません。自動 Tier を今の選択 Tier に合わせたい場合は、ソルバー欄の `現在の Tier にする` を押します。

## セーブと設定

進行状況はブラウザの `localStorage` に保存されます。サーバーやアカウントは使いません。

設定画面からできること:

- セーブの出力と読み込み
- セーブ削除
- 表示言語の切り替え: 日本語 / English
- テーマ切り替え
- 高コントラスト表示
- ソルバー可視化の切り替え
- 購入済みアップグレードの非表示切り替え

セーブ削除には `ERASE` の入力が必要です。

## ローカル実行

```bash
npm ci
npm run dev
```

開発サーバーがローカル URL を表示します。Vite の SPA として動作し、進行状況はブラウザに保存されます。

## ビルド

```bash
npm run build
```

成果物は `dist` に出力されます。

GitHub Pages のようなサブパス配信では、`VITE_BASE_PATH` を指定します。

```bash
VITE_BASE_PATH=/puzzle_incremental/ npm run build
```

`.github/workflows/deploy.yml` では、リポジトリ名に合わせて以下のようにビルドします。

```bash
VITE_BASE_PATH=/${{ github.event.repository.name }}/
```

GitHub Pages の Source は `GitHub Actions` に設定してください。

## テスト

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:e2e
```

Playwright のブラウザが未インストールの場合:

```bash
npx playwright install chromium
```

## 現在の制限

- パズル生成は決定的なバックトラックで行いますが、一意解は保証していません。
- サーバー、アカウント、オンラインランキング、クラウドセーブ、PWA、音声、エディタ、URL 共有、プレステージ、外部テレメトリはまだありません。
- ゲームバランス、アップグレード順、UI 文言は調整中です。
