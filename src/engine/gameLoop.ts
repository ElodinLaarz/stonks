import { createPrng, nextInt } from './prng';
import type { PrngState } from './prng';
import { createMarket, tickMarket } from './market';
import {
  createAgent,
  executeTrade,
  portfolioValue,
  selectAndDecide,
  DEFAULT_GENOME,
  DEFAULT_CONCEALMENT_GENOME,
} from './agent';
import { oracleDecideAction } from './oracle';
import { createAuditorState, makeAccusation, updateSuspicion } from './auditor';
import { evolveGeneration, rankAgents } from './genetics';
import type {
  Agent,
  AgentId,
  GameState,
  GenerationResult,
  MarketState,
  OracleState,
  PerRoundResult,
  RoundState,
  SimConfig,
  StockId,
  Trade,
  TradeAction,
} from './types';

export function createGameState(config: SimConfig): GameState {
  if (config.numAgents < 2) {
    throw new Error(`config.numAgents must be at least 2, but got ${config.numAgents}`);
  }
  if (config.roundsPerGeneration < 1) {
    throw new Error(
      `config.roundsPerGeneration must be at least 1, but got ${config.roundsPerGeneration}`,
    );
  }
  let prng = createPrng(config.seed);

  // Build canonical agents (shared genome/oracle identity across all rounds)
  const rawAgents: Agent[] = [];
  for (let i = 0; i < config.numAgents; i++) {
    rawAgents.push(
      createAgent(
        `agent_gen0_${i}`,
        DEFAULT_GENOME,
        DEFAULT_CONCEALMENT_GENOME,
        config.startingCapital,
        false,
      ),
    );
  }

  // Randomly assign oracle so the auditor cannot learn to always accuse the first agent
  let oracleIdx: number;
  [prng, oracleIdx] = nextInt(prng, 0, config.numAgents - 1);
  const canonicalAgents: Agent[] = rawAgents.map((a, i) => ({ ...a, isOracle: i === oracleIdx }));

  // Create one RoundState per parallel round
  const rounds: RoundState[] = [];
  for (let ri = 0; ri < config.roundsPerGeneration; ri++) {
    rounds.push(makeRoundState(canonicalAgents, config));
  }

  return {
    tick: 0,
    generation: 0,
    agentEpoch: 0,
    rounds,
    generationFitness: new Map(),
    roundEndPortfolioValues: new Map(),
    prng,
    config,
    phase: 'running',
  };
}

/** Create a fresh RoundState for a given set of canonical agents. */
function makeRoundState(canonicalAgents: readonly Agent[], config: SimConfig): RoundState {
  const agents: Agent[] = canonicalAgents.map((a) => ({
    ...a,
    portfolio: { cash: config.startingCapital, positions: new Map() },
  }));
  const oracleStates = new Map<AgentId, OracleState>();
  const portfolioHistory = new Map<AgentId, number[]>();
  for (const agent of agents) {
    oracleStates.set(agent.id, { pendingAction: null });
    portfolioHistory.set(agent.id, [config.startingCapital]);
  }
  return {
    market: createMarket(config),
    agents,
    oracleStates,
    auditor: createAuditorState(agents.map((a) => a.id)),
    tradeLog: [],
    portfolioHistory,
  };
}

/** Advance a single round by one tick. Returns updated round and new PRNG state. */
function tickRound(round: RoundState, config: SimConfig, prng: PrngState): [RoundState, PrngState] {
  let p: PrngState = prng;
  let newMarket: MarketState;
  [newMarket, p] = tickMarket(round.market, config, p);

  let agents: Agent[] = [...round.agents];
  const newTrades: Trade[] = [];
  const oracleStates = new Map(round.oracleStates);
  const tradeLogSnapshot = round.tradeLog;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]!;
    let action: TradeAction;
    let stockId: StockId;

    if (agent.isOracle) {
      const oracleState = oracleStates.get(agent.id) ?? { pendingAction: null };
      let newOracleState: OracleState;
      [action, stockId, newOracleState, p] = oracleDecideAction(
        agent,
        oracleState,
        newMarket,
        tradeLogSnapshot,
        config,
        p,
      );
      oracleStates.set(agent.id, newOracleState);
    } else {
      [action, stockId, p] = selectAndDecide(agent, newMarket, tradeLogSnapshot, p);
    }

    if (action !== 'hold') {
      let updatedAgent: Agent;
      let trade: Trade | null;
      [updatedAgent, trade] = executeTrade(agent, action, stockId!, newMarket, newMarket.tick);
      agents[i] = updatedAgent;
      if (trade !== null) newTrades.push(trade);
    }
  }

  const newAuditor = updateSuspicion(
    round.auditor,
    newTrades,
    newMarket,
    agents.map((a) => a.id),
  );

  // Append in-place — same ownership pattern as before
  for (const trade of newTrades) {
    (round.tradeLog as Trade[]).push(trade);
  }
  for (const agent of agents) {
    (round.portfolioHistory.get(agent.id) as number[]).push(portfolioValue(agent, newMarket));
  }

  return [
    {
      market: newMarket,
      agents,
      oracleStates,
      auditor: newAuditor,
      tradeLog: round.tradeLog,
      portfolioHistory: round.portfolioHistory,
    },
    p,
  ];
}

