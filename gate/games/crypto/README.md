# Paper market prototype

Direct route: `/gate/games/crypto/`. Optional reproducible review path: `/gate/games/crypto/?seed=3` (unsigned 32-bit integer). No registry, random entry selection, gallery, existing game, or personal-page files are changed. No runtime dependencies, API calls, real money, external prices, or external assets.

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/gate/games/crypto/`. This is a local preview, not a deployment. `Start again` draws a fresh seed and resets this account. Reload also resets the account; with a `?seed=` URL it replays that seed. Neither action changes an existing gate pass.

## Play and accounting

- Start with $10,000; get flat with at least $50,000 cash, then explicitly press **Pay $50,000**. Payment deducts fictional cash and uses the existing `enterPersonal` / one-hour session-pass interface to navigate to `/personal/`. A storage failure leaves the money untouched. Merely reaching the goal never issues a pass.
- One linear isolated-margin position. Long profits on a rise; Short profits on a fall. Opposite-direction entry is disabled until the position is fully closed. Same-direction adds combine quantity, collateral, and quantity-weighted entry price.
- Leverage: 1/2/5/10/20, initially 5×. Locked while holding. Order size: 25/50/75/100%, initially 100%. Entries allocate that percentage of available cash; closes release that percentage of position quantity and collateral.
- Each side costs 0.05% of notional. For cash budget `B`, leverage `L`, fee rate `f`, margin is `B/(1+L*f)` and opening fee is `margin*L*f`. Thus 100% entry fits available cash.
- Partial-close cash is proportional margin plus realized linear P&L, minus exit fee. Equity is cash plus nonnegative collateral/P&L before closing fees. Position P&L excludes fees. The goal uses cash, never an unclosed mark-to-market gain.
- Every price tick checks whether margin plus unrealized P&L still covers the exit fee. A gap wipes at most isolated collateral, never idle cash and never creates debt. A flat account below the $1 minimum order ends the run and offers **Try again**.
- The chart shows 2-second OHLC candles, current price, entry, and liquidation markers. Off-scale position markers use arrows; exact prices remain in the account readout. Mobile displays 40 candles and native selectors; desktop displays up to 60 candles and segmented controls. Trade controls remain native buttons with keyboard support.

## Market and time

`config.js` holds tunables; `market.js` owns only price generation; `account.js` owns accounting; `session.js` joins them in fixed 100ms ticks; `live-clock.js` reconciles elapsed time; `chart.js` and `game.js` render/interact; `prototype.js` connects the existing entry flow.

The seeded log-price model has hidden up/down/range states with exponentially distributed dwell averaging 60 seconds. Transitions choose a different state. Trend strength varies by ±25%; drift eases over four seconds. Range states mean-revert toward an anchor. Volatility eases over 15 seconds toward calm (~0.59% candle-scale diffusion, varied ±15%) or volatile (~1.00%) targets. Independent jumps average one per 110 seconds, with 0.9% standard deviation capped at ±3.5%. These are stylized game parameters, not calibrated financial data. Numeric price bounds are $0.01–$1 billion for arbitrarily long runs.

Fifty historical candles are generated from 1,000 real warmup ticks. Live OHLC includes every subsequent tick, including the still-forming candle. Snapshots expose observed prices and candles only, never regime labels, RNG state, or precomputed future candles. The market receives no position/account information. Review seeds are reproducible, not an anti-cheat mechanism.

**The market never pauses for tab switches.** A wall-clock target includes background timer throttling and device sleep. On wake, every missing tick is processed in order, including intervening liquidation crossings even if price subsequently recovers. The account stops only on bankruptcy or payment. No persistence across reload is implemented.

Catch-up processes at most 1,000 ticks per callback, yields through timers between chunks, and disables order/payment controls. The view must paint the reconciled quote before controls unlock. If an order arrives before a delayed timer updates the screen, that click reconciles the view and is rejected with a request to tap again; it never trades at the old or newly unseen quote. Absolute elapsed targets prevent timer/input/visibility/bfcache callbacks from advancing twice. Catch-up and animation callbacks are invalidated on restart/destruction.

`Date.now()` supplies wall elapsed time, with `performance.now()` as a monotonic floor. Sleep counts even where the performance clock stops. Backward wall-clock adjustments re-anchor without rewinding and preserve subsequent sleep accounting. Forward adjustments count as elapsed time. There is no server clock, so manually changing device time can affect this local prototype. There is no manual pause control.

## Pacing evidence

The goal is a **2–4 minute successful run**, not a guaranteed duration. Initial drift of 0.16%/second gave the 5× trend policy only 36.3% success and a 6m44s successful-run median (300 seeds, 10-minute horizon). Small sweeps at 0.20/0.24/0.28/0.32% used 200 calibration seeds. The final 0.32%/second trend drift (~0.64% per two-second candle before noise) makes direction more readable without changing the noise, reacting to trades, or selecting favorable paths.

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
node tests/crypto-simulation.mjs 1000 600 1001
SITE_URL=http://127.0.0.1:8765 ARTIFACT_DIR=/tmp/crypto-review node tests/crypto-browser.cjs
```

The browser script needs Playwright and Chromium (`CHROMIUM` can override `/usr/bin/chromium`); the game itself needs no installation or build. It covers 320/390/768/1280px layouts, Chromium mouse/touch and keyboard controls, fees/partial closes/adds, locked leverage, restart, a complete seeded run, successful Pay and storage failure, an hour of chunked hidden catch-up, liquidation while away, rejected stale-price inputs, lifecycle duplication, and restart during catch-up. It writes actual screenshots. Unit tests independently verify accounting conservation, gaps, market OHLC, path independence, render-rate independence, sleep/clock correction behavior, and an interim liquidation followed by price recovery.

Validation was performed in Chromium, with controlled-clock tests plus an unmocked timer smoke test. Hidden state and sleep are simulated in these tests; no actual handset, OS suspend/resume, Safari or Firefox testing was performed. Screenshots were visually inspected. No production deployment or remote push is part of this prototype.
