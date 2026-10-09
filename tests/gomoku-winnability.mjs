// Bounded, transparent tactical-player simulation; not a human-usability test.
// Run sample: node tests/gomoku-winnability.mjs [games-per-seat=20] [base-seed=20261009]
// Verify saved complete legal victories: node tests/gomoku-winnability.mjs --verify
// Coordinates are one-based [row, column]. All games start on an empty board.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { chooseMove, immediateMove, seededRandom, SEARCH_LIMITS } from '../gate/games/gomoku/ai.js';
import { createMatch, legalMove, SIZE, winningLine } from '../gate/games/gomoku/rules.js';
const DIRECTIONS = [[1,0],[0,1],[1,1],[1,-1]];
const coord = index => [Math.floor(index / SIZE) + 1, index % SIZE + 1];

function nearby(board) {
  const choices = new Set();
  for (let i = 0; i < board.length; i++) if (board[i]) {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const y = r + dr, x = c + dc;
      if (y >= 0 && y < SIZE && x >= 0 && x < SIZE && !board[y * SIZE + x]) choices.add(y * SIZE + x);
    }
  }
  return choices.size ? [...choices] : [112];
}

// Score recognizable threats at a candidate placement, without the AI's
// evaluator, random choices, future seed, or access to the opponent's policy.
function threats(board, index, color) {
  assert.equal(board[index], 0);
  board[index] = color;
  const r = Math.floor(index / SIZE), c = index % SIZE;
  const wins = new Set();
  let freeThrees = 0, threes = 0, twos = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const cells = [];
    for (let step = -5; step <= 5; step++) {
      const y = r + dr * step, x = c + dc * step;
      const at = y * SIZE + x;
      cells.push(y < 0 || y >= SIZE || x < 0 || x >= SIZE ? { value: '#', at: -1 } : { value: board[at] === color ? 'X' : board[at] ? '#' : '.', at });
    }
    let freeThree = false, three = false, two = false;
    for (let start = 1; start <= 5; start++) {
      const window = cells.slice(start, start + 5);
      if (window.some(cell => cell.value === '#')) continue;
      const count = window.filter(cell => cell.value === 'X').length;
      if (count === 4) wins.add(window.find(cell => cell.value === '.').at);
      if (count === 3) three = true;
      if (count === 2) two = true;
    }
    for (let start = 0; start <= 5; start++) {
      const window = cells.slice(start, start + 6);
      if (window[0].value !== '.' || window[5].value !== '.') continue;
      const inner = window.slice(1,5);
      if (!inner.some(cell => cell.value === '#') && inner.filter(cell => cell.value === 'X').length === 3) freeThree = true;
    }
    freeThrees += +freeThree; threes += +three; twos += +two;
  }
  const win = winningLine(board, index).length > 0;
  board[index] = 0;
  const score = win ? 1e9 : wins.size >= 2 ? 1e7 :
    wins.size && freeThrees ? 6e5 : freeThrees >= 2 ? 3e5 :
    wins.size ? 5e4 + freeThrees * 1e4 : freeThrees * 1e4 + threes * 600 + twos * 40;
  return { score, wins: wins.size, freeThrees, threes, twos };
}

export function tacticalHuman(board, color = 1, seed = 1) {
  const win = immediateMove(board, color);
  if (win >= 0) return { index: win, tactic: 'complete five' };
  const block = immediateMove(board, 3 - color);
  if (block >= 0) return { index: block, tactic: 'block immediate five' };
  const random = seededRandom(seed);
  const options = nearby(board).map(index => {
    const attack = threats(board,index,color), defense = threats(board,index,3-color);
    const center = Math.abs(index % SIZE - 7) + Math.abs(Math.floor(index / SIZE) - 7);
    return { index, attack, defense, score: attack.score + defense.score * 1.05 - center, tie: random() };
  });
  options.sort((a,b) => b.score - a.score || b.tie - a.tie);
  const chosen = options[0], { attack, defense } = chosen;
  const tactic = attack.wins >= 2 ? 'create two winning endpoints' :
    defense.wins >= 2 ? 'stop opposing open four / fork' :
    attack.freeThrees >= 2 ? 'create double open three' :
    attack.wins ? 'make a forcing four' :
    attack.freeThrees ? 'build an open three' :
    defense.freeThrees ? 'contest opposing open three' : 'develop / connect stones';
  return { index: chosen.index, tactic, attack, defense };
}

