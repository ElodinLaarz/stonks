import type { SimConfig, MarketState, Stock, PriceBar, StockConfig } from './types';
import { nextFloat, nextInt } from './prng';
import type { PrngState } from './prng';

const TRADING_DAYS_PER_YEAR = 252;
const DT = 1 / TRADING_DAYS_PER_YEAR;
const SQRT_DT = Math.sqrt(DT);
const DEFAULT_INITIAL_PRICE = 100;
/** Maximum intra-tick spread as a fraction of price (1%). */
const OHLC_NOISE_MAX = 0.01;
/** Std deviation of shock log-return. */
const SHOCK_SIGMA = 0.05;

/**
 * Box-Muller transform: consumes two uniform draws, produces one standard normal.
 * Always consumes exactly two draws to keep PRNG advancement consistent.
 */
function boxMuller(prng: PrngState): [PrngState, number] {
  let p = prng;
  let u1: number;
  let u2: number;
  [p, u1] = nextFloat(p);
  [p, u2] = nextFloat(p);
  // Guard against log(0); u1 = 0 has probability 1/2^32.
  if (u1 === 0) u1 = Number.EPSILON;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return [p, z];
}

function buildDefaultStockConfigs(config: SimConfig): readonly StockConfig[] {
  return Array.from({ length: config.numStocks }, (_, i) => ({
    id: `STOCK_${i}`,
    name: `Stock ${i}`,
    initialPrice: DEFAULT_INITIAL_PRICE,
    volatility: config.stockVolatility,
    drift: 0,
  }));
}

/** Initialize market state. PRNG is not consumed; initial bars are deterministic. */
export function createMarket(config: SimConfig): MarketState {
  const stockConfigs = config.stockConfigs ?? buildDefaultStockConfigs(config);

  const stocks: readonly Stock[] = stockConfigs.map((sc) => {
    const openBar: PriceBar = {
      tick: 0,
      open: sc.initialPrice,
      high: sc.initialPrice,
      low: sc.initialPrice,
      close: sc.initialPrice,
    };
    return {
      id: sc.id,
      name: sc.name,
      initialPrice: sc.initialPrice,
      bars: [openBar],
    };
  });

  return { tick: 0, stocks };
}

/** Advance market one tick. Returns updated market state and advanced PRNG. */
export function tickMarket(
  state: MarketState,
  config: SimConfig,
  prng: PrngState,
): [MarketState, PrngState] {
  const stockConfigs = config.stockConfigs ?? buildDefaultStockConfigs(config);
  let p = prng;
  const newTick = state.tick + 1;

  // Determine whether a shock event occurs this tick and which stock it hits.
  let shockStockIndex = -1;
  let shockMultiplier = 1;
  let shockRoll: number;
  [p, shockRoll] = nextFloat(p);
  if (shockRoll < 1 / config.shockFrequency) {
    let idx: number;
    [p, idx] = nextInt(p, 0, state.stocks.length - 1);
    shockStockIndex = idx;
    let z: number;
    [p, z] = boxMuller(p);
    shockMultiplier = Math.exp(SHOCK_SIGMA * z);
  }

  const newStocks: Stock[] = state.stocks.map((stock, i) => {
    // i is always in bounds — stockConfigs is built from the same numStocks.

    const sc = stockConfigs[i]!;
    // bars is never empty: createMarket always adds an initial bar.

    const prevClose = stock.bars[stock.bars.length - 1]!.close;

    let z: number;
    [p, z] = boxMuller(p);
    const logReturn = sc.drift * DT + sc.volatility * SQRT_DT * z;
    let newClose = prevClose * Math.exp(logReturn);

    if (i === shockStockIndex) {
      newClose *= shockMultiplier;
    }

    let noise: number;
    [p, noise] = nextFloat(p);
    noise *= OHLC_NOISE_MAX;

    const open = prevClose;
    const high = Math.max(open, newClose) * (1 + noise);
    const low = Math.min(open, newClose) * (1 - noise);

    const newBar: PriceBar = { tick: newTick, open, high, low, close: newClose };

    return {
      id: stock.id,
      name: stock.name,
      initialPrice: stock.initialPrice,
      bars: [...stock.bars, newBar],
    };
  });

  return [{ tick: newTick, stocks: newStocks }, p];
}
