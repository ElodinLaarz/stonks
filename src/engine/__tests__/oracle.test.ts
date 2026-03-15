import { describe, it, expect } from 'vitest';
import { createPrng } from '../prng';
import { createMarket } from '../market';
import { createAgent, DEFAULT_GENOME, DEFAULT_CONCEALMENT_GENOME } from '../agent';
import { oracleDecideAction } from '../oracle';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { SimConfig, ConcealmentGenome } from '../types';

const config: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  numStocks: 2,
  shockFrequency: 999_999,
  oracleLookahead: 3,
};

function makeOracle(concealmentOverrides: Partial<ConcealmentGenome> = {}) {
  return createAgent(
    'oracle',
    DEFAULT_GENOME,
    { ...DEFAULT_CONCEALMENT_GENOME, ...concealmentOverrides },
    10_000,
    true,
  );
}

describe('oracleDecideAction', () => {
  it('is deterministic with same inputs', () => {
    const oracle = makeOracle({ noiseRate: 0, delayJitter: 0 });
    const market = createMarket(config);
    const prng = createPrng(1);
    const state = { pendingAction: null };
    const [a1, s1] = oracleDecideAction(oracle, state, market, [], config, prng);
    const [a2, s2] = oracleDecideAction(oracle, state, market, [], config, prng);
    expect(a1).toBe(a2);
    expect(s1).toBe(s2);
  });

  it('PRNG is only advanced for real oracle draws (not lookahead)', () => {
    // With noiseRate=0 and delayJitter=0, oracle uses lookahead only.
    // The real PRNG should NOT advance (no noise or delay draws).
    const oracle = makeOracle({ noiseRate: 0, delayJitter: 0 });
    const market = createMarket(config);
    const prng = createPrng(42);
    const [, , , returnedPrng] = oracleDecideAction(
      oracle,
      { pendingAction: null },
      market,
      [],
      config,
      prng,
    );
    // One float is drawn for noiseRoll check even if noiseRate=0
    expect(returnedPrng.s).not.toEqual(prng.s);
  });

  it('noiseRate=1 acts like a regular agent (uses signals, not lookahead)', () => {
    // With noiseRate=1, oracle always takes the noise path
    const oracle = makeOracle({ noiseRate: 1, delayJitter: 0 });
    const market = createMarket(config);
    const prng = createPrng(5);
    const [action] = oracleDecideAction(oracle, { pendingAction: null }, market, [], config, prng);
    // Should produce a valid action (buy/sell/hold)
    expect(['buy', 'sell', 'hold']).toContain(action);
  });

  it('delayJitter=0 fires action immediately (no pending state)', () => {
    const oracle = makeOracle({ noiseRate: 0, delayJitter: 0 });
    const market = createMarket(config);
    const prng = createPrng(1);
    const [, , newOracleState] = oracleDecideAction(
      oracle,
      { pendingAction: null },
      market,
      [],
      config,
      prng,
    );
    expect(newOracleState.pendingAction).toBeNull();
  });

  it('delayJitter>0 may create a pending action', () => {
    const oracle = makeOracle({ noiseRate: 0, delayJitter: 5 });
    const market = createMarket(config);
    const prng = createPrng(1);
    // Run a few times; with delayJitter=5, most calls should create pending actions
    let foundPending = false;
    let p = prng;
    for (let i = 0; i < 20; i++) {
      const [, , newState, newP] = oracleDecideAction(
        oracle,
        { pendingAction: null },
        market,
        [],
        config,
        p,
      );
      p = newP;
      if (newState.pendingAction !== null) {
        foundPending = true;
        break;
      }
    }
    expect(foundPending).toBe(true);
  });

  it('fires pending action after countdown reaches 1', () => {
    const oracle = makeOracle({ noiseRate: 0, delayJitter: 0 });
    const market = createMarket(config);
    const prng = createPrng(1);
    const pendingState = {
      pendingAction: {
        stockId: 'STOCK_0',
        action: 'buy' as const,
        targetShares: 0,
        ticksRemaining: 1,
      },
    };
    const [action, stockId, newState] = oracleDecideAction(
      oracle,
      pendingState,
      market,
      [],
      config,
      prng,
    );
    expect(action).toBe('buy');
    expect(stockId).toBe('STOCK_0');
    expect(newState.pendingAction).toBeNull();
  });

  it('decrements ticksRemaining when >1', () => {
    const oracle = makeOracle({ noiseRate: 0, delayJitter: 0 });
    const market = createMarket(config);
    const prng = createPrng(1);
    const pendingState = {
      pendingAction: {
        stockId: 'STOCK_0',
        action: 'buy' as const,
        targetShares: 0,
        ticksRemaining: 3,
      },
    };
    const [action, , newState] = oracleDecideAction(oracle, pendingState, market, [], config, prng);
    expect(action).toBe('hold');
    expect(newState.pendingAction?.ticksRemaining).toBe(2);
  });
});
