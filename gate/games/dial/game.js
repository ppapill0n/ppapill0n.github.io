import { InertiaDial } from './dial.js?v=20261009-freeplay';
import { formatValue } from '../../common/engine.js';
export function createDialGame(root, changed, tryEnter) {
  root.innerHTML = `<div class="dial-wrap"><div class="dial-marker" aria-hidden="true">▼</div><div id="dial" role="slider" tabindex="0" aria-label="Inertia dial" aria-valuemin="0" aria-valuemax="9999" aria-valuenow="0" aria-describedby="instructions"><div class="dial-face" aria-hidden="true"><span class="dial-tick"></span></div><span class="dial-value" id="value" aria-hidden="true">0000</span></div></div><div class="direction-controls" role="group" aria-label="Rotation controls"><button class="direction" data-direction="-1" type="button" aria-label="Hold to rotate left">←</button><button class="direction" data-direction="1" type="button" aria-label="Hold to rotate right">→</button></div><p id="instructions" class="sr-only">Hold a left or right button, or an arrow key, to accelerate. Opposite arrows brake and reverse the rotation. Release to coast. Match the target and stop completely before activating Enter. Values wrap between 0000 and 9999.</p>`;
  const el = root.querySelector('#dial');
  const dial = new InertiaDial(el, state => {
    root.querySelector('#value').textContent = formatValue(state.value);
    el.setAttribute('aria-valuenow', state.value);
    el.setAttribute('aria-valuetext', formatValue(state.value));
    el.style.setProperty('--rotation', `${state.value * 360 / 10000}deg`);
    changed(state);
  }, root.querySelectorAll('[data-direction]'));
  el.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) tryEnter(); }
  }, { signal:dial.events.signal });
  return { reset:challenge=>dial.reset(challenge.start), getState:()=>dial.getState(), destroy:()=>dial.destroy(), stop:()=>dial.stop() };
}
