# Gomoku gate

Freestyle 15×15: five or more connected stones wins; there are no forbidden moves. Green Nokyong is the human and plays second; Panda opens. Only a settled human victory grants eligibility for the explicit Enter button. Losing, drawing, loading, worker failure, and paused play remain locked. Rematch keeps Gomoku; the global reset chooses another game.

## Turn feedback and pacing

Turn, thinking, paused, and outcome text is screen-reader-only. The existing shared live region announces it; the visual board, winning line, Enter state, and Rematch/Retry buttons remain. Player icons retain their right alignment.

Every Panda turn, including its opening, rematch opening, Retry, and resumed cancelled turn, samples a fresh uniform integer delay of 500–1000 ms inclusive. The timer runs alongside the asynchronous engine request, so this is a minimum total thinking duration, not an extra wait after computation. A response taking longer than the sampled delay is applied as soon as it arrives and passes validation; existing worker load/compute timeouts still apply. Browser timer scheduling may make the actual visible wait longer. The timer never blocks the UI thread. A custom `random` option supplies a seeded duration sampler for tests; production uses `Math.random`.

During both computation and the remaining delay, Panda retains its turn, board input is ignored, `aria-busy` remains true, and Enter stays locked. Reset, blur, page hiding/navigation, and destroy abort the timer and invalidate obsolete worker responses. Failures clear the timer and offer Retry. Duplicate Retry/Rematch clicks cannot restart a pending turn.

## Boundaries and replacing the AI

- `rules.js`: legal moves, alternating turns, freestyle wins/draws. No AI dependency.
- `game.js`: accessible DOM board, touch/keyboard input, presentation and match lifecycle. No knowledge of evaluation scores or search.
- `engine-client.js`: `createWorkerEngine()` returns `findMove(board, player, { signal, seed }) -> Promise<number>`, `cancel()`, and `destroy()`. The board is a length-225 array (0 empty, 1 human, 2 panda); the resolved number is a legal zero-based row-major cell. Cancellation rejects with `AbortError`; failures reject. Every request snapshots the board, supersedes the previous request, rejects illegal results, allows up to 8,000 ms for cold loading and 1,500 ms after the worker reports ready, and terminates its worker on every settled path.
- `worker.js`: transport protocol `{ id, board, color, seed }` -> `{ type:'ready' }`, then `{ id, index }` or `{ id, error }`. The worker is created only when Panda needs to think, so the evaluator/search code is fetched lazily. No work runs on the UI thread.
- `ai.js`: our novice move selector, using an adapted upstream evaluator. Tactical immediate wins and blocks are checked first; then at most 12 candidates × 6 replies plus 12 candidate placements (84 evaluations). Nearby candidates and small seeded tie variety keep work finite. It is deliberately short-sighted, not a strong full Gomoku search.
- `vendor/evaluator.js`: upstream incremental five-cell-window scoring only.

To use a WASM engine later, implement the same worker protocol in a new worker and pass its factory to `createWorkerEngine({ workerFactory })`. Load/initialize WASM inside that worker. Alternatively supply an adapter with the same asynchronous interface as the `engine` option to `createGomokuGame`. Keep the existing cancellation/timeout wrapper, or provide equivalent behavior. The renderer and independent rules must still validate and judge the move. This lets tests use a fake adapter without exposing test-only controls on the public page. If changing initialization/search latency, measure it before adjusting the timeout. An aborted worker's responses must never be applied to a newer match.

## Source and license

Adapted from [yyjhao/HTML5-Gomoku](https://github.com/yyjhao/HTML5-Gomoku), commit `a664ec1e7788c7cbdfbe223fb86f34162f9e006d`, `js/ai-worker.js`. Copyright (c) 2013 Yao Yujian, MIT. Full text: [vendor/LICENSE.txt](vendor/LICENSE.txt) and the shipped derivative's header. Central index: [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md).

Retained: `mapPoint`, board initialization, directional window scores, `_updateMap`, and reversible placements. Changed: scoped state into a fresh evaluator factory and removed upstream message handling, persistent cache, and unbounded negascout/search. The original root search has an occupied-cell check typo and the cache lacks depth/bound metadata; neither path is shipped. The upstream jQuery UI is not included.

The alternative [tombelieber/gomoku](https://github.com/tombelieber/gomoku) also has an MIT license and an engine-only WASM route, but its checkout contains no compiled WASM/glue and requires Rust, a wasm32 target, and wasm-pack. Those were not installed in the implementation environment. This dependency-free adaptation was chosen for integration/build burden and measurable bounded work, not engine strength. No comparative WASM performance claim is made.

## Verification

From the repository root:

- `node --test tests/*.test.mjs`
- `node tests/selection-simulation.mjs`
- `node tests/gomoku-winnability.mjs`
- Start a static server on port 8765, then `node tests/gomoku-browser.cjs` (Playwright and Chromium required).

See [verification measurements](../../../tests/gomoku-verification.md) for measured payload/timing, opening-choice evidence, and limits. Browser mobile emulation is not testing on physical phone hardware.
