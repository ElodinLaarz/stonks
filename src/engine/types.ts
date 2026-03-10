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
}

export interface SimConfig {
  seed: number;
  numAgents: number;
  numStocks: number;
  numTicks: number;
  oracleLookahead: number;
  startingCapital: number;
  /** Annualized volatility applied to all stocks unless overridden. Default: 0.2. */
  stockVolatility: number;
  /** Average ticks between shock events. Default: 100. */
  shockFrequency: number;
  /** Optional per-stock overrides. Defaults to `numStocks` uniform stocks. */
  stockConfigs?: readonly StockConfig[];
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
};
