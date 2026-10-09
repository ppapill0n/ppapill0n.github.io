// Recency recovery, not a shuffle bag. Exclude current when alternatives exist.
// Keep these independent of catalog size: more games already mean fewer repeats.
export const GAME_RECENCY = Object.freeze({ strength: 0.35, halfLife: 2 });

function parameters(options) {
  const config = { ...GAME_RECENCY, ...options };
  const { strength, halfLife } = config;
  // After 55 half-lives, the penalty is below a quarter of the IEEE-754
  // spacing below 1, with margin for arithmetic rounding. The weight is 1.
  config.maxAge = 1 + Math.ceil(55 * halfLife);
  if (!Number.isFinite(strength) || strength < 0 || strength >= 1 ||
      !Number.isFinite(halfLife) || halfLife <= 0 || !Number.isSafeInteger(config.maxAge)) {
    throw new RangeError('Recency needs 0 <= strength < 1 and a positive, safely bounded half-life.');
  }
  return config;
}

function validateRegistry(registry) {
  if (!Array.isArray(registry) || !registry.length || registry.some(game => !game || typeof game.id !== 'string' || !game.id)) {
    throw new TypeError('Games must have nonempty string IDs.');
  }
  const ids = new Set(registry.map(game => game.id));
  if (ids.size !== registry.length) throw new TypeError('Game IDs must be unique.');
  return ids;
}

function weightsFromAges(registry, ages, { strength, halfLife }) {
  return registry.map(game => {
    const age = ages.get(game.id);
    return {
      game,
      weight: registry.length === 1 ? 1 : age === 0 ? 0 : age === undefined ? 1 : 1 - strength * 0.5 ** ((age - 1) / halfLife)
    };
  });
}

/**
 * Pure reference API: history is an oldest-to-newest list including current.
 * Only the latest occurrence of each ID matters. If A then B were visited,
 * A's age d is 1 and its weight is 1 - strength * 0.5 ** ((d - 1) / halfLife).
 * Production keeps bounded ages instead of retaining the whole visit history.
 */
export function gameSelectionWeights(registry, history = [], options = GAME_RECENCY) {
  validateRegistry(registry);
  const config = parameters(options), ages = new Map();
  for (let index = history.length - 1; index >= 0; index--) {
    const id = history[index];
    if (!ages.has(id)) ages.set(id, Math.min(history.length - 1 - index, config.maxAge));
  }
  return weightsFromAges(registry, ages, config);
}

function drawGame(weights, random) {
  const candidates = weights.filter(item => item.weight > 0);
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

/** Pure selection, preserving registry order and object identity. */
export function chooseGame(registry, random = Math.random, history = [], options = GAME_RECENCY) {
  return drawGame(gameSelectionWeights(registry, history, options), random);
}

/** One selector per mounted gate; one bounded age per ID, no session counter. */
export function createGameSelector(registry, random = Math.random, options = GAME_RECENCY) {
  validateRegistry(registry);
  const config = parameters(options), ages = new Map();
  return {
    next() {
      // IDs, not labels/array positions, identify games. Appended games start
      // unseen; replacing/reordering a game preserves its age when its ID stays.
      const ids = validateRegistry(registry);
      const game = drawGame(weightsFromAges(registry, ages, config), random);
      // Mutate only after a valid selection, including after a bad RNG result.
      for (const [id, age] of ages) {
        if (!ids.has(id)) ages.delete(id);
        else ages.set(id, Math.min(age + 1, config.maxAge));
      }
      ages.set(game.id, 0);
      return game;
    },
    getRecency: () => new Map(ages)
  };
}
