const assert = require('node:assert/strict');
const histories = new WeakMap();

// Mirror visits for the pure reference weights. Inject only random draws;
// every transition still uses the real Reset button, teardown, and new adapter.
async function resetToGame(page, id, challengeRandom = 0) {
  const current = await page.locator('#game').getAttribute('data-game');
  const history = histories.get(page) || [current];
  histories.set(page, history);
  if (current === id) await resetToGame(page, id === 'dial' ? 'cannon' : 'dial', 0);
  const selected = await page.evaluate(async ({ id, history, challengeRandom }) => {
    const { createRegistry } = await import('/gate/registry.js');
    const { gameSelectionWeights } = await import('/gate/common/selection.js');
    const weights = gameSelectionWeights(createRegistry(), history);
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    const position = weights.findIndex(item => item.game.id === id);
    if (position < 0 || weights[position].weight === 0) throw Error(`Cannot select ${id}`);
    const before = weights.slice(0, position).reduce((sum, item) => sum + item.weight, 0);
    const draw = (before + weights[position].weight / 2) / total;
    window.__gateTestDraws = [draw, ...Array(150).fill(challengeRandom)];
    document.querySelector('#new-target').click();
    window.__gateTestDraws = [];
    return document.querySelector('#game').dataset.game;
  }, { id, history, challengeRandom });
  assert.equal(selected, id);
  assert.notEqual(selected, history.at(-1), 'Reset must leave the current game');
  history.push(selected);
}
module.exports = { resetToGame };
