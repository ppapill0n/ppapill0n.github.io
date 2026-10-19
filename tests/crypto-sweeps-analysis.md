# Mixed countertrend shocks: implementation and held-out comparison

The implemented market permits sharp moves that recover, retain part/all of their price displacement, or accompany a genuine natural trend reversal. **A sharp countertrend move does not promise recovery.** The 1× default, minimal UI, accounting, hidden-tab clock, existing games and gate selection remain unchanged.

The underlying market is exactly the previous process: 100ms ticks; 2s OHLC; the same up/down/range transitions with mean ~60s, four-second drift response, volatility and original small jumps. A new independent seeded stream adds shocks to the observed log price. Golden hashes from commit `93c20c0` establish that disabling shocks reproduces the prior 600-second paths bit for bit; enabling zero-amplitude shocks also leaves those paths identical. The feature never consumes the background RNG or reads account state.

## Exact parameters and meaning

Source: [`config.js`](../gate/games/crypto/config.js), [`sweeps.js`](../gate/games/crypto/sweeps.js), [`market.js`](../gate/games/crypto/market.js).

| Parameter | Chosen value |
| --- | --- |
| Ordinary countertrend arrival | Mean 240 **eligible** seconds; per-tick probability `1 − exp(−0.1/240)` |
| Eligibility | No active event/cooldown; up/down regime with aligned smoothed drift greater than 0.0016/s |
| Natural reversal shock | 85% chance at an existing direct up↔down transition, only when idle/outside cooldown |
| Amplitude | Uniform 0.065–0.085 log-price offset; 12% use uniform 0.12–0.14 |
| Outbound move | Uniform 3–5s, cosine easing |
| Peak hold | Uniform 0–1.5s |
| Settling interval | Uniform 8–18s; cosine recovery raised to a uniform 0.75–1.75 exponent |
| Offset retention | 20% recover all of the offset; 30% retain a uniform 35–75%; 50% retain all |
| Cooldown | 20s after settling; no overlapping events |
| Randomness | Separate `seed ^ 0xC01D5EED` stream; all draws independent of positions/leverage/cash |

These probabilities describe **event components**, not observed recovery odds. Background drift/noise continue throughout. Retaining an offset permanently changes the price level; it does not force a permanent trend. Shocks attached to natural up↔down transitions move in the new regime's direction, with the same initial amplitude/timing distributions as ordinary countertrend shocks. Thus similar initial chart movements can precede either a rebound or a continuing reversal. Range transitions and further regime changes are never delayed or overridden. The 85% trigger applies only to an eligible actual transition, not 85% of all events or ticks. Event/cooldown exclusion makes actual arrivals rarer than an unrestricted Poisson clock.

The baseline log price and range anchor remain independent of the shock offset. Observed prices are `exp(baseLogPrice + retainedOffset + activeOffset)`, with the existing numeric bounds. Every observed tick goes into OHLC and liquidation. Warmup runs exactly this process for 1,000 ticks and retains ongoing shocks; live play does not redraw event type or clear a recovery. Snapshots expose only observed candles/current price/time, with no event/regime labels or future information.

## Calibration and frozen validation

Only two mixed candidates were considered, using **300 calibration seeds 50001–50300**. A temporary-only design served as an explicit rejected comparator. The final parameters were frozen before **2,000 held-out seeds 60001–62000**, with no subsequent market tuning.

| Calibration model | Positive old-direction return after 20s | Fully regained pre-move price within 60s | Confirmed-bounce 5× profitable closed trades | Trend 5× success / censored | Successful median |
| --- | ---: | ---: | ---: | --- | ---: |
| Temporary-only (rejected) | 78.18% | 78.79% | 92.29% | 69.67% / 30.33% | 266s |
| Mixed v1 (revised) | 63.31% | 58.06% | 79.81% | 66.67% / 33.33% | 286s |
| Final mixed candidate | 47.57% | 42.09% | 68.80% | 70.33% / 29.67% | 272s |

