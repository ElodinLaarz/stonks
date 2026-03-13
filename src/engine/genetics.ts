import { nextFloat, nextInt } from './prng';
import type { PrngState } from './prng';
import { portfolioValue } from './agent';
import type { Agent, AgentId, Genome, MarketState, SimConfig } from './types';

export function rankAgents(
  agents: readonly Agent[],
  marketState: MarketState,
  caughtOracleId: AgentId | null,
): readonly Agent[] {
  const eligible =
    caughtOracleId !== null ? agents.filter((a) => a.id !== caughtOracleId) : [...agents];
  return [...eligible].sort(
    (a, b) => portfolioValue(b, marketState) - portfolioValue(a, marketState),
  );
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function mutateGenome(
  genome: Genome,
  config: SimConfig,
  prng: PrngState,
): [Genome, PrngState] {
  let p = prng;

  const newWeights: [number, number, number, number, number, number] = [
    ...genome.signalWeights,
  ] as [number, number, number, number, number, number];
  for (let i = 0; i < 6; i++) {
    let gate: number;
    [p, gate] = nextFloat(p);
    if (gate < config.mutationRate) {
      let delta: number;
      [p, delta] = nextFloat(p);
      newWeights[i] = newWeights[i]! + (delta - 0.5) * 2 * config.mutationMagnitude;
    }
  }

  let lookbackWindow = genome.lookbackWindow;
  let gwLb: number;
  [p, gwLb] = nextFloat(p);
  if (gwLb < config.mutationRate) {
    let delta: number;
    [p, delta] = nextFloat(p);
    lookbackWindow = Math.max(1, Math.round(lookbackWindow + (delta - 0.5) * 4));
  }

  let buyThreshold = genome.buyThreshold;
  let gwBt: number;
  [p, gwBt] = nextFloat(p);
  if (gwBt < config.mutationRate) {
    let delta: number;
    [p, delta] = nextFloat(p);
    buyThreshold = clamp(buyThreshold + (delta - 0.5) * 2 * config.mutationMagnitude, 0.001, 1);
  }

  let sellThreshold = genome.sellThreshold;
  let gwSt: number;
  [p, gwSt] = nextFloat(p);
  if (gwSt < config.mutationRate) {
    let delta: number;
    [p, delta] = nextFloat(p);
    sellThreshold = clamp(sellThreshold + (delta - 0.5) * 2 * config.mutationMagnitude, 0.001, 1);
  }

  let positionSize = genome.positionSize;
  let gwPs: number;
  [p, gwPs] = nextFloat(p);
  if (gwPs < config.mutationRate) {
    let delta: number;
    [p, delta] = nextFloat(p);
    positionSize = clamp(positionSize + (delta - 0.5) * 2 * config.mutationMagnitude, 0.01, 1);
  }

  let riskTolerance = genome.riskTolerance;
  let gwRt: number;
  [p, gwRt] = nextFloat(p);
  if (gwRt < config.mutationRate) {
    let delta: number;
    [p, delta] = nextFloat(p);
    riskTolerance = clamp(riskTolerance + (delta - 0.5) * 2 * config.mutationMagnitude, 0, 1);
  }

  const newGenome: Genome = {
    signalWeights: newWeights,
    lookbackWindow,
    buyThreshold,
    sellThreshold,
    positionSize,
    riskTolerance,
  };
  return [newGenome, p];
}

export function crossoverGenomes(a: Genome, b: Genome, prng: PrngState): [Genome, PrngState] {
  let p = prng;

  // Uniform crossover: each gene independently drawn from a or b
  const newWeights: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) {
    let coin: number;
    [p, coin] = nextFloat(p);
    newWeights[i] = coin < 0.5 ? a.signalWeights[i]! : b.signalWeights[i]!;
  }

  let coinLb: number;
  [p, coinLb] = nextFloat(p);
  let coinBt: number;
  [p, coinBt] = nextFloat(p);
  let coinSt: number;
  [p, coinSt] = nextFloat(p);
  let coinPs: number;
  [p, coinPs] = nextFloat(p);
  let coinRt: number;
  [p, coinRt] = nextFloat(p);

  const child: Genome = {
    signalWeights: newWeights,
    lookbackWindow: coinLb < 0.5 ? a.lookbackWindow : b.lookbackWindow,
    buyThreshold: coinBt < 0.5 ? a.buyThreshold : b.buyThreshold,
    sellThreshold: coinSt < 0.5 ? a.sellThreshold : b.sellThreshold,
    positionSize: coinPs < 0.5 ? a.positionSize : b.positionSize,
    riskTolerance: coinRt < 0.5 ? a.riskTolerance : b.riskTolerance,
  };
  return [child, p];
}

export function evolveGeneration(
  agents: readonly Agent[],
  config: SimConfig,
  marketState: MarketState,
  prng: PrngState,
): [readonly Agent[], PrngState] {
  let p = prng;

  // Rank by portfolio value (no caught oracle at generation end — auditor handles that)
  const ranked = [...agents].sort(
    (a, b) => portfolioValue(b, marketState) - portfolioValue(a, marketState),
  );

  const n = ranked.length;
  const cullCount = Math.floor(n / 4);
  const survivors = ranked.slice(0, n - cullCount);

  // Fill culled slots with mutated/crossed copies of top performers
  const newAgents: Agent[] = [...survivors];
  const topPerformers = ranked.slice(0, Math.max(1, Math.floor(n / 2)));

  while (newAgents.length < n) {
    // Pick a parent from top performers
    let parentIdx: number;
    [p, parentIdx] = nextInt(p, 0, topPerformers.length - 1);
    const parent = topPerformers[parentIdx]!;

    let childGenome: Genome;
    let crossoverRoll: number;
    [p, crossoverRoll] = nextFloat(p);

    if (crossoverRoll < 0.5 && topPerformers.length >= 2) {
      // Crossover with a different parent
      let otherIdx: number;
      [p, otherIdx] = nextInt(p, 0, topPerformers.length - 1);
      // Avoid same parent
      if (otherIdx === parentIdx) otherIdx = (otherIdx + 1) % topPerformers.length;
      [childGenome, p] = crossoverGenomes(parent.genome, topPerformers[otherIdx]!.genome, p);
    } else {
      childGenome = parent.genome;
    }

    [childGenome, p] = mutateGenome(childGenome, config, p);

    const newId = `agent_gen_${newAgents.length}_${Date.now()}`;
    newAgents.push({
      ...parent,
      id: newId,
      genome: childGenome,
      portfolio: { cash: config.startingCapital, positions: new Map() },
      isOracle: false,
      oracleDelay: 0,
    });
  }

  // Randomly reassign oracle role
  let oracleIdx: number;
  [p, oracleIdx] = nextInt(p, 0, newAgents.length - 1);
  const finalAgents: Agent[] = newAgents.map((a, i) => ({ ...a, isOracle: i === oracleIdx }));

  return [finalAgents, p];
}
