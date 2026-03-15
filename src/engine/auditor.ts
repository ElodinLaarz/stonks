import type {
  AgentId,
  AgentTradeHistory,
  AuditorState,
  MarketState,
  StockId,
  SuspicionScores,
  Tick,
  Trade,
} from './types';

const TIMING_CLUSTER_WINDOW = 2;

const COMPOSITE_WEIGHTS = {
  predictiveCorrelation: 0.35,
  winRate: 0.3,
  timingClustering: 0.2,
  behavioralFingerprint: 0.15,
} as const;

const ZERO_SCORES: SuspicionScores = {
  predictiveCorrelation: 0,
  winRate: 0,
  timingClustering: 0,
  behavioralFingerprint: 1,
  composite: 0,
};

function emptyHistory(): AgentTradeHistory {
  return {
    openPositions: new Map<StockId, number>(),
    closedPnl: [],
    tradeTicks: [],
    buyPredictions: [],
  };
}

export function createAuditorState(agentIds: readonly AgentId[]): AuditorState {
  const scores = new Map<AgentId, SuspicionScores>();
  const tradeHistories = new Map<AgentId, AgentTradeHistory>();
  for (const id of agentIds) {
    scores.set(id, ZERO_SCORES);
    tradeHistories.set(id, emptyHistory());
  }
  return { scores, tradeHistories };
}

export function updateSuspicion(
  state: AuditorState,
  newTrades: readonly Trade[],
  marketState: MarketState,
  allAgentIds: readonly AgentId[],
): AuditorState {
  // Update histories with new trades
  const newHistories = new Map(state.tradeHistories);
  for (const trade of newTrades) {
    const existing = newHistories.get(trade.agentId) ?? emptyHistory();
    const newOpenPositions = new Map(existing.openPositions);
    const newClosedPnl = [...existing.closedPnl];
    const newBuyPredictions = [...existing.buyPredictions];

    if (trade.action === 'buy') {
      newOpenPositions.set(trade.stockId, trade.price);
      newBuyPredictions.push({ tick: trade.tick, stockId: trade.stockId, priceAtBuy: trade.price });
    } else if (trade.action === 'sell') {
      const costBasis = newOpenPositions.get(trade.stockId);
      if (costBasis !== undefined) {
        newClosedPnl.push(trade.price - costBasis);
        newOpenPositions.delete(trade.stockId);
      }
    }

    newHistories.set(trade.agentId, {
      openPositions: newOpenPositions,
      closedPnl: newClosedPnl,
      tradeTicks: [...existing.tradeTicks, trade.tick],
      buyPredictions: newBuyPredictions,
    });
  }

  // Only recompute scores for agents who traded this tick; others keep their previous score.
  // This avoids re-scanning the full trade history for every agent on every tick.
  const agentsWithNewTrades = new Set(newTrades.map((t) => t.agentId));
  const newScores = new Map<AgentId, SuspicionScores>();
  for (const agentId of allAgentIds) {
    if (agentsWithNewTrades.has(agentId)) {
      const history = newHistories.get(agentId) ?? emptyHistory();
      newScores.set(agentId, computeSuspicionScores(history, marketState));
    } else {
      newScores.set(agentId, state.scores.get(agentId) ?? ZERO_SCORES);
    }
  }

  return { ...state, scores: newScores, tradeHistories: newHistories };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length);
}

function computePredictiveCorrelation(
  history: AgentTradeHistory,
  marketState: MarketState,
): number {
  if (history.buyPredictions.length < 2) return 0;

  let positiveCount = 0;
  let total = 0;
  for (const pred of history.buyPredictions) {
    const stock = marketState.stocks.find((s) => s.id === pred.stockId);
    if (stock === undefined || stock.bars.length === 0) continue;
    const currentPrice = stock.bars[stock.bars.length - 1]!.close;
    if (currentPrice > pred.priceAtBuy) positiveCount++;
    total++;
  }
  return total === 0 ? 0 : positiveCount / total;
}

function computeWinRate(history: AgentTradeHistory): number {
  if (history.closedPnl.length === 0) return 0;
  return history.closedPnl.filter((pnl) => pnl > 0).length / history.closedPnl.length;
}

function computeTimingClustering(history: AgentTradeHistory, marketState: MarketState): number {
  if (history.tradeTicks.length === 0) return 0;

  // Collect inflection ticks across all stocks (local min/max in close prices)
  const inflectionTicks = new Set<Tick>();
  for (const stock of marketState.stocks) {
    for (let i = 1; i < stock.bars.length - 1; i++) {
      const prev = stock.bars[i - 1]!.close;
      const curr = stock.bars[i]!.close;
      const next = stock.bars[i + 1]!.close;
      if ((curr >= prev && curr >= next) || (curr <= prev && curr <= next)) {
        inflectionTicks.add(stock.bars[i]!.tick);
      }
    }
  }

  let nearInflection = 0;
  for (const tick of history.tradeTicks) {
    for (let dt = -TIMING_CLUSTER_WINDOW; dt <= TIMING_CLUSTER_WINDOW; dt++) {
      if (inflectionTicks.has(tick + dt)) {
        nearInflection++;
        break;
      }
    }
  }
  return nearInflection / history.tradeTicks.length;
}

function computeBehavioralFingerprint(history: AgentTradeHistory): number {
  // Returns CV of inter-trade intervals: low CV (regular spacing) = high suspicion (low fingerprint)
  if (history.tradeTicks.length < 3) return 1; // not enough data → regular

  const intervals: number[] = [];
  for (let i = 1; i < history.tradeTicks.length; i++) {
    intervals.push(history.tradeTicks[i]! - history.tradeTicks[i - 1]!);
  }
  const avg = mean(intervals);
  if (avg === 0) return 0;
  return Math.min(1, stdDev(intervals) / avg);
}

function computeSuspicionScores(
  history: AgentTradeHistory,
  marketState: MarketState,
): SuspicionScores {
  const predictiveCorrelation = computePredictiveCorrelation(history, marketState);
  const winRate = computeWinRate(history);
  const timingClustering = computeTimingClustering(history, marketState);
  const behavioralFingerprint = computeBehavioralFingerprint(history);

  const composite =
    COMPOSITE_WEIGHTS.predictiveCorrelation * predictiveCorrelation +
    COMPOSITE_WEIGHTS.winRate * winRate +
    COMPOSITE_WEIGHTS.timingClustering * timingClustering +
    COMPOSITE_WEIGHTS.behavioralFingerprint * (1 - behavioralFingerprint);

  return { predictiveCorrelation, winRate, timingClustering, behavioralFingerprint, composite };
}

export function makeAccusation(state: AuditorState): AgentId | null {
  if (state.scores.size === 0) return null;
  let bestId: AgentId | null = null;
  let bestScore = 0; // require positive evidence before accusing anyone
  for (const [id, scores] of state.scores) {
    if (scores.composite > bestScore) {
      bestScore = scores.composite;
      bestId = id;
    }
  }
  return bestId;
}
