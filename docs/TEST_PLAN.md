# テスト計画

## 1. 方針

ゲームロジックの正しさをUIテストへ依存させない。`core`と`solver`は大半をunit/property testで検証する。

乱数を使うテストはseedを固定し、失敗時にseedを出力する。

## 2. Unit Test

### テトロミノ

- 各型の固有向き数が正しい
- 各向きが4セルを持つ
- 正規化後に負座標がない
- 回転4回で元の正規形へ戻る
- 鏡映を暗黙に追加していない

### 配置

- 盤面外を拒否する
- ブロックセルを拒否する
- 重複を拒否する
- 合法配置を受理する
- apply後に元stateを変更しない
- remove後に他ピースを変更しない

### クリア判定

- 全セル充填かつ全ピース使用でtrue
- 空セルがあればfalse
- 未使用ピースがあればfalse
- 不正な重複状態をtrueにしない

### PRNG

- 同seedで同列
- 異なるseedで通常異なる列
- shuffleが入力配列を変更しない

### 報酬

- 同一入力で決定論的
- Manual > Assisted > Automated
- 0以下にならない
- safe integer範囲を超えない

### Upgrade

- 前提未達では購入不可
- 資金不足では購入不可
- 最大level超過不可
- 購入後残高とlevelが正しい
- 二重dispatchでも負残高にならない

## 3. Generator Test

Tierごとに最低1,000 seedを生成するテストを、通常CIでは縮小版100 seed、nightlyまたはローカルstressでは1,000 seedで実行する。

各生成物について以下を検証する。

- 使用可能セル数 = ピース数×4
- すべてのピースが4セル型
- constructionSolutionが盤面を完全充填
- 独立した基準ソルバが解を発見
- 同seedでdeep equal
- 生成時間と探索上限を超過していない
- difficultyScoreが有限で1以上

フォールバック問題も独立solverで検証する。

## 4. Solver Test

小さな手書きfixtureを用意する。

- 唯一解
- 複数解
- 解なし
- 同型ピース複数
- ブロックセルあり
- 最後の一手だけ残った状態

各fixtureについて、同期参照solverとincremental solverの結果を比較する。

`step(1)`を繰り返した結果と`step(10000)`一回の結果が同じ解状態になることを確認する。

Pause中に進捗が変わらないこと、Resumeで継続すること、Cancel後に結果が来ないことを確認する。

MRV、cache、symmetry pruningの有無で、解の有無が変化しないことを確認する。

## 5. Save Test

- 新規save生成
- 保存と読み込みのround trip
- backupから復旧
- parse不能データの退避
- 未知versionの拒否
- 負数、NaN、Infinity、過大levelの拒否
- currentPuzzleの配置復元
- cleared puzzleの二重報酬防止
- import前backup

## 6. React Component Test

- Compute表示
- upgrade購入可否
- disabled理由
- ピース選択と回転
- Undo/Redo
- clear modal
- Assisted/Automatedへの分類遷移
- Worker progressの表示
- 古いsessionIdのメッセージ無視
- settings反映

## 7. Playwright E2E

最低限、以下のシナリオを実装する。

### Fresh Start Manual Clear

新規状態でTier 0を開始し、fixtureまたは既知seedを手動配置してクリアする。Manual倍率の報酬が付く。

### Assisted Clear

Scannerを開発用に解禁したfixture状態から使用し、クリア分類がAssistedになる。

### Automated Clear

Auto Solverを解禁したfixture状態から開始し、Workerが解を返し、Automated報酬が一度だけ付く。

### Persistence

upgrade購入後にreloadし、残高、level、現在盤面が復元する。

### GitHub Pages Base Path

`base`がサブパスでもJS、CSS、Workerが読み込まれる。PlaywrightのbaseURLまたはpreview設定でサブパス相当を検証する。

## 8. 手動確認

- Chrome、Firefox、Edgeの現行版
- デスクトップ横幅1280px
- モバイル相当幅390px
- マウス操作
- タッチエミュレーション
- キーボードのみ
- prefers-reduced-motion
- localStorage無効または容量不足
- WorkerをDevToolsで停止した場合の復旧
- ページを非表示にして戻した時の保存

## 9. CI完了条件

Pull Requestとmain pushで以下を実行する。

```text
npm ci
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

E2Eはmain pushまたは専用workflowでもよいが、最終納品前に必ず通す。

console error、Unhandled Promise Rejection、TypeScript errorを残さない。
