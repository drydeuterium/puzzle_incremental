# アルゴリズム仕様

## 1. 座標と形状

座標系は左上を `(0, 0)` とし、右方向を+x、下方向を+yとする。

各ピース向きは原点正規化されたセル座標集合で表す。最小xと最小yが0になるよう平行移動し、座標を`y, x`順にソートして正規形文字列を作る。回転後に同じ正規形となる向きは除外する。

ピース型の基準形状は以下とする。

```text
I: ####

O: ##
   ##

T: ###
    .#

L: #.
   #.
   ##

J: .#
   .#
   ##

S: .##
   ##.

Z: ##.
   .##
```

`.`は空白である。回転は許可し、鏡映は行わない。

## 2. パズル生成の不変条件

生成されたパズルは必ず少なくとも一つの完全解を持つ。

これを保証するため、最初に盤面をピースで完全充填し、その配置を隠して問題として出力する。完全ランダムなピース集合を先に作って解けるか試す方式を主方式にしない。

生成結果には`constructionSolution`をデバッグ用途で保持してよいが、本番の通常状態やUIへ露出しない。難易度測定とプレイはconstructionSolutionを利用してはならない。

## 3. 生成手順

1. tier設定から幅、高さ、ブロックセル数を得る。
2. seed付きPRNGでブロック形状候補を作る。
3. 使用可能セル数が4の倍数であることを確認する。
4. 未充填の使用可能セルから、候補数が少ないセルを選ぶ。
5. そのセルを含む全テトロミノ型・向き・位置の候補を列挙する。
6. 候補順をseed付きPRNGでshuffleする。
7. 候補を一つ置き、再帰する。
8. 行き止まりなら戻る。
9. 全セルが埋まったら、置かれた各テトロミノをピース個体として抽出する。
10. ピース個体順をshuffleする。
11. 固定基準ソルバで再度解けることを検証する。
12. 難易度を測定し、tierの許容範囲外なら別候補を作る。

生成探索には上限を設ける。1試行あたり100,000ノードを初期値とし、超過したらその形状を破棄する。パズル全体で50試行を超えたらフォールバック問題を使用する。

## 4. ブロック形状

Tier 0〜2は長方形のみとする。

Tier 3以降は、4セル単位のブロック形状を使用できる。初期MVPでは次のテンプレート方式でよい。

- 四隅から2×2を一つ除く
- 中央付近の2×2を一つ除く
- 対称な2×2を二つ除く
- 外周から1×4または4×1を除く
- 既存テンプレートを回転・反転して使う

ブロックセルテンプレート自体の鏡映は許可する。ピース鏡映禁止とは別の規則である。

使用可能領域が4近傍で二つ以上に分断される形状はMVPでは棄却する。

## 5. 候補配置の列挙

各ピース個体について、各固有向きと盤面上のアンカー座標を走査し、以下を満たす配置だけを候補にする。

- 全セルが盤面内
- 全セルが使用可能
- 同一配置内に重複セルがない

候補配置は、占有セルbitmask、piece index、orientation index、anchorを持つ。

MVPの最大盤面は64セルなので、占有セルは`bigint` bitmaskで表現してよい。永続化やJSON通信時はセルindex配列へ変換する。Workerへ送るPuzzleDefinitionはJSON互換に保ち、Worker内部でbitmaskを構築する。

## 6. 解法

基本ソルバは制約充足型の深さ優先探索とする。

制約は以下である。

- 各使用可能セルを一度だけ覆う
- 各ピース個体を一度だけ使う

探索状態は、occupied cell mask、used piece mask、選択済み配置列、探索スタックからなる。

候補選択にはMRVを使う。未充填セルごとに、現在使用可能な候補配置数を数え、最小のセルを選ぶ。候補数0なら即時バックトラックする。同数ならセルindexが小さい方を選び、結果を決定論的にする。

選択したセルを含み、未使用ピースで、occupied maskと衝突しない配置を順番に試す。

候補順は、基準ソルバでは固定順とする。プレイヤー用ソルバではアップグレードによって順序付けを変更できる。

