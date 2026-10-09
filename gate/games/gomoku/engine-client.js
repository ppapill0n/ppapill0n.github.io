import { legalMove, validBoard } from './rules.js';
export const WORKER_TIMEOUT_MS = 1500;
export const WORKER_LOAD_TIMEOUT_MS = 8000;
const aborted = () => new DOMException('Search cancelled', 'AbortError');

// Replace this factory to adopt another engine. Contract:
// findMove(board, player, { signal, seed }) -> Promise<legal cell index>.
// Board ownership, worker lifetime, timeout and cancellation stay here.
export function createWorkerEngine({
  workerFactory = () => new Worker(new URL('./worker.js', import.meta.url), { type:'module' }),
  timeoutMs = WORKER_TIMEOUT_MS,
  loadTimeoutMs = WORKER_LOAD_TIMEOUT_MS
} = {}) {
  let active = null, generation = 0, destroyed = false;
  function cancel() { active?.cancel(); }
  return {
    findMove(board, player, { signal, seed = Math.floor(Math.random() * 4294967296) } = {}) {
      cancel();
      if (destroyed || signal?.aborted) return Promise.reject(aborted());
      if (!validBoard(board) || ![1,2].includes(player)) return Promise.reject(new TypeError('Invalid Gomoku position'));
      const snapshot = Array.from(board), id = ++generation;
      return new Promise((resolve, reject) => {
        let worker = null, timer = null, settled = false, ready = false;
        const finish = (error, index) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
          if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
          if (active?.id === id) active = null;
          error ? reject(error) : resolve(index);
        };
        const onAbort = () => finish(aborted());
        active = { id, cancel: onAbort };
        signal?.addEventListener('abort', onAbort, { once:true });
        try {
          worker = workerFactory();
          worker.onmessage = ({ data }) => {
            if (settled || active?.id !== id) return;
            if (data.type === 'ready') {
              if (ready) return;
              ready = true;
              clearTimeout(timer);
              timer = setTimeout(() => finish(new Error('Engine time limit exceeded')), timeoutMs);
              return;
            }
            if (data.id !== id) return;
            if (data.error || !legalMove(snapshot, data.index)) finish(new Error('Invalid engine move'));
            else finish(null, data.index);
          };
          worker.onerror = event => { event.preventDefault?.(); finish(new Error('Engine unavailable')); };
          timer = setTimeout(() => finish(new Error('Engine load time limit exceeded')), loadTimeoutMs);
          worker.postMessage({ id, board:snapshot, color:player, seed });
        } catch (error) { finish(error); }
      });
    },
    cancel,
    destroy() { destroyed = true; cancel(); }
  };
}
