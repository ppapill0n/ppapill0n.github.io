// Baseline and candidate share every background regime/noise/jump draw. Sweeps
// have their own stream. No strategy receives the paired path or hidden state.
// node tests/crypto-sweeps-simulation.mjs [runs=2000] [startSeed=60001] [variant=candidate]
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../gate/games/crypto/config.js';
import { createMarket } from '../gate/games/crypto/market.js';
import { createAccount } from '../gate/games/crypto/account.js';
import { createPolicy, summarize } from './crypto-simulation.mjs';
import { historyReturns, wilson } from './crypto-history-simulation.mjs';

export const BASELINE = { ...CONFIG, sweeps: { ...CONFIG.sweeps, enabled: false } };
export const HORIZON = 600;
export const CHECKPOINTS = [30, 60, 120, 240, 600];
export const EVENT_HORIZONS = [2, 4, 8, 12, 20, 30, 60];
export const FILTERS = [
  { id: 'all', window: null, threshold: 0 },
  { id: 'desktop50', window: 50, threshold: 0 },
  { id: 'last20', window: 20, threshold: 0 },
  { id: 'last10', window: 10, threshold: 0 },
  { id: 'last10_5pct', window: 10, threshold: .05 },
];
export const STRATEGIES = [
  { id: 'hold-short20', hold: true, side: -1, leverage: 20, allocation: 1 },
  { id: 'hold-long20', hold: true, side: 1, leverage: 20, allocation: 1 },
  { id: 'hold-short10', hold: true, side: -1, leverage: 10, allocation: 1 },
  { id: 'hold-long10', hold: true, side: 1, leverage: 10, allocation: 1 },
  { id: 'trend5', policy: 'trend', leverage: 5, allocation: 1 },
  { id: 'trend5-half', policy: 'trend', leverage: 5, allocation: .5 },
  { id: 'trend10', policy: 'trend', leverage: 10, allocation: 1 },
  { id: 'trend10-half', policy: 'trend', leverage: 10, allocation: .5 },
  { id: 'bounce5', policy: 'bounce', leverage: 5, allocation: 1 },
  { id: 'bounce10', policy: 'bounce', leverage: 10, allocation: 1 },
  { id: 'confirmed-bounce5', policy: 'confirmed-bounce', leverage: 5, allocation: 1 },
  { id: 'confirmed-bounce10', policy: 'confirmed-bounce', leverage: 10, allocation: 1 },
  { id: 'confirmed-bounce20', policy: 'confirmed-bounce', leverage: 20, allocation: 1 },
];

// Last two completed candles move >=3.5% in log price against the preceding
// 20-second trend (>=2%). Deduplicate for 24 seconds, even if a bot is holding.
export function createDetector() {
  let last = -Infinity;
  return (market, seconds) => {
    if (seconds - last < 24 || market.candles.length < 13) return null;
    const p = market.candles.map(c => c.close), reference = p.at(-3);
    const trend = Math.log(reference / p.at(-13)), move = Math.log(p.at(-1) / reference);
    if (Math.abs(trend) < .02 || Math.abs(move) < .035 || trend * move >= 0) return null;
    last = seconds;
    return { time: seconds, side: Math.sign(trend), price: market.price, reference, size: Math.abs(move) };
  };
}

export function createBouncePolicy(confirmed = false) {
  const detect = createDetector();
  let pending = null, entered = -Infinity;
  return state => {
    const seconds = state.elapsed / 1000, market = state.market, p = state.account.position;
    const signal = detect(market, seconds);
    if (p) {
      pending = null;
      const move = p.side * Math.log(market.price / p.entry);
      return { close: move >= .03 || move <= -.025 || seconds - entered >= 20 };
    }
    if (signal) pending = signal;
    if (!pending || seconds - pending.time > 10) { pending = null; return {}; }
    const prices = market.candles.map(c => c.close);
    const turned = seconds > pending.time && pending.side * Math.log(prices.at(-1) / prices.at(-2)) >= .006;
    if (!confirmed || turned) {
      const side = pending.side; pending = null; entered = seconds;
      return { side };
    }
    return {};
  };
}

