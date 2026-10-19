import { CONFIG } from './config.js';

// Wall time includes device sleep on browsers whose performance clock stops there.
// The monotonic floor keeps a backward system-clock adjustment from rewinding or
// freezing the market. A forward clock adjustment counts as elapsed game time.
export function createWallClock(wallNow = () => Date.now(), monotonicNow = () => performance.now()) {
  let origin = wallNow(), previousWall = origin;
  let previousMono = monotonicNow(), elapsed = 0;
  return {
    elapsed() {
      const mono = monotonicNow(), wall = wallNow();
      const floor = elapsed + Math.max(0, mono - previousMono);
      // Re-anchor on a backward adjustment so subsequent sleep is still counted.
      if (wall < previousWall) origin = wall - floor;
      elapsed = Math.max(floor, wall - origin);
      previousMono = Math.max(previousMono, mono);
      previousWall = wall;
      return elapsed;
    },
  };
}

// Advance toward an absolute clock target. Repeated timer, visibility and input
// callbacks cannot charge the same elapsed interval twice. Work is bounded per
// call; the UI yields between chunks while accepted orders wait in their queue.
export function createReconciler(session, clock, config = CONFIG) {
  function remaining() {
    if (session.ended) return 0;
    const target = Math.floor((clock.elapsed() + 1e-7) / config.tickMs) * config.tickMs;
    return Math.max(0, target - session.elapsed);
  }
  return {
    pending: () => remaining() >= config.tickMs,
    reconcile(maxTicks = 1000) {
      if (!Number.isInteger(maxTicks) || maxTicks < 1) throw new RangeError('Invalid catch-up chunk size.');
      const lagMs = remaining();
      const ticks = session.advance(Math.min(lagMs, maxTicks * config.tickMs));
      return { ticks, lagMs, remainingMs: remaining(), ended: session.ended };
    },
  };
}
