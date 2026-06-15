# MVP受入条件

以下をすべて満たした時点でMVP完成とする。

## ゲーム

- 新規ユーザーが説明なしでもTier 0を開始できる
- 7種のテトロミノが正しい形状と回転で扱える
- ピースは盤面外、ブロックセル、他ピースへ重ねられない
- Undo、Redo、Reset、取り外しが動作する
- 盤面完全充填で一度だけクリアする
- Manual、Assisted、Automatedが仕様通り分類される
- 報酬が仕様式から計算される
- Tier 0〜5を順次解禁できる
- seedから同一パズルを再生成できる
- Daily Seedがローカル日付単位で固定される

## 自動化

- Auto SolverはWeb Worker内で実探索する
- Start、Pause、Resume、Cancelが動く
- Worker動作中もUIが操作可能である
- ノード数、バックトラック、nodes/sを表示する
- 探索可視化をOn、Reduced、Offにできる
- Solver Throughput購入で処理予算が増える
- MRV、候補順、symmetry pruning、cacheのupgradeが探索へ反映される
- Queue CapacityとParallel Solversが仕様通り働く
- 同じsolver完了イベントで二重報酬が発生しない

## 生成と正しさ

- 生成された全パズルに少なくとも一つの解がある
- Tierごとの使用可能セル数がピース数×4に一致する
- 固定seedの生成結果が決定論的である
- 生成失敗時にフォールバック問題へ移る
- 難易度測定はプレイヤーupgradeから独立する
- GeneratorとSolverの自動テストが通る

## 保存

- 通貨、upgrade、統計、設定、現在盤面をreload後に復元する
- 破損した主要saveからbackup復旧を試みる
- ExportとImportが動作する
- Erase Saveは`ERASE`入力なしに実行できない
- 旧version移行用dispatcherが存在する
- 探索途中のstackを保存しないことが、データ破損を起こさない

## UI

- デスクトップと390px幅で主要操作が可能
- タッチ環境で回転できる
- キーボード操作で選択、回転、配置、Undoができる
- 色だけに依存せず合法、不正、選択を判別できる
- 高速探索イベントをscreen readerへ大量送信しない
- 未解禁機能と資金不足の理由が確認できる
- エラー時に画面が白紙にならない

## 品質

- `npm run lint`が成功する
- `npm run typecheck`が成功する
- unit testが成功する
- production buildが成功する
- Playwrightの主要3シナリオが成功する
- coreとsolverに`any`が残っていない
- ゲームロジックがReactコンポーネントへ直書きされていない
- `Math.random()`がゲーム生成に使われていない
- バランス値が一つのconfigへ集約されている

## 配信

- GitHub ActionsでVite buildを行う
- GitHub Pagesへ`dist`を配信する
- リポジトリサブパス上でJS、CSS、Workerが正しく読み込まれる
- READMEにローカル起動、テスト、build、Pages設定手順がある
