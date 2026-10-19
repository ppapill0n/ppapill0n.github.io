import { CONFIG } from './config.js';

// FIFO intents, separate from clock scheduling and rendering. Each accepted
// click keeps its selected fraction/leverage; funds/quantity and price are read
// at execution. Position IDs prevent delayed closes/adds from targeting a new
// position after liquidation. Reset/navigation cancel the queue explicitly.
export function createOrderQueue(session, reconciler) {
  let queue = [], closed = false;
  function execute(intent) {
    const state = session.snapshot(), { account: account, market } = state;
    const result = { status: 'invalid', action: intent.action, price: market.price, added: !!account.position };
    if (account.bankrupt || account.paid) return result;
    if (intent.positionId != null && account.position?.id !== intent.positionId) return result;
    let filled = false;
    if (intent.action === 'close') {
      if (intent.positionId == null) return result;
      filled = session.close(intent.allocation);
    } else if (intent.action === 'long' || intent.action === 'short') {
      filled = session.enter(intent.action === 'long' ? 1 : -1, intent.allocation, intent.leverage);
    } else if (intent.action === 'pay' && account.canPay) {
      // One synchronous transaction; storage failure must leave cash untouched.
      if (intent.complete({ value: CONFIG.target, stopped: true, outcome: 'trading' }) === true) filled = session.pay();
    }
    return { ...result, status: filled ? 'filled' : 'invalid' };
  }
  return {
    get pending() { return queue.length > 0; },
    submit(intent) {
      if (closed) return Promise.resolve({ status: 'cancelled', action: intent.action });
      return new Promise(resolve => queue.push({ intent: { ...intent }, resolve }));
    },
    flush(limit = 32) {
      let count = 0;
      // Recheck absolute current time before *each* order. If it advanced during
      // the batch, the caller processes more ticks before consuming the next job.
      while (queue.length && count < limit && !reconciler.pending()) {
        const job = queue.shift(); // Remove before callbacks, so wakeups cannot replay it.
        try { job.resolve(execute(job.intent)); }
        catch { job.resolve({ status: 'invalid', action: job.intent.action }); }
        count++;
      }
      return count;
    },
    cancel() {
      closed = true;
      const pending = queue; queue = [];
      for (const job of pending) job.resolve({ status: 'cancelled', action: job.intent.action });
    },
  };
}
