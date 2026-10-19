import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CONFIG } from '../gate/games/crypto/config.js';
import { createMarket } from '../gate/games/crypto/market.js';
import { createSweeps } from '../gate/games/crypto/sweeps.js';
import { createSession } from '../gate/games/crypto/session.js';
import { createReconciler } from '../gate/games/crypto/live-clock.js';
import { BASELINE, STRATEGIES, createDetector, createBouncePolicy, runMarket } from './crypto-sweeps-simulation.mjs';
import { simulate } from './crypto-simulation.mjs';

const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const settings = changes => ({ ...CONFIG, sweeps: { ...CONFIG.sweeps, ...changes } });

test('disabled sweeps preserve the pre-change 600-second market path bit for bit', () => {
  // Frozen from market.js at 93c20c0, before implementation, including warmup.
  const fixtures = [[3, 'f04f43240f908aebe1fb84c272e225da29226cc45f0f086b074b0dc5b9245cf9'],
    [42, 'adf5ad4d4e3ae4670caaefebb7021b8ea0f4745f0ff6695b5c8c9fd40c14a15b'],
    [50123, 'dd64634fd47b6c4387851706e0ba242c7801d8d7cd6b7037c26b422eef3cfab9']];
  for (const [seed, expected] of fixtures) {
    const market = createMarket(seed, BASELINE), prices = Array.from({ length: 6000 }, () => market.step());
    assert.equal(createHash('sha256').update(JSON.stringify(prices)).digest('hex'), expected);
  }
});

test('event random draws do not perturb background regime, jump or diffusion draws', () => {
  for (const seed of [3, 42, 50123]) {
    const baseline = createMarket(seed, BASELINE);
    const zero = createMarket(seed, settings({ amplitude: [0, 0], largeAmplitude: [0, 0], meanEligibleSeconds: 1 }));
    assert.deepEqual(zero.snapshot(), baseline.snapshot());
    for (let tick = 0; tick < 6000; tick++) assert.equal(zero.step(), baseline.step());
  }
});

test('warmup uses the same mixed-shock process and keeps its active/recovery state', () => {
  const config = settings({ meanEligibleSeconds: 5 });
  for (const seed of [3, 42, 50123]) {
    const warm = createMarket(seed, config), cold = createMarket(seed, { ...config, historyCandles: 0 });
    for (let tick = 0; tick < 1000; tick++) cold.step();
    const a = warm.snapshot(), b = cold.snapshot();
    assert.equal(a.price, b.price);
    assert.deepEqual(a.candles, b.candles.map(c => ({ ...c, time: c.time - 100000 })));
    for (let tick = 0; tick < 200; tick++) assert.equal(warm.step(), cold.step());
  }
});

test('identical initial shocks can fully recover, partly remain or never reverse their level shift', () => {
  const traces = [0, .5, 1].map(retained => {
    const config = settings({ meanEligibleSeconds: .0001, amplitude: [.1, .1], largeProbability: 0,
      attackSeconds: [2, 2], holdSeconds: [0, 0], recoverySeconds: [4, 4], recoveryShape: [1, 1],
      fullRecoveryProbability: retained === 0 ? 1 : 0, partialRecoveryProbability: retained === .5 ? 1 : 0,
      retainedFraction: [.5, .5], cooldownSeconds: 100, reversalShockProbability: 0 });
    const sweep = createSweeps(() => .5, config);
    return Array.from({ length: 100 }, () => sweep.step(1, 1, .0032));
  });
  assert.deepEqual(traces[0].slice(0, 21), traces[1].slice(0, 21));
  assert.deepEqual(traces[0].slice(0, 21), traces[2].slice(0, 21));
  near(traces[0][20], -.1);
  for (const [i, retained] of [0, .5, 1].entries()) {
    near(traces[i].at(-1), -.1 * retained);
    assert.ok(traces[i].every(value => value >= -.100000001 && value <= 0));
  }
});

test('a sharp move can accompany a natural reversal, and events never overlap or restart in cooldown', () => {
  const config = settings({ meanEligibleSeconds: Infinity, reversalShockProbability: 1, amplitude: [.08, .08],
    largeProbability: 0, attackSeconds: [1, 1], holdSeconds: [0, 0], recoverySeconds: [2, 2],
    fullRecoveryProbability: 0, partialRecoveryProbability: 0, cooldownSeconds: 20 });
  const sweep = createSweeps(() => .5, config);
  near(sweep.step(-1, 1, .0032), 0); // Same abrupt onset as a countertrend pullback.
  const values = Array.from({ length: 100 }, (_, i) => sweep.step(i % 2 ? 1 : -1, i % 2 ? -1 : 1, .0032));
  assert.ok(values[10] < -.079);
  near(values.at(-1), -.08); // Repeated reversals cannot stack new events.
  const disabled = createSweeps(() => { throw new Error('disabled RNG'); }, BASELINE);
  assert.equal(disabled.step(1, -1, -.0032), 0);
});