export function runMarket(seed, config) {
  const market = createMarket(seed, config), initial = market.snapshot(), history = historyReturns(initial);
  const detect = createDetector(), events = [], activeEvents = [];
  const traders = STRATEGIES.map(strategy => ({ ...strategy, account: createAccount(config), outcome: null,
    policy: strategy.hold ? null : strategy.policy === 'trend' ? createPolicy('trend', seed) : createBouncePolicy(strategy.policy === 'confirmed-bounce'),
    entries: 0, liquidations: 0, trades: [], entryCash: null, entryAt: null,
  }));
  function finishTrade(trader, price, seconds) {
    if (trader.entryCash === null) return;
    trader.trades.push({ profit: trader.account.snapshot(price).cash - trader.entryCash, seconds: seconds - trader.entryAt });
    trader.entryCash = null;
  }
  let price = initial.price;
  for (let tick = 0; tick <= HORIZON * 1000 / config.tickMs; tick++) {
    const seconds = tick * config.tickMs / 1000, decision = tick % (2000 / config.tickMs) === 0;
    if (tick) price = market.step();
    // These observations are offline diagnostics only; they never enter a policy.
    for (let i = activeEvents.length - 1; i >= 0; i--) {
      const event = activeEvents[i], ageTicks = tick - event.tick;
      const signedReturn = event.side * Math.log(price / event.price);
      if (signedReturn >= event.size / 2 && event.halfAt === null) event.halfAt = ageTicks * config.tickMs / 1000;
      if (signedReturn >= event.size && event.fullAt === null) event.fullAt = ageTicks * config.tickMs / 1000;
      if (EVENT_HORIZONS.includes(ageTicks * config.tickMs / 1000)) event.returns[ageTicks * config.tickMs / 1000] = signedReturn;
      if (ageTicks * config.tickMs >= 60000) activeEvents.splice(i, 1);
    }
    const observed = decision ? market.snapshot() : null;
    if (decision && seconds <= HORIZON - 60) {
      const event = detect(observed, seconds);
      if (event) { const record = { ...event, tick, halfAt: null, fullAt: null, returns: {} }; events.push(record); activeEvents.push(record); }
    }
    for (const trader of traders) {
      if (trader.outcome) continue;
      if (tick && trader.account.liquidate(price)) {
        trader.liquidations++; finishTrade(trader, price, seconds);
        if (trader.account.snapshot(price).bankrupt) {
          trader.outcome = { result: 'ruin', time: seconds, equity: 0 }; continue;
        }
      }
      if (!trader.hold && !decision) continue;
      let account = trader.account.snapshot(price);
      if (account.bankrupt) { trader.outcome = { result: 'ruin', time: seconds, equity: account.equity }; continue; }
      if (account.cashAfterClose >= config.target) {
        if (account.position) { trader.account.close(1, price); finishTrade(trader, price, seconds); }
        if (!trader.account.pay()) throw new Error('Unsettled goal');
        trader.outcome = { result: 'success', time: seconds, equity: account.cashAfterClose }; continue;
      }
      if (seconds === HORIZON) { trader.outcome = { result: 'censored', time: seconds, equity: account.cashAfterClose }; continue; }
      const action = trader.hold ? (tick === 0 ? { side: trader.side } : {}) : trader.policy({ elapsed: seconds * 1000, market: observed, account });
      if (action.close) { trader.account.close(1, price); finishTrade(trader, price, seconds); }
      account = trader.account.snapshot(price);
      if (action.side && !account.position) {
        const cash = account.cash;
        if (trader.account.enter(action.side, trader.allocation, trader.leverage, price)) {
          trader.entries++; trader.entryCash = cash; trader.entryAt = seconds;
        }
      }
    }
  }
  return { history, events, outcomes: Object.fromEntries(traders.map(t => [t.id, { ...t.outcome, entries: t.entries, liquidations: t.liquidations, trades: t.trades }])) };
}

const percent = (n, d) => d ? +(100 * n / d).toFixed(2) : null;
const quantiles = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries([['p10', .1], ['median', .5], ['p90', .9]].map(([label, p]) => [label, sorted.length ? +sorted[Math.floor((sorted.length - 1) * p)].toFixed(5) : null]));
};
const selected = (result, strategy, filter) => !filter.window || strategy.side * result.history[filter.window] > filter.threshold;
function summary(results, id) {
  const outcomes = results.map(r => r.outcomes[id]);
  if (!outcomes.length) return { runs: 0 };
  const trades = outcomes.flatMap(r => r.trades);
  return { ...summarize(outcomes),
    successPercent: percent(outcomes.filter(r => r.result === 'success').length, outcomes.length),
    ruinPercent: percent(outcomes.filter(r => r.result === 'ruin').length, outcomes.length),
    censoredPercent: percent(outcomes.filter(r => r.result === 'censored').length, outcomes.length),
    success95Percent: wilson(outcomes.filter(r => r.result === 'success').length, outcomes.length),
    checkpoints: CHECKPOINTS.map(seconds => {
      const success = outcomes.filter(r => r.result === 'success' && r.time <= seconds).length;
      const ruin = outcomes.filter(r => r.result === 'ruin' && r.time <= seconds).length;
      return { seconds, success, ruin, censored: outcomes.length - success - ruin, successPercent: percent(success, outcomes.length), ruinPercent: percent(ruin, outcomes.length) };
    }),
    entries: outcomes.reduce((sum, r) => sum + r.entries, 0), liquidations: outcomes.reduce((sum, r) => sum + r.liquidations, 0),
    closedTrades: trades.length, profitableTradePercent: percent(trades.filter(t => t.profit > 0).length, trades.length),
    tradeProfitDollars: quantiles(trades.map(t => t.profit)),
  };
}

