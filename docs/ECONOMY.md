# 経済・進行仕様

## 1. 通貨

通常通貨は`Compute`一種類だけとする。小数は使わず、安全な整数として扱う。

JavaScriptの`Number.MAX_SAFE_INTEGER`を超えない範囲をMVPの想定とする。残高または累計が上限へ近づいた場合は上限で飽和させ、UIへ警告を出す。BigInt経済はMVPに含めない。

## 2. 基礎報酬

パズルの基礎報酬は次式とする。

```text
cellReward = usableCellCount * 2
difficultyReward = floor(12 * sqrt(difficultyScore))
baseReward = max(1, cellReward + difficultyReward)
```

クリア区分倍率は以下とする。

```text
Manual    = 3.0
Assisted  = 1.5
Automated = 1.0
```

最終報酬は以下とする。

```text
reward = floor(baseReward * classificationMultiplier)
```

報酬にランダム幅は設けない。

## 3. 初期進行

ゲーム開始時のComputeは0とする。

Tier 0の想定報酬はManualで概ね100〜180C程度になるよう、生成難易度範囲を調整する。

Auto Solverは、プレイヤーがTier 0を数回、Tier 1を数回手動で解いた頃に購入できる価格帯とする。長時間の単純周回を要求しない。

## 4. アップグレード一覧

正確な初期値は`spec/game-config.example.json`を参照する。

### Tier Unlock

各ティアを順番に解禁する。一段飛ばし購入はできない。最大1レベルの個別upgradeとして扱う。

### Placement Scanner

選択ピースの合法配置ハイライトを解禁する。買い切り。

### Contradiction Detector

現在盤面が完了不能か判定する機能を解禁する。買い切り。

### Forced Move

候補が一つしかない配置を自動で一つ置く。買い切り。

### Auto Solver

実探索する自動解法器を解禁する。買い切り。

### Solver Throughput

理論`nodesPerSecond`を増加させる反復upgrade。

```text
nodesPerSecond(level) = baseNodesPerSecond * 1.55^level
price(level) = floor(basePrice * 1.82^level)
```

levelは購入済み回数であり、次購入価格には現在levelを使う。

### Constraint Ordering

MRVを有効にする。買い切り。

### Candidate Ordering

簡易least-constraining-valueを有効にする。買い切り。

### Symmetry Pruning

同型ピース交換による重複探索を削減する。買い切り。

### Dead State Cache

失敗状態キャッシュを解禁する。最初の購入で有効化し、追加レベルで最大エントリ数を増やす。

```text
cacheEntries(level) = 500 * 4^(level - 1)
```

level 0は無効、最大level 5とする。

### Queue Capacity

Auto Queueへ保持できる問題数を増やす。

```text
queueCapacity(level) = level
```

level 0ではキュー機能を使えない。最大level 10。

### Parallel Solvers

論理同時セッション数を増やす。

```text
parallelSessions(level) = 1 + level
```

Auto Solver購入時点では1セッション。最大追加level 3、すなわち最大4セッション。

## 5. 価格曲線

買い切りupgradeは、概ね以下の順序で到達させる。

1. Placement Scanner
2. Tier 1
3. Contradiction Detector
4. Tier 2
5. Forced Move
6. Auto Solver
7. Solver Throughput数レベル
8. Constraint Ordering
9. Tier 3
10. Queue Capacity
11. Symmetry Pruning
12. Candidate Ordering
13. Dead State Cache
14. Parallel Solvers
15. Tier 4、Tier 5

すべての前提条件は設定データへ明示する。UI表示順だけを前提条件として使わない。

## 6. 購入処理

購入可能条件は以下である。

- upgradeが存在する
- 前提upgradeを満たす
- 現在levelが最大未満
- Computeが価格以上ある

購入は残高減算とlevel加算を一つのreducer処理で行い、その直後に保存する。

連打や二重イベントで二重購入しないよう、現在状態から毎回価格と条件を再評価する。

## 7. 自動処理の報酬制御

Auto Queueはパズルを生成し、解けた問題だけ報酬を付与する。

同一seedを意図せず無限周回しない。キュー自動補充時は、tierごとに単調増加する`autoSeedCounter`からseedを生成する。

Cancel、Worker error、Unsatでは報酬を付与しない。

生成器の不具合でUnsatになった場合も通貨補償はMVPでは行わないが、UIに失敗を通知し、次の問題へ進める。

## 8. バランス調整用テレメトリ

外部送信はしない。ローカルの開発モードで以下をJSON出力できるようにする。

- 各パズルのtier、seed、difficulty
- 手動所要時間
- solver nodes、backtracks、wall time
- reward
- upgrade購入時点の累計クリア数と総獲得Compute

本番UIに常設する必要はない。開発者コンソールまたはDebug panelでよい。

## 9. 意図的に避ける設計

手動操作に毎回通貨を消費させない。

Undoをupgradeにしない。

Auto Solverの処理速度を実時間待機だけで偽装しない。

手動クリア倍率を、Auto Solverを最後だけ止めることで得られないようにする。

購入価格を毎フレーム再計算して浮動小数誤差を蓄積させない。式から整数へ丸める。
