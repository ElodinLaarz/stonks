import { nextFloat } from './prng';
import type { PrngState } from './prng';
import type {
  Agent,
  AgentId,
  ConcealmentGenome,
  Genome,
  MarketState,
  Portfolio,
  StockId,
  Trade,
  TradeAction,
  Tick,
} from './types';

export const DEFAULT_GENOME: Genome = {
  signalWeights: [1.0, 0.5, 0.3, 0.8, 0.2, 0.5],
  lookbackWindow: 20,
  buyThreshold: 0.05,
  sellThreshold: 0.05,
  positionSize: 0.2,
  riskTolerance: 0.5,
};

export const DEFAULT_CONCEALMENT_GENOME: ConcealmentGenome = {
  noiseRate: 0.3,
  aggressionCap: 0.5,
  delayJitter: 2,
};

export function createAgent(
  id: AgentId,
  genome: Genome,
  concealmentGenome: ConcealmentGenome,
  startingCapital: number,
  isOracle: boolean,
): Agent {
  const portfolio: Portfolio = {
    cash: startingCapital,
    positions: new Map(),
  };
  return { id, genome, concealmentGenome, portfolio, isOracle };
}

export function portfolioValue(agent: Agent, marketState: MarketState): number {
  let total = agent.portfolio.cash;
  for (const [stockId, position] of agent.portfolio.positions) {
    const stock = marketState.stocks.find((s) => s.id === stockId);
    if (stock !== undefined && stock.bars.length > 0) {
      total += position.shares * stock.bars[stock.bars.length - 1]!.close;
    }
  }
  return total;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute the composite signal for a given stock and agent.
 * volumeNoise: a pre-drawn value in [0, 1); defaults to 0 for deterministic testing.
 */
export function computeSignals(
  agent: Agent,
  marketState: MarketState,
  stockId: StockId,
  tradeLog: readonly Trade[],
  volumeNoise = 0,
): number {
  const stock = marketState.stocks.find((s) => s.id === stockId);
  if (stock === undefined || stock.bars.length === 0) return 0;

  const { genome } = agent;
  const window = Math.max(1, Math.min(genome.lookbackWindow, stock.bars.length));
  const bars = stock.bars.slice(-window);
  const closes = bars.map((b) => b.close);
  const currentClose = closes[closes.length - 1]!;

  // 1. Momentum: current price vs moving average
  const ma = mean(closes);
  const momentum = ma > 0 ? (currentClose - ma) / ma : 0;

  // 2. Mean reversion: negative when above mean (expects reversal downward)
  const sd = stdDev(closes);
  const meanRev = sd > 0 ? -(currentClose - ma) / sd : 0;

  // 3. Volatility: coefficient of variation (higher vol = more opportunity)
  const volatility = ma > 0 ? sd / ma : 0;

  // 4. Relative strength: this stock's return vs average return of all stocks
  let relativeStrength = 0;
  if (marketState.stocks.length > 1) {
    const allReturns = marketState.stocks.map((s) => {
      const b = s.bars;
      const first = b[Math.max(0, b.length - window)]!.close;
      const last = b[b.length - 1]!.close;
      return first > 0 ? (last - first) / first : 0;
    });
    const stockIdx = marketState.stocks.findIndex((s) => s.id === stockId);
    const stockReturn = stockIdx >= 0 ? (allReturns[stockIdx] ?? 0) : 0;
    const avgReturn = mean(allReturns);
    relativeStrength = stockReturn - avgReturn;
  }

  // 5. Volume proxy: pre-drawn uniform noise shifted to [-1, 1)
  const volumeProxy = volumeNoise * 2 - 1;

  // 6. Peer copying: mirror last non-self trade on this stock (reverse search for O(1) amortized)
  let peerCopy = 0;
  for (let i = tradeLog.length - 1; i >= 0; i--) {
    const t = tradeLog[i]!;
    if (t.stockId === stockId && t.agentId !== agent.id) {
      peerCopy = t.action === 'buy' ? 1 : t.action === 'sell' ? -1 : 0;
      break;
    }
  }

  const signals: readonly [number, number, number, number, number, number] = [
    momentum,
    meanRev,
    volatility,
    relativeStrength,
    volumeProxy,
    peerCopy,
  ];

  return signals.reduce((sum, s, i) => sum + genome.signalWeights[i]! * s, 0);
}

/** Find the stock ID with the highest composite signal for this agent. */
export function findBestStockForAgent(
  agent: Agent,
  marketState: MarketState,
  tradeLog: readonly Trade[],
  volumeNoise = 0,
): StockId {
  let bestId = marketState.stocks[0]?.id ?? '';
  let bestSignal = -Infinity;
  for (const stock of marketState.stocks) {
    const signal = computeSignals(agent, marketState, stock.id, tradeLog, volumeNoise);
    if (signal > bestSignal) {
      bestSignal = signal;
      bestId = stock.id;
    }
  }
  return bestId;
}

/**
 * Select the best stock and decide an action in one pass, drawing volumeNoise exactly once.
 * This ensures the same noise value is used for both stock selection and threshold evaluation,
 * avoiding the logical inconsistency of selecting with one signal then deciding with another.
 */
export function selectAndDecide(
  agent: Agent,
  marketState: MarketState,
  tradeLog: readonly Trade[],
  prng: PrngState,
): [TradeAction, StockId, PrngState] {
  let p = prng;
  let volumeNoise: number;
  [p, volumeNoise] = nextFloat(p);

  let bestId = marketState.stocks[0]?.id ?? '';
  let bestSignal = -Infinity;
  for (const stock of marketState.stocks) {
    const sig = computeSignals(agent, marketState, stock.id, tradeLog, volumeNoise);
    if (sig > bestSignal) {
      bestSignal = sig;
      bestId = stock.id;
    }
  }

  const { buyThreshold, sellThreshold } = agent.genome;
  let action: TradeAction;
  if (bestSignal >= buyThreshold) {
    action = 'buy';
  } else if (bestSignal <= -sellThreshold) {
    action = 'sell';
  } else {
    action = 'hold';
  }

  return [action, bestId, p];
}

/**
 * Decide trade action for a specific stock.
 * Draws one float from PRNG for volume proxy noise.
 */
export function decideAction(
  agent: Agent,
  stockId: StockId,
  marketState: MarketState,
  tradeLog: readonly Trade[],
  prng: PrngState,
): [TradeAction, PrngState] {
  let p = prng;
  let volumeNoise: number;
  [p, volumeNoise] = nextFloat(p);

  const signal = computeSignals(agent, marketState, stockId, tradeLog, volumeNoise);
  const { buyThreshold, sellThreshold } = agent.genome;

  let action: TradeAction;
  if (signal >= buyThreshold) {
    action = 'buy';
  } else if (signal <= -sellThreshold) {
    action = 'sell';
  } else {
    action = 'hold';
  }

  return [action, p];
}

/**
 * Execute a trade for an agent. Returns [updatedAgent, trade] or [agent, null] for no-ops.
 * Validates cash availability for buys and share availability for sells.
 */
export function executeTrade(
  agent: Agent,
  action: TradeAction,
  stockId: StockId,
  marketState: MarketState,
  tick: Tick,
): [Agent, Trade | null] {
  if (action === 'hold') return [agent, null];

  const stock = marketState.stocks.find((s) => s.id === stockId);
  if (stock === undefined || stock.bars.length === 0) return [agent, null];

  const price = stock.bars[stock.bars.length - 1]!.close;
  const { genome, portfolio } = agent;

  if (action === 'buy') {
    const spendable = portfolio.cash * genome.positionSize;
    const shares = Math.floor(spendable / price);
    if (shares <= 0) return [agent, null];

    const cost = shares * price;
    const existingPos = portfolio.positions.get(stockId);
    const newShares = (existingPos?.shares ?? 0) + shares;
    const newAvgCost =
      existingPos !== undefined
        ? (existingPos.avgCostBasis * existingPos.shares + cost) / newShares
        : price;

    const newPositions = new Map(portfolio.positions);
    newPositions.set(stockId, { stockId, shares: newShares, avgCostBasis: newAvgCost });

    const newAgent: Agent = {
      ...agent,
      portfolio: { cash: portfolio.cash - cost, positions: newPositions },
    };
    const trade: Trade = {
      tick,
      agentId: agent.id,
      stockId,
      action: 'buy',
      shares,
      price,
      value: cost,
    };
    return [newAgent, trade];
  }

  // sell
  const existingPos = portfolio.positions.get(stockId);
  if (existingPos === undefined || existingPos.shares <= 0) return [agent, null];

  const shares = existingPos.shares;
  const proceeds = shares * price;
  const newPositions = new Map(portfolio.positions);
  newPositions.delete(stockId);

  const newAgent: Agent = {
    ...agent,
    portfolio: { cash: portfolio.cash + proceeds, positions: newPositions },
  };
  const trade: Trade = {
    tick,
    agentId: agent.id,
    stockId,
    action: 'sell',
    shares,
    price,
    value: proceeds,
  };
  return [newAgent, trade];
}
