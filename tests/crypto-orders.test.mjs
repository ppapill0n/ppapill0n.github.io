import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../gate/games/crypto/config.js';
import { createSession } from '../gate/games/crypto/session.js';
import { createReconciler } from '../gate/games/crypto/live-clock.js';
import { createOrderQueue } from '../gate/games/crypto/orders.js';

function fixture(seed = 42, config = CONFIG) {
  let now = 0;
  const session = createSession(seed, config), reconciler = createReconciler(session, { elapsed: () => now }, config);
  const orders = createOrderQueue(session, reconciler);
  return { session, reconciler, orders, setTime(value) { now = value; },
    pump(ticks = 1000) { reconciler.reconcile(ticks); return orders.flush(); },
    finish(ticks = 1000) { while (reconciler.pending() || orders.pending) { reconciler.reconcile(ticks); orders.flush(); } },
    submit(action, allocation = 1, leverage = 1) { return orders.submit({ action, allocation, leverage, positionId: session.snapshot().account.position?.id ?? null }); },
  };
}

test('Long and Short clicked on an old quote execute once at the current tick', async () => {
  for (const action of ['long', 'short']) {
    const f = fixture(), initial = f.session.snapshot().market.price;
    f.setTime(5078);
    const result = f.submit(action, 1, 1); f.finish();
    const fill = await result, state = f.session.snapshot();
    assert.equal(fill.status, 'filled'); assert.equal(state.elapsed, 5000);
    assert.notEqual(fill.price, initial); assert.equal(state.account.position.entry, fill.price);
    assert.equal(fill.price, state.market.price); assert.equal(state.account.cash, 0);
    const before = f.session.snapshot();
    for (let n = 0; n < 10; n++) f.pump();
    assert.deepEqual(f.session.snapshot(), before);
  }
});

test('a queued partial Close releases the selected fraction at the updated price', async () => {
  const f = fixture(11), expected = createSession(11);
  f.session.enter(1, .5, 1); expected.enter(1, .5, 1);
  const original = f.session.snapshot().account.position;
  f.setTime(30000); const result = f.submit('close', .25); f.finish(7);
  expected.advance(30000); expected.close(.25);
  assert.equal((await result).status, 'filled');
  assert.deepEqual(f.session.snapshot(), expected.snapshot());
  assert.equal(f.session.snapshot().account.position.quantity, original.quantity * .75);
});

test('distinct repeated clicks are FIFO; each uses remaining cash and its captured size', async () => {
  const f = fixture(), expected = createSession(42);
  f.setTime(3600000);
  const first = f.submit('long', .25, 5), second = f.submit('long', .5, 5), third = f.submit('long', 1, 5);
  assert.equal(f.pump(100), 0); assert.equal(f.session.snapshot().account.cash, 10000);
  f.setTime(3600100); f.finish(100);
  expected.advance(3600100);
  for (const ratio of [.25, .5, 1]) expected.enter(1, ratio, 5);
  assert.deepEqual((await Promise.all([first, second, third])).map(r => r.status), ['filled', 'filled', 'filled']);
  assert.deepEqual(f.session.snapshot(), expected.snapshot());
  assert.equal(f.session.snapshot().account.cash, 0);
  const impossible = f.submit('long', 1, 5); f.finish();
  assert.equal((await impossible).status, 'invalid');
  assert.deepEqual(f.session.snapshot(), expected.snapshot());
});

test('time advancing between queued actions triggers another catch-up before the next fill', async () => {
  const f = fixture(), originalEnter = f.session.enter;
  let time = 1000;
  f.setTime(time);
  f.session.enter = (...args) => { const result = originalEnter(...args); f.setTime(time += 100); return result; };
  const a = f.submit('long', .25), b = f.submit('long', .25);
  assert.equal(f.pump(), 1); assert.equal(f.orders.pending, true);
  assert.equal(f.pump(), 1);
  const [first, second] = await Promise.all([a, b]);
  assert.notEqual(first.price, second.price);
  const expected = createSession(42); expected.advance(1000); expected.enter(1, .25, 1); expected.advance(100); expected.enter(1, .25, 1);
  assert.deepEqual(f.session.snapshot(), expected.snapshot());
});

test('intervening liquidation invalidates delayed Close/add intents without reopening or debt', async () => {
  for (const action of ['close', 'long']) {
    const f = fixture(11); f.session.enter(1, .5, 20);
    const entry = f.session.snapshot().market.price;
    f.setTime(30000); const result = f.submit(action, .5, 20); f.finish(9);
    assert.equal((await result).status, 'invalid');
    const state = f.session.snapshot();
    assert.equal(state.liquidations, 1); assert.equal(state.account.position, null);
    assert.equal(state.account.cash, 5000); assert.ok(state.market.price > entry);
  }
  const allIn = fixture(11); allIn.session.enter(1, 1, 20); allIn.setTime(30000);
  const result = allIn.submit('close'); allIn.finish(3);
  assert.equal((await result).status, 'invalid'); assert.equal(allIn.session.snapshot().account.cash, 0);
});

test('a delayed position-bound Close cannot close a replacement position', async () => {
  const f = fixture(); f.session.enter(1, .5, 1);
  const result = f.submit('close', 1);
  f.session.close(1); f.session.enter(-1, .5, 1);
  const replacement = f.session.snapshot();
  f.finish(); assert.equal((await result).status, 'invalid'); assert.deepEqual(f.session.snapshot(), replacement);
});

test('repeated partial closes apply to remaining quantity in order without duplication', async () => {
  const f = fixture(); f.session.enter(1, .5, 1);
  const quantity = f.session.snapshot().account.position.quantity;
  f.setTime(2000); const a = f.submit('close', .5), b = f.submit('close', .5);
  f.finish(); assert.deepEqual((await Promise.all([a, b])).map(r => r.status), ['filled', 'filled']);
  assert.equal(f.session.snapshot().account.position.quantity, quantity * .25);
  const before = f.session.snapshot(); f.pump(); assert.deepEqual(f.session.snapshot(), before);
});

test('reset/navigation cancellation settles every pending intent and closes the old queue', async () => {
  const f = fixture(); f.setTime(3600000);
  const a = f.submit('long', .5), b = f.submit('short', .5); f.pump(1);
  f.orders.cancel(); f.finish();
  assert.deepEqual((await Promise.all([a, b])).map(r => r.status), ['cancelled', 'cancelled']);
  assert.equal((await f.submit('long')).status, 'cancelled');
  assert.equal(f.session.snapshot().account.position, null); assert.equal(f.session.snapshot().account.cash, 10000);
});

test('queued payment is atomic, checks actual flat cash, and never issues or charges twice', async () => {
  const f = fixture(42, { ...CONFIG, startingCash: 50000 }); let completions = 0;
  f.setTime(300000);
  const failed = f.orders.submit({ action: 'pay', complete: () => false }); f.finish();
  assert.equal((await failed).status, 'invalid'); assert.equal(f.session.snapshot().account.cash, 50000);
  const complete = state => { assert.deepEqual(state, { value: 50000, stopped: true, outcome: 'trading' }); completions++; return true; };
  const a = f.orders.submit({ action: 'pay', complete }), b = f.orders.submit({ action: 'pay', complete });
  f.finish(); assert.deepEqual((await Promise.all([a, b])).map(r => r.status), ['filled', 'invalid']);
  assert.equal(completions, 1); assert.equal(f.session.snapshot().account.cash, 0); assert.equal(f.session.snapshot().account.paid, true);
});
