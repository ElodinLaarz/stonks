import { nextFloat, nextInt } from './prng';
import type { PrngState } from './prng';
import { selectAndDecide } from './agent';
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

  // Noise gate: act exactly like a regular agent (single volumeNoise draw for both
  // stock selection and threshold evaluation, matching selectAndDecide's contract).
  let noiseRoll: number;
  [p, noiseRoll] = nextFloat(p);
  if (noiseRoll < concealmentGenome.noiseRate) {
    let action: TradeAction;
    let bestStockId: StockId;
    [action, bestStockId, p] = selectAndDecide(agent, marketState, tradeLog, p);
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

  // Delay jitter
  if (concealmentGenome.delayJitter > 0) {
    let delayTicks: number;
    [p, delayTicks] = nextInt(p, 0, concealmentGenome.delayJitter);
    if (delayTicks > 0) {
      const pendingAction: PendingOracleAction = {
        stockId: bestStockId,
        action: idealAction,
        targetShares: 0,
        ticksRemaining: delayTicks,
      };
      return ['hold', bestStockId, { pendingAction }, p];
    }
  }

  return [idealAction, bestStockId, oracleState, p];
}
