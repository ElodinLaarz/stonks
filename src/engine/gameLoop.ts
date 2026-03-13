import { createPrng } from './prng';
import type { PrngState } from './prng';
import { createMarket, tickMarket } from './market';
import {
  createAgent,
  decideAction,
  executeTrade,
  findBestStockForAgent,
  portfolioValue,
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
  const currentTradeLog: readonly Trade[] = state.tradeLog;

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
        currentTradeLog,
        state.config,
        p,
      );
      oracleStates.set(agent.id, newOracleState);
    } else {
      // For regular agents: find best stock then decide action
      // decideAction draws one float for volume noise internally
      stockId = findBestStockForAgent(agent, newMarket, currentTradeLog, 0);
      [action, p] = decideAction(agent, stockId, newMarket, currentTradeLog, p);
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

  const newPortfolioHistory = new Map(state.portfolioHistory);
  for (const agent of agents) {
    const history = newPortfolioHistory.get(agent.id) ?? [];
    newPortfolioHistory.set(agent.id, [...history, portfolioValue(agent, newMarket)]);
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
    tradeLog: [...currentTradeLog, ...newTrades],
    portfolioHistory: newPortfolioHistory,
    prng: p,
    phase: newPhase,
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

  const nextRound = state.round + 1;
  const isGenerationEnd = nextRound >= state.config.roundsPerGeneration;

  // Reset portfolios for next round
  const resetAgents: Agent[] = state.agents.map((a) => ({
    ...a,
    portfolio: { cash: state.config.startingCapital, positions: new Map() },
    oracleDelay: 0,
  }));

  const resetOracleStates = new Map<AgentId, OracleState>();
  const resetPortfolioHistory = new Map<AgentId, number[]>();
  for (const agent of resetAgents) {
    resetOracleStates.set(agent.id, { pendingAction: null });
    resetPortfolioHistory.set(agent.id, [state.config.startingCapital]);
  }

  const newState: GameState = {
    ...state,
    round: nextRound,
    tick: 0,
    market: createMarket(state.config),
    agents: resetAgents,
    oracleStates: resetOracleStates,
    auditor: createAuditorState(resetAgents.map((a) => a.id)),
    tradeLog: [],
    portfolioHistory: resetPortfolioHistory,
    phase: isGenerationEnd ? 'generationEnd' : 'running',
  };

  return [newState, result];
}

export function resolveGeneration(state: GameState): GameState {
  if (state.phase !== 'generationEnd') return state;

  const [newAgents, newPrng] = evolveGeneration(
    state.agents,
    state.config,
    state.market,
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
    prng: newPrng,
    phase: isFinished ? 'finished' : 'running',
  };
}
