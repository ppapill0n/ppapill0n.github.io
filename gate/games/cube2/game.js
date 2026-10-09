import { createCubeGame as createSharedCubeGame } from '../../common/cube-game.js';

export function createCube2Game(root, changed) {
  return createSharedCubeGame(root, changed, 2);
}
