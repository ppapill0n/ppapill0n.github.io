import { createGate, defaultRules } from './engine.js';
import { createDialGame } from './dial-game.js';
import { createCannonGame } from './cannon-game.js';
export function createRegistry(random = Math.random) {
  const dialTargets = createGate(undefined, random);
  return [
    { id:'dial', create:createDialGame, next:()=>dialTargets.next() },
    { id:'cannon', rules:{ ...defaultRules, tolerance:5 }, create:createCannonGame, next:()=>({ target:1 + Math.floor(random() * 1000) }) }
  ];
}
export function chooseGame(registry, random = Math.random) { return registry[Math.floor(random() * registry.length)]; }
