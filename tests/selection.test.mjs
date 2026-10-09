import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseGame, createGameSelector, gameSelectionWeights,
  RECENT_GAME_WEIGHT, GAME_HISTORY_LENGTH
} from '../gate/common/selection.js';
import { GAME_IDS, seededRandom, simulate } from './selection-simulation.mjs';

const games = GAME_IDS.map(id => ({ id }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('initial game is uniform across all seven registry identities', () => {
  for (let i = 0; i < games.length; i++) assert.equal(chooseGame(games, () => (i + 0.5) / games.length), games[i]);
  assert.deepEqual(gameSelectionWeights(games).map(item => item.weight), Array(7).fill(1));
});

test('only current game is excluded; every other game has a positive chance', () => {
  for (const current of games) {
    const history = [games[2].id, games[4].id, current.id];
    const weights = gameSelectionWeights(games, history);
    assert.equal(weights.find(item => item.game === current).weight, 0);
    assert.ok(weights.filter(item => item.game !== current).every(item => item.weight > 0));
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    let before = 0;
    for (const { game, weight } of weights) {
      if (!weight) continue;
      assert.equal(chooseGame(games, () => (before + weight / 2) / total, history), game);
      before += weight;
    }
    assert.notEqual(chooseGame(games, () => 0, history), current);
    assert.notEqual(chooseGame(games, () => 1 - Number.EPSILON, history), current);
  }
});

test('conditional probabilities apply one mild penalty to the last three IDs', () => {
  assert.equal(RECENT_GAME_WEIGHT, 0.85);
  assert.equal(GAME_HISTORY_LENGTH, 3);
  const weights = gameSelectionWeights(games, ['dial', 'cannon', 'slots']);
  assert.deepEqual(weights.map(item => item.weight), [0.85, 0.85, 0, 1, 1, 1, 1]);
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  close(total, 5.7);
  close(weights[0].weight / total, 17 / 114);
  close(weights[3].weight / total, 10 / 57);
  // A-B-A leaves just B penalized: B can immediately return with .85/5.85.
  const alternating = gameSelectionWeights(games, ['dial', 'cannon', 'dial']);
  assert.deepEqual(alternating.map(item => item.weight), [0, 0.85, 1, 1, 1, 1, 1]);
  close(alternating[1].weight / alternating.reduce((sum, item) => sum + item.weight, 0), 17 / 117);
});

test('old history expires, duplicate sightings do not compound, and inputs remain unchanged', () => {
  const history = ['dial', 'cannon', 'slots', 'soda'];
  const before = history.slice();
  assert.deepEqual(gameSelectionWeights(games, history).map(item => item.weight), [1, 0.85, 0.85, 0, 1, 1, 1]);
  assert.deepEqual(gameSelectionWeights(games, ['dial', 'dial', 'slots']).map(item => item.weight), [0.85, 1, 0, 1, 1, 1, 1]);
  const order = games.slice();
  chooseGame(games, () => 0.4, history);
  assert.deepEqual(history, before);
  assert.deepEqual(games, order);
  assert.deepEqual(gameSelectionWeights(games, ['removed-game']).map(item => item.weight), Array(7).fill(1));
});

test('selector owns bounded visit history and allows repeated subsets without a bag', () => {
  const selector = createGameSelector(games, () => 0);
  assert.deepEqual(Array.from({ length: 12 }, () => selector.next().id), Array.from({ length: 12 }, (_, i) => i % 2 ? 'cannon' : 'dial'));
  assert.deepEqual(selector.getHistory(), ['cannon', 'dial', 'cannon']);
  const copy = selector.getHistory();
  copy.fill('soda');
  assert.deepEqual(selector.getHistory(), ['cannon', 'dial', 'cannon']);
  assert.deepEqual(createGameSelector(games).getHistory(), []);
});

test('renaming identities does not change probabilities or any draw decisions', () => {
  const renamed = games.map((game, i) => ({ id: `unrelated-name-${6 - i}` }));
  const originalSelector = createGameSelector(games, seededRandom(42));
  const renamedSelector = createGameSelector(renamed, seededRandom(42));
  for (let i = 0; i < 10000; i++) assert.equal(games.indexOf(originalSelector.next()), renamed.indexOf(renamedSelector.next()));
});

test('malformed registries or random sources cannot silently select an invalid game', () => {
  assert.throws(() => createGameSelector([]), TypeError);
  assert.throws(() => createGameSelector([{ id: 'same' }, { id: 'same' }]), TypeError);
  assert.throws(() => createGameSelector([{ id: null }]), TypeError);
  assert.throws(() => chooseGame([], () => 0), RangeError);
  assert.throws(() => chooseGame([{ id: 'only' }], () => 0, ['only']), RangeError);
  for (const draw of [-0.1, 1, Infinity, NaN, undefined]) assert.throws(() => chooseGame(games, () => draw), RangeError);
  const selector = createGameSelector(games, () => NaN);
  assert.throws(() => selector.next(), RangeError);
  assert.deepEqual(selector.getHistory(), []);
});

test('seeded 300k comparison mildly reduces cycling without enforcing even coverage', () => {
  const uniform = simulate('uniform-exclusion');
  const recency = simulate('weak-recency');
  assert.equal(uniform.immediateRepeats, 0);
  assert.equal(recency.immediateRepeats, 0);
  for (const rate of Object.values(recency.frequencies)) assert.ok(Math.abs(rate - 1 / 7) < 0.003);
  assert.ok(recency.abaRate < uniform.abaRate);
  assert.ok(recency.ababRate < uniform.ababRate);
  assert.ok(recency.atMostThreeInSevenRate < uniform.atMostThreeInSevenRate);
  assert.ok(recency.meanDistinct[7] > uniform.meanDistinct[7]);
  assert.ok(recency.meanDistinct[7] < uniform.meanDistinct[7] + 0.2);
  assert.ok(recency.ababRate > 0.015);
  assert.ok(recency.atMostThreeInSevenRate > 0.01);
  assert.ok(recency.allSevenRate < 0.05);
});
