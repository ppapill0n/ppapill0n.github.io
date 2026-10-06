import { chargePower, sweepAngle, trajectory, flightPoint, landingCode } from './cannon-physics.js';
export function createCannonGame(root, changed, _tryEnter, clock = () => performance.now()) {
  root.innerHTML = `<svg id="range" viewBox="0 0 1200 600" role="img" aria-label="Cannon flight field, right ground edge 100 metres"><defs><clipPath id="creature-clip"><polygon points="400,115 494,115 494,80 570,80 580,126 676,126 694,80 751,80 751,114 850,114 850,202 791,202 791,242 829,242 829,311 780,311 759,339 520,339 484,313 460,284 460,220 472,202 400,202"/></clipPath><symbol id="creature" viewBox="400 80 450 260"><image href="assets/character-reference.png" width="1254" height="1254" clip-path="url(#creature-clip)"/></symbol></defs><path class="ground" d="M60 520H1140"/><path class="ground-tick" d="M60 514V527M1140 514V527"/><text x="60" y="565" text-anchor="middle">0</text><text x="1140" y="565" text-anchor="end">100.0m</text><path id="target-mark" d="M0 490V526"/><g id="barrel" transform="translate(60 504)"><rect x="-10" y="-15" width="82" height="30" rx="8"/></g><circle class="wheel" cx="60" cy="514" r="22"/><use id="projectile" href="#creature" width="70" height="41" x="25" y="463"/></svg><div class="shot-readouts"><output id="angle" aria-label="Cannon angle">0°</output><output id="distance" aria-label="Landing distance">—</output></div><progress id="power" max="1" value="0" aria-label="Charge power"></progress><button id="fire" type="button" aria-label="Hold to lock angle and charge; release to fire" aria-describedby="instructions"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 19L19 5M7 5h12v12"/></svg></button><p id="instructions" class="sr-only">The cannon sweeps from 0 to 90 degrees and back every second. Hold this button, Space or Enter to lock the angle and charge for up to half a second. Release to fire. Land within 0.5 metres of the target, using the displayed distance rounded to tenths of a metre, then activate Enter.</p>`;
  const button = root.querySelector('#fire');
  const events = new AbortController();
  const listen = (el, type, handler) => el.addEventListener(type, handler, { signal:events.signal });
  let epoch = clock(), phase = 'idle', angle = 0, started = 0, shot = null, value = null, source = null, frame = null, destroyed = false;
  function getState() { return { value, stopped:phase === 'idle' }; }
  function notify() { changed(getState()); }
  function releaseCapture() {
    const held = source; source = null;
    if (held?.type === 'pointer' && button.hasPointerCapture(held.id)) button.releasePointerCapture(held.id);
  }
  function cancel() {
    phase = 'idle'; shot = null; value = null; releaseCapture(); button.disabled = false;
    root.querySelector('#power').value = 0; root.querySelector('#distance').textContent = '—'; notify();
  }
  function begin(type, id) {
    if (phase !== 'idle' || source) return;
    source = { type, id }; angle = sweepAngle(clock() - epoch); started = clock();
    value = null; phase = 'charging'; root.querySelector('#power').value = 0; root.querySelector('#distance').textContent = '—'; notify();
  }
  function fire(type, id) {
    if (phase !== 'charging' || source?.type !== type || source.id !== id) return;
    const now = clock(); const power = chargePower(now - started);
    root.querySelector('#power').value = power; shot = trajectory(angle, power);
    phase = 'flight'; started = now; releaseCapture(); button.disabled = true; notify();
  }
  listen(button, 'pointerdown', event => {
    if (event.button !== 0 || phase !== 'idle') return;
    event.preventDefault(); button.focus({ preventScroll:true });
    button.setPointerCapture(event.pointerId); begin('pointer', event.pointerId);
  });
  listen(button, 'pointerup', event => fire('pointer', event.pointerId));
  for (const type of ['pointercancel', 'lostpointercapture']) listen(button, type, event => {
    if (source?.type === 'pointer' && source.id === event.pointerId) cancel();
  });
  listen(button, 'contextmenu', event => event.preventDefault());
  listen(button, 'keydown', event => {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); if (!event.repeat) begin('key', event.code || event.key);
  });
  listen(window, 'keyup', event => {
    if (source?.type === 'key' && source.id === (event.code || event.key)) { event.preventDefault(); fire('key', source.id); }
  });
  listen(button, 'blur', () => { if (phase === 'charging') cancel(); });
  listen(window, 'blur', cancel);
  listen(window, 'pagehide', cancel);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  function render() {
    if (destroyed) return;
    const now = clock();
    if (phase === 'idle') angle = sweepAngle(now - epoch);
    if (phase === 'charging') root.querySelector('#power').value = chargePower(now - started);
    if (phase === 'flight' && (now - started) / 1000 >= shot.duration) {
      value = landingCode(shot.distance); phase = 'idle'; button.disabled = false;
      root.querySelector('#distance').textContent = `${(value / 10).toFixed(1)}m`; notify();
    }
    const point = phase === 'flight' ? flightPoint(shot, (now - started) / 1000) : { x:0, y:1.5 };
    root.querySelector('#projectile').setAttribute('x', 60 + point.x * 10.8 - 35);
    root.querySelector('#projectile').setAttribute('y', 520 - point.y * 10.8 - 41);
    root.querySelector('#barrel').setAttribute('transform', `translate(60 504) rotate(${-angle})`);
    root.querySelector('#angle').textContent = `${angle.toFixed(1)}°`;
    root.dataset.phase = phase;
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  return {
    reset(challenge) { epoch = clock(); cancel(); root.querySelector('#target-mark').setAttribute('transform', `translate(${60 + challenge.target / 10 * 10.8} 0)`); },
    getState,
    stop:cancel,
    destroy() { destroyed = true; cancelAnimationFrame(frame); cancel(); events.abort(); }
  };
}
