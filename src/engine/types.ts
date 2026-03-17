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
  readonly bars: readonly PriceBar[];
}

export interface MarketState {
  readonly tick: Tick;
  readonly stocks: readonly Stock[];
  readonly stockConfigs: readonly StockConfig[];
}

export interface SimConfig {
  seed: number;
  numAgents: number;
  numStocks: number;
  numTicks: number;
  oracleLookahead: number;
  startingCapital: number;
  stockVolatility: number;
  shockFrequency: number;
  stockConfigs?: readonly StockConfig[];
  /** Number of parallel rounds run simultaneously each generation. */
  roundsPerGeneration: number;
  mutationRate: number;
  mutationMagnitude: number;
  maxGenerations: number;
  /** Fraction of agents culled each generation, e.g. 0.25 = bottom 25%. */
  replacementRate: number;
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
  roundsPerGeneration: 3,
  mutationRate: 0.1,
  mutationMagnitude: 0.05,
  maxGenerations: 10,
  replacementRate: 0.25,
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
  readonly tradeHistories: ReadonlyMap<AgentId, AgentTradeHistory>;
}

/** The state of a single parallel round within a generation. */
export interface RoundState {
  readonly market: MarketState;
  readonly agents: readonly Agent[];
  readonly oracleStates: ReadonlyMap<AgentId, OracleState>;
  readonly auditor: AuditorState;
  readonly tradeLog: readonly Trade[];
  readonly portfolioHistory: ReadonlyMap<AgentId, readonly number[]>;
}

export interface GameState {
  readonly tick: Tick;
  readonly generation: number;
  /** Monotonically increasing counter; increments every time agents are replaced.
   *  Used to derive new agent IDs: agent_gen{agentEpoch}_{i}. */
  readonly agentEpoch: number;
  /** All parallel rounds running simultaneously this generation. */
  readonly rounds: readonly RoundState[];
  /** Fitness aggregated across all rounds at generation end, used by the GA. */
  readonly generationFitness: ReadonlyMap<AgentId, number>;
  /**
   * @deprecated This no longer represents per-round portfolio values.
   * Use {@link GameState.generationFitness} for aggregated per-generation fitness.
   */
  readonly roundEndPortfolioValues: ReadonlyMap<AgentId, number>;
  readonly prng: PrngState;
  readonly config: SimConfig;
  readonly phase: 'running' | 'generationEnd' | 'finished';
}

/** Result for one parallel round within a generation. */
export interface PerRoundResult {
  readonly roundIndex: number;
  readonly oracleId: AgentId;
  readonly auditorAccusation: AgentId | null;
  readonly auditorCorrect: boolean;
  readonly portfolioRanking: readonly AgentId[];
  readonly oracleWon: boolean;
  /** True when the oracle was caught AND had the highest portfolio value (auditor stopped the leader). */
  readonly oracleWasLeading: boolean;
}

/** Result for an entire generation (all parallel rounds + GA step). */
export interface GenerationResult {
  readonly generation: number;
  readonly roundResults: readonly PerRoundResult[];
  /** Agent IDs culled by the GA at the end of this generation. */
  readonly replacedAgentIds: readonly AgentId[];
}
