# Gomoku verification, 2026-10-09

## Status

- Passed: `node --test tests/*.test.mjs`, 74 tests including all existing pure game/session tests plus Gomoku rules, actual Node Worker protocol, fake adapter, controller lifecycle, evaluator, directory-layout and selector tests.
- Passed: six full, legal, seeded game replays with `node tests/gomoku-winnability.mjs --verify`.
- Passed: independent DOM implementation (happy-dom 20.0.11) with `HAPPY_DOM_MODULE=<installed happy-dom entry> node tests/gomoku-dom.mjs`: second-player opening, duplicate and occupied clicks, obsolete request/reset, blur/focus, keyboard focus, win/loss/draw/rematch, illegal engine response/retry, destruction and explicit one-hour entry.
- Passed on the deployed HTTPS site in the provided cloud Chromium browser: rendered desktop board and reused artwork, Panda-first opening and genuine Worker replies; loss stays locked; two complete 225-stone draws stay locked; Rematch after loss/draw; all seven games render across 26 actual global Resets with no current-game repeat.
- Passed: a deterministic 18-ply second-player browser replay using the unchanged production UI/rules/Worker and only saved RNG seeds. Every rendered board matched the legal fixture. Enter stayed disabled until the genuine human five, then navigated to `/personal/`; same-tab reload stayed authorized. The temporary unlinked test HTML was removed after verification. This is a seeded browser test, not an unseeded human victory or a measured human win rate.
- Passed: a rendered 393-CSS-pixel responsive-width check using ordinary browser zoom, with no horizontal overflow and a legal move/reply. This is narrow-width desktop rendering, not mobile-device/touch emulation.
- No site-origin console errors observed; the browser's own extension emitted metadata errors.
- Not run: the full standalone Playwright browser regression suites. Chromium cannot create its required Unix socket in the cloud shell (`Operation not permitted`), including an approved escalation retry. The supplied browser cannot reach the isolated localhost preview and rejects local file URLs. Its DevTools policy also blocks device emulation. These restrictions were respected; the targeted live-browser checks above were performed separately.
- Not tested: physical phone hardware, actual/emulated touch events, Safari/WebKit, real-device compute/network/energy use. Timing and one-hour expiry edge cases are covered in Node/DOM rather than waiting an hour in the live browser.

## Turn-feedback follow-up

- All visible informational status text (including turn/thinking/outcome text) is now screen-reader-only; the shared live region remains. Board, winner highlights, Enter, Retry, Rematch, and right-aligned player icons remain.
- Each Panda turn samples an integer minimum duration uniformly from 500 through 1000 ms inclusive. The timer and worker run together: fast replies wait until the sampled duration; valid slower replies apply when ready, under the unchanged worker timeouts. UI scheduling can extend actual elapsed time. No blocking sleep is used.
- Added mock-clock coverage for both endpoints, a midpoint, and 32 seeded samples; concurrent computation, a slow response, input/Enter locking, opening/rematch, reset during an already-computed move's delay, blur/pagehide/visibility/stop/destroy timer cleanup, stale responses, errors/Retry, and duplicate Retry/Rematch clicks. Independent DOM checks now advance the same test-only clock.
- Final local checks: 69 Node tests, independent DOM suite, six seeded legal game replays, browser-test syntax, and `git diff --check` pass. Selection and the AI move algorithm are unchanged.
- Full standalone browser-suite limitation above still applies. Targeted live verification for this follow-up is recorded separately after publication; earlier live observations above concern the initial implementation. The user reported that touch worked on their Android device before this follow-up; this is user confirmation, not a new device test performed here.

## Bounded work and payload

Measured on cloud Linux x64, Node v24.19.0. No WASM timing comparison is claimed.

| Shipped resource | Raw bytes | gzip bytes (local estimate) |
| --- | ---: | ---: |
| Worker protocol | 470 | 278 |
| Bounded chooser | 3,644 | 1,465 |
| Adapted evaluator, including full MIT notice | 6,709 | 1,986 |
| Independent rules | 1,636 | 698 |
| Full worker dependency graph | 12,459 | 4,427 |
| UI/controller | 7,665 | 2,823 |
| Async engine adapter | 2,796 | 1,095 |

The rules module is already required by the UI. The additional lazily requested Worker/AI/evaluator bytes are therefore 10,823 raw / 3,729 gzip-estimate before caching. The search graph is never imported by the main page; a worker is created only when Gomoku asks Panda to move. Other selected games never start it. Panda opens, so selecting Gomoku starts the first worker immediately. Every settled or cancelled request terminates its worker.

