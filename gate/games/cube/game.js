import { createCubeGame as createSharedCubeGame } from '../../common/cube-game.js?v=20261009-orbit';

export function createCubeGame(root, changed) {
  return createSharedCubeGame(root, changed, 3);
}