## 7. Incremental Solver

同期的な再帰関数だけで実装せず、探索スタックを明示的な配列として保持し、`step(nodeBudget)`で中断・再開可能にする。

概念的なframeは以下を持つ。

```ts
type SearchFrame = {
  constraintCell: number;
  candidates: readonly CandidateId[];
  nextCandidateIndex: number;
  appliedCandidateId: CandidateId | null;
};
```

`step`は以下のいずれかを返す。

```ts
type StepResult =
  | { status: "running"; consumedNodes: number }
  | { status: "solved"; consumedNodes: number; solution: Placement[] }
  | { status: "unsat"; consumedNodes: number };
```

一つの候補を試すたびに1ノード消費とする。候補0による即時戻りはbacktrackには数えるがnodeには数えなくてよい。実装内で定義を統一し、テストで固定する。

Pauseは探索状態を保持する。Cancelは破棄する。

## 8. ソルバアップグレード

`Auto Solver`解禁直後は、固定セル順、キャッシュなしの単純バックトラッキングでもよい。ただし基礎実装からMRVを使う場合、アップグレードは以下のように効果を変える。

`Constraint Ordering` はMRVを有効にする。未購入時は最小indexの未充填セルを選ぶ。

`Candidate Ordering` は、置いた後に残り候補数を減らしすぎない配置を先に試す簡易least-constraining-valueを有効にする。

`Dead State Cache` は失敗状態をキャッシュする。キーは`occupiedMask`と`usedPieceMask`の組とする。上限を超えたら古いエントリから削除する簡易FIFOでよい。

`Symmetry Pruning` は同型未使用ピースのうち最小index個体だけを代表として試す。同型個体の交換による重複探索を削減する。

これらは結果の正しさを変えず、探索ノード数だけを変える。

## 9. 難易度測定

難易度は、プレイヤーのアップグレードから独立した固定基準ソルバで測る。

基準ソルバ設定は以下とする。

- MRV有効
- Candidate Ordering無効
- Dead State Cache無効
- Symmetry Pruning有効
- 候補順は固定
- constructionSolution不使用

測定値は以下とする。

- solutionNodes
- backtracks
- maxDepth
- forcedRatio
- initialBranching

`forcedRatio`は解経路上で候補数1だった深さの割合である。

難易度スコアは次式を基準とする。

```text
raw =
  log10(solutionNodes + 1) * 100
  + log10(backtracks + 1) * 60
  + maxDepth * 2
  + initialBranching * 5
  - forcedRatio * 40

difficultyScore = max(1, round(raw))
```

生成候補が基準ソルバで200万ノードを超えた場合はMVP上限超過として棄却してよい。測定上限は設定ファイルで変更可能にする。

## 10. 報酬の難易度参照

報酬計算はsolutionNodesそのものではなくdifficultyScoreを使う。極端な探索量が通貨を破壊しないよう平方根と対数で圧縮する。正確な式は`docs/ECONOMY.md`に従う。

## 11. Contradiction Detector

現在の手動配置を固定条件として、残り問題を基準ソルバで一つ解こうとする。

最大判定ノード数は100,000とする。

解が見つかった場合は`No contradiction found`と表示する。

全探索して解なしなら`This position cannot be completed`と表示する。

上限到達時は`Inconclusive`とし、解なしと断定しない。

## 12. Forced Move

現在状態で、未充填セルまたは未使用ピースに関する合法候補が一つだけなら、その候補を配置する。

候補が複数あるが、全解に共通する配置を深い探索で求める機能はMVPに含めない。

候補が一つもない場合はContradiction扱いとして警告する。

## 13. 再現性

同一のgame config version、tier、seedからは、同一の盤面形状、ピース個体集合、候補順、難易度スコアを生成する。

生成アルゴリズムを将来変更する場合は`generatorVersion`を上げる。保存中のパズルにはgeneratorVersionを記録し、古いバージョンを再現できない場合は盤面定義そのものを保存して復元する。
