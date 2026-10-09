// A light recency nudge, not a shuffle bag: every game except the current one
// remains eligible on every reset. All identities receive the same treatment.
export const RECENT_GAME_WEIGHT = 0.85;
export const GAME_HISTORY_LENGTH = 3;

/**
 * History is an oldest-to-newest array of game IDs, including the current game.
 * Only the final three entries matter. Multiple appearances do not compound
 * the penalty, so a short alternating run is possible rather than forbidden.
 */
export function gameSelectionWeights(registry, history = []) {
  const recent = history.slice(-GAME_HISTORY_LENGTH);
  const current = recent.at(-1);
  const seen = new Set(recent);
  return registry.map(game => ({
    game,
    weight: game.id === current ? 0 : seen.has(game.id) ? RECENT_GAME_WEIGHT : 1
  }));
}

/** Pure selection, preserving registry order and object identity. */
export function chooseGame(registry, random = Math.random, history = []) {
  const candidates = gameSelectionWeights(registry, history).filter(item => item.weight > 0);
  if (!candidates.length) throw new RangeError('No different game is available.');
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new RangeError('The random source must return a number in [0, 1).');
  }
  let remaining = draw * candidates.reduce((sum, item) => sum + item.weight, 0);
  for (const { game, weight } of candidates) {
    if (remaining < weight) return game;
    remaining -= weight;
  }
  // Rounding at the upper boundary must never select an excluded game.
  return candidates.at(-1).game;
}

/** One selector per mounted gate; history lives only for that page visit. */
export function createGameSelector(registry, random = Math.random) {
  if (!registry.length || registry.some(game => typeof game.id !== 'string' || !game.id)) {
    throw new TypeError('Games must have nonempty string IDs.');
  }
  if (new Set(registry.map(game => game.id)).size !== registry.length) {
    throw new TypeError('Game IDs must be unique.');
  }
  const history = [];
  return {
    next() {
      const game = chooseGame(registry, random, history);
      history.push(game.id);
      if (history.length > GAME_HISTORY_LENGTH) history.shift();
      return game;
    },
    getHistory: () => history.slice()
  };
}
