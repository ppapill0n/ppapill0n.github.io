import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate, formatValue } from '../gate/engine.js';
import { InertiaDial, wrap } from '../gate/dial.js';

test('every four-digit target is reachable; matching requires a stopped dial by default', () => {
  for (let value = 0; value < 10000; value++) {
    const gate = createGate(undefined, () => (value + 0.1) / 10000);
    const challenge = gate.next();
    assert.equal(challenge.target, value);
    assert.notEqual(challenge.start, value);
    assert.equal(formatValue(value).length, 4);
    assert.equal(wrap(value - 1 + 1), value);
    assert.equal(gate.canEnter({ value, stopped: true }), true);
    assert.equal(gate.canEnter({ value, stopped: false }), false);
    assert.equal(gate.canEnter({ value: wrap(value + 1), stopped: true }), false);
    assert.notEqual(gate.next().target, value);
  }
  assert.equal(formatValue(0), '0000');
  assert.equal(formatValue(9999), '9999');
});

test('stopped rule is configurable independently of the input implementation', () => {
  const gate = createGate({ requireStopped: false }, () => 0);
  assert.equal(gate.canEnter({ value: 0, stopped: true }), false);
  gate.next();
  assert.equal(gate.canEnter({ value: 0, stopped: false }), true);
});

test('dial settles, wraps, resets active input, and stops on tab visibility changes', () => {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  let callback;
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
  globalThis.cancelAnimationFrame = () => { callback = null; };
  const element = new EventTarget();
  let captured = null;
  element.hasPointerCapture = id => captured === id;
  element.releasePointerCapture = () => { captured = null; };
  let state;
  const dial = new InertiaDial(element, next => { state = next; });
  const key = (name, shiftKey = false) => ({ key: name, shiftKey, preventDefault() {} });
  dial.reset(0);
  for (let value = 1; value <= 10000; value++) {
    dial.key(key('ArrowRight'));
    assert.equal(state.value, value % 10000);
  }
  dial.reset(9999);
  dial.key(key('ArrowRight'));
  assert.equal(state.value, 0);
  assert.equal(state.stopped, false);
  dial.stop();
  assert.equal(state.stopped, true);
  dial.key(key('ArrowLeft'));
  assert.equal(state.value, 9999);
  dial.reset(0);
  dial.velocity = 5000;
  dial.lastFrame = 0;
  for (let time = 16; time <= 2000; time += 16) { callback = null; dial.tick(time); }
  assert.equal(state.stopped, true);
  assert.equal(dial.velocity, 0);
  assert.equal(dial.position, Math.round(dial.position));
  dial.pointer = captured = 7;
  dial.velocity = 900;
  dial.frame = requestAnimationFrame(() => {});
  dial.keys.add('ArrowRight');
  dial.reset(42);
  assert.deepEqual(state, { value: 42, stopped: true });
  assert.equal(captured, null);
  assert.equal(dial.keys.size, 0);
  assert.equal(callback, null);
  dial.key(key('ArrowRight'));
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(state.stopped, true);
  assert.equal(dial.keys.size, 0);
  dial.position = 9999.9;
  dial.snap();
  assert.equal(state.value, 0);
});
