# Initial history, one-entry shortcuts, and the 1× default

The default leverage is now **1×**, with 1/2/5/10/20 still selectable. No visible UI copy, market parameters, trading/accounting rules or timing rules changed. The previous pacing results explicitly used 5× and must not be presented as the new default's pacing.

## Findings

The starting chart carries useful information about subsequent direction. It is the actual warmup of the same process, not an independent decorative chart. A full declining desktop history improves a one-entry 20× short's ten-minute success rate from **31.61% to 39.11%**, but **60.60% of those selected runs liquidate**. A stronger recent decline (last ten candles down more than 5%) yields **53.89% success / 45.83% liquidation**, with a successful-run median of **77.0 seconds**. This is a substantial opening signal and can shorten a winning run below the original 2–4 minute aim; it is not a near-certain or immediate win.

No 20× short in the 20,000-seed experiment reached the fee-adjusted target within 30 seconds. A further **20.2899% price decline from the entry quote** is required, while a **4.9475% rise** liquidates it. The visible historical decline is already in the entry price; it contributes no P&L to a newly opened position.

## Method and reproducibility

- 20,000 consecutive seeds **20001–40000**, not used for the original market calibration. Every seed is included; filters were fixed before the run.
- A 600-second horizon, with checkpoints at 30/60/120/240/600 seconds. All rates use **all selected seeds** as denominator, not survivors or winners.
- For a window of N completed initial candles, `return = latest.close / oldest.open - 1`. “Declining” means negative net return; it does **not** mean that every candle is red. Ten candles = 20s, twenty = 40s, forty = 80s, fifty = 100s. The desktop initially shows 50 candles, mobile 40.
- Entry is at the exact initial actionable quote at t=0, after selecting only on that initial observed history. Allocate 100% of the $10,000 including opening fees. Hold one position without adding, reducing, switching, stopping out, or reinvesting.
- Process every actual **100ms** tick. Liquidation is checked first, exactly as in the game. Otherwise close 100% at the first currently observed tick whose proceeds after closing fees reach $50,000, then actually call Pay. No future prices, latent regimes, RNG state or future-based filters are used for entry or exit.
- This assumes perfect reactions to observed ticks and zero time to initially select 20× and click Short. It matches price/execution quantization but is **not a human reaction-time estimate**. Market-return diagnostics later in the report are recorded for analysis only and are never passed to the trading policy.
- Ruin = liquidation to zero; unfinished = neither success nor ruin by that checkpoint. The four strategies share each seed's independent market path for comparability, but hold separate accounts. Market generation never receives their positions.
- 95% Wilson intervals describe approximate finite-seed sampling uncertainty, not uncertainty in whether the model resembles real markets. Conditions overlap; they are not independent experiments. Zero observed events do not prove impossibility, except for the analytic 1× short limit discussed below.

```sh
node tests/crypto-history-simulation.mjs 20000 20001 > tests/crypto-history-results.json
node tests/crypto-simulation.mjs 1000 600 20001 1,5 > tests/crypto-default-pacing-results.json
node --test tests/crypto-history.test.mjs tests/crypto.test.mjs
```

Raw results: [history experiment](crypto-history-results.json), [default pacing](crypto-default-pacing-results.json). The analysis tests compare the shared-path harness against independent real gameplay sessions, and independently check historical windows, target accounting and uncertainty calculations.

## 20× short: declining-history selection

All success columns are cumulative probability of settling at least $50,000 cash and paying by that time, conditional on the initial filter. Ruin and unfinished are at 600s. Percentages are rounded independently.

