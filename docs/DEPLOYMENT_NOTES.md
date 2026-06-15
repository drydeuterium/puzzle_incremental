# 配置メモ

## ローカル

想定コマンドは以下である。

```bash
npm install
npm run dev
```

production相当は以下で確認する。

```bash
npm run build
npm run preview
```

`vite preview`はローカル確認用であり、本番サーバとして使わない。

## GitHub Pages

リポジトリのSettingsからPagesを開き、Sourceを`GitHub Actions`へ設定する。

`templates/deploy.yml`を`.github/workflows/deploy.yml`へ配置する。

リポジトリURLが`https://<user>.github.io/<repo>/`なら、Viteのbaseを`/<repo>/`にする。テンプレートworkflowは`VITE_BASE_PATH`へリポジトリ名を渡す。

ユーザーサイト`https://<user>.github.io/`または独自ドメインへ置く場合は、`VITE_BASE_PATH=/`でbuildするようworkflowを変更する。

Web Workerは次のようにmodule URLから生成し、base pathとbundler処理に追従させる。

```ts
new Worker(new URL("../workers/solver.worker.ts", import.meta.url), {
  type: "module",
});
```

`/src/...`のような絶対パスを文字列でWorkerへ渡さない。

## 公式資料

実装時に仕様が変わっている可能性があるため、以下を確認する。

- Vite Static Deploy: https://vite.dev/guide/static-deploy.html
- GitHub Pages: https://docs.github.com/en/pages
