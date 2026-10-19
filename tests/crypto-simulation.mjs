// Seeded policies see only completed candles and the current executable quote.
// Usage: node tests/crypto-simulation.mjs [runs=1000] [horizonSeconds=600] [startSeed=1001] [leverages=5,10,20]
import { createSession } from '../gate/games/crypto/session.js';
import { seededRandom } from '../gate/games/crypto/market.js';
import { CONFIG } from '../gate/games/crypto/config.js';
import { pathToFileURL } from 'node:url';

export function createPolicy(name, seed) {
  const random = seededRandom(seed ^ 0xA5A5A5A5);
  let lastTrade = -Infinity;
  return state => {
    const prices = state.market.candles.map(c => c.close);
    const price = prices.at(-1), p = state.account.position;
    const seconds = state.elapsed / 1000;
    if (name === 'random') {
      if (seconds - lastTrade < 10) return {};
      lastTrade = seconds;
      return { close: !!p, side: random() < 0.5 ? 1 : -1 };
    }
    if (name === 'trend') {
      const fast = prices.slice(-4).reduce((a, b) => a + b, 0) / 4;
      const slow = prices.slice(-12).reduce((a, b) => a + b, 0) / 12;
      const signal = Math.log(fast / slow);
      const side = Math.abs(signal) > 0.004 ? Math.sign(signal) : 0;
      const stop = p && state.account.unrealized / p.margin < -0.35;
      const close = !!p && (stop || (side && side !== p.side) || seconds - lastTrade >= 20);
      if ((!p || close) && side) { lastTrade = seconds; return { close, side }; }
      return { close };
    }
    if (name === 'range') {
      const sample = prices.slice(-16, -1);
      const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
      const sd = Math.sqrt(sample.reduce((sum, x) => sum + (x - mean) ** 2, 0) / sample.length);
      const z = (price - mean) / Math.max(sd, price * 0.001);
      if (p) return { close: (p.side === 1 ? z > -0.15 : z < 0.15)
        || state.account.unrealized / p.margin < -0.25 || seconds - lastTrade >= 24 };
      if (Math.abs(z) > 1.4) { lastTrade = seconds; return { side: z > 0 ? -1 : 1 }; }
      return {};
    }
    throw new Error(`Unknown policy: ${name}`);
  };
}

export function simulate(name, seed, horizonSeconds, leverage, config = CONFIG) {
  const game = createSession(seed, config), policy = createPolicy(name, seed);
  for (let seconds = 0; seconds <= horizonSeconds; seconds += 2) {
    let state = game.snapshot();
    if (state.account.bankrupt) return { result: 'ruin', time: state.elapsed / 1000, equity: state.account.equity };
    if (state.account.cashAfterClose >= config.target) {
      if (state.account.position) game.close(1);
      if (game.pay()) return { result: 'success', time: state.elapsed / 1000, equity: state.account.cashAfterClose };
    }
    if (seconds === horizonSeconds) return { result: 'censored', time: seconds, equity: state.account.cashAfterClose };
    const decision = policy(state);
    if (decision.close) game.close(1);
    state = game.snapshot();
    if (decision.side && !state.account.position) game.enter(decision.side, 1, leverage);
    game.advance(2000);
  }
}

export function summarize(results) {
  const times = results.filter(r => r.result === 'success').map(r => r.time).sort((a, b) => a - b);
  const equities = results.map(r => r.equity).sort((a, b) => a - b);
  const percentile = (values, p) => values.length ? values[Math.floor((values.length - 1) * p)] : null;
  const count = result => results.filter(r => r.result === result).length;
  return {
    runs: results.length, success: count('success'), ruin: count('ruin'), censored: count('censored'),
    successPercent: +(count('success') / results.length * 100).toFixed(1),
    ruinPercent: +(count('ruin') / results.length * 100).toFixed(1),
    depletedBelow1000Percent: +(results.filter(r => r.equity < 1000).length / results.length * 100).toFixed(1),
    successfulSeconds: { p10: percentile(times, .1), p25: percentile(times, .25), median: percentile(times, .5), p75: percentile(times, .75), p90: percentile(times, .9) },
    successesWithin120to240Seconds: times.filter(t => t >= 120 && t <= 240).length,
    successBy240Percent: +(times.filter(t => t <= 240).length / results.length * 100).toFixed(1),
    allRunTerminalEquity: { p10: +percentile(equities, .1).toFixed(2), median: +percentile(equities, .5).toFixed(2) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runs = Number(process.argv[2] || 1000), horizonSeconds = Number(process.argv[3] || 600), startSeed = Number(process.argv[4] || 1001);
  const leverages = (process.argv[5] || '5,10,20').split(',').map(Number);
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(horizonSeconds) || horizonSeconds < 2 || horizonSeconds % 2 || !Number.isInteger(startSeed)) throw new Error('Use positive runs, an even horizon in seconds and an integer starting seed.');
  if (leverages.some(value => !CONFIG.leverage.includes(value)) || new Set(leverages).size !== leverages.length) throw new Error('Use distinct supported leverage levels.');
  const report = { seedRange: [startSeed, startSeed + runs - 1], horizonSeconds, decisionSeconds: 2, entryAllocation: 1, leverages, config: CONFIG, strategies: {} };
  for (const leverage of leverages) for (const name of ['random', 'trend', 'range']) {
    const results = Array.from({ length: runs }, (_, index) => simulate(name, index + startSeed, horizonSeconds, leverage));
    report.strategies[`${name}-${leverage}x`] = summarize(results);
  }
  console.log(JSON.stringify(report, null, 2));
}
