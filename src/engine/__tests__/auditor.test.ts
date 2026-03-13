import { describe, it, expect } from 'vitest';
import { createMarket } from '../market';
import { createAuditorState, updateSuspicion, makeAccusation } from '../auditor';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { Trade } from '../types';

const config = { ...DEFAULT_SIM_CONFIG, numStocks: 1, shockFrequency: 999_999 };
const agentIds = ['a1', 'a2', 'a3'];

describe('createAuditorState', () => {
  it('initializes zero scores for all agents', () => {
    const state = createAuditorState(agentIds);
    for (const id of agentIds) {
      const score = state.scores.get(id);
      expect(score?.composite).toBe(0);
    }
  });

  it('initializes empty trade histories', () => {
    const state = createAuditorState(agentIds);
    for (const id of agentIds) {
      const hist = state.tradeHistories.get(id);
      expect(hist?.tradeTicks.length).toBe(0);
    }
  });

  it('accusation starts null', () => {
    const state = createAuditorState(agentIds);
    expect(state.accusation).toBeNull();
  });
});

describe('updateSuspicion', () => {
  it('zero trades → zero scores', () => {
    const market = createMarket(config);
    let state = createAuditorState(agentIds);
    state = updateSuspicion(state, [], market, agentIds);
    for (const id of agentIds) {
      expect(state.scores.get(id)?.composite).toBe(0);
    }
  });

  it('records buy trade in history', () => {
    const market = createMarket(config);
    let state = createAuditorState(agentIds);
    const trade: Trade = {
      tick: 1,
      agentId: 'a1',
      stockId: 'STOCK_0',
      action: 'buy',
      shares: 10,
      price: 100,
      value: 1000,
    };
    state = updateSuspicion(state, [trade], market, agentIds);
    const hist = state.tradeHistories.get('a1');
    expect(hist?.buyPredictions.length).toBe(1);
    expect(hist?.tradeTicks).toContain(1);
  });

  it('records closed P&L on sell after buy', () => {
    const market = createMarket(config);
    let state = createAuditorState(agentIds);
    const buy: Trade = {
      tick: 1,
      agentId: 'a1',
      stockId: 'STOCK_0',
      action: 'buy',
      shares: 10,
      price: 100,
      value: 1000,
    };
    const sell: Trade = {
      tick: 5,
      agentId: 'a1',
      stockId: 'STOCK_0',
      action: 'sell',
      shares: 10,
      price: 120,
      value: 1200,
    };
    state = updateSuspicion(state, [buy], market, agentIds);
    state = updateSuspicion(state, [sell], market, agentIds);
    const hist = state.tradeHistories.get('a1');
    expect(hist?.closedPnl.length).toBe(1);
    expect(hist?.closedPnl[0]).toBeCloseTo(20); // sold at 120, bought at 100
  });

  it('100% win rate → winRate score = 1', () => {
    const market = createMarket(config);
    let state = createAuditorState(agentIds);
    const buy: Trade = {
      tick: 1,
      agentId: 'a1',
      stockId: 'STOCK_0',
      action: 'buy',
      shares: 1,
      price: 100,
      value: 100,
    };
    const sell: Trade = {
      tick: 2,
      agentId: 'a1',
      stockId: 'STOCK_0',
      action: 'sell',
      shares: 1,
      price: 200,
      value: 200,
    };
    state = updateSuspicion(state, [buy, sell], market, agentIds);
    expect(state.scores.get('a1')?.winRate).toBe(1);
  });
});

describe('makeAccusation', () => {
  it('returns null for empty scores', () => {
    const state = createAuditorState([]);
    expect(makeAccusation(state)).toBeNull();
  });

  it('picks agent with highest composite score', () => {
    const market = createMarket(config);
    let state = createAuditorState(agentIds);
    // Give a1 a high score via win rate
    const trades: Trade[] = [];
    for (let i = 0; i < 5; i++) {
      trades.push({
        tick: i * 2,
        agentId: 'a1',
        stockId: 'STOCK_0',
        action: 'buy',
        shares: 1,
        price: 100,
        value: 100,
      });
      trades.push({
        tick: i * 2 + 1,
        agentId: 'a1',
        stockId: 'STOCK_0',
        action: 'sell',
        shares: 1,
        price: 200,
        value: 200,
      });
    }
    state = updateSuspicion(state, trades, market, agentIds);
    expect(makeAccusation(state)).toBe('a1');
  });
});
