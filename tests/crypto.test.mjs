import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../gate/games/crypto/config.js';
import { createAccount } from '../gate/games/crypto/account.js';
import { createMarket, seededRandom } from '../gate/games/crypto/market.js';
import { createSession } from '../gate/games/crypto/session.js';
import { canEnter } from '../gate/common/engine.js';
import { createWallClock, createReconciler } from '../gate/games/crypto/live-clock.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('standalone, gate and freeplay invalidate the ticker renderer together', async () => {
  const graph = [
    ['gate/games/crypto/index.html', './prototype.js'], ['gate/games/crypto/prototype.js', './game.js'],
    ['gate/index.html', 'gate.js'], ['gate/gate.js', './registry.js'],
    ['play/index.html', 'play.js'], ['play/play.js', '../gate/registry.js'],
    ['gate/registry.js', './games/crypto/game.js'], ['gate/games/crypto/game.js', './chart.js'],
  ];
  for (const [file, dependency] of graph) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes(`${dependency}?v=20261029-ticker`), `${file} must invalidate ${dependency}`);
  }
});

test('default is 1x while all selectable leverage levels remain available', () => {
  assert.equal(CONFIG.defaultLeverage, 1);
  assert.deepEqual(CONFIG.leverage, [1, 2, 5, 10, 20]);
  const account = createAccount();
  assert.equal(account.enter(1, 1, CONFIG.defaultLeverage, 100), true);
  const state = account.snapshot(100);
  near(state.position.quantity * 100, state.position.margin);
  near(state.fees, 10000 * .0005 / 1.0005);
  near(state.liquidationPrice, 0);
});

test('100% entries reserve margin and the correct notional fee at every leverage', () => {
  for (const leverage of CONFIG.leverage) for (const side of [1, -1]) {
    const a = createAccount();
    assert.equal(a.enter(side, 1, leverage, 100), true);
    const s = a.snapshot(100), margin = 10000 / (1 + leverage * .0005);
    near(s.cash, 0); near(s.position.margin, margin);
    near(s.position.quantity, margin * leverage / 100);
    near(s.fees, margin * leverage * .0005);
    near(s.equity + s.fees, 10000);
    assert.equal(a.enter(side, 1, leverage, 100), false);
    assert.equal(a.close(1, 100), true);
    const closed = a.snapshot(100);
    near(closed.cash, 10000 - 2 * s.fees);
    near(closed.fees, 2 * s.fees);
    assert.equal(closed.position, null);
  }
});

test('partial closes release proportional margin and linear P&L minus exit costs', () => {
  for (const side of [1, -1]) for (const fraction of CONFIG.allocations) {
    const a = createAccount(); a.enter(side, .5, 10, 100);
    const p = a.snapshot(100).position, price = side === 1 ? 107 : 93;
    const net = p.margin + side * p.quantity * (price - 100) - p.quantity * price * .0005;
    assert.equal(a.close(fraction, price), true);
    const s = a.snapshot(price);
    near(s.cash, 5000 + fraction * net);
    if (fraction === 1) assert.equal(s.position, null);
    else {
      near(s.position.margin, p.margin * (1 - fraction));
      near(s.position.quantity, p.quantity * (1 - fraction));
      near(s.position.entry, 100);
      near(s.cashAfterClose, 5000 + net);
    }
  }
});

test('adds use quantity-weighted entry and retain margin, leverage and P&L continuity', () => {
  for (const side of [1, -1]) {
    const a = createAccount(); a.enter(side, .5, 5, 100);
    const first = a.snapshot(110), m = 2500 / 1.0025, quantity = m * 5 / 110;
    assert.equal(a.enter(-side, .5, 5, 110), false);
    assert.equal(a.enter(side, .5, 10, 110), false);
    assert.equal(a.enter(side, .5, 5, 110), true);
    const s = a.snapshot(110);
    near(s.position.entry, (first.position.quantity * 100 + quantity * 110) / (first.position.quantity + quantity));
    near(s.position.margin, first.position.margin + m);
    near(s.cash, 2500);
    near(s.unrealized, first.unrealized);
    near(s.equity, first.equity - quantity * 110 * .0005);
    a.close(1, 110);
    assert.equal(a.enter(-side, 1, 20, 110), true);
  }
});

