// One entry, no adjustment, no hidden-state access, no future-based selection.
// node tests/crypto-history-simulation.mjs [runs=20000] [startSeed=20001]
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../gate/games/crypto/config.js';
import { createMarket } from '../gate/games/crypto/market.js';
import { createAccount } from '../gate/games/crypto/account.js';

export const HORIZONS = [30, 60, 120, 240, 600];
export const CONDITIONS = [
  { id: 'all', window: null, threshold: null },
  { id: 'desktop50', window: 50, threshold: 0 },
  { id: 'mobile40', window: 40, threshold: 0 },
  { id: 'last20', window: 20, threshold: 0 },
  { id: 'last10', window: 10, threshold: 0 },
  { id: 'last10_3pct', window: 10, threshold: .03 },
  { id: 'last10_5pct', window: 10, threshold: .05 },
  { id: 'last20_5pct', window: 20, threshold: .05 },
  { id: 'last20_10pct', window: 20, threshold: .10 },
  { id: 'desktop50_10pct', window: 50, threshold: .10 },
];
export const STRATEGIES = [
  { id: 'short20', side: -1, leverage: 20 },
  { id: 'long20', side: 1, leverage: 20 },
  { id: 'short5', side: -1, leverage: 5 },
  { id: 'short1', side: -1, leverage: 1 },
];

export function historyReturns(snapshot) {
  return Object.fromEntries([10, 20, 40, 50].map(window => [window,
    snapshot.candles.at(-1).close / snapshot.candles.at(-window).open - 1,
  ]));
}

export function matches(returns, condition, side) {
  return condition.window === null || side * returns[condition.window] > condition.threshold;
}

// Each account executes at the same initially visible quote. Accounts share a
// market path only to reduce noise/work; neither the market nor filters see them.
export function runSeed(seed) {
  const market = createMarket(seed), initial = market.snapshot();
  const history = historyReturns(initial), future = {};
  const accounts = STRATEGIES.map(strategy => {
    const account = createAccount();
    if (!account.enter(strategy.side, 1, strategy.leverage, initial.price)) throw new Error('Entry failed');
    return { ...strategy, account, grossAt: null, outcome: null };
  });
  for (let tick = 1; tick <= 600000 / CONFIG.tickMs; tick++) {
    const price = market.step(), seconds = tick * CONFIG.tickMs / 1000;
    for (const trade of accounts) {
      if (trade.outcome) continue;
      const liquidated = trade.account.liquidate(price); // Risk check precedes input, as in session.js.
      const state = trade.account.snapshot(price);
      if (state.equity >= CONFIG.target && trade.grossAt === null) trade.grossAt = seconds;
      if (liquidated || state.bankrupt) trade.outcome = { result: 'ruin', time: seconds, grossAt: trade.grossAt, equity: state.equity };
      else if (state.cashAfterClose >= CONFIG.target) {
        if (!trade.account.close(1, price) || !trade.account.snapshot(price).canPay || !trade.account.pay()) throw new Error('Target did not settle into cash');
        trade.outcome = { result: 'success', time: seconds, grossAt: trade.grossAt, equity: state.cashAfterClose };
      } else if (seconds === 600) trade.outcome = { result: 'unfinished', time: seconds, grossAt: trade.grossAt, equity: state.cashAfterClose };
    }
    if (HORIZONS.includes(seconds)) future[seconds] = price / initial.price - 1;
  }
  return { seed, history, future, outcomes: Object.fromEntries(accounts.map(trade => [trade.id, trade.outcome])) };
}

export function wilson(successes, total) {
  if (!total) return null;
  const z = 1.959963984540054, p = successes / total, d = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / d;
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)].map(value => +(value * 100).toFixed(2));
}
const percent = (n, total) => total ? +(n / total * 100).toFixed(2) : null;
const quantiles = numbers => {
  const sorted = numbers.slice().sort((a, b) => a - b);
  return Object.fromEntries([['p10', .1], ['median', .5], ['p90', .9]].map(([name, p]) => [name, sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null]));
};