export function tickGame(state: GameState): GameState {
  if (state.phase !== 'running') return state;

  let p: PrngState = state.prng;
  const newRounds: RoundState[] = [];

  for (const round of state.rounds) {
    let newRound: RoundState;
    [newRound, p] = tickRound(round, state.config, p);
    newRounds.push(newRound);
  }

  const newTick = state.tick + 1;
  const newPhase = newTick >= state.config.numTicks ? 'generationEnd' : 'running';

  return {
    ...state,
    tick: newTick,
    rounds: newRounds,
    prng: p,
    phase: newPhase,
  };
}

export function resolveGeneration(state: GameState): [GameState, GenerationResult] {
  if (state.phase !== 'generationEnd')
    return [state, { generation: state.generation, roundResults: [], replacedAgentIds: [] }];

  // Compute per-round oracle detection results
  const roundResults: PerRoundResult[] = state.rounds.map((round, ri) => {
    const oracleAgent = round.agents.find((a) => a.isOracle);
    if (!oracleAgent) {
      // This should be impossible if game state is constructed correctly.
      throw new Error('Oracle not found in round ' + ri);
    }
    const oracleId = oracleAgent.id;
    const accusation = makeAccusation(round.auditor);
    const auditorCorrect = accusation === oracleId;
    const allRanked = rankAgents(round.agents, round.market, null);
    const oracleWasLeading = auditorCorrect && allRanked[0]?.id === oracleId;
    const ranked = rankAgents(round.agents, round.market, auditorCorrect ? oracleId : null);
    const portfolioRanking = ranked.map((a) => a.id);
    const oracleWon = !auditorCorrect && portfolioRanking[0] === oracleId;
    return {
      roundIndex: ri,
      oracleId,
      auditorAccusation: accusation,
      auditorCorrect,
      portfolioRanking,
      oracleWon,
      oracleWasLeading,
    };
  });

  // Aggregate fitness: sum portfolio values across all rounds per agent
  const canonicalAgents = state.rounds[0]!.agents;
  const aggregatedFitness = new Map<AgentId, number>();
  for (const agent of canonicalAgents) {
    let total = 0;
    for (const round of state.rounds) {
      const roundAgent = round.agents.find((a) => a.id === agent.id);
      if (roundAgent) total += portfolioValue(roundAgent, round.market);
    }
    aggregatedFitness.set(agent.id, total);
  }

  // Oracle caught in any round → always culled, regardless of portfolio performance
  const oracleCaught = roundResults.some((rr) => rr.auditorCorrect);
  if (oracleCaught) {
    const oracleId = roundResults[0]!.oracleId;
    aggregatedFitness.set(oracleId, -Infinity);
  }

  // Run GA
  const nextEpoch = state.agentEpoch + 1;
  let newPrng = state.prng;
  let evolvedAgents: readonly Agent[];
  let replacedAgentIds: readonly AgentId[];
  [evolvedAgents, replacedAgentIds, newPrng] = evolveGeneration(
    canonicalAgents,
    state.config,
    aggregatedFitness,
    newPrng,
    nextEpoch,
  );

  // Build new round states for the next generation
  const newRounds: RoundState[] = [];
  for (let ri = 0; ri < state.config.roundsPerGeneration; ri++) {
    newRounds.push(makeRoundState(evolvedAgents, state.config));
  }

  const nextGeneration = state.generation + 1;
  const isFinished = nextGeneration >= state.config.maxGenerations;

  const result: GenerationResult = {
    generation: state.generation,
    roundResults,
    replacedAgentIds,
  };

  const newState: GameState = {
    ...state,
    generation: nextGeneration,
    tick: 0,
    agentEpoch: nextEpoch,
    rounds: newRounds,
    roundEndPortfolioValues: aggregatedFitness,
    prng: newPrng,
    phase: isFinished ? 'finished' : 'running',
  };

  return [newState, result];
}
