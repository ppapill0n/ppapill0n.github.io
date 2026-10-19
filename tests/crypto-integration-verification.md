# Paper market homepage integration — 2026-10-19

The accepted order intent now survives a price update. Before filling, the game processes elapsed 100ms market ticks and intervening liquidations, then executes each queued intent once at the current tick price. It does not simulate a future tick or ask the player to click again. Large catch-up periods yield in 1,000-tick chunks while retaining the queue.

Each click captures the fraction and leverage. Repeated clicks execute FIFO against then-available cash or remaining quantity. Position IDs keep delayed adds/closes attached to the original position; liquidation and full closure invalidate those intents. Reset, switching games, destruction and pagehide cancel pending work. Duplicate visibility/pageshow events cannot replay it. A bfcache return resumes the market with a new queue. Cash cannot become debt.

The shared registry now contains eight games. Gate selection keeps strength 0.35, half-life two visits, and exclusion of the current game. Crypto uses one **Pay $50,000** entrance button. Payment checks actual flat cash, writes the existing one-hour session pass, deducts fictional cash once, then navigates. Unavailable storage leaves cash untouched. Freeplay's payment ends the fictional run without creating or extending a pass or navigating away. English/Korean gallery names are Paper market / 모의투자; the new 600×450 WebP is an actual gameplay screenshot.

The 1× default, minimal UI, existing mascot artwork, all other game engines and personal-page files are unchanged. Crypto styles are scoped to its root; standalone page styles are separate. `config.js`, `market.js`, `sweeps.js` and the selection implementation have no diff from `6bbd33d`. Existing seeded market results remain applicable; this change does not claim new human pacing measurements.

## Validation

- `node --test tests/*.test.mjs`: 144 passed, zero failures. Nine new queue tests cover delayed Long/Short, partial closes, FIFO sizes, clock advancement between fills, liquidation/replacement IDs, repeated closes, cancellation and atomic payment.
- `tests/crypto-browser.cjs`: standalone layouts at 320/390/768/1280px, mouse/touch/keyboard, real and controlled clocks, accounting, completed run, storage failure, background catch-up and lifecycle checks passed.
- `tests/crypto-integration-browser.cjs`: gate at 320/390/1280px, current-quote fills, three queued clicks during one-hour catch-up, duplicate wakeups, liquidation, cancellation, actual seeded gate payment, failed storage, freeplay payment/restart/switch and immutable pass passed; zero page errors.
- `tests/gate-browser.cjs` and `tests/session-browser.cjs`: existing game input, entry, storage and one-hour access checks passed.
- `tests/freeplay-browser.cjs`: all eight deep links and gallery cards, 320/390/1200px input and EN/KO layouts, real worker cancellation, restart/switch/history, unavailable storage, fixed expiry, hidden-tab/pageshow revalidation and immutable passes passed; zero page errors.
- Eight-game selection simulation: 300,000 draws, seed 20261019; zero immediate repeats; production recency frequencies 12.4637–12.5483%, with crypto at 12.4850%. `node tests/selection-simulation.mjs 300000 20261019` reproduces the result.
- Gate, gallery, freeplay and thumbnail screenshots were inspected. No horizontal overflow in the tested layouts. Freeplay's global academic section spacing is reset only within the crypto root.

The existing gallery browser test initially reproduced the same missing Gomoku compatibility click on both the integration and untouched `6bbd33d`, after CDP canvas swipes. Responsive input scenarios now use independent browser contexts; separate same-document switch and worker cancellation tests remain intact. The intentionally blocked-storage fixture establishes its origin on a blank page, so unrelated academic-homepage storage code is excluded from this freeplay check. No Gomoku or academic implementation was changed.

## Reproduction and limits

Serve the repository using `python3 -m http.server 8767 --bind 127.0.0.1`. Browser scripts require Playwright and Chromium; this environment uses `NODE_PATH=/opt/codex/runtimes/cua/lib/node_modules` and `/usr/bin/chromium`. Set `SITE_URL=http://127.0.0.1:8767` for crypto, freeplay and session suites; the gate suite uses `GATE_URL=http://127.0.0.1:8767/gate/`. `PW_TEST_SCREENSHOT_NO_FONTS_READY=1` prevents screenshots waiting for externally blocked fonts in older suites.

Browser input was tested in headless Chromium with touch emulation, not on a physical handset. Hidden state and long sleep were simulated; Safari, Firefox and real OS suspend/resume were not tested. The optional Happy DOM suite was not run because that dependency is absent; actual Chromium exercises those pages. Direct public-site requests from this environment fail at the proxy tunnel with HTTP 403; local browser verification and GitHub Pages deployment status are separate evidence.
