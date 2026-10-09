import { symbolDefinitions } from '../../common/slot-symbols.js';
import { createMatch, HUMAN, PANDA, SIZE, legalMove } from './rules.js';
import { createWorkerEngine } from './engine-client.js';

// Presentation pacing runs alongside the worker, not after it. A slow valid
// response still wins over the timer; cancellation always removes the timer.
function thinkingDelay(signal, random) {
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(finish, 500 + Math.floor(random() * 501));
    function cancel() {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      reject(new DOMException('Thinking cancelled', 'AbortError'));
    }
    signal.addEventListener('abort', cancel, { once:true });
    if (signal.aborted) cancel();
  });
}

export function createGomokuGame(root, changed, _enter, options = {}) {
  const engine = options.engine ?? createWorkerEngine();
  const random = options.random ?? Math.random;
  const humanFirst = options.humanFirst ?? false;
  const events = new AbortController();
  let match, pending = null, epoch = 0, destroyed = false, suspended = false, failed = false, focusIndex = 112;
  root.innerHTML = `${symbolDefinitions}<div class="gomoku-heading"><span id="gomoku-status" class="sr-only"></span><span class="gomoku-players" aria-hidden="true"><svg><use href="#slot-nokyong"/></svg><span>vs</span><svg><use href="#slot-panda"/></svg></span></div><p id="gomoku-help" class="sr-only">You are green Nokyong and move ${humanFirst ? 'first' : 'second'}. Place five or more stones in a row to enter. There are no forbidden moves. Tap an empty intersection, or use arrow keys and Enter. Only your victory unlocks Enter.</p><div class="gomoku-board" role="grid" aria-label="Gomoku board" aria-rowcount="15" aria-colcount="15" aria-describedby="gomoku-help"><svg class="gomoku-lines" viewBox="0 0 450 450" aria-hidden="true">${Array.from({length:15},(_,i)=>`<path d="M15 ${15+i*30}H435 M${15+i*30} 15V435"/>`).join('')}${[3,7,11].flatMap(r=>[3,7,11].map(c=>`<circle cx="${15+c*30}" cy="${15+r*30}" r="2.5"/>`)).join('')}</svg>${Array.from({length:15},(_,r)=>`<div role="row">${Array.from({length:15},(_,c)=>`<button type="button" class="gomoku-cell" role="gridcell" data-index="${r*15+c}" aria-rowindex="${r+1}" aria-colindex="${c+1}" tabindex="${r*15+c===112?0:-1}"></button>`).join('')}</div>`).join('')}</div><div class="gomoku-rematch"><button id="rematch" type="button" hidden>Rematch</button></div>`;
  const cells = [...root.querySelectorAll('.gomoku-cell')], board = root.querySelector('.gomoku-board'), message = root.querySelector('#gomoku-status'), rematch = root.querySelector('#rematch');
  const listen = (element, name, fn) => element.addEventListener(name, fn, { signal: events.signal });
  function getState() { return { outcome: match?.outcome ?? null, stopped: !pending && !suspended && !document.hidden && !failed }; }
  function paint() {
    if (destroyed || !match) return;
    const outcome = match.outcome, playable = !outcome && match.turn === HUMAN && !pending && !failed && !suspended;
    const text = failed ? 'Panda paused.' : outcome === 'human' ? 'You won.' : outcome === 'panda' ? 'Panda won.' : outcome === 'draw' ? 'Draw.' : suspended ? 'Paused.' : match.turn === HUMAN ? 'Your turn.' : 'Panda…';
    message.textContent = text;
    root.dataset.phase = outcome ?? (failed ? 'error' : suspended ? 'paused' : match.turn === HUMAN ? 'human' : 'thinking');
    board.setAttribute('aria-busy', String(!!pending));
    const line = new Set(match.line), last = match.moves.at(-1);
    cells.forEach((cell,i) => {
      const value = match.board[i];
      if (cell.dataset.stone !== String(value)) {
        cell.dataset.stone = String(value);
        cell.innerHTML = value ? `<svg aria-hidden="true"><use href="#slot-${value===HUMAN?'nokyong':'panda'}"/></svg>` : '';
      }
      cell.classList.toggle('winning', line.has(i)); cell.classList.toggle('last-stone', i === last);
      cell.setAttribute('aria-label', `Row ${Math.floor(i/SIZE)+1}, column ${i%SIZE+1}, ${value===HUMAN?'Nokyong':value===PANDA?'panda':'empty'}`);
      cell.setAttribute('aria-disabled', String(!playable || !!value));
    });
    rematch.hidden = !outcome && !failed; rematch.textContent = failed ? 'Retry' : 'Rematch';
    changed(getState());
  }
  function cancelSearch() {
    epoch++; pending?.abort(); pending = null; engine.cancel?.();
  }
  async function think() {
    if (destroyed || suspended || document.hidden || match.outcome || match.turn !== PANDA || pending) return;
    failed = false;
    const id = ++epoch, controller = new AbortController(); pending = controller;
    paint();
    try {
      const [index] = await Promise.all([
        engine.findMove(match.board, PANDA, { signal:controller.signal }),
        thinkingDelay(controller.signal, random)
      ]);
      if (destroyed || epoch !== id || pending !== controller) return;
      pending = null;
      if (!legalMove(match.board, index) || !match.play(index, PANDA)) throw new Error('Invalid engine move');
      paint();
    } catch (error) {
      if (destroyed || epoch !== id || controller.signal.aborted) return;
      pending = null; failed = true; controller.abort(); paint();
    }
  }
  function play(index) {
    if (destroyed || suspended || document.hidden || pending || failed || match.turn !== HUMAN || !match.play(index, HUMAN)) return;
    paint(); if (!match.outcome) think();
  }
  listen(board, 'click', event => {
    const cell = event.target.closest('[data-index]'); if (!cell || !board.contains(cell)) return;
    focusIndex = Number(cell.dataset.index); cells.forEach((button,i) => button.tabIndex = i === focusIndex ? 0 : -1);
    play(focusIndex);
  });
  listen(board, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.key === 'Enter' || event.key === ' ') && event.repeat) { event.preventDefault(); return; }
    const directions = { ArrowLeft:[0,-1], ArrowRight:[0,1], ArrowUp:[-1,0], ArrowDown:[1,0] };
    if (!directions[event.key] && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    if (directions[event.key]) {
      const [dr,dc] = directions[event.key], r = Math.floor(focusIndex / SIZE), c = focusIndex % SIZE;
      focusIndex = Math.max(0,Math.min(SIZE-1,r+dr))*SIZE+Math.max(0,Math.min(SIZE-1,c+dc));
    } else focusIndex = event.key === 'Home' ? 0 : SIZE*SIZE-1;
    cells.forEach((cell,i) => cell.tabIndex = i === focusIndex ? 0 : -1); cells[focusIndex].focus();
  });
  function reset() {
    cancelSearch(); failed = false; suspended = document.hidden;
    match = createMatch(humanFirst); focusIndex = 112;
    cells.forEach((cell,i) => cell.tabIndex = i === focusIndex ? 0 : -1);
    paint(); if (!humanFirst) think();
  }
  listen(rematch, 'click', () => { if (failed) { failed = false; think(); } else if (match.outcome) reset(); });
  function suspend() { if (destroyed) return; suspended = true; cancelSearch(); paint(); }
  function resume() { if (destroyed || document.hidden) return; suspended = false; paint(); if (match?.turn === PANDA && !match.outcome && !failed) think(); }
  listen(window, 'blur', suspend); listen(window, 'pagehide', suspend);
  listen(window, 'focus', resume); listen(window, 'pageshow', resume);
  listen(document, 'visibilitychange', () => document.hidden ? suspend() : resume());
  return { getState, reset, stop() { if (document.hidden) suspend(); }, destroy() { destroyed = true; cancelSearch(); engine.destroy?.(); events.abort(); } };
}
