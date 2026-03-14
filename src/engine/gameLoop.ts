import { createPrng } from './prng';
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
  MarketState,
  OracleState,
  RoundResult,
  SimConfig,
  Trade,
  TradeAction,
  StockId,
} from './types';

export function createGameState(config: SimConfig): GameState {
  const prng = createPrng(config.seed);
  const market = createMarket(config);

  const agents: Agent[] = [];
  const oracleStates = new Map<AgentId, OracleState>();
  const portfolioHistory = new Map<AgentId, number[]>();

  for (let i = 0; i < config.numAgents; i++) {
    const id = `agent_${i}`;
    const isOracle = i === 0;
    const agent = createAgent(
      id,
      DEFAULT_GENOME,
      DEFAULT_CONCEALMENT_GENOME,
      config.startingCapital,
      isOracle,
    );
    agents.push(agent);
    oracleStates.set(id, { pendingAction: null });
    portfolioHistory.set(id, [config.startingCapital]);
  }

  const agentIds = agents.map((a) => a.id);
  return {
    tick: 0,
    round: 0,
    generation: 0,
    market,
    agents,
    oracleStates,
    auditor: createAuditorState(agentIds),
    tradeLog: [],
    portfolioHistory,
    roundEndPortfolioValues: new Map(),
    prng,
    config,
    phase: 'running',
  };
}

export function tickGame(state: GameState): GameState {
  if (state.phase !== 'running') return state;

  let p: PrngState = state.prng;
  let newMarket: MarketState;
  let newP: PrngState;
  [newMarket, newP] = tickMarket(state.market, state.config, p);
  p = newP;

  let agents: Agent[] = [...state.agents];
  const newTrades: Trade[] = [];
  const oracleStates = new Map(state.oracleStates);

  // Snapshot the trade log reference before appending so agents only see prior-tick trades.
  // The underlying array is mutated in place after the agent loop (see below).
  const tradeLogSnapshot = state.tradeLog;

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
        state.config,
        p,
      );
      oracleStates.set(agent.id, newOracleState);
    } else {
      // selectAndDecide draws volumeNoise once and uses it consistently for both
      // stock selection and action threshold evaluation.
      [action, stockId, p] = selectAndDecide(agent, newMarket, tradeLogSnapshot, p);
    }

    let trade: Trade | null = null;
    if (action !== 'hold') {
      let updatedAgent: Agent;
      [updatedAgent, trade] = executeTrade(agent, action, stockId!, newMarket, newMarket.tick);
      agents[i] = updatedAgent;
    }
    if (trade !== null) {
      newTrades.push(trade);
    }
  }

  const newAuditor = updateSuspicion(
    state.auditor,
    newTrades,
    newMarket,
    agents.map((a) => a.id),
  );

  // Append trades and portfolio snapshots in-place — O(k) per tick instead of O(n).
  // These arrays are owned by the current round; resolveRound creates fresh ones.
  // Callers always reassign (state = tickGame(state)), so the old reference is dropped.
  for (const trade of newTrades) {
    (state.tradeLog as Trade[]).push(trade);
  }
  for (const agent of agents) {
    (state.portfolioHistory.get(agent.id) as number[]).push(portfolioValue(agent, newMarket));
  }

  const newTick = state.tick + 1;
  const newPhase = newTick >= state.config.numTicks ? 'roundEnd' : 'running';

  return {
    ...state,
    tick: newTick,
    market: newMarket,
    agents,
    oracleStates,
    auditor: newAuditor,
    prng: p,
    phase: newPhase,
    // tradeLog and portfolioHistory are mutated in place above; they propagate via ...state
  };
}

export function resolveRound(state: GameState): [GameState, RoundResult] {
  const oracleAgent = state.agents.find((a) => a.isOracle);
  const oracleId = oracleAgent?.id ?? state.agents[0]!.id;

  const accusation = makeAccusation(state.auditor);
  const auditorCorrect = accusation === oracleId;

  const ranked = rankAgents(state.agents, state.market, auditorCorrect ? oracleId : null);
  const portfolioRanking = ranked.map((a) => a.id);

  const oracleWon = !auditorCorrect && portfolioRanking[0] === oracleId;

  const result: RoundResult = {
    generation: state.generation,
    round: state.round,
    oracleId,
    auditorAccusation: accusation,
    auditorCorrect,
    portfolioRanking,
    oracleWon,
  };

  // Capture fitness before resetting portfolios so the GA can rank on actual performance.
  // Only the last completed round's values are used for GA selection — this intentionally
  // weights selection toward recent performance rather than averaged generation history.
  const roundEndPortfolioValues = new Map<AgentId, number>(
    state.agents.map((a) => [a.id, portfolioValue(a, state.market)]),
  );

  const nextRound = state.round + 1;
  const isGenerationEnd = nextRound >= state.config.roundsPerGeneration;

  // Reset portfolios for next round
  const resetAgents: Agent[] = state.agents.map((a) => ({
    ...a,
    portfolio: { cash: state.config.startingCapital, positions: new Map() },
  }));

  const resetOracleStates = new Map<AgentId, OracleState>();
  const resetPortfolioHistory = new Map<AgentId, number[]>();
  for (const agent of resetAgents) {
    resetOracleStates.set(agent.id, { pendingAction: null });
    resetPortfolioHistory.set(agent.id, [state.config.startingCapital]);
  }

  // Start next round with a fresh auditor, but carry forward the accusation so the UI
  // can display who was accused at round end.
  const freshAuditor = createAuditorState(resetAgents.map((a) => a.id));

  const newState: GameState = {
    ...state,
    round: nextRound,
    tick: 0,
    market: createMarket(state.config),
    agents: resetAgents,
    oracleStates: resetOracleStates,
    auditor: { ...freshAuditor, accusation },
    tradeLog: [],
    portfolioHistory: resetPortfolioHistory,
    roundEndPortfolioValues,
    phase: isGenerationEnd ? 'generationEnd' : 'running',
  };

  return [newState, result];
}

export function resolveGeneration(state: GameState): GameState {
  if (state.phase !== 'generationEnd') return state;

  const [newAgents, newPrng] = evolveGeneration(
    state.agents,
    state.config,
    state.roundEndPortfolioValues,
    state.prng,
  );

  const oracleStates = new Map<AgentId, OracleState>();
  const portfolioHistory = new Map<AgentId, number[]>();
  for (const agent of newAgents) {
    oracleStates.set(agent.id, { pendingAction: null });
    portfolioHistory.set(agent.id, [state.config.startingCapital]);
  }

  const nextGeneration = state.generation + 1;
  const isFinished = nextGeneration >= state.config.maxGenerations;

  return {
    ...state,
    generation: nextGeneration,
    round: 0,
    tick: 0,
    market: createMarket(state.config),
    agents: newAgents,
    oracleStates,
    auditor: createAuditorState(newAgents.map((a) => a.id)),
    tradeLog: [],
    portfolioHistory,
    roundEndPortfolioValues: new Map(),
    prng: newPrng,
    phase: isFinished ? 'finished' : 'running',
  };
}
