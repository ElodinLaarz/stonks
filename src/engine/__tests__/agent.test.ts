import { describe, it, expect } from 'vitest';
import { createPrng } from '../prng';
import { createMarket } from '../market';
import {
  createAgent,
  computeSignals,
  decideAction,
  executeTrade,
  portfolioValue,
  DEFAULT_GENOME,
  DEFAULT_CONCEALMENT_GENOME,
} from '../agent';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { SimConfig, Genome, Trade } from '../types';

const config: SimConfig = { ...DEFAULT_SIM_CONFIG, numStocks: 2, shockFrequency: 999_999 };

function makeAgent(genome: Partial<Genome> = {}) {
  return createAgent(
    'a1',
    { ...DEFAULT_GENOME, ...genome },
    DEFAULT_CONCEALMENT_GENOME,
    10_000,
    false,
  );
}

describe('createAgent', () => {
  it('initializes with correct cash', () => {
    const agent = makeAgent();
    expect(agent.portfolio.cash).toBe(10_000);
  });

  it('initializes with empty positions', () => {
    const agent = makeAgent();
    expect(agent.portfolio.positions.size).toBe(0);
  });

  it('sets isOracle correctly', () => {
    const oracle = createAgent('o', DEFAULT_GENOME, DEFAULT_CONCEALMENT_GENOME, 10_000, true);
    expect(oracle.isOracle).toBe(true);
  });
});

describe('portfolioValue', () => {
  it('returns cash when no positions', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    expect(portfolioValue(agent, market)).toBe(10_000);
  });

  it('includes position value', () => {
    const market = createMarket(config);
    const price = market.stocks[0]!.bars[0]!.close;
    const agent = createAgent('a', DEFAULT_GENOME, DEFAULT_CONCEALMENT_GENOME, 5_000, false);
    // Manually add a position
    const agentWithPos = {
      ...agent,
      portfolio: {
        cash: 5_000,
        positions: new Map([['STOCK_0', { stockId: 'STOCK_0', shares: 10, avgCostBasis: price }]]),
      },
    };
    expect(portfolioValue(agentWithPos, market)).toBeCloseTo(5_000 + 10 * price);
  });
});

describe('computeSignals', () => {
  it('returns 0 for unknown stock', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    expect(computeSignals(agent, market, 'UNKNOWN', [])).toBe(0);
  });

  it('is deterministic with same inputs', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    const s1 = computeSignals(agent, market, 'STOCK_0', []);
    const s2 = computeSignals(agent, market, 'STOCK_0', []);
    expect(s1).toBe(s2);
  });

  it('peer copying signal mirrors last non-self trade', () => {
    const agent = makeAgent({ signalWeights: [0, 0, 0, 0, 0, 1.0] });
    const market = createMarket(config);
    const buyTrade: Trade = {
      tick: 1,
      agentId: 'other',
      stockId: 'STOCK_0',
      action: 'buy',
      shares: 1,
      price: 100,
      value: 100,
    };
    const signal = computeSignals(agent, market, 'STOCK_0', [buyTrade]);
    expect(signal).toBeGreaterThan(0); // peer bought → positive signal
  });

  it('peer copying with sell trade gives negative signal', () => {
    const agent = makeAgent({ signalWeights: [0, 0, 0, 0, 0, 1.0] });
    const market = createMarket(config);
    const sellTrade: Trade = {
      tick: 1,
      agentId: 'other',
      stockId: 'STOCK_0',
      action: 'sell',
      shares: 1,
      price: 100,
      value: 100,
    };
    const signal = computeSignals(agent, market, 'STOCK_0', [sellTrade]);
    expect(signal).toBeLessThan(0);
  });
});