export function playGame({ humanFirst, seed, maximumPlies = 225 }) {
  const game = createMatch(humanFirst), random = seededRandom(seed), trace = [];
  let aiMs = 0, humanMs = 0, maxAiMs = 0, maxAiEvaluations = 0;
  const started = performance.now();
  while (!game.outcome && trace.length < maximumPlies) {
    const color = game.turn, moveSeed = Math.floor(random() * 4294967296);
    const began = performance.now();
    const move = color === 1 ? tacticalHuman(game.board, color, moveSeed) : chooseMove(game.board, color, moveSeed);
    const duration = performance.now() - began;
    assert.ok(legalMove(game.board, move.index));
    assert.ok(game.play(move.index, color));
    trace.push({ ply: trace.length + 1, side: color === 1 ? 'human-policy' : 'panda', index: move.index, coordinate: coord(move.index), seed: moveSeed, tactic: move.tactic || 'bounded evaluation' });
    if (color === 1) humanMs += duration;
    else { aiMs += duration; maxAiMs = Math.max(maxAiMs, duration); maxAiEvaluations = Math.max(maxAiEvaluations, move.evaluated); }
  }
  assert.ok(game.outcome, 'Every simulation must finish a full legal game.');
  assert.ok(maxAiEvaluations <= SEARCH_LIMITS.candidates * (SEARCH_LIMITS.replies + 1));
  return { humanFirst, seed, outcome: game.outcome, plies: trace.length, timingMs: { total: performance.now() - started, human: humanMs, panda: aiMs, maxPandaMove: maxAiMs }, maxAiEvaluations, winningLine: game.line.map(coord), trace };
}

export function simulate(games = 20, baseSeed = 20261009) {
  const report = { caution: 'Automated tactical-policy wins demonstrate reachable legal victories, not beginner human usability or a measured human win rate.', policy: 'Greedy one-placement tactical pattern scoring: immediate wins/blocks, open-four endpoints, forcing four, double/open three, local development. No opponent seed knowledge and no search through opponent responses.', gamesPerSeat: games, baseSeed, seats: [] };
  for (const humanFirst of [true, false]) {
    const results = [];
    for (let n = 0; n < games; n++) results.push(playGame({humanFirst, seed: baseSeed + n}));
    report.seats.push({humanFirst, wins: results.filter(r => r.outcome === 'human').length, losses: results.filter(r => r.outcome === 'panda').length, draws: results.filter(r => r.outcome === 'draw').length,
      meanPlies: results.reduce((n,r) => n + r.plies, 0) / games,
      timingMs: { total: results.reduce((n,r) => n + r.timingMs.total, 0), maxPandaMove: Math.max(...results.map(r => r.timingMs.maxPandaMove)) },
      firstVictory: results.find(r => r.outcome === 'human') || null,
      outcomes: results.map(({seed,outcome,plies}) => ({seed,outcome,plies})) });
  }
  return report;
}

export function verifyTrace(record) {
  const game = createMatch(record.humanFirst);
  for (const expected of record.trace) {
    assert.equal(game.outcome, null, 'No move is permitted after an earlier victory.');
    assert.equal(expected.ply, game.moves.length + 1);
    const color = expected.side === 'human-policy' ? 1 : 2;
    assert.equal(color, game.turn);
    assert.deepEqual(expected.coordinate, coord(expected.index));
    const before = [...game.board];
    const actual = color === 1 ? tacticalHuman(game.board, color, expected.seed) : chooseMove(game.board, color, expected.seed);
    assert.deepEqual([...game.board], before, 'Neither player may alter the input position.');
    assert.equal(actual.index, expected.index, `Seeded move changed at ply ${expected.ply}.`);
    if (color === 2) {
      const ownWin = immediateMove(game.board, color);
      const humanWin = immediateMove(game.board, 3 - color);
      if (ownWin >= 0) {
        game.board[actual.index] = color;
        assert.ok(winningLine(game.board, actual.index).length, 'Panda may not miss an immediate win.');
        game.board[actual.index] = 0;
      } else if (humanWin >= 0) {
        game.board[actual.index] = 3 - color;
        assert.ok(winningLine(game.board, actual.index).length, 'Panda must occupy an immediate human winning point when one exists.');
        game.board[actual.index] = 0;
      }
    }
    assert.ok(game.play(expected.index, color));
  }
  assert.equal(game.outcome, 'human');
  assert.equal(game.outcome, record.outcome);
  assert.equal(game.moves.length, record.plies);
  assert.deepEqual(game.line.map(coord), record.winningLine);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--verify') {
    const fixture = JSON.parse(readFileSync(new URL('./gomoku-winnability-fixtures.json', import.meta.url), 'utf8'));
    const records = [...fixture.sample.seats.map(seat => seat.firstVictory), ...fixture.demonstrations];
    records.forEach(verifyTrace);
    console.log(`Verified ${records.length} full legal games from empty boards, including both seats and every seeded AI move.`);
  } else {
    const games = Number(process.argv[2] || 20), baseSeed = Number(process.argv[3] || 20261009);
    if (!Number.isInteger(games) || games < 1 || !Number.isInteger(baseSeed)) throw new Error('Provide a positive integer game count and integer seed.');
    console.log(JSON.stringify(simulate(games,baseSeed), null, 2));
  }
}
