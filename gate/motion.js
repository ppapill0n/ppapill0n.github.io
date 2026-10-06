export const wrap = value => ((value % 10000) + 10000) % 10000;
export const physics = Object.freeze({ initialSpeed:360, acceleration:40, accelerationRamp:120, maxSpeed:3000, braking:1800, friction:6, stopSpeed:0.1 });
export function advance(state, direction, dt) {
  let { position, velocity, holdTime } = state;
  if (!direction) {
    const decay = Math.exp(-physics.friction * dt);
    position += velocity * (1 - decay) / physics.friction;
    velocity *= decay;
    if (Math.abs(velocity) < physics.stopSpeed) velocity = 0;
    return { position:wrap(position), velocity, holdTime:0 };
  }
  if (velocity * direction < 0) {
    const duration = Math.min(dt, Math.abs(velocity) / physics.braking);
    position += velocity * duration + direction * physics.braking * duration * duration / 2;
    velocity += direction * physics.braking * duration;
    dt -= duration;
    holdTime = 0;
    if (Math.abs(velocity) < 1e-9) velocity = 0;
    if (dt <= 0) return { position:wrap(position), velocity, holdTime };
  }
  const speed = Math.abs(velocity);
  const acceleration = physics.acceleration + physics.accelerationRamp * holdTime;
  const untilCap = Math.max(0, (Math.sqrt(acceleration ** 2 + 2 * physics.accelerationRamp * Math.max(0, physics.maxSpeed - speed)) - acceleration) / physics.accelerationRamp);
  const powered = Math.min(dt, untilCap);
  position += direction * (speed * powered + acceleration * powered ** 2 / 2 + physics.accelerationRamp * powered ** 3 / 6 + physics.maxSpeed * (dt - powered));
  velocity = direction * Math.min(physics.maxSpeed, speed + acceleration * powered + physics.accelerationRamp * powered ** 2 / 2);
  return { position:wrap(position), velocity, holdTime:holdTime + dt };
}