| Initial filter | Selected / 20,000 | Selection | Win ≤30s | ≤60s | ≤120s | ≤240s | ≤600s | Ruin 600s | Unfinished 600s | Successful median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No history filter | 20,000 | 100.00% | 0.00% | 4.02% | 18.48% | 27.36% | 31.61% | 68.14% | 0.25% | 102.4s |
| Full desktop: last 50 < 0% | 9,932 | 49.66% | 0.00% | 5.99% | 24.19% | 34.49% | 39.11% | 60.60% | 0.29% | 95.1s |
| Full mobile: last 40 < 0% | 9,963 | 49.81% | 0.00% | 6.17% | 24.58% | 35.02% | 39.74% | 59.94% | 0.32% | 94.7s |
| Last 20 < 0% | 9,967 | 49.84% | 0.00% | 6.82% | 26.68% | 37.11% | 41.97% | 57.78% | 0.25% | 91.5s |
| Last 10 < 0% | 10,008 | 50.04% | 0.00% | 7.09% | 27.73% | 38.43% | 43.53% | 56.22% | 0.26% | 91.1s |
| Last 10 < −3% | 6,077 | 30.39% | 0.00% | 10.22% | 34.94% | 45.65% | 50.34% | 49.40% | 0.26% | 81.6s |
| Last 10 < −5% | 3,982 | 19.91% | 0.00% | 12.81% | 38.93% | 49.27% | 53.89% | 45.83% | 0.28% | 77.0s |
| Last 20 < −5% | 5,928 | 29.64% | 0.00% | 9.46% | 33.52% | 44.26% | 48.77% | 50.98% | 0.25% | 82.1s |
| Last 20 < −10% | 3,269 | 16.35% | 0.00% | 12.48% | 37.96% | 48.49% | 53.35% | 46.41% | 0.24% | 77.0s |
| Full desktop: last 50 < −10% | 5,636 | 28.18% | 0.00% | 7.86% | 28.53% | 38.66% | 43.29% | 56.41% | 0.30% | 85.8s |

The plain full-desktop decline selects 9,932 seeds and finishes with **3,884 wins, 6,019 liquidations and 29 unfinished**. Its 600s win interval is **38.15–40.07%**; successful p10/median/p90 are **56.3 / 95.1 / 255.5 seconds**. Its 0/9,932 wins by 30s have an approximate 95% upper bound of 0.04%.

The recent −5% filter selects 3,982 seeds and finishes with **2,146 wins, 1,825 liquidations and 11 unfinished**. Its 600s win interval is **52.34–55.44%**; successful p10/median/p90 are **53.8 / 77.0 / 226.2 seconds**. Its 0/3,982 wins by 30s have an approximate 95% upper bound of 0.10%. It appears in 19.91% of fresh starts (about one in five); the probability that a random fresh seed both qualifies and wins is 2,146/20,000 = **10.73%**, before any restart screening.

### Outcomes over time, not just successful runs

| Filter | Horizon | Success | Ruin | Unfinished |
| --- | ---: | ---: | ---: | ---: |
| Full desktop: last 50 < 0% | 30s | 0.00% | 20.02% | 79.98% |
| Full desktop: last 50 < 0% | 60s | 5.99% | 31.09% | 62.92% |
| Full desktop: last 50 < 0% | 120s | 24.19% | 44.17% | 31.64% |
| Full desktop: last 50 < 0% | 240s | 34.49% | 55.50% | 10.01% |
| Full desktop: last 50 < 0% | 600s | 39.11% | 60.60% | 0.29% |
| Last 10 < −5% | 30s | 0.00% | 8.01% | 91.99% |
| Last 10 < −5% | 60s | 12.81% | 17.20% | 69.99% |
| Last 10 < −5% | 120s | 38.93% | 28.30% | 32.77% |
| Last 10 < −5% | 240s | 49.27% | 39.93% | 10.80% |
| Last 10 < −5% | 600s | 53.89% | 45.83% | 0.28% |

## Rising-chart 20× long comparison

These mirror the declining filters with **positive** returns and positive thresholds. Percent-return thresholds select slightly different counts because the model evolves in log price. The 100% allocation, unchanged hold, fees and tick execution are identical.

