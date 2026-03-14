import type { PrngState } from './prng';

export type Tick = number;
export type AgentId = string;
export type StockId = string;

export interface PriceBar {
  tick: Tick;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StockConfig {
  id: StockId;
  name: string;
  initialPrice: number;
  /** Annualized volatility, e.g. 0.2 = 20%. */
  volatility: number;
  /** Annualized drift, e.g. 0.0 = zero drift. */
  drift: number;
}

export interface Stock {
  readonly id: StockId;
  readonly name: string;
  readonly initialPrice: number;
  /**
   * Price history. `tickMarket` returns a new `Stock` object with a new bars
   * array each tick, preserving immutability for state forking (e.g. Oracle lookahead).
   */
  readonly bars: readonly PriceBar[];
}

export interface MarketState {
  readonly tick: Tick;
  readonly stocks: readonly Stock[];
  /** Resolved stock configurations, computed once at market creation. */
  readonly stockConfigs: readonly StockConfig[];
}

export interface SimConfig {
  seed: number;
  numAgents: number;
  numStocks: number;
  numTicks: number;
  oracleLookahead: number;
  startingCapital: number;
  /** Annualized volatility applied to all stocks unless overridden. See DEFAULT_SIM_CONFIG. */
  stockVolatility: number;
  /** Average ticks between shock events. See DEFAULT_SIM_CONFIG. */
  shockFrequency: number;
  /** Optional per-stock overrides. Defaults to `numStocks` uniform stocks. */
  stockConfigs?: readonly StockConfig[];
  roundsPerGeneration: number;
  mutationRate: number;
  mutationMagnitude: number;
  maxGenerations: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  seed: 1,
  numAgents: 4,
  numStocks: 5,
  numTicks: 500,
  oracleLookahead: 5,
  startingCapital: 10_000,
  stockVolatility: 0.2,
  shockFrequency: 100,
  roundsPerGeneration: 10,
  mutationRate: 0.1,
  mutationMagnitude: 0.05,
  maxGenerations: 10,
};

export type TradeAction = 'buy' | 'sell' | 'hold';

export interface Genome {
  readonly signalWeights: readonly [number, number, number, number, number, number];
  readonly lookbackWindow: number;
  readonly buyThreshold: number;
  readonly sellThreshold: number;
  readonly positionSize: number;
  readonly riskTolerance: number;
}

export interface ConcealmentGenome {
  readonly noiseRate: number;
  readonly aggressionCap: number;
  readonly styleTarget: AgentId | null;
  readonly delayJitter: number;
}

export interface Position {
  readonly stockId: StockId;
  readonly shares: number;
  readonly avgCostBasis: number;
}

export interface Portfolio {
  readonly cash: number;
  readonly positions: ReadonlyMap<StockId, Position>;
}

export interface Trade {
  readonly tick: Tick;
  readonly agentId: AgentId;
  readonly stockId: StockId;
  readonly action: TradeAction;
  readonly shares: number;
  readonly price: number;
  readonly value: number;
}

export interface Agent {
  readonly id: AgentId;
  readonly genome: Genome;
  readonly concealmentGenome: ConcealmentGenome;
  readonly portfolio: Portfolio;
  readonly isOracle: boolean;
}

export interface PendingOracleAction {
  readonly stockId: StockId;
  readonly action: TradeAction;
  readonly targetShares: number;
  readonly ticksRemaining: number;
}

export interface OracleState {
  readonly pendingAction: PendingOracleAction | null;
}

export interface SuspicionScores {
  readonly predictiveCorrelation: number;
  readonly winRate: number;
  readonly timingClustering: number;
  readonly behavioralFingerprint: number;
  readonly composite: number;
}

export interface AgentTradeHistory {
  readonly openPositions: ReadonlyMap<StockId, number>;
  readonly closedPnl: readonly number[];
  readonly tradeTicks: readonly Tick[];
  readonly buyPredictions: readonly { tick: Tick; stockId: StockId; priceAtBuy: number }[];
}

export interface AuditorState {
  readonly scores: ReadonlyMap<AgentId, SuspicionScores>;
  readonly accusation: AgentId | null;
  readonly tradeHistories: ReadonlyMap<AgentId, AgentTradeHistory>;
}

export interface GameState {
  readonly tick: Tick;
  readonly round: number;
  readonly generation: number;
  readonly market: MarketState;
  readonly agents: readonly Agent[];
  readonly oracleStates: ReadonlyMap<AgentId, OracleState>;
  readonly auditor: AuditorState;
  readonly tradeLog: readonly Trade[];
  readonly portfolioHistory: ReadonlyMap<AgentId, readonly number[]>;
  /** Portfolio values captured at end of each round (before reset) for use by the GA. */
  readonly roundEndPortfolioValues: ReadonlyMap<AgentId, number>;
  readonly prng: PrngState;
  readonly config: SimConfig;
  readonly phase: 'running' | 'roundEnd' | 'generationEnd' | 'finished';
}

export interface RoundResult {
  readonly generation: number;
  readonly round: number;
  readonly oracleId: AgentId;
  readonly auditorAccusation: AgentId | null;
  readonly auditorCorrect: boolean;
  readonly portfolioRanking: readonly AgentId[];
  readonly oracleWon: boolean;
}
