import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { characterImageUrl } from '../gate/common/artwork.js';
import { symbolDefinitions } from '../gate/common/slot-symbols.js';

test('each existing game has an independently importable per-game entry point', async () => {
  for (const [id, exported] of [
    ['dial', 'createDialGame'], ['cannon', 'createCannonGame'],
    ['slots', 'createSlotsGame'], ['soda', 'createSodaGame'],
    ['cube', 'createCubeGame'], ['cube2', 'createCube2Game']
  ]) {
    const module = await import(`../gate/games/${id}/game.js`);
    assert.equal(typeof module[exported], 'function', `${id} entry point`);
  }
});

test('shared character artwork resolves to the preserved gate asset after module relocation', async () => {
  const expected = new URL('../gate/assets/character-reference.png', import.meta.url);
  assert.equal(characterImageUrl, expected.href);
  assert.ok(symbolDefinitions.includes(`href="${expected.href}"`));
  const bytes = await readFile(expected);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
