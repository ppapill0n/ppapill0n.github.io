# Game selection

`selection.js` gives every registered game the same recency rule. `gate.js` owns one selector per mounted page. No state persists across page reloads, and Rematch stays within its current game without recording another global visit.

## Rule and tuning

The central `GAME_RECENCY` configuration contains `strength: 0.35` and `halfLife: 2`. These are intentionally fixed as the catalog grows; adding a game only requires its normal entry in `gate/registry.js`.

- The initial choice is uniform over all N games.
- If N >= 2, the current game has weight 0.
- An unseen ID has weight 1.
- For any other ID last seen d visits ago, weight = `1 - strength * 0.5 ** ((d - 1) / halfLife)`.
- Divide each eligible weight by their sum to get its conditional selection probability.

Here d counts the intervening visits, including the current game: after A → B, A has d = 1. With the defaults, weights at d = 1, 2, 3, 4, 5, 6 are 0.650, 0.753, 0.825, 0.876, 0.913, 0.938. After A → B with five unseen alternatives, A's probability is .65 / 5.65 = 11.504%; each unseen game's is 1 / 5.65 = 17.699%.

Only the **last** visit to an ID matters. Repeated appearances do not accumulate frequency penalties. There is no shuffle bag, quota, or finite-window guarantee. A → B → A and longer alternating runs remain possible. All identities receive equal long-run treatment under the same random source, not equal probabilities conditional on a particular history.

Every noncurrent game's weight is at least .65 and at most 1. With N >= 2 and a current registered game, every alternative's conditional probability is at least `.65 / (N - 1)`. This prevents structural starvation. Independent uniform random draws give eventual selection with probability 1; no finite waiting-time guarantee is claimed, and a deliberately adversarial RNG can keep choosing a subset.

## Catalog growth and edge cases

Keep the short-term recovery horizon fixed. Larger catalogs already repeat less often: uniform exclusion has A → B → A probability `1 / (N - 1)`. Automatically increasing strength would apply additional pressure without evidence. We also tested a half-life proportional to alternatives, bounded between 1 and 4. It mildly increases wide-window coverage but does not improve immediate backtracking at larger N. See the [reproducible growth comparison](../../tests/selection-verification.md).

- One game: return the only game, including on Reset. Avoiding repetition is impossible, so this is the explicit exception to current-game exclusion.
- Two games: forced alternation; recency cannot change the only eligible choice.
- No games or duplicate/empty/non-string IDs: reject the invalid registry explicitly.
- Stable IDs preserve recency across object replacement, label changes, and registry reordering. New IDs start unseen. Removed IDs are pruned on the next successful selection; an ID later reintroduced after pruning is unseen.
- Random sources must return finite numbers in [0, 1). Invalid samples throw without changing selection state. Both endpoints inside the valid interval are covered. A last-candidate rounding fallback never returns an excluded game.

## Bounded state

Production keeps one age per seen registered ID in a Map, using O(N) time and space per Reset. There is no ever-growing visit list or absolute session counter. Ages saturate at `1 + ceil(55 * halfLife)`, which is 111 with the defaults. At that point the remaining penalty is below a quarter of the double-precision spacing below 1, with arithmetic-rounding margin, so the computed weight is already exactly 1. This is a numerical saturation bound, not a new product cutoff.

`getRecency()` returns a defensive Map snapshot for inspection. The pure `gameSelectionWeights(registry, history, options)` and `chooseGame(registry, random, history, options)` accept an oldest-to-newest history for reference/testing; production does not retain that history. Tests compare both paths. Optional configuration is captured at construction and validated to keep strength below 1 and age saturation within safe integers.

## Precedent, not a copied algorithm

Duolingo's [KDD 2020 Recovering Difference Softmax paper](https://burrsettles.com/pub/yancey.kdd20.pdf), sections 2.3–2.4, describes an exponentially recovering penalty based on the most recent exposure, followed by softmax over learned scores. That is a real precedent for the recovery idea. This selector instead uses equal baselines and directly normalized positive weights, counts game visits rather than days, and learns no reward scores. Its .35 strength and two-visit half-life are bespoke settings for this gate, not Duolingo's constants or industry-standard values.
