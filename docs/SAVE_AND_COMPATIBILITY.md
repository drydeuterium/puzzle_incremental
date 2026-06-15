# セーブ・互換性仕様

## 1. 保存先

localStorageを使用する。

主要キーは以下とする。

```text
puzzle_incremental.save.v1
puzzle_incremental.save.backup
puzzle_incremental.save.corrupt.<timestamp>
```

一時UI状態とsolver探索スタックは保存しない。

## 2. 保存タイミング

以下で保存する。

- 初回状態作成時
- 通貨獲得時
- upgrade購入時
- 新規パズル開始時
- 手動配置操作後。500ms debounceしてよい
- Settings変更時
- 5秒ごとのautosave
- `visibilitychange`でhiddenへ移る時
- `pagehide`

`beforeunload`だけに依存しない。

## 3. 原子的保存

新しいJSONをまず`puzzle_incremental.save.backup`へ書き、読み戻してparse可能であることを確認してから主要キーへ書く。

主要キー更新成功後もbackupを直前世代として残してよい。

localStorage容量超過時は、現在セッションのゲームを継続させつつ永続化失敗を明示する。

## 4. セーブ構造

トップレベルに以下を持つ。

```ts
type SaveDataV1 = {
  schemaVersion: 1;
  gameConfigVersion: string;
  generatorVersion: number;
  createdAt: string;
  updatedAt: string;

  economy: {
    compute: number;
    lifetimeCompute: number;
  };

  progression: {
    upgradeLevels: Record<string, number>;
    selectedTier: number;
    autoSeedCounters: Record<string, number>;
  };

  currentPuzzle: SavedPuzzle | null;

  statistics: Statistics;

  settings: UserSettings;
};
```

`SavedPuzzle`はseedだけでなく、盤面サイズ、使用可能セル、ピース個体を保存する。生成器変更後も現在問題を復元するためである。

手動配置はpieceId、orientation、anchorとして保存する。

クリア済みフラグを持たせ、ロード時の二重報酬を防ぐ。

## 5. Import / Export

Exportは整形済みJSONファイルをダウンロードする。ファイル名は以下とする。

```text
puzzle_incremental-save-YYYYMMDD-HHmmss.json
```

Importはファイル選択でJSONを読み込む。以下を検証する。

- JSONとしてparse可能
- schemaVersionが対応範囲
- 数値が有限、非負、safe integer
- upgrade IDが既知、levelが範囲内
- currentPuzzleがルール上妥当
- 統計値が有限、非負

MVPは不正防止を目的としないため、ユーザーが編集した正当な形式のセーブを拒否する必要はない。ただし破損値でアプリが停止してはならない。

Import前に現セーブをbackupへ退避する。Import成功後はページ再読み込みなしで状態を反映してよい。

## 6. Migration

schemaVersionごとに純粋なmigration関数を持つ。

```ts
migrateSave(input: unknown): SaveDataCurrent
```

未知の新しいversionは読み込まず、現在のデータを上書きしない。

古いversionは段階的に変換する。

MVP公開時点はv1だけでもよいが、migration dispatcherとversion判定は最初から実装する。

## 7. 復旧

主要キーがparse不能ならbackupを試す。

backupが有効ならそれを読み込み、復旧した旨を通知する。

両方無効なら、破損文字列をcorruptキーへ退避し、新規セーブを作る。

## 8. 日時

日時はISO 8601文字列で保存する。表示時だけローカル時間へ変換する。

Daily Seedはプレイヤーのローカル日付を使う。タイムゾーンを跨ぐ厳密な競技性はMVPの対象外である。
