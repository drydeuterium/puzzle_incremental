# puzzle_incremental

`puzzle_incremental` is a client-side React game that combines tetromino filling puzzles with incremental Auto Solver upgrades.

The player places tetromino pieces on a board until every usable cell is covered exactly once. Clears award `Compute`, which unlocks higher tiers, hints, contradiction checks, forced moves, and a Web Worker based solver. The Auto Solver performs real backtracking search; it is not a reward timer.

## Local Run

```bash
npm ci
npm run dev
```

The dev server prints the local URL. The app is a single-page Vite application and stores progress in the browser.

## Build

```bash
npm run build
```

The production artifact is written to `dist`.

## Test

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:e2e
```

Playwright uses the production preview server. If browsers are not installed, run:

```bash
npx playwright install chromium
```

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`. GitHub Pages should be configured with Source set to GitHub Actions.

For repository subpath deployment, the workflow builds with:

```bash
VITE_BASE_PATH=/${{ github.event.repository.name }}/
```

The Vite config also accepts a local override:

```bash
VITE_BASE_PATH=/puzzle_incremental/ npm run build
```

Worker URLs are emitted by Vite using `new URL(..., import.meta.url)`, so the production build keeps the solver worker under the configured base path.

## Save Specification

Progress is stored in `localStorage`.

Primary keys:

```text
puzzle_incremental.save.v1
puzzle_incremental.save.backup
puzzle_incremental.save.corrupt.<timestamp>
```

The save contains Compute, upgrade levels, selected tier, auto seed counters, settings, statistics, and the current puzzle definition plus manual placements. Solver search stacks are not saved. Writes go to the backup key first and then to the primary key after validation.

Export and Import are available from Settings. `Erase Save` requires typing `ERASE`.

## Known Limits

Puzzle generation now uses deterministic backtracking over all seven tetromino types, including the early 5x5 board with one blocked cell. It still does not try to guarantee unique solutions, and the block templates are intentionally simple.

No server, account, online ranking, cloud save, PWA, audio, editor, URL sharing, prestige, or external telemetry is included.
