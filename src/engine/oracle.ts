import { nextFloat, nextInt } from './prng';

const STYLE_MIMICRY_CHANCE = 0.5;
import type { PrngState } from './prng';
import { decideAction, findBestStockForAgent } from './agent';
import { tickMarket } from './market';
import type {
  Agent,
  MarketState,
  OracleState,
  PendingOracleAction,
  SimConfig,
  StockId,
  Trade,
  TradeAction,
} from './types';

function findBestFutureStock(currentMarket: MarketState, futureMarket: MarketState): StockId {
  let bestId = currentMarket.stocks[0]?.id ?? '';
  let bestReturn = -Infinity;
  for (let i = 0; i < currentMarket.stocks.length; i++) {
    const curr = currentMarket.stocks[i]!;
    const future = futureMarket.stocks[i]!;
    const currPrice = curr.bars[curr.bars.length - 1]!.close;
    const futPrice = future.bars[future.bars.length - 1]!.close;
    const ret = currPrice > 0 ? (futPrice - currPrice) / currPrice : 0;
    if (ret > bestReturn) {
      bestReturn = ret;
      bestId = curr.id;
    }
  }
  return bestId;
}

/**
 * Oracle decision with lookahead and concealment.
 * The real PRNG is only advanced for noise/jitter draws — not for the lookahead simulation.
 */
export function oracleDecideAction(
  agent: Agent,
  oracleState: OracleState,
  marketState: MarketState,
  tradeLog: readonly Trade[],
  config: SimConfig,
  prng: PrngState,
): [TradeAction, StockId, OracleState, PrngState] {
  let p = prng;
  const { concealmentGenome } = agent;

  // Tick down any pending delayed action
  if (oracleState.pendingAction !== null) {
    const pending = oracleState.pendingAction;
    if (pending.ticksRemaining <= 1) {
      return [pending.action, pending.stockId, { pendingAction: null }, p];
    }
    const newPending: PendingOracleAction = {
      ...pending,
      ticksRemaining: pending.ticksRemaining - 1,
    };
    return ['hold', pending.stockId, { pendingAction: newPending }, p];
  }

  // Noise gate: act like a regular agent instead of using lookahead
  let noiseRoll: number;
  [p, noiseRoll] = nextFloat(p);
  if (noiseRoll < concealmentGenome.noiseRate) {
    let volumeNoise: number;
    [p, volumeNoise] = nextFloat(p);
    const bestStockId = findBestStockForAgent(agent, marketState, tradeLog, volumeNoise);
    let action: TradeAction;
    [action, p] = decideAction(agent, bestStockId, marketState, tradeLog, p);
    return [action, bestStockId, oracleState, p];
  }

  // Lookahead: fork the PRNG — lookaheadPrng advances but real p does not
  let lookaheadPrng = p; // value copy (PrngState is an immutable object)
  let lookaheadMarket = marketState;
  for (let i = 0; i < config.oracleLookahead; i++) {
    [lookaheadMarket, lookaheadPrng] = tickMarket(lookaheadMarket, config, lookaheadPrng);
  }

  const bestStockId = findBestFutureStock(marketState, lookaheadMarket);
  const currStock = marketState.stocks.find((s) => s.id === bestStockId);
  const futStock = lookaheadMarket.stocks.find((s) => s.id === bestStockId);
  const currPrice = currStock?.bars[currStock.bars.length - 1]?.close ?? 0;
  const futPrice = futStock?.bars[futStock.bars.length - 1]?.close ?? 0;
  const idealAction: TradeAction = futPrice > currPrice ? 'buy' : 'sell';

  // Style mimicry: blend toward target agent's last action
  // (Implemented as a soft override — if target recently sold, flip to sell)
  let finalAction = idealAction;
  if (concealmentGenome.styleTarget !== null) {
    let lastTargetAction: Trade | null = null;
    for (let i = tradeLog.length - 1; i >= 0; i--) {
      if (tradeLog[i]!.agentId === concealmentGenome.styleTarget) {
        lastTargetAction = tradeLog[i]!;
        break;
      }
    }
    if (lastTargetAction !== null) {
      let styleRoll: number;
      [p, styleRoll] = nextFloat(p);
      if (styleRoll < STYLE_MIMICRY_CHANCE) {
        finalAction = lastTargetAction.action === 'hold' ? idealAction : lastTargetAction.action;
      }
    }
  }

  // Delay jitter
  if (concealmentGenome.delayJitter > 0) {
    let delayTicks: number;
    [p, delayTicks] = nextInt(p, 0, concealmentGenome.delayJitter);
    if (delayTicks > 0) {
      const pendingAction: PendingOracleAction = {
        stockId: bestStockId,
        action: finalAction,
        targetShares: 0,
        ticksRemaining: delayTicks,
      };
      return ['hold', bestStockId, { pendingAction }, p];
    }
  }

  return [finalAction, bestStockId, oracleState, p];
}