The temporary-only comparator used a 180s eligible arrival clock, no reversal-attached shocks, and 100% offset recovery. Mixed v1 used 180s, 55% reversal attachment, and 45/25/30% full/partial/no offset recovery. The final candidate uses the table above. Therefore calibration comparisons assess whole designs, not an isolated single-parameter effect. The reduction in automatic recovery was prioritized over preserving the previous 5× completion speed.

## Simulation method

- Both models receive the same seeds and exactly the same background regime, strength, volatility, diffusion and small-jump draws. Only the separate shock stream is enabled in the candidate. Neither policy can see the paired model.
- All runs start with $10,000 and stop on actual payment, bankruptcy, or the **600s horizon**. Success requires close fees to be paid and $50,000 settled cash, then successful Pay. Both 0.05% notional fees and every 100ms liquidation crossing apply.
- Initial holds enter once at t=0, after the observed warmup, with 100% cash at 10× or 20×. They do not add, stop out, switch or reinvest. They close/pay on the first observed 100ms target tick.
- Active policies act every 2s and can reinvest. The existing trend policy uses 4/12-candle means, a 0.4% signal threshold, a 35% collateral stop, direction changes and 20s rebalancing. `-half` allocates 50% of current available cash per entry; otherwise allocation is 100%.
- A visible sharp move is an absolute **3.5% log return over the last two completed candles**, opposite a preceding 20-second trend of at least **2% log return**. Detections are spaced at least 24s apart. Future returns never influence detection.
- Immediate bounce enters in the old trend direction at detection. Confirmed bounce waits up to 10s for a completed 2s candle gaining at least 0.6% log return in that direction, then enters at the current quote. Both close at +3% or −2.5% directional log return, or after 20s, evaluated every 2s; liquidation still happens every 100ms. No position sizing, stops or thresholds were selected using held-out results.
- Diagnostic detections stop at t=540s so all have 60s follow-up. Full/half recovery counts any actual intervening tick that regains the pre-move level/midpoint in log price, even if price later moves away. Diagnostic future prices never reach the bots.
- Ruin means flat cash below $1; censored means neither success nor ruin by 600s. A surviving but depleted account is not a win. Terminal equity in results is cash after hypothetical full close, or pre-payment settled cash for winners.
- All displayed success rates use **all selected starts**, not survivors or winners. Successful times condition on winning and must be read alongside success/ruin/censoring. These are automatic observed-price reactions, not human play, reaction-time or enjoyment measurements.

## Opening all-in holds

| Policy | Model | N | Success | Ruin | Censored | Success by 240s | Successful p10 / median / p90 | Equity p10 / median |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| hold-short20 | Baseline | 2000 | 33.65% | 66.05% | 0.30% | 29.40% | 57.6s / 101.2s / 253.5s | $0.00 / $0.00 |
| hold-short20 | Mixed shocks | 2000 | 31.75% | 67.95% | 0.30% | 27.70% | 56.2s / 104.7s / 260.7s | $0.00 / $0.00 |
| hold-long20 | Baseline | 2000 | 34.85% | 65.10% | 0.05% | 31.80% | 47.5s / 87.8s / 229.5s | $0.00 / $0.00 |
| hold-long20 | Mixed shocks | 2000 | 32.70% | 67.20% | 0.10% | 29.60% | 47.3s / 89.4s / 231.9s | $0.00 / $0.00 |
| hold-short10 | Baseline | 2000 | 21.85% | 68.65% | 9.50% | 7.80% | 156.6s / 283.6s / 493.9s | $0.00 / $0.00 |
| hold-short10 | Mixed shocks | 2000 | 20.45% | 70.35% | 9.20% | 7.10% | 158.3s / 291.3s / 487.7s | $0.00 / $0.00 |
| hold-long10 | Baseline | 2000 | 31.15% | 65.35% | 3.50% | 19.40% | 97.3s / 197.7s / 414.6s | $0.00 / $0.00 |
| hold-long10 | Mixed shocks | 2000 | 30.40% | 65.95% | 3.65% | 18.30% | 99.3s / 199.9s / 427.7s | $0.00 / $0.00 |

