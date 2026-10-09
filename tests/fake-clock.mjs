// Timer-only clock for async UI tests. Promise jobs and setImmediate remain real.
export function installFakeClock() {
  const original = { setTimeout:globalThis.setTimeout, clearTimeout:globalThis.clearTimeout };
  const timers = new Map();
  let now = 0, nextId = 0;
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    timers.set(id, { callback, at:now + delay });
    return id;
  };
  globalThis.clearTimeout = id => timers.delete(id);
  return {
    get pendingCount() { return timers.size; },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at; timers.delete(id); timer.callback();
      }
      now = end;
    },
    restore() { Object.assign(globalThis, original); timers.clear(); }
  };
}
