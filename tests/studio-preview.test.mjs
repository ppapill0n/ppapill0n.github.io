import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectStore, validateObjects, STORAGE_KEY, MAX_OBJECTS } from '../personal/studio-preview/object-store.js';
import { normalizeView, viewDirection, PITCH_LIMIT } from '../personal/studio-preview/view-controls.js';

const entry = { type: 'plant', destination: 'profile', label: 'Garden' };
function fixture(initial) {
  const data = new Map([['unrelated', 'preserve']]);
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  let counter = 0;
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  return { data, options: { getStorage: () => storage, makeId: () => `object-${++counter}` } };
}
test('empty by default; repeated add/remove/reload/reset preserves unrelated state', () => {
  const f = fixture();
  let store = createObjectStore(f.options);
  assert.deepEqual(store.snapshot().objects, []);
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < MAX_OBJECTS; i++) assert.equal(store.add(entry).ok, true);
    assert.equal(store.add(entry).reason, 'full');
    store = createObjectStore(f.options);
    assert.equal(store.snapshot().objects.length, MAX_OBJECTS);
    const item = store.snapshot().objects[2];
    assert.equal(store.remove(item.id).ok, true);
    assert.equal(store.remove(item.id).reason, 'missing');
    assert.equal(store.add(entry).objects.at(-1).slot, 2);
    store.reset();
    store = createObjectStore(f.options);
    assert.equal(store.snapshot().objects.length, 0);
    assert.equal(f.data.get('unrelated'), 'preserve');
  }
});
test('storage failures retain a usable in-memory editor and report unavailable persistence', () => {
  for (const options of [
    { getStorage() { throw new Error('SecurityError'); } },
    { getStorage: () => ({ getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } }) },
  ]) {
    const store = createObjectStore({ ...options, makeId: () => 'only-object' });
    const added = store.add(entry);
    assert.equal(added.ok, true);
    assert.equal(added.persistence, 'unavailable');
    assert.equal(store.remove('only-object').objects.length, 0);
    store.add(entry);
    assert.equal(store.reset().objects.length, 0);
  }
});
test('corrupt data, unsupported versions, duplicate slots and unsafe destinations are rejected', () => {
  const item = { ...entry, id: 'a', slot: 0 };
  for (const value of [
    null, {}, { version: 2, objects: [] },
    { version: 1, objects: [item, { ...item, id: 'b' }] },
    { version: 1, objects: [{ ...item, destination: 'javascript:alert(1)' }] },
    { version: 1, objects: [{ ...item, destination: '__proto__' }] },
    { version: 1, objects: [{ ...item, label: ' '.repeat(10) }] },
    { version: 1, objects: [{ ...item, slot: Infinity }] },
  ]) assert.equal(validateObjects(value), null);
  for (const raw of ['broken JSON', JSON.stringify({ version: 99, objects: [] })]) {
    const f = fixture(raw), store = createObjectStore(f.options);
    assert.deepEqual(store.snapshot().objects, []);
    assert.equal(f.data.get(STORAGE_KEY), raw, 'read must not overwrite unrecognized data');
    assert.equal(store.add(entry).persistence, 'saved');
  }
});
test('returned snapshots cannot mutate live objects', () => {
  const f = fixture(), store = createObjectStore(f.options);
  const result = store.add(entry);
  result.objects[0].destination = 'javascript:alert(1)';
  result.objects.push({});
  assert.equal(store.snapshot().objects.length, 1);
  assert.equal(store.snapshot().objects[0].destination, 'profile');
});
test('look direction is a unit vector with full yaw and bounded vertical view', () => {
  assert.deepEqual(viewDirection({ yaw: 0, pitch: 0 }), { x: 0, y: 0, z: -1 });
  for (const yaw of [-Math.PI * 100, -1, 0, 1, Math.PI * 100]) {
    for (const pitch of [-100, -0.5, 0, 0.5, 100]) {
      const view = normalizeView({ yaw, pitch }), direction = viewDirection(view);
      assert.ok(Math.abs(view.pitch) <= PITCH_LIMIT);
      assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-12);
    }
  }
});