test('liquidation incorporates exit costs; gaps never debit isolated-outside cash', () => {
  for (const side of [1, -1]) for (const leverage of [2, 5, 10, 20]) {
    const a = createAccount(); a.enter(side, .75, leverage, 100);
    const s = a.snapshot(100), liq = s.liquidationPrice;
    near(s.position.margin + side * s.position.quantity * (liq - 100), s.position.quantity * liq * .0005);
    assert.equal(a.liquidate(liq + side * .00001), false);
    assert.equal(a.liquidate(liq - side * .00001), true);
    near(a.snapshot(100).cash, 2500);
    assert.equal(a.snapshot(100).position, null);
    assert.equal(a.liquidate(100), false);
    const gap = createAccount(); gap.enter(side, .75, leverage, 100);
    assert.equal(gap.liquidate(side === 1 ? 1 : 1000), true);
    near(gap.snapshot(100).cash, 2500);
    assert.ok(gap.snapshot(100).fees >= 0);
  }
});

test('insolvent positions cannot be rescued by adding or paid out with a close', () => {
  for (const side of [1, -1]) {
    const a = createAccount(); a.enter(side, .5, 20, 100);
    const gap = side === 1 ? 50 : 200;
    assert.equal(a.enter(side, 1, 20, gap), false);
    assert.equal(a.close(.25, gap), true);
    const s = a.snapshot(gap);
    assert.equal(s.position, null); near(s.cash, 5000);
  }
});

test('1x long has no positive liquidation price; short remains exposed to rises', () => {
  const a = createAccount(); a.enter(1, 1, 1, 100);
  near(a.snapshot(100).liquidationPrice, 0);
  assert.equal(a.liquidate(.01), false);
  const b = createAccount(); b.enter(-1, 1, 1, 100);
  assert.ok(b.snapshot(100).liquidationPrice > 199);
  assert.equal(b.liquidate(201), true);
});

test('payment requires flat cash, spends once, and bankruptcy has a clear minimum order', () => {
  const a = createAccount(); assert.equal(a.pay(), false);
  a.enter(1, 1, 5, 100);
  assert.ok(a.snapshot(200).cashAfterClose > CONFIG.target);
  assert.equal(a.snapshot(200).canPay, false); assert.equal(a.pay(), false);
  a.close(1, 200);
  assert.equal(a.snapshot(200).canPay, true);
  const before = a.snapshot(200).cash;
  assert.equal(a.pay(), true); near(a.snapshot(200).cash, before - CONFIG.target);
  assert.equal(a.pay(), false); assert.equal(a.enter(1, 1, 5, 100), false);
  assert.equal(a.snapshot(100).bankrupt, false);
  const dust = createAccount({ ...CONFIG, startingCash: .99 });
  assert.equal(dust.snapshot(100).bankrupt, true);
  assert.equal(dust.enter(1, 1, 5, 100), false);
  const b = createAccount(); b.enter(1, 1, 20, 100); b.liquidate(1);
  assert.equal(b.snapshot(1).bankrupt, true); near(b.snapshot(1).equity, 0);
});

test('invalid orders leave the account unchanged', () => {
  const a = createAccount(), before = a.snapshot(100);
  for (const price of [NaN, Infinity, -1, 0]) assert.equal(a.enter(1, 1, 5, price), false);
  for (const ratio of [NaN, 0, -1, .1, 2]) assert.equal(a.enter(1, ratio, 5, 100), false);
  for (const leverage of [NaN, 0, 3, 30]) assert.equal(a.enter(1, 1, leverage, 100), false);
  for (const side of [0, 2, 'long']) assert.equal(a.enter(side, 1, 5, 100), false);
  assert.deepEqual(a.snapshot(100), before);
  assert.equal(a.close(1, 100), false);
  assert.throws(() => a.snapshot(NaN), RangeError);
});

