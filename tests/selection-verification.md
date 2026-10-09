# Decaying-recency verification, 2026-10-09

## Result

The production selector uses fixed strength .35 and half-life 2 for every catalog size. It preserves the requested seven-game behavior without adding catalog-dependent balancing. Game UI, Panda pacing/AI, entry eligibility, and session-pass code are unchanged by this follow-up.

Passed: all 74 Node tests (`node --test tests/*.test.mjs`), the independent DOM suite, six complete seeded legal Gomoku replays, browser-helper/simulation syntax checks, and `git diff --check`. The selector tests check exact weights and drawable intervals, identity relabel symmetry, stable IDs and registry changes, singleton/two-game behavior, RNG boundaries/invalid samples, full-history equivalence, and 100,000 visits with bounded state. They do not assert brittle random-frequency thresholds.

The existing cloud-shell restriction on standalone Playwright browser launches remains; this report does not claim those suites or new physical-device coverage. Targeted live publication verification is reported separately after deployment.

## Reproducible simulation

Command: `node tests/selection-simulation.mjs 1000000 20261009 --growth`

One million consecutive draws per cell, identical seeded RNG implementation/seed, no burn-in. All three policies use the actual production selector. Uniform exclusion sets strength to zero. The count-scaled counterfactual uses strength .35 with `halfLife = max(1, min(4, (N - 1) / 3))`; it is only in the simulation, never selected automatically in production. These are algorithm simulations, not a human-perception study or independent statistical experiments.

No immediate repeats occurred in any of the 18 runs. N = 1 is tested separately as the intentional sole-choice exception.

| Games | Policy | Half-life | A-B-A | A-B-A-B | Mean distinct in 7 | Mean distinct in N |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 2 | Uniform exclusion | 2 | 100.000% | 100.000% | 2.000 | 2.000 |
| 2 | Fixed recovery (chosen) | 2 | 100.000% | 100.000% | 2.000 | 2.000 |
| 2 | Count-scaled (comparison) | 1 | 100.000% | 100.000% | 2.000 | 2.000 |
| 3 | Uniform exclusion | 2 | 50.012% | 25.013% | 2.969 | 2.500 |
| 3 | Fixed recovery (chosen) | 2 | 44.966% | 19.462% | 2.986 | 2.550 |
| 3 | Count-scaled (comparison) | 1 | 42.798% | 17.577% | 2.989 | 2.572 |
| 7 | Uniform exclusion | 2 | 16.676% | 2.762% | 4.991 | 4.991 |
| 7 | Fixed recovery (chosen) | 2 | 12.717% | 1.556% | 5.181 | 5.181 |
| 7 | Count-scaled (comparison) | 2 | 12.717% | 1.556% | 5.181 | 5.181 |
| 12 | Uniform exclusion | 2 | 9.057% | 0.816% | 5.791 | 8.146 |
| 12 | Fixed recovery (chosen) | 2 | 6.477% | 0.406% | 5.974 | 8.430 |
| 12 | Count-scaled (comparison) | 3.67 | 6.800% | 0.445% | 5.977 | 8.471 |
| 20 | Uniform exclusion | 2 | 5.212% | 0.270% | 6.266 | 13.210 |
| 20 | Fixed recovery (chosen) | 2 | 3.589% | 0.118% | 6.402 | 13.556 |
| 20 | Count-scaled (comparison) | 4 | 3.738% | 0.128% | 6.413 | 13.689 |
| 50 | Uniform exclusion | 2 | 2.020% | 0.040% | 6.704 | 32.168 |
| 50 | Fixed recovery (chosen) | 2 | 1.364% | 0.021% | 6.768 | 32.573 |
| 50 | Count-scaled (comparison) | 4 | 1.384% | 0.019% | 6.777 | 32.835 |

### Seven-game detail

Uniform exclusion → fixed recovery:

- A-B-A: 16.676% → 12.717%
- A-B-A-B: 2.762% → 1.556%
- Mean distinct games in seven visits: 4.991 → 5.181
- Seven-visit windows containing at most three identities: 1.997% → 0.865%
- Seven-visit windows containing all seven identities: 1.526% → 2.616%
- Per-identity frequencies for fixed recovery: 14.2569%–14.3374%, near the symmetric long-run 1/7 share. This one sample is illustrative, not a proof of equality.

### Why keep the horizon fixed?

Natural backtracking already falls with the number of alternatives. The fixed rule reduces it from about 16.7% to 12.7% at seven games and from about 2.0% to 1.4% at 50 games. The scaled comparison keeps more alternatives penalized at once, slightly raising backtracking rates at 12/20/50 while modestly increasing wider-window coverage. Neither result justifies introducing a catalog-dependent policy for this request. Fixed settings stay interpretable and do not need updating when a game is added.

A-B-A-B and short narrow runs still occur. The new rule does not turn random selection into a rotation. Two games inevitably alternate under every no-immediate-repeat policy.

## Implementation and evidence

See [selection design and edge cases](../gate/common/selection.md) and [production source](../gate/common/selection.js). State is one bounded last-visit age per ID, O(N), capped at age 111 under the default settings because older weights round to exactly 1. There is no cumulative frequency penalty or unbounded session history.

The external precedent is [Duolingo's KDD 2020 paper](https://burrsettles.com/pub/yancey.kdd20.pdf), sections 2.3–2.4. Only the exponentially recovering last-exposure penalty is analogous; this code's direct normalized weights and constants are deliberately simpler and bespoke.
