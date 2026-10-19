import { CONFIG } from './config.js';

const validPrice = price => Number.isFinite(price) && price > 0;
const EPSILON = 1e-8;

export function createAccount(config = CONFIG) {
  let cash = config.startingCash, position = null, fees = 0, paid = false;
  const pnl = price => position ? position.side * position.quantity * (price - position.entry) : 0;
  const exitFee = price => position ? position.quantity * price * config.feeRate : 0;
  const collateral = price => position ? position.margin + pnl(price) : 0;
  function snapshot(price) {
    if (!validPrice(price)) throw new RangeError('Price must be positive and finite.');
    const unrealized = pnl(price), closingFee = exitFee(price);
    return {
      cash, position: position && { ...position }, fees, paid,
      unrealized, closingFee,
      equity: cash + Math.max(0, collateral(price)),
      cashAfterClose: cash + Math.max(0, collateral(price) - closingFee),
      liquidationPrice: position ? (position.side * position.quantity * position.entry - position.margin)
        / (position.quantity * (position.side - config.feeRate)) : null,
      bankrupt: !paid && !position && cash < config.minimumOrder,
      canPay: !paid && !position && cash >= config.target,
    };
  }
  function liquidate(price) {
    if (!validPrice(price)) throw new RangeError('Price must be positive and finite.');
    if (!position || collateral(price) > exitFee(price)) return false;
    // Exit costs can consume collateral, never idle cash. A gap creates no debt.
    fees += Math.max(0, Math.min(exitFee(price), collateral(price)));
    position = null;
    return true;
  }
  return {
    snapshot,
    liquidate,
    enter(side, allocation, leverage, price) {
      if (paid || !validPrice(price) || ![1, -1].includes(side)
        || !config.allocations.includes(allocation) || !config.leverage.includes(leverage)) return false;
      if (position && (position.side !== side || position.leverage !== leverage)) return false;
      // Refuse an already insolvent fill rather than rescuing it with new cash.
      if (position && collateral(price) <= exitFee(price)) return false;
      const budget = cash * allocation;
      if (budget < config.minimumOrder) return false;
      // budget = margin + opening fee; even 100% allocation is affordable.
      const margin = budget / (1 + leverage * config.feeRate);
      const notional = margin * leverage, quantity = notional / price;
      const fee = notional * config.feeRate;
      if (position) {
        position.entry = (position.entry * position.quantity + price * quantity) / (position.quantity + quantity);
        position.quantity += quantity;
        position.margin += margin;
      } else {
        position = { side, leverage, entry: price, quantity, margin };
      }
      cash = Math.max(0, cash - budget);
      fees += fee;
      return true;
    },
    close(allocation, price) {
      if (paid || !position || !validPrice(price) || !config.allocations.includes(allocation)) return false;
      if (liquidate(price)) return true;
      const quantity = position.quantity * allocation;
      const margin = position.margin * allocation;
      const fee = quantity * price * config.feeRate;
      const realized = position.side * quantity * (price - position.entry);
      cash += Math.max(0, margin + realized - fee);
      fees += fee;
      if (allocation === 1) position = null;
      else {
        position.quantity -= quantity;
        position.margin -= margin;
      }
      if (cash < EPSILON) cash = 0;
      return true;
    },
    pay() {
      if (paid || position || cash < config.target) return false;
      cash -= config.target;
      paid = true;
      return true;
    },
  };
}