test('hidden catch-up liquidates inside a recovered sweep, including within a single candle', () => {
  const config = { ...settings({ meanEligibleSeconds: .0001, amplitude: [.14, .14], largeProbability: 0,
    attackSeconds: [.3, .3], holdSeconds: [0, 0], recoverySeconds: [.3, .3], recoveryShape: [1, 1],
    fullRecoveryProbability: 1, partialRecoveryProbability: 0, cooldownSeconds: Infinity }),
    historyCandles: 0, meanRegimeSeconds: Infinity, driftResponseSeconds: .001,
    calmSigma: 0, volatileSigma: 0, jumpSigma: 0 };
  const fast = createSession(3, config), hidden = createSession(3, config);
  fast.enter(1, .5, 10); hidden.enter(1, .5, 10);
  const liq = fast.snapshot().account.liquidationPrice;
  for (let i = 0; i < 20; i++) fast.advance(100);
  const driver = createReconciler(hidden, { elapsed: () => 2000 }, config);
  while (driver.pending()) driver.reconcile(3);
  assert.deepEqual(hidden.snapshot(), fast.snapshot());
  const state = hidden.snapshot();
  assert.equal(state.liquidations, 1); assert.equal(state.account.cash, 5000);
  assert.equal(state.account.position, null);
  assert.ok(state.market.price > 100, 'The terminal quote alone would hide liquidation');
  assert.ok(state.market.candles[0].low < liq);
  const allIn = createSession(3, config); allIn.enter(1, 1, 20); allIn.advance(2000);
  assert.equal(allIn.snapshot().account.bankrupt, true);
  assert.ok(allIn.elapsed < 1000, 'A later recovery must never revive a bankrupt account');
});

test('visible sharp-move detection and bounce entry cannot use future data or an event label', () => {
  const candles = Array.from({ length: 13 }, (_, i) => ({ close: 100 + i }));
  candles[11].close = 107; candles[12].close = 105;
  const market = { price: 105, candles, candle: { close: 99999 } };
  const detector = createDetector(), signal = detector(market, 0);
  assert.equal(signal.side, 1); assert.equal(signal.reference, 110);
  assert.equal(detector(market, 2), null);
  const state = { market, elapsed: 0, account: { position: null } };
  assert.deepEqual(createBouncePolicy(false)(state), { side: 1 });
  const confirmed = createBouncePolicy(true);
  assert.deepEqual(confirmed(state), {});
  assert.deepEqual(confirmed({ ...state, elapsed: 2000 }), {});
  const recovered = { price: 106, candles: [...candles.slice(1), { close: 106 }] };
  assert.deepEqual(confirmed({ ...state, market: recovered, elapsed: 4000 }), { side: 1 });
});

test('comparative account pool agrees with independent real sessions and the existing trend policy', () => {
  for (const config of [BASELINE, CONFIG]) {
    const seed = 50123, run = runMarket(seed, config);
    const expected = simulate('trend', seed, 600, 5, config), actual = run.outcomes.trend5;
    assert.deepEqual({ result: actual.result, time: actual.time, equity: actual.equity }, expected);
    for (const strategy of STRATEGIES.filter(s => s.hold)) {
      const session = createSession(seed, config); session.enter(strategy.side, 1, strategy.leverage);
      let outcome;
      for (let tick = 1; tick <= 6000; tick++) {
        session.advance(100); const state = session.snapshot(), a = state.account, time = state.elapsed / 1000;
        if (a.bankrupt) outcome = { result: 'ruin', time, equity: a.equity };
        else if (a.cashAfterClose >= 50000) { session.close(1); assert.equal(session.pay(), true); outcome = { result: 'success', time, equity: a.cashAfterClose }; }
        else if (time === 600) outcome = { result: 'censored', time, equity: a.cashAfterClose };
        if (outcome) break;
      }
      const actual = run.outcomes[strategy.id];
      assert.deepEqual({ result: actual.result, time: actual.time, equity: actual.equity }, outcome);
    }
  }
});

test('actual mixed shocks remain independent of trades, account losses and restart', () => {
  const trading = createSession(11), idle = createSession(11);
  trading.enter(1, .25, 20);
  for (let i = 0; i < 300; i++) {
    trading.advance(100); idle.advance(100);
    assert.deepEqual(trading.snapshot().market, idle.snapshot().market);
  }
  assert.equal(trading.snapshot().liquidations, 1);
  assert.equal(trading.snapshot().account.cash, 7500);
  assert.deepEqual(createSession(11).snapshot(), createSession(11).snapshot());
});

test('bounce variants execute identically through real session ticks, fees, stops and target payment', () => {
  const seed = 50123, run = runMarket(seed, CONFIG);
  for (const strategy of STRATEGIES.filter(s => s.policy?.includes('bounce'))) {
    const session = createSession(seed), policy = createBouncePolicy(strategy.policy === 'confirmed-bounce');
    let outcome, entries = 0;
    for (let seconds = 0; seconds <= 600; seconds += 2) {
      let state = session.snapshot(), a = state.account;
      if (a.bankrupt) { outcome = { result: 'ruin', time: session.elapsed / 1000, equity: a.equity }; break; }
      if (a.cashAfterClose >= 50000) {
        if (a.position) session.close(1);
        assert.equal(session.pay(), true);
        outcome = { result: 'success', time: seconds, equity: a.cashAfterClose }; break;
      }
      if (seconds === 600) { outcome = { result: 'censored', time: seconds, equity: a.cashAfterClose }; break; }
      const action = policy(state);
      if (action.close) session.close(1);
      if (action.side && !session.snapshot().account.position && session.enter(action.side, 1, strategy.leverage)) entries++;
      session.advance(2000);
    }
    const actual = run.outcomes[strategy.id];
    assert.deepEqual({ result: actual.result, time: actual.time, equity: actual.equity }, outcome);
    assert.equal(actual.entries, entries);
  }
});