test('randomized trades preserve conservation, positive balances and isolated risk', () => {
  const random = seededRandom(7913);
  for (let run = 0; run < 60; run++) {
    const a = createAccount(); let price = 100;
    for (let i = 0; i < 200; i++) {
      price *= Math.exp((random() - .5) * .12);
      a.liquidate(price);
      const before = a.snapshot(price), fraction = CONFIG.allocations[Math.floor(random() * 4)];
      if (before.position && random() < .5) a.close(fraction, price);
      else a.enter(before.position?.side || (random() < .5 ? 1 : -1), fraction, before.position?.leverage || 5, price);
      const after = a.snapshot(price);
      assert.ok(after.cash >= 0 && Number.isFinite(after.equity));
      near(before.equity - after.equity, after.fees - before.fees, 1e-6);
      if (after.position) assert.ok(after.position.margin > 0 && after.position.quantity > 0);
    }
  }
});

test('market seed determinism, detached snapshots, 50 real historical candles and no future exposure', () => {
  const a = createMarket(42), b = createMarket(42), c = createMarket(43);
  const start = a.snapshot();
  assert.equal(start.candles.length, 50); assert.equal(start.time, 0); assert.equal(start.candle, null);
  assert.equal(start.candles[0].time, -100000);
  assert.equal(start.candles.at(-1).time, -2000);
  assert.deepEqual(start, b.snapshot()); assert.notDeepEqual(start, c.snapshot());
  assert.deepEqual(Object.keys(start).sort(), ['candle', 'candles', 'price', 'time']);
  start.candles[0].close = 999999;
  assert.notEqual(a.snapshot().candles[0].close, 999999);
  for (let i = 0; i < 1200; i++) near(a.step(), b.step());
  assert.equal(a.snapshot().candles.length, 60);
});

test('OHLC is aggregated from every actual tick, with continuous candle opens', () => {
  const market = createMarket(87);
  for (let candle = 0; candle < 40; candle++) {
    const start = market.snapshot().price, prices = [start];
    for (let tick = 0; tick < 20; tick++) {
      prices.push(market.step());
      const s = market.snapshot();
      if (tick < 19) {
        assert.equal(s.candle.open, start);
        assert.equal(s.candle.high, Math.max(...prices));
        assert.equal(s.candle.low, Math.min(...prices));
        assert.equal(s.candle.close, prices.at(-1));
      }
    }
    const s = market.snapshot(), bar = s.candles.at(-1);
    assert.equal(s.candle, null);
    assert.deepEqual(bar, { time: candle * 2000, open: start, high: Math.max(...prices), low: Math.min(...prices), close: prices.at(-1) });
  }
});

test('fixed clock yields the same path across render rates and does not trade in unseen future', () => {
  const fast = createSession(9), slow = createSession(9), irregular = createSession(9);
  for (let i = 0; i < 600; i++) fast.advance(1000 / 60);
  for (let i = 0; i < 300; i++) slow.advance(1000 / 30);
  for (const delta of [1, 48, 285, 500, 9166]) irregular.advance(delta);
  assert.deepEqual(fast.snapshot(), slow.snapshot());
  assert.deepEqual(fast.snapshot(), irregular.snapshot());
  const before = fast.snapshot(); fast.enter(1, .5, 5);
  assert.equal(fast.snapshot().account.position.entry, before.market.price);
  assert.deepEqual(fast.snapshot().market, before.market);
  fast.close(1); assert.deepEqual(fast.snapshot().market, before.market);
  assert.throws(() => fast.advance(-10), RangeError);
});

test('player positions never influence market, and a new session resets all account/clock state', () => {
  const active = createSession(718), idle = createSession(718);
  for (let i = 0; i < 40; i++) {
    active.enter(i % 2 ? -1 : 1, .25, 5);
    active.advance(2000); idle.advance(2000);
    assert.deepEqual(active.snapshot().market, idle.snapshot().market);
    active.close(1);
  }
  const reset = createSession(718), clean = createSession(718);
  assert.deepEqual(reset.snapshot(), clean.snapshot());
  assert.equal(reset.snapshot().elapsed, 0); assert.equal(reset.snapshot().account.cash, 10000);
});