| Initial rising filter | Selected / 20,000 | Selection | Win ≤30s | ≤60s | ≤120s | ≤240s | ≤600s | Ruin 600s | Unfinished 600s | Successful median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No history filter | 20,000 | 100.00% | 0.09% | 10.14% | 23.75% | 31.80% | 34.85% | 65.04% | 0.11% | 80.9s |
| Full desktop: last 50 > 0% | 10,068 | 50.34% | 0.16% | 14.54% | 30.85% | 39.87% | 43.25% | 56.64% | 0.11% | 74.5s |
| Full mobile: last 40 > 0% | 10,037 | 50.19% | 0.16% | 14.86% | 31.42% | 40.46% | 43.96% | 55.95% | 0.09% | 74.2s |
| Last 20 > 0% | 10,033 | 50.17% | 0.16% | 16.11% | 33.60% | 42.60% | 46.32% | 53.58% | 0.10% | 72.8s |
| Last 10 > 0% | 9,992 | 49.96% | 0.18% | 17.09% | 34.95% | 44.45% | 48.14% | 51.71% | 0.15% | 72.2s |
| Last 10 > +3% | 6,214 | 31.07% | 0.26% | 22.98% | 42.29% | 51.26% | 54.84% | 45.03% | 0.13% | 65.6s |
| Last 10 > +5% | 4,264 | 21.32% | 0.28% | 26.57% | 46.08% | 54.22% | 57.76% | 42.10% | 0.14% | 62.7s |
| Last 20 > +5% | 6,193 | 30.96% | 0.24% | 21.36% | 40.79% | 49.49% | 53.01% | 46.89% | 0.10% | 66.8s |
| Last 20 > +10% | 3,925 | 19.63% | 0.28% | 25.27% | 44.20% | 52.59% | 56.38% | 43.49% | 0.13% | 63.5s |
| Full desktop: last 50 > +10% | 6,094 | 30.47% | 0.18% | 17.87% | 35.33% | 44.32% | 47.65% | 52.26% | 0.08% | 70.0s |

Long has a somewhat easier time target under symmetric log drift: +20.3102% is about +0.1849 log return, whereas a −20.2899% short target is about −0.2268 log return. The downside and upside liquidation distances also differ slightly in log space. This is a consequence of linear P&L and multiplicative prices, not a favorable path chosen after entry.

## Same declining-history short at 1× and 5×

| Leverage | Initial filter | Selected | Win ≤30/60/120/240s | Win ≤600s | Ruin 600s | Unfinished 600s | Successful median |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1× | No history filter | 20,000 | 0 / 0 / 0 / 0% | 0.00% | 16.28% | 83.73% | — |
| 1× | Full desktop: last 50 < 0% | 9,932 | 0 / 0 / 0 / 0% | 0.00% | 14.09% | 85.91% | — |
| 1× | Last 10 < 0% | 10,008 | 0 / 0 / 0 / 0% | 0.00% | 12.70% | 87.30% | — |
| 1× | Last 10 < −5% | 3,982 | 0 / 0 / 0 / 0% | 0.00% | 10.35% | 89.65% | — |
| 1× | Last 20 < −10% | 3,269 | 0 / 0 / 0 / 0% | 0.00% | 10.86% | 89.14% | — |
| 5× | No history filter | 20,000 | 0 / 0 / 0 / 0% | 0.23% | 60.11% | 39.66% | 516.5s |
| 5× | Full desktop: last 50 < 0% | 9,932 | 0 / 0 / 0 / 0% | 0.31% | 55.09% | 44.59% | 510.4s |
| 5× | Last 10 < 0% | 10,008 | 0 / 0 / 0 / 0% | 0.35% | 51.90% | 47.75% | 514.2s |
| 5× | Last 10 < −5% | 3,982 | 0 / 0 / 0 / 0% | 0.55% | 46.76% | 52.69% | 510.4s |
| 5× | Last 20 < −10% | 3,269 | 0 / 0 / 0 / 0% | 0.58% | 47.51% | 51.91% | 510.4s |

The 1× short result is structurally zero for this one-entry strategy, not merely an observed zero. With budget B, leverage L and fee f, margin is `m = B/(1+L*f)` and initial notional is `N = m*L`. A short's cash on full close at price ratio r is `m + N − N*r*(1+f)`. At 1× its absolute maximum as price approaches zero is `m + N = $19,990.005`, far below $50,000. There is no compounding in this hold strategy.

At 5×, a short needs a further **80.2599% price decline** to pay; this explains the very low ten-minute win rate. This should not be confused with the original active 5× strategy, which switches direction and reinvests profits.

## Gross equity versus usable cash

20× entry uses **$9,900.9901 margin + $99.0099 opening fee**. On a short, gross equity reaches $50,000 at a price ratio of **0.7975000**, but closing fees require **0.7971014493**. A gross-only target would incorrectly count 3 extra full-decline runs at 600s (**3,887 gross crossings vs 3,884 paid wins**) and 5 extra at 60s (**600 vs 595**). In the stronger recent −5% subset the corresponding 600s numbers are **2,148 vs 2,146**. All headline success rates use actual net cash and successful payment.

For successful 20× short runs, the median gross-to-net crossing delay is zero ticks because many ticks cross both levels at once; p90 is 0.3 seconds. Rare reversals can reach gross equity but never the fee-adjusted target before liquidation or the horizon. The simulator records those separately.

