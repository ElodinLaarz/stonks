import { describe, it, expect } from 'vitest';
import { createMarket, tickMarket } from '../market';
import { createPrng } from '../prng';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { SimConfig } from '../types';

/** Run the market forward N ticks, returning the final state. */
function runMarket(config: SimConfig, ticks: number) {
  let market = createMarket(config);
  let prng = createPrng(config.seed);
  for (let i = 0; i < ticks; i++) {
    [market, prng] = tickMarket(market, config, prng);
  }
  return market;
}

describe('createMarket', () => {
  it('initializes the correct number of stocks', () => {
    const market = createMarket(DEFAULT_SIM_CONFIG);
    expect(market.stocks.length).toBe(DEFAULT_SIM_CONFIG.numStocks);
  });

  it('each stock starts at tick 0 with one bar', () => {
    const market = createMarket(DEFAULT_SIM_CONFIG);
    for (const stock of market.stocks) {
      expect(stock.bars.length).toBe(1);
      expect(stock.bars[0]?.tick).toBe(0);
    }
  });

  it('initial bar has all OHLC equal to initialPrice', () => {
    const market = createMarket(DEFAULT_SIM_CONFIG);
    for (const stock of market.stocks) {
      const bar = stock.bars[0]!;
      expect(bar.open).toBe(stock.initialPrice);
      expect(bar.high).toBe(stock.initialPrice);
      expect(bar.low).toBe(stock.initialPrice);
      expect(bar.close).toBe(stock.initialPrice);
    }
  });
});

describe('tickMarket determinism', () => {
  it('produces identical results for the same seed (golden output)', () => {
    // High shockFrequency to eliminate shocks from this golden test.
    const config: SimConfig = { ...DEFAULT_SIM_CONFIG, seed: 1, shockFrequency: 999_999 };
    const GOLDEN_CLOSE = 106.305855811421;

    const market = runMarket(config, 100);
    const stock0 = market.stocks[0]!;
    const close = stock0.bars[stock0.bars.length - 1]!.close;

    // toBeCloseTo avoids brittleness from floating-point differences across
    // JS engine versions; 10 decimal places is far tighter than any real drift.
    expect(close).toBeCloseTo(GOLDEN_CLOSE, 10);
  });

  it('two independent runs with the same seed are identical', () => {
    const config: SimConfig = { ...DEFAULT_SIM_CONFIG, seed: 7 };
    const a = runMarket(config, 50);
    const b = runMarket(config, 50);

    for (let i = 0; i < a.stocks.length; i++) {
      const stockA = a.stocks[i]!;
      const stockB = b.stocks[i]!;
      expect(stockA.bars[stockA.bars.length - 1]!.close).toBe(
        stockB.bars[stockB.bars.length - 1]!.close,
      );
    }
  });

  it('different seeds produce different results', () => {
    const configA: SimConfig = { ...DEFAULT_SIM_CONFIG, seed: 1, shockFrequency: 999_999 };
    const configB: SimConfig = { ...DEFAULT_SIM_CONFIG, seed: 2, shockFrequency: 999_999 };
    const a = runMarket(configA, 10);
    const b = runMarket(configB, 10);
    const closeA = a.stocks[0]!.bars[a.stocks[0]!.bars.length - 1]!.close;
    const closeB = b.stocks[0]!.bars[b.stocks[0]!.bars.length - 1]!.close;
    expect(closeA).not.toBe(closeB);
  });
});

describe('tickMarket invariants', () => {
  it('advances tick counter by 1 per call', () => {
    let market = createMarket(DEFAULT_SIM_CONFIG);
    let prng = createPrng(DEFAULT_SIM_CONFIG.seed);
    for (let i = 1; i <= 5; i++) {
      [market, prng] = tickMarket(market, DEFAULT_SIM_CONFIG, prng);
      expect(market.tick).toBe(i);
    }
  });

  it('each stock gains exactly one bar per tick', () => {
    const TICKS = 50;
    const market = runMarket(DEFAULT_SIM_CONFIG, TICKS);
    for (const stock of market.stocks) {
      expect(stock.bars.length).toBe(TICKS + 1); // +1 for initial bar
    }
  });

  it('OHLC invariants hold on every bar', () => {
    const market = runMarket(DEFAULT_SIM_CONFIG, 200);
    for (const stock of market.stocks) {
      for (const bar of stock.bars) {
        expect(bar.high).toBeGreaterThanOrEqual(bar.open);
        expect(bar.high).toBeGreaterThanOrEqual(bar.close);
        expect(bar.low).toBeLessThanOrEqual(bar.open);
        expect(bar.low).toBeLessThanOrEqual(bar.close);
        expect(bar.high).toBeGreaterThanOrEqual(bar.low);
      }
    }
  });

  it('all prices stay positive over 500 ticks', () => {
    const market = runMarket(DEFAULT_SIM_CONFIG, 500);
    for (const stock of market.stocks) {
      for (const bar of stock.bars) {
        expect(bar.close).toBeGreaterThan(0);
        expect(bar.low).toBeGreaterThan(0);
      }
    }
  });
});