test('crypto is registered with payment eligibility and preserves the standalone completion route', async () => {
  const registry = await readFile(new URL('../gate/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /id:'crypto'/);
  assert.match(registry, /payment:true/);
  assert.equal(canEnter(CONFIG.target, { value: CONFIG.target, stopped: true }), true);
  assert.equal(canEnter(CONFIG.target, { value: CONFIG.target, stopped: false }), false);
  const shell = await readFile(new URL('../gate/games/crypto/prototype.js', import.meta.url), 'utf8');
  assert.match(shell, /enterPersonal/);
  assert.doesNotMatch(shell, /clearPass/);
});

test('wall clock includes sleep, never rewinds and handles backward clock corrections', () => {
  let wall = 100000, mono = 0;
  const clock = createWallClock(() => wall, () => mono);
  wall += 2000; mono += 2000; near(clock.elapsed(), 2000);
  wall += 60000; near(clock.elapsed(), 62000); // sleeping performance clock
  near(clock.elapsed(), 62000); // repeated callback cannot double count
  mono += 100; wall += 100; near(clock.elapsed(), 62100);
  wall -= 60000; mono += 100; near(clock.elapsed(), 62200);
  wall += 100; mono += 100; near(clock.elapsed(), 62300);
  wall += 120000; near(clock.elapsed(), 182300); // sleep / forward jump after correction is still elapsed time
});

test('reconciliation is absolute, chunked and independent of callback frequency', () => {
  let now = 0;
  const a = createSession(15), b = createSession(15);
  const driver = createReconciler(a, { elapsed: () => now });
  now = 123456;
  const first = driver.reconcile(100);
  assert.equal(first.ticks, 100); assert.equal(first.remainingMs, 113400);
  assert.equal(a.elapsed, 10000); assert.equal(driver.pending(), true);
  let chunks = 1;
  while (driver.pending()) { assert.ok(driver.reconcile(100).ticks <= 100); chunks++; }
  assert.equal(chunks, 13);
  b.advance(now);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(driver.reconcile().ticks, 0);
  now += 44; driver.reconcile(); b.advance(44);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('hidden interval processes liquidation crossing even if the price later recovers', () => {
  // Find an actual crossing-and-recovery on a fixed independent path, rather
  // than replacing a market step with an artificial final quote.
  let fixture;
  for (let seed = 1; seed < 50 && !fixture; seed++) {
    const market = createMarket(seed), start = market.snapshot().price;
    let low = start;
    for (let tick = 1; tick <= 2400; tick++) {
      const price = market.step(); low = Math.min(low, price);
      if (low < start * .949 && price > start * .985) { fixture = { seed, elapsed: tick * 100, price }; break; }
    }
  }
  assert.ok(fixture);
  const a = createSession(fixture.seed), b = createSession(fixture.seed);
  a.enter(1, .5, 20); b.enter(1, .5, 20);
  const driver = createReconciler(a, { elapsed: () => fixture.elapsed });
  while (driver.pending()) driver.reconcile(37);
  for (let t = 0; t < fixture.elapsed; t += 100) b.advance(100);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.snapshot().liquidations, 1);
  assert.equal(a.snapshot().account.position, null);
  near(a.snapshot().account.cash, 5000);
  near(a.snapshot().market.price, fixture.price);
});

test('bankruptcy during catch-up terminates the run at the crossing, not a final-price jump', () => {
  const game = createSession(42); game.enter(1, 1, 20);
  const reconciler = createReconciler(game, { elapsed: () => 86400000 });
  let calls = 0;
  while (reconciler.pending() && calls++ < 100) reconciler.reconcile(50);
  assert.equal(game.ended, true);
  assert.equal(game.snapshot().account.bankrupt, true);
  assert.equal(game.snapshot().liquidations, 1);
  assert.ok(game.elapsed < 86400000);
  assert.equal(reconciler.pending(), false);
});
