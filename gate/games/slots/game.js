import { slotSymbols, drawReels, slotsWin, slotsBonus, reelDurations, reelPosition } from './engine.js';
import { symbolDefinitions } from '../../common/slot-symbols.js';
export function createSlotsGame(root, changed, _tryEnter, clock = () => performance.now(), random = Math.random) {
  const strip = Array.from({ length:56 }, (_, index) => `<div class="slot-cell"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#slot-${slotSymbols[index % 7]}" width="64" height="64"/></svg></div>`).join('');
  root.innerHTML = `${symbolDefinitions}<div class="slot-machine"><div class="slot-reels" role="group" aria-label="Three independent reels">${[0,1,2].map(index=>`<div class="slot-reel" role="img" aria-label="Reel ${index+1}"><div class="slot-strip" aria-hidden="true">${strip}</div></div>`).join('')}<span class="slot-sparkles" aria-hidden="true">${Array.from({length:6},()=>'<i>✦</i>').join('')}</span></div><button id="lever" type="button" aria-label="Pull lever to spin all three reels"><span class="lever-base" aria-hidden="true"></span><span class="lever-arm" aria-hidden="true"><span class="lever-knob"></span></span></button></div>`;
  const lever = root.querySelector('#lever');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion:reduce)');
  const reels = [...root.querySelectorAll('.slot-reel')];
  const events = new AbortController();
  const listen = (el, type, fn) => el.addEventListener(type, fn, { signal:events.signal });
  let positions = [0,1,2], outcomes = null, starts = null, started = 0, spinning = false, settled = false, frame = null, destroyed = false, bonusTimer = null;
  function getState() { return { value:settled ? (slotsWin(outcomes, true) ? 777 : 0) : null, stopped:!spinning }; }
  function place(index, position, label) {
    reels[index].querySelector('.slot-strip').style.transform = `translateY(${-position * 100 / 56}%)`;
    reels[index].setAttribute('aria-label', `Reel ${index+1}: ${label}`);
  }
  function clearBonus() {
    clearTimeout(bonusTimer); bonusTimer = null; root.classList.remove('slots-bonus');
    root.querySelectorAll('.is-result').forEach(el=>el.classList.remove('is-result'));
  }
  function celebrate() {
    outcomes.forEach((symbol,index)=>reels[index].querySelectorAll('.slot-cell')[symbol].classList.add('is-result'));
    root.classList.add('slots-bonus');
    bonusTimer = setTimeout(clearBonus,800);
  }
  function stop() {
    clearBonus();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; spinning = false; settled = false; outcomes = null; positions = [0,1,2];
    root.classList.remove('slots-spinning'); root.dataset.phase = 'idle'; lever.disabled = false;
    positions.forEach((position,index)=>{ reels[index].dataset.settled='false'; place(index,position,slotSymbols[position]); }); changed(getState());
  }
  function render() {
    if (destroyed || !spinning) return;
    const elapsed = clock() - started;
    reels.forEach((reel,index) => {
      const done = elapsed >= reelDurations[index];
      positions[index] = done ? outcomes[index] : reducedMotion.matches ? starts[index] : reelPosition(starts[index],outcomes[index],index,elapsed);
      place(index,positions[index],done ? slotSymbols[outcomes[index]] : 'spinning');
      reel.dataset.settled = String(done);
    });
    if (elapsed >= Math.max(...reelDurations)) {
      frame = null; spinning = false; settled = true; lever.disabled = false;
      root.classList.remove('slots-spinning'); root.dataset.phase = 'idle';
      if (slotsBonus(outcomes,true)) celebrate();
      changed(getState());
    } else frame = requestAnimationFrame(render);
  }
  function spin() {
    if (spinning || destroyed) return;
    clearBonus();
    outcomes = drawReels(random); starts = positions.map(position=>position % 7);
    settled = false; spinning = true; started = clock(); lever.disabled = true;
    root.classList.add('slots-spinning'); root.dataset.phase = 'spinning'; changed(getState());
    reels.forEach((reel,index)=>{ reel.dataset.settled='false'; place(index,starts[index],'spinning'); });
    frame = requestAnimationFrame(render);
  }
  listen(lever,'click',spin);
  listen(lever,'keydown',event=>{
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); if (!event.repeat) spin();
  });
  listen(lever,'keyup',event=>{ if ([' ', 'Enter'].includes(event.key)) event.preventDefault(); });
  listen(window,'blur',stop);
  listen(window,'pagehide',stop);
  listen(document,'visibilitychange',()=>{ if (document.hidden) stop(); });
  return { reset:stop, getState, stop, destroy(){ destroyed=true; stop(); events.abort(); } };
}
