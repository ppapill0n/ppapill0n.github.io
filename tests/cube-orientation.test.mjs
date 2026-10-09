import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrientation, orbitOrientation, transformView, inverseView } from '../gate/common/cube-orientation.js';
import { project } from '../gate/common/cube-gestures.js';

const TAU = 2 * Math.PI;
const BASIS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const VECTORS = [...BASIS, [0, 0, 0], [1, -2, 3], [-1.505, .75, 1.505], [1, 1, 1]];
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function near(actual, expected, message, tolerance = 2e-11) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} differs from ${expected}`);
}

function vectorNear(actual, expected, message, tolerance = 2e-11) {
  assert.equal(actual.length, expected.length, `${message}: vector dimension`);
  actual.forEach((value, i) => near(value, expected[i], `${message}, component ${i}`, tolerance));
}

// The reference rotates vectors with Rodrigues' geometric formula. It neither
// multiplies quaternions nor uses any production rotation/projection helper.
function rotateReference(vector, axis, angle) {
  const length = Math.hypot(...axis);
  if (length === 0 || angle === 0) return [...vector];
  const unit = axis.map(value => value / length);
  const tangent = cross(unit, vector), parallel = dot(unit, vector);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return vector.map((value, i) => value * cosine + tangent[i] * sine + unit[i] * parallel * (1 - cosine));
}

const orbitReference = (vector, dx, dy) => rotateReference(vector, [dy, dx, 0], Math.hypot(dx, dy));
const initialReference = (vector, yaw = -.58, pitch = .42) =>
  rotateReference(rotateReference(vector, [0, 1, 0], yaw), [1, 0, 0], pitch);

// Axis-angle inputs supply poses unavailable to a two-angle yaw/pitch camera,
// including a pure roll and an upside-down camera. This is only a fixture, not
// the oracle for the transformed vectors.
function axisAngleQuaternion(axis, angle) {
  const length = Math.hypot(...axis), sine = Math.sin(angle / 2);
  return [...axis.map(value => value / length * sine), Math.cos(angle / 2)];
}

function startingPoses() {
  return [
    { name: 'identity', q: createOrientation(0, 0), reference: vector => [...vector] },
    { name: 'default', q: createOrientation(), reference: vector => initialReference(vector) },
    { name: 'past the upper pole', q: createOrientation(.83, 2.73), reference: vector => initialReference(vector, .83, 2.73) },
    { name: 'past the lower pole', q: createOrientation(-2.1, -2.84), reference: vector => initialReference(vector, -2.1, -2.84) },
    ...[
      { name: 'quarter roll', axis: [0, 0, 1], angle: Math.PI / 2 },
      { name: 'upside down', axis: [0, 0, 1], angle: Math.PI },
      { name: 'arbitrary tilted roll', axis: [1, -3, 2], angle: 2.17 },
      { name: 'arbitrary reverse roll', axis: [-2, 1, 4], angle: -1.83 }
    ].map(({ name, axis, angle }) => ({
      name, q: axisAngleQuaternion(axis, angle), reference: vector => rotateReference(vector, axis, angle)
    }))
  ];
}

test('the default orientation preserves Y-then-X framing and arbitrary initial pitches are unrestricted', () => {
  for (const [yaw, pitch] of [[-.58, .42], [0, 0], [2.3, 2.7], [-5.4, -2.9], [17.2, -21.6]]) {
    const q = createOrientation(yaw, pitch);
    assert.equal(q.length, 4);
    near(Math.hypot(...q), 1, 'initial quaternion norm');
    for (const vector of VECTORS) vectorNear(transformView(vector, q), initialReference(vector, yaw, pitch), 'initial framing');
  }
  vectorNear(createOrientation(), createOrientation(-.58, .42), 'default angles');
});

test('horizontal, vertical and diagonal strokes keep rotating through repeated full turns in both directions', () => {
  const steps = 1536, turns = 7.375;
  for (const [label, x, y] of [['horizontal', 1, 0], ['vertical', 0, 1], ['diagonal', .6, .8]]) {
    for (const sign of [-1, 1]) {
      const angle = sign * TAU * turns, dx = x * angle / steps, dy = y * angle / steps;
      let q = createOrientation();
      for (let step = 1; step <= steps; step++) {
        q = orbitOrientation(q, dx, dy);
        // Check every step, so a clamp, stalled pole or wrap discontinuity
        // cannot hide behind a correct final orientation.
        for (const vector of BASIS) {
          const expected = orbitReference(initialReference(vector), x * angle * step / steps, y * angle * step / steps);
          vectorNear(transformView(vector, q), expected, `${label} ${sign}, step ${step}`);
        }
      }
    }
  }
});

test('each complete 2pi orbit returns to the same view, even when rolled or inverted', () => {
  for (const pose of startingPoses()) {
    for (const [x, y] of [[1, 0], [0, 1], [.6, .8], [-.8, .6]]) {
      for (const sign of [-1, 1]) {
        let q = [...pose.q];
        for (let turn = 1; turn <= 4; turn++) {
          for (let step = 0; step < 64; step++) q = orbitOrientation(q, sign * x * TAU / 64, sign * y * TAU / 64);
          for (const vector of VECTORS) vectorNear(transformView(vector, q), pose.reference(vector), `${pose.name}, loop ${turn}`);
        }
        // Equivalent views are intentional: q and -q encode the same pose.
        const single = orbitOrientation(pose.q, sign * x * TAU, sign * y * TAU);
        for (const vector of VECTORS) vectorNear(transformView(vector, single), pose.reference(vector), `${pose.name}, single full turn`);
      }
    }
  }
});

test('equal pointer increments rotate around fixed camera axes from every starting pose', () => {
  for (const pose of startingPoses()) {
    for (const [dx, dy] of [[.15, 0], [-.15, 0], [0, .15], [0, -.15], [.19, -.27], [2.6, 1.7]]) {
      const q = orbitOrientation(pose.q, dx, dy);
      for (const vector of VECTORS) {
        vectorNear(transformView(vector, q), orbitReference(pose.reference(vector), dx, dy), `${pose.name}, camera-relative (${dx}, ${dy})`);
      }
    }
  }
});

test('subdividing a straight stroke preserves its orientation, including long diagonal strokes', () => {
  for (const pose of startingPoses()) {
    for (const [dx, dy] of [[.73, 0], [0, -11.9], [4.7, -8.3], [-31.4, 62.8]]) {
      const whole = orbitOrientation(pose.q, dx, dy);
      for (const count of [2, 7, 60, 257]) {
        let q = [...pose.q];
        for (let step = 0; step < count; step++) q = orbitOrientation(q, dx / count, dy / count);
        for (const vector of VECTORS) {
          const expected = orbitReference(pose.reference(vector), dx, dy);
          vectorNear(transformView(vector, whole), expected, `${pose.name}, whole stroke`);
          vectorNear(transformView(vector, q), expected, `${pose.name}, ${count} samples`);
        }
      }
      // Uneven event spacing should behave the same as uniform sampling.
      let uneven = [...pose.q];
      for (const fraction of [.01, .24, .5, .03, .22]) uneven = orbitOrientation(uneven, dx * fraction, dy * fraction);
      for (const vector of VECTORS) vectorNear(transformView(vector, uneven), orbitReference(pose.reference(vector), dx, dy), 'uneven samples');
    }
  }
});

test('successive non-collinear drags compose geometrically and retracing them exactly reverses the orbit', () => {
  const strokes = [[.81, 0], [0, 1.29], [-.73, .31], [5.71, -2.2], [.04, -.57], [0, -7.1]];
  for (const pose of startingPoses()) {
    let q = [...pose.q], expected = VECTORS.map(pose.reference);
    for (const [dx, dy] of strokes) {
      q = orbitOrientation(q, dx, dy);
      expected = expected.map(vector => orbitReference(vector, dx, dy));
      VECTORS.forEach((vector, i) => vectorNear(transformView(vector, q), expected[i], `${pose.name}, composed stroke`));
    }
    for (const [dx, dy] of [...strokes].reverse()) q = orbitOrientation(q, -dx, -dy);
    for (const vector of VECTORS) vectorNear(transformView(vector, q), pose.reference(vector), `${pose.name}, retraced path`);
  }
  const horizontalThenVertical = orbitOrientation(orbitOrientation(createOrientation(0, 0), .8, 0), 0, 1.1);
  const verticalThenHorizontal = orbitOrientation(orbitOrientation(createOrientation(0, 0), 0, 1.1), .8, 0);
  assert.ok(Math.hypot(...transformView([0, 0, 1], horizontalThenVertical).map((value, i) => value - transformView([0, 0, 1], verticalThenHorizontal)[i])) > .1,
    'different drag paths must not collapse to summed Euler yaw/pitch');
});

test('view and inverseView round-trip vectors and agree with independently inverted axis-angle geometry', () => {
  for (const pose of startingPoses()) {
    for (const vector of VECTORS) {
      vectorNear(inverseView(pose.reference(vector), pose.q), vector, `${pose.name}, reference inverse`);
      vectorNear(inverseView(transformView(vector, pose.q), pose.q), vector, `${pose.name}, object round trip`);
      vectorNear(transformView(inverseView(vector, pose.q), pose.q), vector, `${pose.name}, camera round trip`);
      vectorNear(transformView(vector, pose.q.map(value => -value)), pose.reference(vector), `${pose.name}, quaternion sign`);
    }
  }
  for (let i = 1; i <= 80; i++) {
    const axis = [Math.sin(i * .73), Math.cos(i * .41), Math.sin(i * .29)], angle = i * .27 - 10;
    const q = axisAngleQuaternion(axis, angle);
    for (const vector of VECTORS) vectorNear(inverseView(vector, q), rotateReference(vector, axis, -angle), 'independent inverse rotation');
  }
});

test('zero and tiny drags have no dead zone and preserve accumulated subpixel rotation', () => {
  for (const pose of startingPoses()) {
    const unchanged = orbitOrientation(pose.q, 0, 0);
    for (const vector of VECTORS) vectorNear(transformView(vector, unchanged), pose.reference(vector), 'zero stroke');
    let q = [...pose.q];
    const count = 4096, dx = 3e-12, dy = -4e-12;
    for (let i = 0; i < count; i++) q = orbitOrientation(q, dx, dy);
    for (const vector of VECTORS) vectorNear(transformView(vector, q), orbitReference(pose.reference(vector), dx * count, dy * count), 'accumulated tiny stroke', 1e-11);
  }
});

test('many mixed orbit updates preserve unit norm, orthogonality, handedness and geometric precision', () => {
  let q = createOrientation(), expected = BASIS.map(vector => initialReference(vector));
  const vector = [1.505, -.75, 1.505];
  for (let step = 1; step <= 50000; step++) {
    const dx = .023 * Math.sin(step * .37) + .007, dy = .031 * Math.cos(step * .19) - .003;
    q = orbitOrientation(q, dx, dy);
    expected = expected.map(value => orbitReference(value, dx, dy));
    if (step % 997 !== 0 && step !== 50000) continue;
    assert.equal(q.length, 4);
    near(Math.hypot(...q), 1, `unit quaternion at ${step}`, 5e-15);
    const basis = BASIS.map(value => transformView(value, q));
    for (let i = 0; i < 3; i++) {
      vectorNear(basis[i], expected[i], `independent accumulated rotation at ${step}`, 2e-9);
      for (let j = 0; j < 3; j++) near(dot(basis[i], basis[j]), Number(i === j), `orthogonal basis ${i}/${j} at ${step}`, 5e-14);
    }
    near(dot(cross(basis[0], basis[1]), basis[2]), 1, `right-handed basis at ${step}`, 5e-14);
    near(Math.hypot(...transformView(vector, q)), Math.hypot(...vector), `length preservation at ${step}`, 5e-14);
    vectorNear(inverseView(transformView(vector, q), q), vector, `long-session inverse at ${step}`, 5e-14);
  }
});

test('orthographic projection and inverse view agree for rolled and inverted orientations', () => {
  for (const pose of startingPoses()) {
    const q = orbitOrientation(orbitOrientation(pose.q, 1.71, -.29), -.63, 2.28);
    for (const vector of VECTORS) {
      const expected = orbitReference(orbitReference(pose.reference(vector), 1.71, -.29), -.63, 2.28);
      const screen = project(vector, q);
      vectorNear(screen, [210 + 60 * expected[0], 170 - 60 * expected[1], expected[2]], `${pose.name}, screen projection`, 2e-9);
      const cameraPoint = [(screen[0] - 210) / 60, (170 - screen[1]) / 60, screen[2]];
      vectorNear(inverseView(cameraPoint, q), vector, `${pose.name}, screen inverse`);
    }
  }
});
