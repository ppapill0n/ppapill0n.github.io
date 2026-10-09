import { createCubeGame as createSharedCubeGame } from '../../common/cube-game.js?v=20261009-orbit';

export function createCube2Game(root, changed) {
  return createSharedCubeGame(root, changed, 2);
}
