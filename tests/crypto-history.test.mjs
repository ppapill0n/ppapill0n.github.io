import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../gate/games/crypto/config.js';
import { createAccount } from '../gate/games/crypto/account.js';
import { createSession } from '../gate/games/crypto/session.js';
import { CONDITIONS, STRATEGIES, historyReturns, matches, priceBoundaries, runSeed, wilson } from './crypto-history-simulation.mjs';

test('history filters use exactly the visible candle window and no live future values', () => {
  const candles = Array.from({ length: 50 }, (_, i) => ({ open: 100 - i, close: 99 - i }));
  const returns = historyReturns({ candles, price: 99999, candle: { close: 99999 } });
  assert.equal(returns[50], 50 / 100 - 1);
  assert.equal(returns[40], 50 / 90 - 1);
  assert.equal(returns[20], 50 / 70 - 1);
  assert.equal(returns[10], 50 / 60 - 1);
  for (const condition of CONDITIONS) {
    assert.equal(matches(returns, condition, -1), true);
    assert.equal(matches(returns, condition, 1), condition.id === 'all');
  }
  assert.equal(matches({ 10: -.05 }, { window: 10, threshold: .05 }, -1), false, 'Thresholds are strict');
});

test('analytic target boundaries agree with real accounting and distinguish closing fees', () => {
  for (const leverage of [1, 5, 20]) for (const side of [-1, 1]) {
    const boundary = priceBoundaries(side, leverage), account = createAccount();
    account.enter(side, 1, leverage, 100);
    if (boundary.targetReachable) {
      const net = account.snapshot(100 * boundary.netTargetRatio);
      assert.ok(Math.abs(net.cashAfterClose - 50000) < 1e-7);
      const gross = account.snapshot(100 * boundary.grossTargetRatio);
      assert.ok(Math.abs(gross.equity - 50000) < 1e-7);
      assert.ok(gross.cashAfterClose < 50000, 'Gross target alone cannot pay');
    } else {
      assert.equal(side, -1); assert.equal(leverage, 1);
      assert.ok(boundary.shortMaximumCashAtZeroPrice < 20000);
      assert.ok(account.snapshot(.0001).cashAfterClose < 20000);
    }
  }
});

test('shared-path simulation matches independent gameplay sessions at every execution boundary', () => {
  for (const seed of [20001, 20123, 29555]) {
    const result = runSeed(seed);
    for (const strategy of STRATEGIES) {
      const session = createSession(seed);
      assert.deepEqual(historyReturns(session.snapshot().market), result.history);
      session.enter(strategy.side, 1, strategy.leverage);
      let grossAt = null, outcome;
      for (let tick = 1; tick <= 600000 / CONFIG.tickMs; tick++) {
        session.advance(CONFIG.tickMs);
        const state = session.snapshot(), seconds = state.elapsed / 1000, a = state.account;
        if (a.equity >= 50000 && grossAt === null) grossAt = seconds;
        if (a.bankrupt) outcome = { result: 'ruin', time: seconds, grossAt, equity: a.equity };
        else if (a.cashAfterClose >= 50000) {
          assert.equal(session.close(1), true); assert.equal(session.pay(), true);
          outcome = { result: 'success', time: seconds, grossAt, equity: a.cashAfterClose };
        } else if (seconds === 600) outcome = { result: 'unfinished', time: seconds, grossAt, equity: a.cashAfterClose };
        if (outcome) break;
      }
      assert.deepEqual(result.outcomes[strategy.id], outcome, `seed=${seed}, strategy=${strategy.id}`);
    }
  }
});

test('reported uncertainty stays bounded for zero, mixed and all-success samples', () => {
  assert.deepEqual(wilson(0, 100), [0, 3.7]);
  assert.deepEqual(wilson(50, 100), [40.38, 59.62]);
  assert.deepEqual(wilson(100, 100), [96.3, 100]);
});
