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

export interface SimConfig {
  seed: number;
  numAgents: number;
  numStocks: number;
  numTicks: number;
  oracleLookahead: number;
  startingCapital: number;
}
