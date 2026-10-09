import { createCubeGame as createSharedCubeGame } from '../../common/cube-game.js';

export function createCubeGame(root, changed) {
  return createSharedCubeGame(root, changed, 3);
}
