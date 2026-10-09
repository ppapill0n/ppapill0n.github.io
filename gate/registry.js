import { createGate, defaultRules } from './common/engine.js';
import { createDialGame } from './games/dial/game.js?v=20261009-freeplay';
import { createCannonGame } from './games/cannon/game.js';
import { createSodaGame } from './games/soda/game.js';
import { createCubeGame } from './games/cube/game.js?v=20261009-orbit';
import { createCube2Game } from './games/cube2/game.js?v=20261009-orbit';
import { scramble } from './common/cube-engine.js';
import { createSlotsGame } from './games/slots/game.js';
import { createGomokuGame } from './games/gomoku/game.js';
export { chooseGame, createGameSelector } from './common/selection.js';
export function createRegistry(random = Math.random) {
  const dialTargets = createGate(undefined, random);
  return [
    { id:'dial', create:createDialGame, next:()=>dialTargets.next() },
    { id:'cannon', rules:{ ...defaultRules, tolerance:5 }, create:createCannonGame, next:()=>({ target:1 + Math.floor(random() * 1000) }) },
    { id:'slots', create:createSlotsGame, next:()=>({ target:777 }), formatTarget:String },
    { id:'soda', create:createSodaGame, next:()=>({ target:Math.floor(random() * 3001) }) },
    { id:'cube', create:createCubeGame, next:()=>({ target:1, ...scramble(random) }), hideTarget:true, cube:true },
    { id:'cube2', create:createCube2Game, next:()=>({ target:1, ...scramble(random,15,2) }), hideTarget:true, cube:true },
    { id:'gomoku', create:createGomokuGame, next:()=>({}), hideTarget:true, rules:{requireStopped:true,humanVictory:true} }
  ];
}