## Why the initial history predicts future direction

In `market.js`, warmup executes the same `step()` 1,000 times and then returns the still-live closure. It preserves **regime, range anchor, trend strength, current drift, current volatility, volatility target and RNG continuation**. At t=0 only the candle boundary/time changes; the underlying state is not redrawn.

A regime has independent per-tick transition probability `1 − exp(−0.1/60)`, so the expected remaining dwell is still 60 seconds. Even a visibly long prior trend is not “due” to reverse: no-transition probability is about **60.7% over the next 30s**, **36.8% over 60s**, and **13.5% over 120s**, conditional on the current latent state. These are model mechanics, not a hidden-state signal used by the strategies.

Trend drift is substantial for this accelerated game (0.24–0.40% per second in a settled trending regime), eases over four seconds, and survives the warmup boundary. Volatility also carries over and eases over 15 seconds. Noise and rare jumps can still liquidate a 20× position; range states mean-revert, and state changes can reverse a previously readable trend. The recent 10-candle window reflects the current state more closely than the full 50-candle window, which can mix earlier regimes.

Observed correlations between **initial-history log return** and **subsequent log return**, across all 20,000 paths:

| History window | Next 30s | Next 60s | Next 120s | Next 240s | Next 600s |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 candles | 0.5726 | 0.4793 | 0.3545 | 0.2435 | 0.1417 |
| 20 candles | 0.5177 | 0.4359 | 0.3199 | 0.2183 | 0.1261 |
| 40 candles | 0.4133 | 0.3470 | 0.2523 | 0.1680 | 0.0971 |
| 50 candles | 0.3813 | 0.3201 | 0.2331 | 0.1529 | 0.0884 |

With the full desktop history declining, price is lower 30 seconds later in **60.91%** of seeds. With the recent −5% filter it is lower in **81.97%**. Directional predictability is therefore considerably stronger than the probability of an immediate fivefold account gain: a small further decline is not enough to pay, and an interim adverse move can liquidate before a later decline.

## Is this shortcut stronger than intended?

It is a meaningful start-screen advantage, not a broken accounting exploit. A coarse “chart is down” rule raises 600s win probability by 7.50 percentage points; the stronger recent-decline screen raises it by 22.28 points, to slightly above one half. Its winning runs are often faster than the original 2–4 minute pacing aim, and free restarts make qualifying charts inexpensive to search for. Thus a player can replace ongoing decision-making with chart screening and one risky position. However, full-history declines still lose more often than they win, and even the stronger screen loses almost half its entries.

Changing the **default** to 1× does not remove that strategy: 20× remains selectable before entering. Whether the opening signal is desirable skill expression or an overly effective shortcut is a balance decision. No warmup, trend persistence, volatility, leverage availability, target or trading rule has been changed as part of this analysis.

## Pacing when the player stays at the new 1× default

This is a **separate active-policy experiment**: 1,000 seeds 20001–21000, 600-second horizon, decisions every two seconds, full allocation. The existing random/trend/range policies close/reopen and can reinvest. Both 1× and 5× use identical seeds and policies. It is not the one-entry hold strategy above.

| Policy | Leverage | Success | Ruin | Unfinished | Success by 240s | Successful median | Terminal equity median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| random | 1x | 0.0% | 0.0% | 100.0% | 0.0% | — | $9,159.71 |
| trend | 1x | 0.6% | 0.0% | 99.4% | 0.0% | 566s | $23,644.51 |
| range | 1x | 0.0% | 0.0% | 100.0% | 0.0% | — | $3,920.01 |
| random | 5x | 3.0% | 0.0% | 97.0% | 0.8% | 382s | $3,847.52 |
| trend | 5x | 90.6% | 0.0% | 9.4% | 45.6% | 238s | $50,860.43 |
| range | 5x | 0.0% | 0.4% | 99.6% | 0.0% | — | $60.06 |

The trend policy at 1× wins **6/1,000** times by ten minutes, none by four minutes; its six wins have a median of **566s (9m26s)**. The 99.4% unfinished rate matters far more than that conditional median. At 5× the same policy wins 906/1,000 by ten minutes, 45.6% by four minutes, with a successful median of 238s. Staying at 1× is materially slower; the old pacing claim does not carry over. Higher leverage remains a deliberate user choice, and no compensating retune was made.
