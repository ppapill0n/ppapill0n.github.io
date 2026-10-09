# Gomoku verification, 2026-10-09

## Status

- Passed: `node --test tests/*.test.mjs`, 64 tests including all existing pure game/session tests plus Gomoku rules, actual Node Worker protocol, fake adapter, controller lifecycle, evaluator, directory-layout and selector tests.
- Passed: six full, legal, seeded game replays with `node tests/gomoku-winnability.mjs --verify`.
- Passed: independent DOM implementation (happy-dom 20.0.11) with `HAPPY_DOM_MODULE=<installed happy-dom entry> node tests/gomoku-dom.mjs`: second-player opening, duplicate and occupied clicks, obsolete request/reset, blur/focus, keyboard focus, win/loss/draw/rematch, illegal engine response/retry, destruction and explicit one-hour entry.
- Passed on the deployed HTTPS site in the provided cloud Chromium browser: rendered desktop board and reused artwork, Panda-first opening and genuine Worker replies; loss stays locked; two complete 225-stone draws stay locked; Rematch after loss/draw; all seven games render across 26 actual global Resets with no current-game repeat.
- Passed: a deterministic 18-ply second-player browser replay using the unchanged production UI/rules/Worker and only saved RNG seeds. Every rendered board matched the legal fixture. Enter stayed disabled until the genuine human five, then navigated to `/personal/`; same-tab reload stayed authorized. The temporary unlinked test HTML was removed after verification. This is a seeded browser test, not an unseeded human victory or a measured human win rate.
- Passed: a rendered 393-CSS-pixel responsive-width check using ordinary browser zoom, with no horizontal overflow and a legal move/reply. This is narrow-width desktop rendering, not mobile-device/touch emulation.
- No site-origin console errors observed; the browser's own extension emitted metadata errors.
- Not run: the full standalone Playwright browser regression suites. Chromium cannot create its required Unix socket in the cloud shell (`Operation not permitted`), including an approved escalation retry. The supplied browser cannot reach the isolated localhost preview and rejects local file URLs. Its DevTools policy also blocks device emulation. These restrictions were respected; the targeted live-browser checks above were performed separately.
- Not tested: physical phone hardware, actual/emulated touch events, Safari/WebKit, real-device compute/network/energy use. Timing and one-hour expiry edge cases are covered in Node/DOM rather than waiting an hour in the live browser.

## Bounded work and payload

Measured on cloud Linux x64, Node v24.19.0. No WASM timing comparison is claimed.

| Shipped resource | Raw bytes | gzip bytes (local estimate) |
| --- | ---: | ---: |
| Worker protocol | 470 | 278 |
| Bounded chooser | 3,644 | 1,465 |
| Adapted evaluator, including full MIT notice | 6,709 | 1,986 |
| Independent rules | 1,636 | 698 |
| Full worker dependency graph | 12,459 | 4,427 |
| UI/controller | 6,807 | 2,499 |
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

Compare uniform exclusion (every noncurrent game 1/6) with a weak recency penalty:

- The first draw is uniform 1/7.
- Current game is excluded (probability zero).
- Other identities seen within the last three visits get weight .85; all others get weight 1. A repeated identity is not penalized multiple times.
- With two distinct recent alternatives, each gets .85/5.7 = 14.912%; the other four each get 1/5.7 = 17.544%.
- With only one recent alternative, it gets .85/5.85 = 14.530%; the other five each get 1/5.85 = 17.094%.
- There is no bag, quota, hard exclusion of old games, or forced finite-window balance. A-B-A and A-B-A-B are still possible. Identity symmetry gives equal long-run treatment, not equal probability conditional on history.

At 1,000,000 draws, seed 20261009, uniform exclusion → weak recency: A-B-A 16.676% → 14.875%; A-B-A-B 2.762% → 2.144%; mean unique games in seven draws 4.991 → 5.073; windows containing at most three identities 1.997% → 1.362%. No immediate repeats in either sample. Recency frequencies were 14.256–14.350% across individual games. Command: `node tests/selection-simulation.mjs 1000000`.

## Preserved behavior

The six earlier games' algorithms are unchanged apart from import/artwork paths and 2×2/3×3 entry wrappers. Academic HTML/CSS/JS are untouched. Entry still requires an explicit successful Enter action and writes the same verified one-hour sessionStorage record; no automatic entry on victory. The public static gate remains a same-tab convenience game, not authentication.

## Live publication evidence

Implementation commit: `8ef71f7e05c4004ef7a4093e4ebf90503c3dc8c1`; reviewed tree `2c0fca1b6022b27ef1a2414564bb1020c8b42078` exactly matched the local implementation tree. GitHub Pages [run 37891894069](https://github.com/ppapill0n/ppapill0n.github.io/actions/runs/37891894069) completed successfully. The temporary deterministic harness was introduced by test-only commit `11737a514ea972070fee7db4dd96d3d66b4c7384`, verified after its successful Pages deployment, and removed in the documentation cleanup. Production game code did not change during that test.

Observed live reset sequence: gomoku → cannon → soda → cannon → soda → cube2 → cube → soda → cube → dial → gomoku → cannon → cube → dial → cube → cannon → cube2 → gomoku → dial → cube2 → gomoku → cannon → gomoku → dial → cube → cannon → slots. The early cannon/soda alternation illustrates that the mild selector still allows natural clustering. This small sample is a smoke test, not an estimate of probabilities.
