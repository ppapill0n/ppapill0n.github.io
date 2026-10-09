// Reproducible comparison: node tests/selection-simulation.mjs [draws] [seed]
// Add --growth to compare the catalog sizes below and a rejected scaling option.
import { pathToFileURL } from 'node:url';
import { createGameSelector, GAME_RECENCY } from '../gate/common/selection.js';
import { createRegistry } from '../gate/registry.js';

export const GAME_IDS = createRegistry().map(game => game.id);
export const GROWTH_COUNTS = [2, 3, 7, 12, 20, 50];
export const MODES = ['uniform-exclusion', 'decaying-recency', 'capped-scaled-recency'];

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulationParameters(mode, gameCount) {
  if (!MODES.includes(mode)) throw new Error('Unknown selection mode.');
  return {
    ...GAME_RECENCY,
    strength: mode === 'uniform-exclusion' ? 0 : GAME_RECENCY.strength,
    // Counterfactual only. Production stays at halfLife=2 at every catalog size.
    halfLife: mode === 'capped-scaled-recency' ? Math.max(1, Math.min(4, (gameCount - 1) / 3)) : GAME_RECENCY.halfLife
  };
}

export function simulate(mode, draws = 300000, seed = 20261009, gameCount = GAME_IDS.length) {
  if (!Number.isInteger(gameCount) || gameCount < 2) throw new Error('Use at least two games.');
  if (!Number.isInteger(draws) || draws < Math.max(7, gameCount)) throw new Error('Use enough draws for a full window.');
  const ids = gameCount === GAME_IDS.length ? GAME_IDS : Array.from({ length: gameCount }, (_, i) => `game-${i + 1}`);
  const config = simulationParameters(mode, gameCount);
  const selector = createGameSelector(ids.map(id => ({ id })), seededRandom(seed), config);
  const counts = Object.fromEntries(ids.map(id => [id, 0]));
  const window = [], sizes = [...new Set([3, 4, 7, gameCount])];
  const uniqueCounts = Object.fromEntries(sizes.map(size => [size, 0]));
  let current, immediateRepeats = 0, aba = 0, abab = 0, atMostThreeInSeven = 0, allSeven = 0;
  for (let i = 0; i < draws; i++) {
    const id = selector.next().id;
    counts[id]++;
    immediateRepeats += Number(id === current);
    aba += Number(window.length >= 2 && id === window.at(-2));
    abab += Number(window.length >= 3 && id === window.at(-2) && window.at(-1) === window.at(-3));
    window.push(id);
    if (window.length > Math.max(...sizes)) window.shift();
    for (const size of sizes) {
      if (window.length >= size) uniqueCounts[size] += new Set(window.slice(-size)).size;
    }
    if (window.length >= 7) {
      const unique = new Set(window.slice(-7)).size;
      atMostThreeInSeven += Number(unique <= 3);
      allSeven += Number(unique === 7);
    }
    current = id;
  }
  return {
    mode, gameCount, config, draws, seed,
    counts,
    frequencies: Object.fromEntries(ids.map(id => [id, counts[id] / draws])),
    immediateRepeats,
    abaRate: aba / (draws - 2),
    ababRate: abab / (draws - 3),
    meanDistinct: Object.fromEntries(sizes.map(size => [size, uniqueCounts[size] / (draws - size + 1)])),
    atMostThreeInSevenRate: atMostThreeInSeven / (draws - 6),
    allSevenRate: allSeven / (draws - 6)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const draws = Number(process.argv[2] || 300000), seed = Number(process.argv[3] || 20261009);
  const growth = process.argv.includes('--growth');
  for (const count of growth ? GROWTH_COUNTS : [GAME_IDS.length]) {
    for (const mode of growth ? MODES : MODES.slice(0, 2)) console.log(JSON.stringify(simulate(mode, draws, seed, count)));
  }
}
