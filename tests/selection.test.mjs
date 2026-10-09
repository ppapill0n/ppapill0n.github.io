import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseGame, createGameSelector, gameSelectionWeights, GAME_RECENCY } from '../gate/common/selection.js';
import { GAME_IDS, GROWTH_COUNTS, seededRandom, simulate } from './selection-simulation.mjs';

const games = GAME_IDS.map(id => ({ id }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const weights = (registry, history, options) => gameSelectionWeights(registry, history, options).map(item => item.weight);

function drawFor(registry, history, id) {
  const entries = gameSelectionWeights(registry, history);
  const target = entries.findIndex(item => item.game.id === id);
  const total = entries.reduce((sum, item) => sum + item.weight, 0);
  return (entries.slice(0, target).reduce((sum, item) => sum + item.weight, 0) + entries[target].weight / 2) / total;
}

test('initial selection is uniform for every catalog size without a manual ID list', () => {
  for (const count of [1, ...GROWTH_COUNTS]) {
    const registry = Array.from({ length: count }, (_, i) => ({ id: `game-${i}` }));
    assert.deepEqual(weights(registry, []), Array(count).fill(1));
    for (let i = 0; i < count; i++) assert.equal(chooseGame(registry, () => (i + .5) / count), registry[i]);
  }
});

test('approved seven-game decay starts at .65, halves its penalty every two visits, and tends to 1', () => {
  assert.deepEqual(GAME_RECENCY, { strength: .35, halfLife: 2 });
  assert.ok(Object.isFrozen(GAME_RECENCY));
  let previous = 0;
  for (let age = 1; age <= 120; age++) {
    const history = [games[0].id, ...Array(age).fill(games[1].id)];
    const actual = weights(games, history)[0];
    close(actual, 1 - .35 * .5 ** ((age - 1) / 2));
    assert.ok(actual >= previous && actual >= .65 && actual <= 1);
    previous = actual;
  }
  const history = games.map(game => game.id);
  const actual = weights(games, history);
  [0.9381281566461771, .9125, .8762563132923542, .825, .7525126265847084, .65, 0]
    .forEach((expected, i) => close(actual[i], expected));
  assert.equal(previous, 1);
});

test('only current is excluded; every other identity has selectable support at all tested sizes', () => {
  for (const count of GROWTH_COUNTS) {
    const registry = Array.from({ length: count }, (_, i) => ({ id: `game-${i}` }));
    for (const current of registry) {
      const history = [...registry.map(game => game.id), current.id];
      const entries = gameSelectionWeights(registry, history);
      const total = entries.reduce((sum, item) => sum + item.weight, 0);
      for (const { game, weight } of entries) {
        if (game === current) { assert.equal(weight, 0); continue; }
        assert.ok(weight >= .65 && weight <= 1);
        assert.ok(weight / total >= .65 / (count - 1));
        assert.equal(chooseGame(registry, () => drawFor(registry, history, game.id), history), game);
      }
      assert.notEqual(chooseGame(registry, () => 0, history), current);
      assert.notEqual(chooseGame(registry, () => 1 - Number.EPSILON, history), current);
    }
  }
});

test('weights normalize over eligible games rather than promising uniform conditionals', () => {
  const history = [games[0].id, games[1].id];
  const actual = weights(games, history), total = actual.reduce((sum, value) => sum + value, 0);
  assert.deepEqual(actual, [.65, 0, 1, 1, 1, 1, 1]);
  close(total, 5.65);
  close(actual[0] / total, .65 / 5.65);
  close(actual[2] / total, 1 / 5.65);
  // A-B-A does not compound A's old visit or force a third identity.
  assert.deepEqual(weights(games, [games[0].id, games[1].id, games[0].id]), [0, .65, 1, 1, 1, 1, 1]);
});

test('last visit alone matters, old visits recover smoothly, and pure inputs are unchanged', () => {
  const [a, b, c, d] = games.map(game => game.id);
  close(weights(games, [a, b, c, d])[0], .825);
  close(weights(games, [a, b, a, c])[0], weights(games, [a, c])[0]);
  close(weights(games, [a, a, c])[0], .65);
  const history = [a, b, c, d], before = history.slice(), order = games.slice();
  chooseGame(games, () => .4, history);
  assert.deepEqual(history, before);
  assert.deepEqual(games, order);
  assert.deepEqual(weights(games, ['removed-game']), Array(games.length).fill(1));
});

test('stateful selection exactly matches a full-history oracle through long sessions', () => {
  const random = seededRandom(77), referenceRandom = seededRandom(77);
  const selector = createGameSelector(games, random), history = [];
  for (let i = 0; i < 2500; i++) {
    const actual = selector.next(), expected = chooseGame(games, referenceRandom, history);
    assert.equal(actual, expected);
    assert.notEqual(actual.id, history.at(-1));
    history.push(actual.id);
  }
});

test('bounded ages and defensive snapshots do not grow with visits or enforce coverage', () => {
  let draw = 0;
  const selector = createGameSelector(games, () => draw);
  selector.next();
  draw = 1 - Number.EPSILON;
  selector.next(); // The last ID is seen once, then omitted for the long run.
  draw = 0;
  for (let i = 0; i < 100000; i++) assert.equal(selector.next(), games[i % 2]);
  const state = selector.getRecency();
  assert.equal(state.size, 3);
  assert.equal(state.get(games.at(-1).id), 111);
  assert.ok([...state.values()].every(age => Number.isInteger(age) && age >= 0 && age <= 111));
  state.clear();
  assert.equal(selector.getRecency().size, 3);
  assert.equal(createGameSelector(games).getRecency().size, 0);
});

test('renaming identities leaves every draw decision unchanged at small and large sizes', () => {
  for (const count of GROWTH_COUNTS) {
    const original = Array.from({ length: count }, (_, i) => ({ id: `original-${i}` }));
    const renamed = original.map((game, i) => ({ id: `unrelated-${count - i}` }));
    const left = createGameSelector(original, seededRandom(42)), right = createGameSelector(renamed, seededRandom(42));
    for (let i = 0; i < 2000; i++) assert.equal(original.indexOf(left.next()), renamed.indexOf(right.next()));
  }
});

test('new IDs are unseen; stable IDs survive object replacement/reordering; removals are pruned', () => {
  let draw = 0;
  const registry = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const selector = createGameSelector(registry, () => draw);
  assert.equal(selector.next().id, 'a');
  assert.equal(selector.next().id, 'b');
  registry.push({ id: 'new' });
  const history = ['a', 'b'];
  assert.equal(weights(registry, history).at(-1), 1);
  draw = drawFor(registry, history, 'new');
  assert.equal(selector.next().id, 'new');
  history.push('new');
  registry.reverse();
  registry[3] = { id: 'a', label: 'Updated label' };
  draw = drawFor(registry, history, 'a');
  assert.equal(selector.next(), registry[3]);
  assert.equal(selector.getRecency().get('b'), 2);
  registry.splice(registry.findIndex(game => game.id === 'b'), 1);
  selector.next();
  assert.equal(selector.getRecency().has('b'), false);
  assert.ok(selector.getRecency().size <= registry.length);
});

test('one game safely returns its only choice; two games necessarily alternate', () => {
  const singleton = [{ id: 'only' }], single = createGameSelector(singleton);
  assert.equal(single.next(), singleton[0]);
  assert.equal(single.next(), singleton[0]);
  assert.deepEqual(weights(singleton, ['only']), [1]);
  assert.equal(chooseGame(singleton, () => .5, ['only']), singleton[0]);
  assert.deepEqual([...single.getRecency()], [['only', 0]]);
  for (const sample of [0, .5, 1 - Number.EPSILON]) {
    const pair = games.slice(0, 2), selector = createGameSelector(pair, () => sample);
    let previous;
    for (let i = 0; i < 100; i++) {
      const game = selector.next();
      assert.notEqual(game, previous);
      previous = game;
    }
  }
});

test('malformed registries, parameters and RNG results fail without changing selection state', () => {
  for (const registry of [[], null, [{ id: 'same' }, { id: 'same' }], [{ id: null }], [null], [{ id: '' }]]) {
    assert.throws(() => createGameSelector(registry), TypeError);
    assert.throws(() => chooseGame(registry), TypeError);
  }
  for (const options of [{ strength: -1 }, { strength: 1 }, { strength: NaN }, { halfLife: 0 }, { halfLife: Infinity }, { halfLife: 1e100 }]) {
    assert.throws(() => createGameSelector(games, Math.random, options), RangeError);
    assert.throws(() => gameSelectionWeights(games, [], options), RangeError);
  }
  for (const draw of [-.1, 1, Infinity, NaN, undefined, '0.5']) {
    assert.throws(() => chooseGame(games, () => draw), RangeError);
    let sample = 0;
    const selector = createGameSelector(games, () => sample);
    selector.next();
    const before = selector.getRecency();
    sample = draw;
    assert.throws(() => selector.next(), RangeError);
    assert.deepEqual(selector.getRecency(), before);
  }
  assert.equal(chooseGame(games, () => -0), games[0]);
});

test('zero strength gives exact uniform exclusion and options are captured defensively', () => {
  const options = { strength: 0, halfLife: 3 };
  assert.deepEqual(weights(games, GAME_IDS, options), [...Array(games.length - 1).fill(1), 0]);
  const selector = createGameSelector(games, () => .25, options);
  options.strength = 1;
  assert.doesNotThrow(() => selector.next());
});

test('simulation is deterministic and reports exact invariants without statistical test thresholds', () => {
  for (const count of GROWTH_COUNTS) {
    for (const mode of ['uniform-exclusion', 'decaying-recency', 'capped-scaled-recency']) {
      const result = simulate(mode, 200, 42, count);
      assert.deepEqual(result, simulate(mode, 200, 42, count));
      assert.equal(result.immediateRepeats, 0);
      assert.equal(Object.values(result.counts).reduce((sum, value) => sum + value, 0), result.draws);
      if (count === 2) {
        assert.equal(result.abaRate, 1);
        assert.equal(result.ababRate, 1);
      }
    }
  }
});
