// Reproducible comparison: node tests/selection-simulation.mjs [draws] [seed]
import { pathToFileURL } from 'node:url';
import { createGameSelector } from '../gate/common/selection.js';

export const GAME_IDS = ['dial', 'cannon', 'slots', 'soda', 'cube', 'cube2', 'gomoku'];

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(mode, draws = 300000, seed = 20261009) {
  if (!['uniform-exclusion', 'weak-recency'].includes(mode)) throw new Error('Unknown selection mode.');
  if (!Number.isInteger(draws) || draws < 7) throw new Error('Use at least seven draws.');
  const random = seededRandom(seed);
  const registry = GAME_IDS.map(id => ({ id }));
  const selector = createGameSelector(registry, random);
  const counts = Object.fromEntries(GAME_IDS.map(id => [id, 0]));
  const window = [];
  const uniqueCounts = Object.fromEntries([3, 4, 7].map(size => [size, 0]));
  let current, immediateRepeats = 0, aba = 0, abab = 0, atMostThreeInSeven = 0, allSeven = 0;
  for (let i = 0; i < draws; i++) {
    const eligible = mode === 'uniform-exclusion' ? registry.filter(game => game.id !== current) : null;
    const id = mode === 'weak-recency' ? selector.next().id : eligible[Math.floor(random() * eligible.length)].id;
    counts[id]++;
    immediateRepeats += Number(id === current);
    aba += Number(window.length >= 2 && id === window.at(-2));
    abab += Number(window.length >= 3 && id === window.at(-2) && window.at(-1) === window.at(-3));
    window.push(id);
    if (window.length > 7) window.shift();
    for (const size of [3, 4, 7]) {
      if (window.length >= size) uniqueCounts[size] += new Set(window.slice(-size)).size;
    }
    if (window.length === 7) {
      const unique = new Set(window).size;
      atMostThreeInSeven += Number(unique <= 3);
      allSeven += Number(unique === 7);
    }
    current = id;
  }
  return {
    mode, draws, seed,
    counts,
    frequencies: Object.fromEntries(GAME_IDS.map(id => [id, counts[id] / draws])),
    immediateRepeats,
    abaRate: aba / (draws - 2),
    ababRate: abab / (draws - 3),
    meanDistinct: Object.fromEntries([3, 4, 7].map(size => [size, uniqueCounts[size] / (draws - size + 1)])),
    atMostThreeInSevenRate: atMostThreeInSeven / (draws - 6),
    allSevenRate: allSeven / (draws - 6)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const draws = Number(process.argv[2] || 300000);
  const seed = Number(process.argv[3] || 20261009);
  for (const mode of ['uniform-exclusion', 'weak-recency']) console.log(JSON.stringify(simulate(mode, draws, seed), null, 2));
}