function summarize(samples, strategy, totalRuns) {
  const outcomes = samples.map(sample => sample.outcomes[strategy.id]);
  return {
    selected: samples.length, selectionPercent: percent(samples.length, totalRuns),
    checkpoints: HORIZONS.map(seconds => {
      const success = outcomes.filter(o => o.result === 'success' && o.time <= seconds).length;
      const ruin = outcomes.filter(o => o.result === 'ruin' && o.time <= seconds).length;
      const grossTargetReached = outcomes.filter(o => o.grossAt !== null && o.grossAt <= seconds).length;
      const unfinished = outcomes.length - success - ruin;
      return { seconds, success, successPercent: percent(success, outcomes.length), success95Percent: wilson(success, outcomes.length),
        ruin, ruinPercent: percent(ruin, outcomes.length), unfinished, unfinishedPercent: percent(unfinished, outcomes.length),
        grossTargetReached, grossTargetReachedPercent: percent(grossTargetReached, outcomes.length), grossWithoutNetTarget: grossTargetReached - success,
        futurePriceInSelectedDirectionPercent: percent(samples.filter(sample => strategy.side * sample.future[seconds] > 0).length, samples.length),
      };
    }),
    successfulSeconds: quantiles(outcomes.filter(o => o.result === 'success').map(o => o.time)),
    grossToNetDelaySeconds: quantiles(outcomes.filter(o => o.result === 'success').map(o => +(o.time - o.grossAt).toFixed(1))),
    terminalEquity: quantiles(outcomes.map(o => +o.equity.toFixed(2))),
  };
}

function correlation(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let covariance = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { covariance += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return +(covariance / Math.sqrt(vx * vy)).toFixed(4);
}

export function priceBoundaries(side, leverage) {
  const margin = CONFIG.startingCash / (1 + leverage * CONFIG.feeRate), notional = margin * leverage;
  const grossTargetRatio = 1 + side * (CONFIG.target - margin) / notional;
  const netTargetRatio = (CONFIG.target - margin + side * notional) / (notional * (side - CONFIG.feeRate));
  const liquidationRatio = (side * notional - margin) / (notional * (side - CONFIG.feeRate));
  return { margin, openingFee: notional * CONFIG.feeRate, grossTargetRatio, netTargetRatio, liquidationRatio,
    targetReachable: netTargetRatio > 0, shortMaximumCashAtZeroPrice: side === -1 ? margin + notional : null };
}

export function analyze(runs = 20000, startSeed = 20001) {
  const samples = Array.from({ length: runs }, (_, i) => runSeed(startSeed + i));
  return {
    seedRange: [startSeed, startSeed + runs - 1], runs, horizonSeconds: 600, tickMs: CONFIG.tickMs, entryTimeSeconds: 0,
    execution: 'One 100% entry at t=0; observe every actual 100ms tick, liquidate first, otherwise close and pay on first fee-adjusted $50k opportunity. No stop, rebalance or compounding. Perfect observed-tick reaction, not a human timing estimate.',
    historyDefinition: 'For the last N completed candles, return = last.close / first.open - 1. Negative means net decline, not that every candle is red. Desktop initially displays 50 candles (100s); mobile displays the last 40 (80s). Strict thresholds; only initial visible OHLC decides selection.',
    uncertainty: '95% Wilson binomial intervals approximate seed-sampling uncertainty, not model error. Conditions overlap and were fixed before simulation; not independent experiments.',
    config: CONFIG, conditions: CONDITIONS,
    historyFutureLogReturnCorrelations: Object.fromEntries([10, 20, 40, 50].map(window => [window, Object.fromEntries(HORIZONS.map(seconds => [seconds,
      correlation(samples.map(s => Math.log1p(s.history[window])), samples.map(s => Math.log1p(s.future[seconds]))),
    ]))])),
    strategies: Object.fromEntries(STRATEGIES.map(strategy => [strategy.id, {
      side: strategy.side, leverage: strategy.leverage, boundaries: priceBoundaries(strategy.side, strategy.leverage),
      conditions: Object.fromEntries(CONDITIONS.map(condition => [condition.id, summarize(samples.filter(sample => matches(sample.history, condition, strategy.side)), strategy, runs)])),
    }])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runs = Number(process.argv[2] || 20000), startSeed = Number(process.argv[3] || 20001);
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(startSeed) || startSeed < 0 || startSeed + runs - 1 > 0xFFFFFFFF) throw new Error('Invalid seed range');
  console.log(JSON.stringify(analyze(runs, startSeed), null, 2));
}
