import { CONFIG } from './config.js?v=20261019-sweeps';
import { createAccount } from './account.js?v=20261019-orders';
import { createMarket } from './market.js?v=20261019-sweeps';

// Fixed-time simulation clock, separate from rendering and trading input.
export function createSession(seed, config = CONFIG) {
  const market = createMarket(seed, config), account = createAccount(config);
  let carry = 0, elapsed = 0, price = market.snapshot().price, liquidations = 0;
  return {
    account,
    get elapsed() { return elapsed; },
    get ended() { const state = account.snapshot(price); return state.paid || state.bankrupt; },
    snapshot: () => ({ seed, elapsed, liquidations, market: market.snapshot(), account: account.snapshot(price) }),
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError('Invalid elapsed time.');
      if (account.snapshot(price).paid || account.snapshot(price).bankrupt) return 0;
      carry += milliseconds;
      let count = 0;
      while (carry + 1e-7 >= config.tickMs) {
        carry = Math.max(0, carry - config.tickMs);
        price = market.step();
        elapsed += config.tickMs;
        if (account.liquidate(price)) liquidations++;
        count++;
        if (account.snapshot(price).bankrupt) { carry = 0; break; }
      }
      return count;
    },
    enter: (side, allocation, leverage) => account.enter(side, allocation, leverage, price),
    close: allocation => account.close(allocation, price),
    pay: () => account.pay(),
  };
}
