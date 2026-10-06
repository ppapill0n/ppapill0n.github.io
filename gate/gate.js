import { createGate, formatValue } from './engine.js';
import { InertiaDial } from './dial.js';
const gate = createGate();
const element = document.querySelector('#dial');
const enter = document.querySelector('#enter');
const status = document.querySelector('#state');
function render(state) {
  const value = formatValue(state.value);
  document.querySelector('#value').textContent = value;
  element.setAttribute('aria-valuenow', state.value);
  element.setAttribute('aria-valuetext', value);
  element.style.setProperty('--rotation', `${state.value * 360 / 10000}deg`);
  enter.disabled = !gate.canEnter(state);
  const message = !state.stopped ? 'Moving.' : gate.canEnter(state) ? 'Target matched. Ready to enter.' : 'Stopped.';
  if (status.textContent !== message) status.textContent = message;
}
const dial = new InertiaDial(element, render);
function newTarget() {
  const { target, start } = gate.next();
  document.querySelector('#target').textContent = formatValue(target);
  dial.reset(start);
}
function tryEnter() {
  if (gate.canEnter(dial.getState())) window.location.assign('../personal/');
}
document.querySelector('#new-target').addEventListener('click', newTarget);
document.querySelector('#new-target').disabled = false;
enter.addEventListener('click', tryEnter);
element.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) tryEnter(); }
});
newTarget();
window.addEventListener('pageshow', () => dial.stop());