History filters are applied separately to each model's own initial visible chart; they can select different seeds because warmup includes shocks. Declining/rising means net return over the window, not every candle having the same color. The following table is the 20× short; the JSON includes both directions at both leverages and every time checkpoint.

| Initial short filter | Model | Selected | Success ≤60s | ≤120s | ≤240s | ≤600s | Ruin 600s | Censored | Successful median |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop50 | Baseline | 995 | 6.93% | 25.33% | 36.28% | 41.11% | 58.79% | 0.10% | 95.1s |
| desktop50 | Mixed shocks | 993 | 6.65% | 24.37% | 35.65% | 39.38% | 60.52% | 0.10% | 93.1s |
| last20 | Baseline | 1004 | 7.37% | 27.89% | 39.94% | 44.42% | 55.38% | 0.20% | 90.5s |
| last20 | Mixed shocks | 1008 | 6.85% | 25.99% | 38.10% | 42.26% | 57.44% | 0.30% | 91.4s |
| last10 | Baseline | 996 | 7.43% | 28.82% | 40.66% | 45.78% | 53.92% | 0.30% | 90.8s |
| last10 | Mixed shocks | 999 | 6.71% | 26.43% | 37.94% | 42.04% | 57.66% | 0.30% | 90.9s |
| last10_5pct | Baseline | 431 | 10.67% | 38.05% | 50.81% | 57.54% | 42.23% | 0.23% | 84.4s |
| last10_5pct | Mixed shocks | 436 | 8.72% | 34.40% | 45.41% | 50.00% | 49.31% | 0.69% | 83.2s |

With no filter, 20× short success falls **33.65% → 31.75%**, and long success **34.85% → 32.70%**. The added shocks therefore reduce this strategy modestly rather than making every leveraged entry lose. For the recent >5% decline, success falls **57.54% → 50.00%** using each chart's own filter. Among the **384 seeds qualifying in both versions**, the paired reduction is **7.29 percentage points**, approximate 95% interval **4.31–10.27 points**. The unfiltered paired short reduction is **1.90 points**, interval **0.81–2.99**. Intersections are diagnostic counterfactual comparisons, not a condition available to a player who sees only one version.

At 10×, unfiltered short success changes 21.85% → 20.45% and long 31.15% → 30.40%; the latter difference's paired interval includes zero. A profitable early position can have enough cushion to survive later sweeps. Also, allocating less cash preserves reserves but does not change the liquidation distance from entry at the same leverage. Those mechanics prevent claiming that a sweep selectively or reliably punishes every all-in trader.

## Active trend strategies and the 2–4 minute aim

| Policy | Model | N | Success | Ruin | Censored | Success by 240s | Successful p10 / median / p90 | Equity p10 / median |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| trend5 | Baseline | 2000 | 92.15% | 0.00% | 7.85% | 46.50% | 126s / 238s / 452s | $50,044.38 / $50,850.19 |
| trend5 | Mixed shocks | 2000 | 71.85% | 0.00% | 28.15% | 26.90% | 138s / 292s / 514s | $10,820.26 / $50,566.68 |
| trend5-half | Baseline | 2000 | 70.45% | 0.00% | 29.55% | 4.50% | 262s / 398s / 544s | $24,745.14 / $50,286.78 |
| trend5-half | Mixed shocks | 2000 | 39.00% | 0.00% | 61.00% | 1.90% | 284s / 448s / 572s | $12,723.19 / $35,268.78 |
| trend10 | Baseline | 2000 | 96.05% | 0.00% | 3.95% | 73.80% | 62s / 138s / 356s | $50,178.34 / $51,616.89 |
| trend10 | Mixed shocks | 2000 | 79.20% | 1.70% | 19.10% | 52.30% | 64s / 170s / 434s | $2,852.07 / $51,262.27 |
| trend10-half | Baseline | 2000 | 92.20% | 0.00% | 7.80% | 46.40% | 126s / 238s / 456s | $50,039.47 / $50,843.01 |
| trend10-half | Mixed shocks | 2000 | 72.75% | 0.00% | 27.25% | 27.20% | 138s / 296s / 514s | $12,244.82 / $50,565.90 |

