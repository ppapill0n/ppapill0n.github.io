import { CONFIG } from './config.js?v=20261019-sweeps';
import { createSweeps } from './sweeps.js?v=20261019-sweeps';

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function createMarket(seed, config = CONFIG) {
  const random = seededRandom(seed);
  const sweeps = createSweeps(seededRandom(seed ^ 0xC01D5EED), config);
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const dt = config.tickMs / 1000, ticksPerCandle = config.candleMs / config.tickMs;
  const warmupTicks = config.historyCandles * ticksPerCandle;
  let tick = -warmupTicks, logPrice = Math.log(config.startingPrice), price = config.startingPrice;
  let regime, anchor, strength, targetSigma, sigma = config.calmSigma, drift = 0;
  let candle = null;
  const candles = [];
  function chooseRegime() {
    // Hidden state with exponentially distributed dwell; a transition changes state.
    const choices = [-1, 0, 1].filter(value => value !== regime);
    regime = choices[Math.floor(random() * choices.length)];
    anchor = logPrice;
    strength = 0.75 + random() * 0.5;
    targetSigma = (random() < config.volatileProbability ? config.volatileSigma : config.calmSigma)
      * (0.85 + random() * 0.3);
  }
  chooseRegime();
  function step() {
    const previousRegime = regime;
    if (random() < 1 - Math.exp(-dt / config.meanRegimeSeconds)) chooseRegime();
    const targetDrift = regime === 0
      ? Math.max(-config.trendDrift * 1.5, Math.min(config.trendDrift * 1.5, (anchor - logPrice) * config.rangeReversion))
      : regime * config.trendDrift * strength;
    drift += (targetDrift - drift) * (1 - Math.exp(-dt / config.driftResponseSeconds));
    sigma += (targetSigma - sigma) * (1 - Math.exp(-dt / config.volatilityResponseSeconds));
    const jump = random() < 1 - Math.exp(-dt / config.meanJumpSeconds)
      ? Math.max(-0.035, Math.min(0.035, normal() * config.jumpSigma)) : 0;
    const previous = price;
    // Bounds protect numeric precision on arbitrarily long sessions, not account outcomes.
    logPrice = Math.max(Math.log(0.01), Math.min(Math.log(1e9), logPrice + drift * dt + sigma * Math.sqrt(dt) * normal() + jump));
    // Keep the original process (including its range anchor and RNG) untouched.
    // Observed shocks can retain a level change, but never feed back into it.
    const offset = sweeps.step(regime, previousRegime, drift);
    price = Math.exp(Math.max(Math.log(0.01), Math.min(Math.log(1e9), logPrice + offset)));
    if (!candle) candle = { time: tick * config.tickMs, open: previous, high: previous, low: previous, close: previous };
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    tick++;
    if (tick % ticksPerCandle === 0) {
      candles.push(candle);
      if (candles.length > config.visibleCandles) candles.shift();
      candle = null;
    }
    return price;
  }
  for (let i = 0; i < warmupTicks; i++) step();
  return {
    step,
    // Only observed prices/candles leave this closure. No regime or future path API.
    snapshot: () => ({ price, time: tick * config.tickMs, candles: candles.map(c => ({ ...c })), candle: candle && { ...candle } }),
  };
}
