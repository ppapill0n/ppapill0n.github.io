export const cannonPhysics = Object.freeze({ period:1000, chargeMs:500, gravity:80, maxSpeed:Math.sqrt(12800), height:1.5 });
export const sweepAngle = elapsed => {
  const phase = ((elapsed % cannonPhysics.period) + cannonPhysics.period) % cannonPhysics.period;
  return phase <= 500 ? phase * .18 : (1000 - phase) * .18;
};
export const chargePower = elapsed => Math.min(1, Math.max(0, elapsed / cannonPhysics.chargeMs));
export const landingCode = distance => Math.floor(Math.max(0, distance) * 10 + .5 + 1e-9);
export function trajectory(angle, power) {
  const speed = cannonPhysics.maxSpeed * Math.max(0, Math.min(1, power)) ** 2;
  const radians = angle * Math.PI / 180;
  const vx = angle === 90 ? 0 : speed * Math.cos(radians);
  const vy = speed * Math.sin(radians);
  const duration = (vy + Math.sqrt(vy * vy + 2 * cannonPhysics.gravity * cannonPhysics.height)) / cannonPhysics.gravity;
  return { vx, vy, duration, distance:vx * duration };
}
export function flightPoint(shot, elapsed) {
  const t = Math.min(shot.duration, Math.max(0, elapsed));
  return { x:shot.vx * t, y:t >= shot.duration ? 0 : Math.max(0, cannonPhysics.height + shot.vy * t - cannonPhysics.gravity * t * t / 2) };
}
