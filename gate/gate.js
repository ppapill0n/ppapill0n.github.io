import { canEnter, formatValue } from './common/engine.js';
import { enterPersonal } from './common/entry.js';
import { clearPass } from './common/session-pass.js';
import { createRegistry, createGameSelector } from './registry.js?v=20261009-orbit';
const registry = createRegistry();
const selector = createGameSelector(registry);
const root = document.querySelector('#game');
const enter = document.querySelector('#enter');
const status = document.querySelector('#state');
let active = null, target = null, generation = 0, rules;
function storageError(show) {
  let message=document.querySelector('#entry-error');
  if(show&&!message){message=document.createElement('p');message.id='entry-error';message.setAttribute('role','alert');enter.after(message);}
  if(message){message.hidden=!show;message.textContent=show?'Session storage is unavailable. Enable it to enter.':'';}
}
function tryEnter() {
  if (!active) return;
  const result=enterPersonal(target, active.getState(), rules);
  storageError(result==='unavailable');
}
function reset() {
  storageError(!clearPass());
  const current = ++generation;
  enter.disabled = true;
  const previous = active; active = null; previous?.destroy();
  const game = selector.next(); rules = game.rules;
  const challenge = game.next(); target = challenge.target;
  document.querySelector('#target').parentElement.hidden = !!game.hideTarget;
  document.querySelector('main').classList.toggle('cube-mode', !!game.cube);
  document.querySelector('#target').textContent = game.hideTarget ? '' : (game.formatTarget ?? formatValue)(target);
  document.querySelector('main').classList.toggle('gomoku-mode', game.id === 'gomoku');
  document.querySelector('main').classList.toggle('cannon-mode', game.id === 'cannon');
  document.querySelector('main').classList.toggle('slots-mode', game.id === 'slots');
  document.querySelector('main').classList.toggle('soda-mode', game.id === 'soda');
  root.dataset.game = game.id; delete root.dataset.phase;
  active = game.create(root, state => {
    if (current !== generation) return;
    enter.disabled = !canEnter(target, state, rules);
    const message = game.id === 'gomoku' ? (state.outcome === 'human' ? 'You won. Ready to enter.' : document.querySelector('#gomoku-status').textContent) : !state.stopped ? 'Moving.' : canEnter(target, state, rules) ? (!!game.cube ? 'Cube solved. Ready to enter.' : 'Target matched. Ready to enter.') : 'Stopped.';
    if (status.textContent !== message) status.textContent = message;
  }, tryEnter);
  active.reset(challenge);
}
document.querySelector('#new-target').addEventListener('click', reset);
document.querySelector('#new-target').disabled = false;
enter.addEventListener('click', tryEnter);
reset();
window.addEventListener('pageshow', () => active?.stop());
