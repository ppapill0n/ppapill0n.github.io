import { createEvaluator } from './vendor/evaluator.js';
import { SIZE, legalMove, validBoard, winningLine } from './rules.js';

// Fixed work, not an open-ended iterative search: at most 225 tactical probes
// per side, 12 candidate placements, and 6 opponent replies per candidate.
export const SEARCH_LIMITS = Object.freeze({ candidates: 12, replies: 6, plies: 2 });
export function seededRandom(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function nearby(board, index) {
  const r = Math.floor(index / SIZE), c = index % SIZE;
  for (let y = Math.max(0, r - 2); y <= Math.min(SIZE - 1, r + 2); y++)
    for (let x = Math.max(0, c - 2); x <= Math.min(SIZE - 1, c + 2); x++) if (board[y * SIZE + x]) return true;
  return false;
}
export function immediateMove(board, color) {
  for (let i = 0; i < board.length; i++) if (legalMove(board, i)) {
    board[i] = color; const wins = winningLine(board, i).length > 0; board[i] = 0;
    if (wins) return i;
  }
  return -1;
}
// A fallback is selected inside the worker too; a stalled/failed worker is
// replaced, rather than transferring a potentially expensive search to the UI.
export function chooseMove(input, color = 2, seed = 1) {
  if (!validBoard(input) || ![1,2].includes(color)) throw new TypeError('Invalid Gomoku position');
  const board = Uint8Array.from(input), random = seededRandom(seed);
  const legal = Array.from(board, (_, i) => i).filter(i => legalMove(board, i));
  if (!legal.length) return { index: -1, evaluated: 0 };
  if (legal.length === SIZE * SIZE) return { index: 112, evaluated: 0 };
  const win = immediateMove(board, color);
  if (win >= 0) return { index: win, evaluated: 0, tactic: 'win' };
  const block = immediateMove(board, 3 - color);
  if (block >= 0) return { index: block, evaluated: 0, tactic: 'block' };
  const engine = createEvaluator();
  for (let i = 0; i < board.length; i++) if (board[i]) engine._updateMap(Math.floor(i / SIZE), i % SIZE, board[i] === color ? 1 : 0, false);
  const ranks = legal.filter(i => nearby(board, i)).map(index => ({ index, score: engine.map[Math.floor(index / SIZE)][index % SIZE].score, tie: random() }));
  ranks.sort((a,b) => b.score - a.score || b.tie - a.tie);
  let evaluated = 0;
  const candidates = ranks.slice(0, SEARCH_LIMITS.candidates).map(({ index }) => {
    const r = Math.floor(index / SIZE), c = index % SIZE;
    engine._updateMap(r, c, 1, false); evaluated++;
    const own = engine.sum;
    const replies = ranks.filter(p => p.index !== index).map(p => ({ index: p.index, score: engine.map[Math.floor(p.index / SIZE)][p.index % SIZE].score })).sort((a,b) => b.score - a.score).slice(0, SEARCH_LIMITS.replies);
    let worst = own;
    for (const reply of replies) {
      const y = Math.floor(reply.index / SIZE), x = reply.index % SIZE;
      engine._updateMap(y, x, 0, false); evaluated++; worst = Math.min(worst, engine.sum); engine._updateMap(y, x, 0, true);
    }
    engine._updateMap(r, c, 1, true);
    return { index, score: own * .8 + worst * .2, tie: random() };
  });
  candidates.sort((a,b) => b.score - a.score || b.tie - a.tie);
  // A small amount of near-equal move variety; immediate wins/blocks above
  // are never randomized away. The novice is deliberately short-sighted.
  const best = candidates[0].score, margin = Math.max(20, Math.abs(best) * .12);
  const pool = candidates.filter(p => p.score >= best - margin).slice(0, 3);
  return { index: pool[Math.floor(random() * pool.length)].index, evaluated };
}
