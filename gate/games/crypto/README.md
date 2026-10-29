# Paper market

Paper market is the eighth game in the random entrance registry and the freeplay gallery, named **모의투자** in Korean. The registry retains its existing recency weighting and current-game exclusion. Its gallery thumbnail is a 600×450 capture of actual gameplay. Existing game engines and the personal page are unchanged. No runtime dependencies, API calls, real money, external prices, or external assets.

Routes: random entrance at `/gate/`, freeplay at `/play/?game=crypto` with an existing valid session pass, and the retained direct route at `/gate/games/crypto/`. The direct route accepts reproducible review seeds, such as `/gate/games/crypto/?seed=3` (unsigned 32-bit integer). The site publishes through GitHub Pages from `main`.

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/gate/games/crypto/`. This is a local preview, not a deployment. `Start again` draws a fresh seed and resets this account. Reload also resets the account; with a `?seed=` URL it replays that seed. Neither action changes an existing gate pass.

## Play and accounting

Each new run draws a four-letter uppercase fictional ticker, shared by the heading, position quantity, order hint, and accessible chart labels. It stays fixed during the run and differs from the previous run in the same game root, including freeplay restarts. Cosmetic randomness is separate from the seeded market path.

- Start with $10,000; get flat with at least $50,000 cash, then explicitly press **Pay $50,000**. At the gate or direct route, payment deducts fictional cash and uses the existing `enterPersonal` / one-hour session-pass interface to navigate to `/personal/`. A storage failure leaves the money untouched. Merely reaching the goal never issues a pass. In freeplay, payment completes the fictional run without navigation, issuing a pass, or extending the existing pass.
- One linear isolated-margin position. Long profits on a rise; Short profits on a fall. Opposite-direction entry is disabled until the position is fully closed. Same-direction adds combine quantity, collateral, and quantity-weighted entry price.
- Leverage: 1/2/5/10/20, initially 1×. Locked while holding. Order size: 25/50/75/100%, initially 100%. Entries allocate that percentage of available cash; closes release that percentage of position quantity and collateral.
- Each side costs 0.05% of notional. For cash budget `B`, leverage `L`, fee rate `f`, margin is `B/(1+L*f)` and opening fee is `margin*L*f`. Thus 100% entry fits available cash.
- Partial-close cash is proportional margin plus realized linear P&L, minus exit fee. Equity is cash plus nonnegative collateral/P&L before closing fees. Position P&L excludes fees. The goal uses cash, never an unclosed mark-to-market gain.
- Every price tick checks whether margin plus unrealized P&L still covers the exit fee. A gap wipes at most isolated collateral, never idle cash and never creates debt. A flat account below the $1 minimum order ends the run and offers **Try again**.
- The chart shows 2-second OHLC candles, current price, entry, and liquidation markers. Off-scale position markers use arrows; exact prices remain in the account readout. Mobile displays 40 candles and native selectors; desktop displays up to 60 candles and segmented controls. Trade controls remain native buttons with keyboard support.

## Market and time

`config.js` holds tunables; `market.js` owns price generation and `sweeps.js` supplies independent mixed shocks; `account.js` owns accounting; `session.js` joins them in fixed 100ms ticks; `live-clock.js` reconciles elapsed time; `orders.js` holds pending order intents; `chart.js` and `game.js` render/interact. Component CSS is scoped to `.crypto-game`; `standalone.css` and `prototype.js` supply the retained direct route's page shell and entry flow.

The seeded log-price model has hidden up/down/range states with exponentially distributed dwell averaging 60 seconds. Transitions choose a different state. Trend strength varies by ±25%; drift eases over four seconds. Range states mean-revert toward an anchor. Volatility eases over 15 seconds toward calm (~0.59% candle-scale diffusion, varied ±15%) or volatile (~1.00%) targets. Independent jumps average one per 110 seconds, with 0.9% standard deviation capped at ±3.5%. These are stylized game parameters, not calibrated financial data. Numeric price bounds are $0.01–$1 billion for arbitrarily long runs.

Mixed shocks use a separate seeded stream and never alter those background draws or regime timings. Ordinary countertrend arrivals have a 240s mean eligible-time clock; 85% of idle/outside-cooldown direct up↔down transitions also receive a shock in the new direction. Both have the same onset distributions: 0.065–0.085 log amplitude (12% use 0.12–0.14), 3–5s outbound, 0–1.5s peak hold, then 8–18s settling with randomized easing. Only 20% fully remove their offset; 30% retain 35–75%, and 50% retain all. There is a 20s cooldown and no overlap. Natural regime changes continue throughout. Similar sharp moves can therefore recover, partly remain, or accompany lasting trend reversals. Component recovery is not a promise that the observed price returns: drift and noise continue independently. See [mixed-shock analysis](../../../tests/crypto-sweeps-analysis.md) for exact parameters, measured predictability and tradeoffs.

Fifty historical candles are generated from 1,000 real warmup ticks. Live OHLC includes every subsequent tick, including the still-forming candle. Snapshots expose observed prices and candles only, never regime labels, RNG state, or precomputed future candles. The market receives no position/account information. Review seeds are reproducible, not an anti-cheat mechanism.

**The market never pauses for tab switches.** A wall-clock target includes background timer throttling and device sleep. On wake, every missing tick is processed in order, including intervening liquidation crossings even if price subsequently recovers. The account stops only on bankruptcy or payment. No persistence across reload is implemented.

Catch-up processes at most 1,000 ticks per callback and yields through timers between chunks. The overlay appears only when at least one second of simulation remains after that chunk; foreground delays resolved within the callback do not cover the chart. A new tick becoming due during rendering schedules more work without forcing an overlay or waiting for additional animation frames. Unchanged polls and selectors retain the chart's SVG; price ticks, position markers and size changes redraw it.

**An accepted Long, Short, or Close click survives price updates and fills once at the latest elapsed market tick after catch-up.** It never advances to a future tick or requires another click just because the displayed price changed. Rendering is not a condition for filling an order. Trading controls remain usable while catching up; hidden or ended games do not accept new input.

Pending orders execute in click order. Each captures its selected fraction and leverage; available cash or remaining quantity is measured at execution. Distinct repeated clicks are distinct orders. Adds and closes bind to the original position ID, so liquidation or full closure makes an old position order invalid instead of reopening a position or closing a replacement. Insufficient funds and other impossible orders also fail without debt. Leverage remains locked while holding or while orders are pending.

Absolute elapsed targets prevent timer/input/visibility/bfcache callbacks from advancing twice. Restart, destruction, navigation and pagehide cancel pending orders and invalidate old timer callbacks. A bfcache return resumes elapsed-time catch-up with a fresh queue. Duplicate wakeups cannot replay orders. Payment also uses the queue and synchronously checks actual flat cash, persists the gate pass, and deducts cash at most once.

`Date.now()` supplies wall elapsed time, with `performance.now()` as a monotonic floor. Sleep counts even where the performance clock stops. Backward wall-clock adjustments re-anchor without rewinding and preserve subsequent sleep accounting. Forward adjustments count as elapsed time. There is no server clock, so manually changing device time can affect this local prototype. There is no manual pause control.

## Current mixed-shock pacing

Held-out comparison: 2,000 seeds 60001–62000, 600s horizon, shared background paths. Active 5× trend trading succeeds in 71.85%, with 0% ruin / 28.15% censored and a 292s successful median; 26.9% of all starts win by four minutes. At 10×, the same policy has 79.20% success / 1.70% ruin / 19.10% censored, a 170s successful median and 52.3% winning by four minutes. The 1× default remains unchanged. The 2–4 minute aim is not guaranteed and the new shocks slow 5× progress.

Of 5,556 detected sharp moves, 48.72% are back in the old direction after 20s; only 42.69% regain the pre-move price within 60s. Nevertheless, a confirmed-bounce 20× bot has a residual edge: 7.55% success / 0.40% ruin / 92.05% censored, with a 456s successful median. This is not a claim of exploit resistance. Full distributions, conditional/paired comparisons, calibration history and reproduction commands are in [the report](../../../tests/crypto-sweeps-analysis.md).

## Historical pacing evidence (before mixed shocks)

The original goal was a **2–4 minute successful run**, not a guaranteed duration. The following results predate mixed shocks and explicitly test 5×/10×/20×. The later change of default to 1× did not retune that original market; [initial-history analysis](../../../tests/crypto-history-analysis.md) records its pacing and one-entry results at that time. Initial drift of 0.16%/second gave the 5× trend policy only 36.3% success and a 6m44s successful-run median (300 seeds, 10-minute horizon). Parameter trials at 0.20/0.24/0.28/0.32% used 200 calibration seeds. The selected 0.32%/second trend drift (~0.64% per two-second candle before noise) makes direction more readable without changing the noise, reacting to trades, or selecting favorable paths.

Final validation: **1,000 previously unused seeds, 1001–2000, per policy/leverage; 600-second horizon; decisions every two seconds; 100% cash entries.** Policies use only completed candles and the executable current price. They use actual fees, tick-by-tick liquidation, and full closing costs to qualify for payment.

| Policy | Leverage | Success | Ruin | Censored at 10m | Successful median | Successful p10–p90 | Equity below $1,000 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Random | 5× | 2.5% | 0.0% | 97.5% | 5m40s | 2m50s–8m52s | 13.0% |
| Trend | 5× | 92.7% | 0.0% | 7.3% | **3m50s** | 2m02s–7m54s | 0.0% |
| Range fade | 5× | 0.0% | 1.4% | 98.6% | — | — | 94.5% |
| Random | 10× | 10.8% | 3.3% | 85.9% | 3m26s | 1m14s–7m46s | 65.3% |
| Trend | 10× | 96.4% | 0.0% | 3.6% | 2m08s | 1m04s–6m18s | 0.3% |
| Range fade | 10× | 0.4% | 59.3% | 40.3% | 2m56s | 2m50s–3m16s | 98.6% |
| Random | 20× | 13.7% | 84.5% | 1.8% | 1m02s | 0m30s–3m22s | 86.0% |
| Trend | 20× | 96.8% | 0.3% | 2.9% | 1m16s | 0m34s–5m22s | 1.6% |
| Range fade | 20× | 1.1% | 95.9% | 3.0% | 2m10s | 1m38s–5m42s | 98.8% |

Ruin means a flat balance below $1 (including liquidation to zero). Censored means neither paid nor ruined when 600 seconds elapsed; it is not a success. The last column also counts heavily depleted surviving accounts so low strict ruin rates do not hide losses. Successful times condition on reaching the goal. At 5×, **49.6% of all trend runs finish by four minutes**, and 419/1,000 (41.9% of all runs; 45.2% of successes) finish within 2–4 minutes. The successful median is near the desired target, but many runs take longer, and indiscriminate trading performs poorly.

Policy definitions are in `tests/crypto-simulation.mjs`: random flips/reopens every ten seconds; trend uses 4/12-candle means, a 0.4% signal threshold, a 35% collateral stop and 20-second rebalancing; range fade enters beyond 1.4 trailing standard deviations, closes near the mean, after 24 seconds, or after losing 25% of collateral. Range fade is deliberately a simple mean-reversion baseline with no hidden-regime detector; it performs badly during trends. These automatic policies do not measure human success rates, reaction time, or enjoyment. The full distribution, counts, config, seeds, and depletion measures are retained in `tests/crypto-simulation-results.json`.

## Verification

```sh
node --test tests/*.test.mjs
node tests/crypto-sweeps-simulation.mjs 2000 60001
SITE_URL=http://127.0.0.1:8765 ARTIFACT_DIR=/tmp/crypto-review node tests/crypto-browser.cjs
SITE_URL=http://127.0.0.1:8765 node tests/crypto-integration-browser.cjs
SITE_URL=http://127.0.0.1:8765 node tests/crypto-foreground-browser.cjs
SITE_URL=http://127.0.0.1:8765 node tests/crypto-ticker-browser.cjs
```

The browser scripts need Playwright and Chromium (`CHROMIUM` can override `/usr/bin/chromium`); the game itself needs no installation or build. They cover 320/390/768/1280px layouts, Chromium mouse/touch and keyboard controls, fees/partial closes/adds, locked leverage, restart, complete seeded runs, successful Pay and storage failure, an hour of chunked hidden catch-up, liquidation while away, current-price execution of delayed inputs, repeated clicks, lifecycle duplication, and restart/navigation during catch-up. The integration suite additionally checks the gate's single payment button, eight-card gallery, freeplay payment isolation, and pass preservation. Both write actual screenshots. Unit tests independently verify accounting conservation, gaps, market OHLC, path independence, render-rate independence, sleep/clock correction behavior, and an interim liquidation followed by price recovery. See [integration verification](../../../tests/crypto-integration-verification.md).

Validation was performed in Chromium, with controlled-clock tests plus an unmocked timer smoke test. Hidden state and sleep are simulated in these tests; no actual handset, OS suspend/resume, Safari or Firefox testing was performed. Screenshots were visually inspected. Homepage integration does not change the market parameters or the 1× default; the mixed-shock simulation results above still describe that same market.

The foreground regression suite covers 100–5000ms visible-tab delays, a tick becoming due during a 120ms SVG update, unchanged-node retention, resize and position markers, an hour-long backlog, repeated queued orders, and intermediate hidden liquidation followed by recovery. A real-timer Chromium run with 6× CPU throttling and eight 120ms stalls also samples chart frames for empty/covered states. These are desktop-browser emulation checks, not a claim about the user's handset or browser. The foreground fix retains background market progression and changes no market or accounting parameters.
