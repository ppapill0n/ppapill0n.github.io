import { chooseMove } from './ai.js';
self.onmessage = ({ data }) => {
  const started = performance.now();
  try {
    const result = chooseMove(data.board, data.color, data.seed);
    self.postMessage({ id: data.id, ...result, elapsedMs: performance.now() - started });
  } catch {
    self.postMessage({ id: data.id, error: 'invalid-position' });
  }
};
// Loading/compilation is budgeted separately from bounded move computation.
self.postMessage({ type:'ready' });