At 5×, the candidate succeeds in **1,437/2,000 (71.85%)**, with **0 ruin / 563 censored**; successful median is **292s (4m52s)**. Only **26.9% of all starts** win by four minutes, and 22.15% finish specifically within 2–4 minutes. Its previous 92.15% ten-minute success and 238s winning median do not carry over.

At 10×, active trend trading succeeds in **1,584/2,000 (79.20%)**, with **34 ruined (1.70%) / 382 censored (19.10%)**. Successful median is **170s (2m50s)**, and **52.3% of all starts** win by four minutes. 24.35% finish specifically within 2–4 minutes; many others win earlier or later. **5.9% finish below $1,000**, so low strict ruin alone understates losses. At half allocation, 10× has **47 position liquidations but no account ruins**, confirming that reserved cash matters; it is slower, with a 296s successful median.

This is a real pacing cost, not a hidden recalibration of drift, target or default leverage. The default remains 1×; these higher-leverage policies do not describe 1× pacing, and the original 2–4 minute goal remains conditional rather than assured.

## Does a sharp move now guarantee a bounce?

No. In the held-out candidate there are **5,556 visible detections across 1,920/2,000 runs**. The unchanged baseline has only 479 detections across 399 runs. This is a descriptive conditional comparison: the detector selects different events, and multiple events from one seed are correlated.

| Time after detection | Positive old-direction return | Mean signed log return | Median signed log return | Regained half the move at any tick | Regained pre-move level at any tick |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2s | 27.77% | -1.055% | -0.757% | 0.49% | 0.02% |
| 4s | 36.05% | -0.834% | -0.694% | 4.50% | 0.31% |
| 8s | 48.76% | +0.107% | -0.130% | 23.45% | 6.97% |
| 12s | 52.41% | +0.644% | +0.395% | 35.46% | 16.68% |
| 20s | 48.72% | +0.407% | -0.205% | 43.47% | 26.75% |
| 30s | 45.32% | -0.089% | -1.158% | 47.59% | 33.01% |
| 60s | 46.06% | -0.734% | -1.478% | 54.91% | 42.69% |

At 20s, only **48.72%** are on the old-trend side of the detection price; the median signed log return is **−0.205%**. The mean is still **+0.408%**, so this is not a claim of zero expected-return predictability. The p10/p90 span is **−7.648% / +9.712%**, much larger than 20× liquidation distance. **57.31% never regain the pre-move price within 60s**. Some do recover later; a finite-horizon failure to recover does not prove a permanently lower/higher market.

A little confirmation remains informative. The bots below deliberately test that residual edge rather than only an immediate falling-knife entry.

| Policy | Model | N | Success | Ruin | Censored | Success by 240s | Successful p10 / median / p90 | Equity p10 / median |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| bounce5 | Baseline | 2000 | 0.00% | 0.00% | 100.00% | 0.00% | — / — / — | $8,613.53 / $10,000.00 |
| bounce5 | Mixed shocks | 2000 | 0.00% | 0.00% | 100.00% | 0.00% | — / — / — | $6,075.17 / $9,264.07 |
| bounce10 | Baseline | 2000 | 0.00% | 0.00% | 100.00% | 0.00% | — / — / — | $7,233.95 / $10,000.00 |
| bounce10 | Mixed shocks | 2000 | 0.00% | 0.05% | 99.95% | 0.00% | — / — / — | $3,045.74 / $7,721.64 |
| confirmed-bounce5 | Baseline | 2000 | 0.00% | 0.00% | 100.00% | 0.00% | — / — / — | $10,000.00 / $10,000.00 |
| confirmed-bounce5 | Mixed shocks | 2000 | 0.00% | 0.00% | 100.00% | 0.00% | — / — / — | $8,498.04 / $11,515.20 |
| confirmed-bounce10 | Baseline | 2000 | 0.00% | 0.00% | 100.00% | 0.00% | — / — / — | $10,000.00 / $10,000.00 |
| confirmed-bounce10 | Mixed shocks | 2000 | 0.10% | 0.00% | 99.90% | 0.00% | 568s / 568s / 568s | $6,877.90 / $12,883.69 |
| confirmed-bounce20 | Baseline | 2000 | 0.00% | 0.05% | 99.95% | 0.00% | — / — / — | $10,000.00 / $10,000.00 |
| confirmed-bounce20 | Mixed shocks | 2000 | 7.55% | 0.40% | 92.05% | 0.30% | 296s / 456s / 568s | $2,988.30 / $13,243.23 |