function eventSummary(results) {
  const events = results.flatMap(r => r.events), n = events.length;
  return { count: n, runsWithDetection: results.filter(r => r.events.length).length,
    note: 'Repeated detections within a seed are correlated. Returns are signed log returns in the old trend direction; positive means a bounce, not a profitable leveraged trade. All events have 60s observed follow-up.',
    horizons: EVENT_HORIZONS.map(seconds => ({ seconds, positiveReturnPercent: percent(events.filter(e => e.returns[seconds] > 0).length, n),
      signedLogReturnPercent: quantiles(events.map(e => e.returns[seconds] * 100)),
      meanSignedLogReturnPercent: n ? +(events.reduce((sum, e) => sum + e.returns[seconds] * 100, 0) / n).toFixed(5) : null,
      halfRecoveredByPercent: percent(events.filter(e => e.halfAt !== null && e.halfAt <= seconds).length, n),
      fullyRecoveredByPercent: percent(events.filter(e => e.fullAt !== null && e.fullAt <= seconds).length, n),
    })) };
}

export function compare(runs, startSeed, candidate = CONFIG) {
  const samples = Array.from({ length: runs }, (_, i) => ({ baseline: runMarket(startSeed + i, BASELINE), candidate: runMarket(startSeed + i, candidate) }));
  const models = Object.fromEntries(['baseline', 'candidate'].map(name => {
    const rows = samples.map(s => s[name]);
    return [name, { strategies: Object.fromEntries(STRATEGIES.map(strategy => [strategy.id, Object.fromEntries((strategy.hold ? FILTERS : [FILTERS[0]]).map(filter => [filter.id, summary(rows.filter(row => selected(row, strategy, filter)), strategy.id)]))])), visibleSharpMoves: eventSummary(rows) }];
  }));
  const paired = Object.fromEntries(STRATEGIES.map(strategy => [strategy.id, Object.fromEntries((strategy.hold ? FILTERS : [FILTERS[0]]).map(filter => {
    const both = samples.filter(s => selected(s.baseline, strategy, filter) && selected(s.candidate, strategy, filter));
    const differences = both.map(s => +(s.candidate.outcomes[strategy.id].result === 'success') - +(s.baseline.outcomes[strategy.id].result === 'success'));
    const mean = differences.reduce((a, b) => a + b, 0) / both.length;
    const se = Math.sqrt(differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (both.length - 1) / both.length);
    return [filter.id, { runs: both.length, baseline: summary(both.map(s => s.baseline), strategy.id), candidate: summary(both.map(s => s.candidate), strategy.id),
      successDifferencePercentagePoints: both.length ? +(mean * 100).toFixed(2) : null,
      // A degenerate normal approximation must not imply certainty when no
      // discordant outcomes were observed; per-model Wilson intervals remain.
      approximatePaired95Points: se > 0 ? [(mean - 1.96 * se) * 100, (mean + 1.96 * se) * 100].map(v => +v.toFixed(2)) : null }];
  }))]));
  return { seedRange: [startSeed, startSeed + runs - 1], runs, horizonSeconds: HORIZON,
    assumptions: '100ms price/liquidation ticks. Initial holds enter at t=0 and close/pay on the first observed net target tick. Active policies observe/act/pay every 2s. No future, paired-path, regime or event-type input to policies. Filters apply separately to each observed initial chart; paired filter reports use their intersection. Automatic reactions, not human performance. Seed confidence intervals do not capture model uncertainty.',
    baselineConfig: BASELINE, candidateConfig: candidate, strategies: STRATEGIES, filters: FILTERS, models, paired };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runs = Number(process.argv[2] || 2000), startSeed = Number(process.argv[3] || 60001), variant = process.argv[4] || 'candidate';
  if (!Number.isInteger(runs) || runs < 2 || !Number.isInteger(startSeed) || startSeed < 0 || startSeed + runs - 1 > 0xFFFFFFFF) throw new Error('Invalid seed range');
  if (!['candidate', 'mixed-v1', 'temporary-only'].includes(variant)) throw new Error('Unknown variant');
  const overrides = variant === 'temporary-only'
    ? { meanEligibleSeconds: 180, fullRecoveryProbability: 1, partialRecoveryProbability: 0, reversalShockProbability: 0 }
    : variant === 'mixed-v1' ? { meanEligibleSeconds: 180, reversalShockProbability: .55, fullRecoveryProbability: .45, partialRecoveryProbability: .25 } : {};
  const candidate = { ...CONFIG, sweeps: { ...CONFIG.sweeps, ...overrides } };
  console.log(JSON.stringify(compare(runs, startSeed, candidate), null, 2));
}
