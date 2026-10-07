import { canEnter, formatValue } from './engine.js';
import { createRegistry, chooseGame } from './registry.js';
const registry = createRegistry();
const root = document.querySelector('#game');
const enter = document.querySelector('#enter');
const status = document.querySelector('#state');
let active = null, target = null, generation = 0, rules;
function tryEnter() {
  if (active && canEnter(target, active.getState(), rules)) window.location.assign('../personal/');
}
function reset() {
  const current = ++generation;
  enter.disabled = true;
  const previous = active; active = null; previous?.destroy();
  const game = chooseGame(registry); rules = game.rules;
  const challenge = game.next(); target = challenge.target;
  document.querySelector('#target').parentElement.hidden = !!game.hideTarget;
  document.querySelector('main').classList.toggle('cube-mode', game.id === 'cube');
  document.querySelector('#target').textContent = (game.formatTarget ?? formatValue)(target);
  document.querySelector('main').classList.toggle('cannon-mode', game.id === 'cannon');
  document.querySelector('main').classList.toggle('slots-mode', game.id === 'slots');
  document.querySelector('main').classList.toggle('soda-mode', game.id === 'soda');
  root.dataset.game = game.id; delete root.dataset.phase;
  active = game.create(root, state => {
    if (current !== generation) return;
    enter.disabled = !canEnter(target, state, rules);
    const message = !state.stopped ? 'Moving.' : canEnter(target, state, rules) ? (game.id === 'cube' ? 'Cube solved. Ready to enter.' : 'Target matched. Ready to enter.') : 'Stopped.';
    if (status.textContent !== message) status.textContent = message;
  }, tryEnter);
  active.reset(challenge);
}
document.querySelector('#new-target').addEventListener('click', reset);
document.querySelector('#new-target').disabled = false;
enter.addEventListener('click', tryEnter);
reset();
window.addEventListener('pageshow', () => active?.stop());