Existing Nokyong reference artwork is 816,070 bytes. It is reused at its existing URL, not duplicated; a first visit still has that image cost, while repeat games can reuse browser cache. Panda uses the existing inline SVG. Local gzip figures are estimates, not verified HTTP transfer sizes.

The chooser checks immediate wins/blocks, then caps candidate/reply work at 12 × (1 + 6) = 84 evaluator placements. No recursive/open-ended search or upstream transposition cache remains. The adapter allows at most 8,000 ms for cold loading and 1,500 ms after the worker reports ready, and terminates overdue work and rejects obsolete/illegal results. A slow or unavailable engine never unlocks Enter; Retry is offered.

A reproducible 20-game seeded AI-vs-AI run made 787 calls: median 0.564 ms, p95 1.002 ms, maximum 8.534 ms; no call exceeded 84 evaluator placements. These are synchronous Node compute timings, excluding Worker construction, downloads, browser rendering, mobile hardware and human time. The 400-game tactical sample separately observed a maximum Panda compute time of 9.75 ms.

## Human second is attainable

Both seats were tested from empty boards against an independent, shallow tactical player. In 200 consecutive seeds per seat:

| Human-policy seat | Wins | Losses | Draws |
| --- | ---: | ---: | ---: |
| First | 127 | 39 | 34 |
| Second | 104 | 75 | 21 |

The policy scans local patterns for immediate wins/blocks, forcing fours and open/double threes. It does not search opponent replies, know opponent seeds, or use the AI's evaluator. Three fully inspected second-seat wins (18, 32 and 44 plies) end with ordinary open-four conversions; the opponent blocks one end and the human takes the other. Replays assert that Panda takes available immediate wins and blocks immediate human winning points.

The user prefers human second when reasonably winnable, so Panda opens in production. The 52% automated second-seat success is not a measured human or beginner win rate. Shortest examples are selected demonstrations, not typical lengths. Full traces, seeds, source hashes, sample caveats and tactical annotations are in `gomoku-winnability-fixtures.json`.

## Reset selection

The original .85 / last-three-visits nudge was replaced by an exponentially recovering last-visit penalty. Current game is excluded when alternatives exist; unseen IDs have weight 1; other IDs use `1 - .35 * .5 ** ((d - 1) / 2)`, where d = 1 after A → B when considering A again. Settings remain fixed as more games are added. No bag, quota, or cumulative frequency penalty is used.

At one million draws, seed 20261009, seven-game uniform exclusion → recovery: A-B-A 16.676% → 12.717%; A-B-A-B 2.762% → 1.556%; mean distinct in seven visits 4.991 → 5.181. Immediate repeats were zero. The [dedicated selector report](selection-verification.md) includes catalogs of 2, 3, 7, 12, 20, and 50, the rejected scaling comparison, exact invariant tests, and singleton behavior. See the [design/configuration guide](../gate/common/selection.md).

## Preserved behavior

The six earlier games' algorithms are unchanged apart from import/artwork paths and 2×2/3×3 entry wrappers. Academic HTML/CSS/JS are untouched. Entry still requires an explicit successful Enter action and writes the same verified one-hour sessionStorage record; no automatic entry on victory. The public static gate remains a same-tab convenience game, not authentication.

## Live publication evidence

Implementation commit: `8ef71f7e05c4004ef7a4093e4ebf90503c3dc8c1`; reviewed tree `2c0fca1b6022b27ef1a2414564bb1020c8b42078` exactly matched the local implementation tree. GitHub Pages [run 37891894069](https://github.com/ppapill0n/ppapill0n.github.io/actions/runs/37891894069) completed successfully. The temporary deterministic harness was introduced by test-only commit `11737a514ea972070fee7db4dd96d3d66b4c7384`, verified after its successful Pages deployment, and removed in the documentation cleanup. Production game code did not change during that test.

Observed live reset sequence: gomoku → cannon → soda → cannon → soda → cube2 → cube → soda → cube → dial → gomoku → cannon → cube → dial → cube → cannon → cube2 → gomoku → dial → cube2 → gomoku → cannon → gomoku → dial → cube → cannon → slots. The early cannon/soda alternation illustrates that the mild selector still allows natural clustering. This small sample is a smoke test, not an estimate of probabilities.
