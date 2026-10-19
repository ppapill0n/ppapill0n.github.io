// All rates use simulation seconds. The market never receives account state.
export const CONFIG = Object.freeze({
  startingCash: 10_000,
  target: 50_000,
  feeRate: 0.0005,
  minimumOrder: 1,
  leverage: Object.freeze([1, 2, 5, 10, 20]),
  allocations: Object.freeze([0.25, 0.5, 0.75, 1]),
  defaultLeverage: 5,
  tickMs: 100,
  candleMs: 2_000,
  historyCandles: 50,
  visibleCandles: 60,
  startingPrice: 100,
  meanRegimeSeconds: 60,
  trendDrift: 0.0032, // Stylized ~0.64% directional drift per two-second candle
  driftResponseSeconds: 4,
  rangeReversion: 0.055,
  calmSigma: 0.0042, // ~0.59% standard deviation per two-second candle
  volatileSigma: 0.0071, // ~1.00% per candle before jumps / drift
  volatilityResponseSeconds: 15,
  volatileProbability: 0.25,
  meanJumpSeconds: 110,
  jumpSigma: 0.009,
  catchupChunkTicks: 1_000,
  catchupNoticeMs: 1_000,
});
