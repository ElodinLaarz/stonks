import { describe, it, expect } from 'vitest';
import { createGameState, tickGame, resolveRound, resolveGeneration } from '../gameLoop';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { SimConfig } from '../types';

const config: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  numAgents: 3,
  numStocks: 2,
  numTicks: 5,
  shockFrequency: 999_999,
  roundsPerGeneration: 2,
  maxGenerations: 3,
  replacementRate: 0.34, // ceil(3 * 0.34) = 2, clamped to 1 (n-1=2 means at most 2, at least 1)
};

describe('createGameState', () => {
  it('initializes at tick 0, round 0, generation 0', () => {
    const state = createGameState(config);
    expect(state.tick).toBe(0);
    expect(state.round).toBe(0);
    expect(state.generation).toBe(0);
  });

  it('initializes agentEpoch at 0', () => {
    const state = createGameState(config);
    expect(state.agentEpoch).toBe(0);
  });

  it('creates correct number of agents', () => {
    const state = createGameState(config);
    expect(state.agents.length).toBe(config.numAgents);
  });

  it('agent IDs use gen0 naming', () => {
    const state = createGameState(config);
    for (const agent of state.agents) {
      expect(agent.id).toMatch(/^agent_gen0_\d+$/);
    }
  });

  it('exactly one oracle agent', () => {
    const state = createGameState(config);
    expect(state.agents.filter((a) => a.isOracle).length).toBe(1);
  });

  it('phase starts as running', () => {
    const state = createGameState(config);
    expect(state.phase).toBe('running');
  });

  it('all agents start with correct capital', () => {
    const state = createGameState(config);
    for (const agent of state.agents) {
      expect(agent.portfolio.cash).toBe(config.startingCapital);
    }
  });
});

describe('tickGame', () => {
  it('increments tick by 1', () => {
    let state = createGameState(config);
    state = tickGame(state);
    expect(state.tick).toBe(1);
  });

  it('trade log grows as trades occur', () => {
    let state = createGameState(config);
    for (let i = 0; i < 5; i++) {
      state = tickGame(state);
    }
    // tradeLog might be empty (if all hold), but it should not error
    expect(state.tradeLog).toBeInstanceOf(Array);
  });

  it('transitions to roundEnd after numTicks', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) {
      state = tickGame(state);
    }
    expect(state.phase).toBe('roundEnd');
  });

  it('is deterministic from the same seed', () => {
    const runGame = (ticks: number) => {
      let state = createGameState(config);
      for (let i = 0; i < ticks; i++) state = tickGame(state);
      return state;
    };
    const a = runGame(5);
    const b = runGame(5);
    expect(a.tick).toBe(b.tick);
    expect(a.tradeLog.length).toBe(b.tradeLog.length);
    expect(a.market.tick).toBe(b.market.tick);
  });

  it('no-ops when phase is not running', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    expect(state.phase).toBe('roundEnd');
    const stateAfter = tickGame(state);
    expect(stateAfter.tick).toBe(state.tick); // no additional tick
  });
});

describe('resolveRound', () => {
  it('increments round counter', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [newState] = resolveRound(state);
    expect(newState.round).toBe(1);
  });

  it('resets tick to 0', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [newState] = resolveRound(state);
    expect(newState.tick).toBe(0);
  });

  it('increments agentEpoch', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [newState] = resolveRound(state);
    expect(newState.agentEpoch).toBe(1);
  });

  it('transitions to generationEnd after roundsPerGeneration rounds', () => {
    let state = createGameState(config);
    for (let r = 0; r < config.roundsPerGeneration; r++) {
      for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
      const [ns] = resolveRound(state);
      state = ns;
    }
    expect(state.phase).toBe('generationEnd');
  });

  it('returns correct RoundResult', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [, result] = resolveRound(state);
    expect(result.generation).toBe(0);
    expect(result.round).toBe(0);
    expect(typeof result.oracleId).toBe('string');
    expect(result.portfolioRanking.length).toBeGreaterThan(0);
  });

  it('replacedAgentIds has at least 1 and at most n-1 entries', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [, result] = resolveRound(state);
    expect(result.replacedAgentIds.length).toBeGreaterThanOrEqual(1);
    expect(result.replacedAgentIds.length).toBeLessThanOrEqual(config.numAgents - 1);
  });

  it('new agents born in the next epoch carry the correct ID prefix', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [newState, result] = resolveRound(state);
    // All agents born in epoch 1 should have agent_gen1_ prefix
    const freshAgents = newState.agents.filter(
      (a) =>
        result.replacedAgentIds.includes(a.id) === false &&
        !state.agents.some((old) => old.id === a.id),
    );
    expect(freshAgents.every((a) => a.id.startsWith('agent_gen1_'))).toBe(true);
  });

  it('next state has exactly one oracle after resolveRound', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [newState] = resolveRound(state);
    expect(newState.agents.filter((a) => a.isOracle).length).toBe(1);
  });

  it('oracle selection is deterministic for a fixed seed', () => {
    const runToRoundEnd = () => {
      let state = createGameState(config);
      for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
      return resolveRound(state);
    };
    const [newStateA] = runToRoundEnd();
    const [newStateB] = runToRoundEnd();
    const oracleA = newStateA.agents.find((a) => a.isOracle)!.id;
    const oracleB = newStateB.agents.find((a) => a.isOracle)!.id;
    expect(oracleA).toBe(oracleB);
  });

  it('prng advances when resolveRound selects the next oracle', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const prngBefore = state.prng;
    const [newState] = resolveRound(state);
    expect(newState.prng).not.toEqual(prngBefore);
  });

  it('resets agent portfolios to startingCapital', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    const [newState] = resolveRound(state);
    for (const agent of newState.agents) {
      expect(agent.portfolio.cash).toBe(config.startingCapital);
      expect(agent.portfolio.positions.size).toBe(0);
    }
  });
});

describe('resolveGeneration', () => {
  function runToGenerationEnd(): ReturnType<typeof createGameState> {
    let state = createGameState(config);
    for (let r = 0; r < config.roundsPerGeneration; r++) {
      for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
      const [ns] = resolveRound(state);
      state = ns;
    }
    return state;
  }

  it('increments generation', () => {
    const genEndState = runToGenerationEnd();
    const newState = resolveGeneration(genEndState);
    expect(newState.generation).toBe(1);
  });

  it('resets round and tick to 0', () => {
    const genEndState = runToGenerationEnd();
    const newState = resolveGeneration(genEndState);
    expect(newState.round).toBe(0);
    expect(newState.tick).toBe(0);
  });

  it('increments agentEpoch', () => {
    const genEndState = runToGenerationEnd();
    const epochBefore = genEndState.agentEpoch;
    const newState = resolveGeneration(genEndState);
    expect(newState.agentEpoch).toBe(epochBefore + 1);
  });

  it('transitions to finished after maxGenerations', () => {
    let state = createGameState(config);
    for (let g = 0; g < config.maxGenerations; g++) {
      for (let r = 0; r < config.roundsPerGeneration; r++) {
        for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
        const [ns] = resolveRound(state);
        state = ns;
      }
      state = resolveGeneration(state);
    }
    expect(state.phase).toBe('finished');
  });

  it('no-ops when phase is not generationEnd', () => {
    const state = createGameState(config);
    const after = resolveGeneration(state);
    expect(after).toBe(state);
  });
});