describe('tickMarket config', () => {
  it('zero-volatility, zero-drift stock stays flat', () => {
    const config: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      numStocks: 1,
      shockFrequency: 999_999,
      stockConfigs: [{ id: 'FLAT', name: 'Flat', initialPrice: 100, volatility: 0, drift: 0 }],
    };
    const market = runMarket(config, 100);
    const stock = market.stocks[0]!;
    for (const bar of stock.bars) {
      expect(bar.close).toBeCloseTo(100, 10);
    }
  });

  it('throws when shockFrequency is zero', () => {
    const config: SimConfig = { ...DEFAULT_SIM_CONFIG, shockFrequency: 0 };
    const market = createMarket(config);
    const prng = createPrng(config.seed);
    expect(() => tickMarket(market, config, prng)).toThrow(RangeError);
  });

  it('throws when shockFrequency is negative', () => {
    const config: SimConfig = { ...DEFAULT_SIM_CONFIG, shockFrequency: -1 };
    const market = createMarket(config);
    const prng = createPrng(config.seed);
    expect(() => tickMarket(market, config, prng)).toThrow(RangeError);
  });

  it('throws when stockConfigs length mismatches numStocks', () => {
    const config: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      numStocks: 5,
      stockConfigs: [{ id: 'X', name: 'X', initialPrice: 100, volatility: 0.2, drift: 0 }],
    };
    expect(() => createMarket(config)).toThrow(Error);
  });

  it('respects per-stock initialPrice', () => {
    const config: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      numStocks: 2,
      stockConfigs: [
        { id: 'A', name: 'A', initialPrice: 50, volatility: 0.2, drift: 0 },
        { id: 'B', name: 'B', initialPrice: 200, volatility: 0.2, drift: 0 },
      ],
    };
    const market = createMarket(config);
    expect(market.stocks[0]!.bars[0]!.close).toBe(50);
    expect(market.stocks[1]!.bars[0]!.close).toBe(200);
  });
});

describe('tickMarket shock events', () => {
  it('shock occurs deterministically with shockFrequency=1 (every tick)', () => {
    // Zero volatility + zero drift: any price change must come from the shock path.
    const config: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      seed: 42,
      numStocks: 1,
      shockFrequency: 1,
      stockConfigs: [{ id: 'S', name: 'S', initialPrice: 100, volatility: 0, drift: 0 }],
    };
    const market = runMarket(config, 1);
    const close = market.stocks[0]!.bars[1]!.close;

    // Price must have deviated from 100 due to the shock multiplier.
    expect(close).not.toBeCloseTo(100, 5);
    // PRNG advancement is deterministic: two runs with the same seed agree.
    const market2 = runMarket(config, 1);
    expect(market2.stocks[0]!.bars[1]!.close).toBe(close);
  });

  it('only the shocked stock changes price (zero-vol single-stock sanity)', () => {
    // With two zero-vol stocks and shockFrequency=1, one stock is shocked per tick.
    // The non-shocked stock stays flat at its initial price.
    const config: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      seed: 7,
      numStocks: 2,
      shockFrequency: 1,
      stockConfigs: [
        { id: 'A', name: 'A', initialPrice: 100, volatility: 0, drift: 0 },
        { id: 'B', name: 'B', initialPrice: 100, volatility: 0, drift: 0 },
      ],
    };
    const market = runMarket(config, 1);
    const closeA = market.stocks[0]!.bars[1]!.close;
    const closeB = market.stocks[1]!.bars[1]!.close;

    // Exactly one stock should be shocked; the other should stay at 100.
    const aFlat = Math.abs(closeA - 100) < 1e-9;
    const bFlat = Math.abs(closeB - 100) < 1e-9;
    expect(aFlat !== bFlat).toBe(true);
  });
});