describe('decideAction', () => {
  it('is deterministic with same seed', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    const prng = createPrng(1);
    const [actionA] = decideAction(agent, 'STOCK_0', market, [], prng);
    const [actionB] = decideAction(agent, 'STOCK_0', market, [], prng);
    expect(actionA).toBe(actionB);
  });

  it('advances PRNG state', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    const prng = createPrng(1);
    const [, newPrng] = decideAction(agent, 'STOCK_0', market, [], prng);
    expect(newPrng.s).not.toEqual(prng.s);
  });

  it('returns buy when signal exceeds buyThreshold', () => {
    // Very low threshold + extreme buy pressure via peer copying
    const agent = makeAgent({
      signalWeights: [0, 0, 0, 0, 0, 1.0],
      buyThreshold: 0.001,
      sellThreshold: 999,
    });
    const market = createMarket(config);
    const buyTrade: Trade = {
      tick: 1,
      agentId: 'other',
      stockId: 'STOCK_0',
      action: 'buy',
      shares: 1,
      price: 100,
      value: 100,
    };
    const prng = createPrng(1);
    const [action] = decideAction(agent, 'STOCK_0', market, [buyTrade], prng);
    expect(action).toBe('buy');
  });

  it('returns sell when signal is below -sellThreshold', () => {
    const agent = makeAgent({
      signalWeights: [0, 0, 0, 0, 0, 1.0],
      buyThreshold: 999,
      sellThreshold: 0.001,
    });
    const market = createMarket(config);
    const sellTrade: Trade = {
      tick: 1,
      agentId: 'other',
      stockId: 'STOCK_0',
      action: 'sell',
      shares: 1,
      price: 100,
      value: 100,
    };
    const prng = createPrng(1);
    const [action] = decideAction(agent, 'STOCK_0', market, [sellTrade], prng);
    expect(action).toBe('sell');
  });
});

describe('executeTrade', () => {
  it('buy reduces cash and adds position', () => {
    const agent = makeAgent({ positionSize: 1.0 });
    const market = createMarket(config);
    const price = market.stocks[0]!.bars[0]!.close;
    const [newAgent, trade] = executeTrade(agent, 'buy', 'STOCK_0', market, 1);
    expect(newAgent.portfolio.cash).toBeLessThan(10_000);
    expect(newAgent.portfolio.positions.has('STOCK_0')).toBe(true);
    expect(trade).not.toBeNull();
    expect(trade!.action).toBe('buy');
    expect(trade!.price).toBeCloseTo(price);
  });

  it('sell adds cash and removes position', () => {
    const price = 100;
    const agentWithPos = {
      ...makeAgent(),
      portfolio: {
        cash: 5_000,
        positions: new Map([['STOCK_0', { stockId: 'STOCK_0', shares: 10, avgCostBasis: price }]]),
      },
    };
    const market = createMarket(config);
    const [newAgent, trade] = executeTrade(agentWithPos, 'sell', 'STOCK_0', market, 1);
    expect(newAgent.portfolio.positions.has('STOCK_0')).toBe(false);
    expect(newAgent.portfolio.cash).toBeGreaterThan(5_000);
    expect(trade!.action).toBe('sell');
  });

  it('hold returns original agent and null trade', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    const [newAgent, trade] = executeTrade(agent, 'hold', 'STOCK_0', market, 1);
    expect(newAgent).toBe(agent);
    expect(trade).toBeNull();
  });

  it('buy with zero cash returns null trade', () => {
    const broke = { ...makeAgent(), portfolio: { cash: 0, positions: new Map() } };
    const market = createMarket(config);
    const [, trade] = executeTrade(broke, 'buy', 'STOCK_0', market, 1);
    expect(trade).toBeNull();
  });

  it('sell with no position returns null trade', () => {
    const agent = makeAgent();
    const market = createMarket(config);
    const [, trade] = executeTrade(agent, 'sell', 'STOCK_0', market, 1);
    expect(trade).toBeNull();
  });

  it('does not mutate original agent', () => {
    const agent = makeAgent({ positionSize: 1.0 });
    const market = createMarket(config);
    const originalCash = agent.portfolio.cash;
    executeTrade(agent, 'buy', 'STOCK_0', market, 1);
    expect(agent.portfolio.cash).toBe(originalCash);
  });
});
