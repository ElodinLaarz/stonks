import { describe, it, expect } from 'vitest';
import { createGameState, tickGame, resolveGeneration } from '../gameLoop';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { SimConfig } from '../types';

const config: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  numAgents: 4,
  numStocks: 2,
  numTicks: 5,
  shockFrequency: 999_999,
  roundsPerGeneration: 2,
  maxGenerations: 3,
};

describe('createGameState', () => {
  it('initializes at tick 0, generation 0', () => {
    const state = createGameState(config);
    expect(state.tick).toBe(0);
    expect(state.generation).toBe(0);
  });

  it('initializes agentEpoch at 0', () => {
    const state = createGameState(config);
    expect(state.agentEpoch).toBe(0);
  });

  it('creates correct number of parallel rounds', () => {
    const state = createGameState(config);
    expect(state.rounds.length).toBe(config.roundsPerGeneration);
  });

  it('each round has correct number of agents', () => {
    const state = createGameState(config);
    for (const round of state.rounds) {
      expect(round.agents.length).toBe(config.numAgents);
    }
  });

  it('agent IDs use gen0 naming', () => {
    const state = createGameState(config);
    for (const round of state.rounds) {
      for (const agent of round.agents) {
        expect(agent.id).toMatch(/^agent_gen0_\d+$/);
      }
    }
  });

  it('exactly one oracle per round', () => {
    const state = createGameState(config);
    for (const round of state.rounds) {
      expect(round.agents.filter((a) => a.isOracle).length).toBe(1);
    }
  });

  it('same oracle across all rounds', () => {
    const state = createGameState(config);
    const oracleIds = state.rounds.map((r) => r.agents.find((a) => a.isOracle)!.id);
    expect(new Set(oracleIds).size).toBe(1);
  });

  it('phase starts as running', () => {
    const state = createGameState(config);
    expect(state.phase).toBe('running');
  });

  it('all agents start with correct capital in each round', () => {
    const state = createGameState(config);
    for (const round of state.rounds) {
      for (const agent of round.agents) {
        expect(agent.portfolio.cash).toBe(config.startingCapital);
      }
    }
  });
});

describe('tickGame', () => {
  it('increments tick by 1', () => {
    let state = createGameState(config);
    state = tickGame(state);
    expect(state.tick).toBe(1);
  });

  it('advances all rounds', () => {
    let state = createGameState(config);
    state = tickGame(state);
    for (const round of state.rounds) {
      expect(round.market.tick).toBe(1);
    }
  });

  it('trade logs grow across rounds', () => {
    let state = createGameState(config);
    for (let i = 0; i < 5; i++) state = tickGame(state);
    for (const round of state.rounds) {
      expect(round.tradeLog).toBeInstanceOf(Array);
    }
  });

  it('transitions to generationEnd after numTicks', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    expect(state.phase).toBe('generationEnd');
  });

  it('is deterministic from the same seed', () => {
    const run = (ticks: number) => {
      let state = createGameState(config);
      for (let i = 0; i < ticks; i++) state = tickGame(state);
      return state;
    };
    const a = run(5);
    const b = run(5);
    expect(a.tick).toBe(b.tick);
    expect(a.rounds[0]!.tradeLog.length).toBe(b.rounds[0]!.tradeLog.length);
  });

  it('no-ops when phase is not running', () => {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    expect(state.phase).toBe('generationEnd');
    const after = tickGame(state);
    expect(after.tick).toBe(state.tick);
  });
});

describe('resolveGeneration', () => {
  function runToGenerationEnd() {
    let state = createGameState(config);
    for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
    return state;
  }

  it('increments generation', () => {
    const [newState] = resolveGeneration(runToGenerationEnd());
    expect(newState.generation).toBe(1);
  });

  it('resets tick to 0', () => {
    const [newState] = resolveGeneration(runToGenerationEnd());
    expect(newState.tick).toBe(0);
  });

  it('increments agentEpoch', () => {
    const genEndState = runToGenerationEnd();
    const [newState] = resolveGeneration(genEndState);
    expect(newState.agentEpoch).toBe(genEndState.agentEpoch + 1);
  });

  it('creates correct number of new rounds', () => {
    const [newState] = resolveGeneration(runToGenerationEnd());
    expect(newState.rounds.length).toBe(config.roundsPerGeneration);
  });

  it('returns round results for each parallel round', () => {
    const genEndState = runToGenerationEnd();
    const [, result] = resolveGeneration(genEndState);
    expect(result.generation).toBe(0);
    expect(result.roundResults.length).toBe(config.roundsPerGeneration);
  });

  it('each round result has an oracle', () => {
    const [, result] = resolveGeneration(runToGenerationEnd());
    for (const rr of result.roundResults) {
      expect(typeof rr.oracleId).toBe('string');
      expect(rr.portfolioRanking.length).toBeGreaterThan(0);
    }
  });

  it('replacedAgentIds is non-empty', () => {
    const [, result] = resolveGeneration(runToGenerationEnd());
    expect(result.replacedAgentIds.length).toBeGreaterThan(0);
  });

  it('new agents carry the correct epoch in their ID', () => {
    const genEndState = runToGenerationEnd();
    const canonicalIds = new Set(genEndState.rounds[0]!.agents.map((a) => a.id));
    const [newState] = resolveGeneration(genEndState);
    const freshAgents = newState.rounds[0]!.agents.filter((a) => !canonicalIds.has(a.id));
    expect(freshAgents.every((a) => a.id.startsWith('agent_gen1_'))).toBe(true);
  });

  it('exactly one oracle per round after evolution', () => {
    const [newState] = resolveGeneration(runToGenerationEnd());
    for (const round of newState.rounds) {
      expect(round.agents.filter((a) => a.isOracle).length).toBe(1);
    }
  });

  it('same oracle across all new rounds', () => {
    const [newState] = resolveGeneration(runToGenerationEnd());
    const oracleIds = newState.rounds.map((r) => r.agents.find((a) => a.isOracle)!.id);
    expect(new Set(oracleIds).size).toBe(1);
  });

  it('is deterministic', () => {
    const [a] = resolveGeneration(runToGenerationEnd());
    const [b] = resolveGeneration(runToGenerationEnd());
    expect(a.rounds[0]!.agents.map((x) => x.id)).toEqual(b.rounds[0]!.agents.map((x) => x.id));
    expect(a.generation).toBe(b.generation);
  });

  it('transitions to finished after maxGenerations', () => {
    let state = createGameState(config);
    for (let g = 0; g < config.maxGenerations; g++) {
      for (let i = 0; i < config.numTicks; i++) state = tickGame(state);
      [state] = resolveGeneration(state);
    }
    expect(state.phase).toBe('finished');
  });

  it('no-ops when phase is not generationEnd', () => {
    const state = createGameState(config);
    const [after] = resolveGeneration(state);
    expect(after).toBe(state);
  });

  it('all new round agents start with correct capital', () => {
    const [newState] = resolveGeneration(runToGenerationEnd());
    for (const round of newState.rounds) {
      for (const agent of round.agents) {
        expect(agent.portfolio.cash).toBe(config.startingCapital);
        expect(agent.portfolio.positions.size).toBe(0);
      }
    }
  });
});