The candidate's immediate bounce bot has **43.99% profitable closed trades**; median terminal cash is **$9,264 at 5× / $7,722 at 10×**, and neither reaches the goal in these seeds. Confirmation raises profitable closed trades to **68.12% at 5×/10×**, and median cash to **$11,515 / $12,884**. At 20× the confirmed bot has **68.27% profitable closed trades**, **151 wins (7.55%) / 8 ruins (0.40%) / 1,841 censored (92.05%)**, and a **456s successful median**. Only **0.3% of all starts** finish by four minutes; median terminal cash is **$13,243**.

Thus the always-recover shortcut is substantially weaker, but a residual bounce edge clearly exists. Five related bots with fixed thresholds are not a proof of exploit resistance; more sophisticated timing, size selection, longer horizons or restarting may do better. Profitable-trade percentages exclude unclosed positions at the horizon and should not be substituted for all-run outcomes.

## Verification and review

- `node --test tests/*.test.mjs`: **135 passed**. New coverage includes old-path hashes, independent RNG, warmup continuity, identical-onset full/partial/no recovery, natural reversal attachment and cooldown, hidden recovery after liquidation inside a single candle, account independence, and comparative bots checked against real gameplay sessions.
- Local Chromium suite covers 320/390/768/1280px, mouse/touch/keyboard events, default 1×, accounting, restart, stale clicks, hidden catch-up, payment and storage denial. A production-config fixture (`seed=11`, Long 20×, 50% allocation, hidden 30s) liquidates at 3s and then rises above entry; the same-seed baseline position survives. A discarded-endpoint simulation would have missed that liquidation.
- Payment fixture changed from seed 3 (now legitimately censored at 600s) to seed 4 (the unchanged 5× policy wins at 140s). That fixture proves UI payment behavior, not overall pacing. No market parameter was tuned to it.
- Actual screenshots are inspected locally. Browser touch events and hidden time are simulated; no physical handset, Safari/Firefox or real OS suspend testing is claimed.

## Reproduce

```sh
# Calibration / rejected comparator; do not mix these with the held-out set.
node tests/crypto-sweeps-simulation.mjs 300 50001 temporary-only > tests/crypto-sweeps-calibration-temporary.json
node tests/crypto-sweeps-simulation.mjs 300 50001 mixed-v1 > tests/crypto-sweeps-calibration-v1.json
node tests/crypto-sweeps-simulation.mjs 300 50001 > tests/crypto-sweeps-calibration.json
# Frozen held-out comparison, all 13 policies with shared background paths.
node tests/crypto-sweeps-simulation.mjs 2000 60001 > tests/crypto-sweeps-results.json
node --test tests/*.test.mjs
python3 -m http.server 8767 --bind 127.0.0.1
SITE_URL=http://127.0.0.1:8767 ARTIFACT_DIR=/tmp/crypto-sweeps-review/browser node tests/crypto-browser.cjs
```

The browser command requires Playwright on Node's module path and Chromium (override `CHROMIUM` if necessary). This environment uses `NODE_PATH=/opt/codex/runtimes/cua/lib/node_modules`.

Raw reports: [held-out](crypto-sweeps-results.json), [final calibration](crypto-sweeps-calibration.json), [first mixed calibration](crypto-sweeps-calibration-v1.json), [temporary-only calibration](crypto-sweeps-calibration-temporary.json). Reports contain every 30/60/120/240/600s hold/strategy checkpoint, all-run outcomes, conditional completion quantiles, seed/config records, and paired comparison intervals. Degenerate paired normal intervals are omitted rather than implying certainty from zero observed differences. Wilson and approximate paired intervals quantify finite-seed uncertainty only; no claim is made about human success or real-world markets.
