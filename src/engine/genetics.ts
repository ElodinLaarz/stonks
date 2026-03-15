import { nextFloat, nextInt } from './prng';
import type { PrngState } from './prng';
import { portfolioValue } from './agent';
import type { Agent, AgentId, Genome, MarketState, SimConfig } from './types';

const CROSSOVER_CHANCE = 0.5;

function maybeMutateNumber(
  value: number,
  prng: PrngState,
  config: SimConfig,
  lo: number,
  hi: number,
): [number, PrngState] {
  let p = prng;
  let gate: number;
  [p, gate] = nextFloat(p);
  if (gate >= config.mutationRate) return [value, p];
  let delta: number;
  [p, delta] = nextFloat(p);
  return [clamp(value + (delta - 0.5) * 2 * config.mutationMagnitude, lo, hi), p];
}

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
    // Signal weights are unbounded — use a wide range that maybeMutateNumber won't actually clamp
    let w: number;
    [w, p] = maybeMutateNumber(newWeights[i]!, p, config, -Infinity, Infinity);
    newWeights[i] = w;
  }

  let lookbackWindow: number;
  // lookbackWindow uses a smaller step (4) rather than mutationMagnitude — handled inline
  {
    let gate: number;
    [p, gate] = nextFloat(p);
    if (gate < config.mutationRate) {
      let delta: number;
      [p, delta] = nextFloat(p);
      lookbackWindow = Math.max(1, Math.round(genome.lookbackWindow + (delta - 0.5) * 4));
    } else {
      lookbackWindow = genome.lookbackWindow;
    }
  }

  let buyThreshold: number;
  [buyThreshold, p] = maybeMutateNumber(genome.buyThreshold, p, config, 0.001, 1);

  let sellThreshold: number;
  [sellThreshold, p] = maybeMutateNumber(genome.sellThreshold, p, config, 0.001, 1);

  let positionSize: number;
  [positionSize, p] = maybeMutateNumber(genome.positionSize, p, config, 0.01, 1);

  let riskTolerance: number;
  [riskTolerance, p] = maybeMutateNumber(genome.riskTolerance, p, config, 0, 1);

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

function pickFrom<T>(a: T, b: T, prng: PrngState): [T, PrngState] {
  let p = prng;
  let coin: number;
  [p, coin] = nextFloat(p);
  return [coin < 0.5 ? a : b, p];
}

export function crossoverGenomes(a: Genome, b: Genome, prng: PrngState): [Genome, PrngState] {
  let p = prng;

  // Uniform crossover: each gene independently drawn from a or b
  const newWeights: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) {
    let w: number;
    [w, p] = pickFrom(a.signalWeights[i]!, b.signalWeights[i]!, p);
    newWeights[i] = w;
  }

  let lookbackWindow: number;
  [lookbackWindow, p] = pickFrom(a.lookbackWindow, b.lookbackWindow, p);
  let buyThreshold: number;
  [buyThreshold, p] = pickFrom(a.buyThreshold, b.buyThreshold, p);
  let sellThreshold: number;
  [sellThreshold, p] = pickFrom(a.sellThreshold, b.sellThreshold, p);
  let positionSize: number;
  [positionSize, p] = pickFrom(a.positionSize, b.positionSize, p);
  let riskTolerance: number;
  [riskTolerance, p] = pickFrom(a.riskTolerance, b.riskTolerance, p);

  const child: Genome = {
    signalWeights: newWeights,
    lookbackWindow,
    buyThreshold,
    sellThreshold,
    positionSize,
    riskTolerance,
  };
  return [child, p];
}

/**
 * Breeds a single child genome from the top performers via optional crossover + mutation.
 * Returns the child genome, the primary parent (for field inheritance), and the new PRNG state.
 */
function breedChild(
  topPerformers: readonly Agent[],
  config: SimConfig,
  prng: PrngState,
): [Genome, Agent, PrngState] {
  let p = prng;

  let parentIdx: number;
  [p, parentIdx] = nextInt(p, 0, topPerformers.length - 1);
  const parent = topPerformers[parentIdx]!;

  let childGenome: Genome;
  let crossoverRoll: number;
  [p, crossoverRoll] = nextFloat(p);

  if (crossoverRoll < CROSSOVER_CHANCE && topPerformers.length >= 2) {
    let otherIdx: number;
    [p, otherIdx] = nextInt(p, 0, topPerformers.length - 1);
    if (otherIdx === parentIdx) otherIdx = (otherIdx + 1) % topPerformers.length;
    [childGenome, p] = crossoverGenomes(parent.genome, topPerformers[otherIdx]!.genome, p);
  } else {
    childGenome = parent.genome;
  }

  [childGenome, p] = mutateGenome(childGenome, config, p);
  return [childGenome, parent, p];
}

/**
 * Replaces the bottom `ceil(n * config.replacementRate)` agents (bounded to [1, n-1])
 * with children bred from the top performers. New agents are named agent_gen{agentEpoch}_{i}.
 *
 * If `forceReplaceId` is provided (e.g. a caught oracle), that agent is always culled
 * regardless of rank, as long as the total replacements remain below n-1.
 *
 * Returns [newAgents, replacedIds, newPrng].
 */
export function replaceBottomAgents(
  agents: readonly Agent[],
  config: SimConfig,
  fitnessValues: ReadonlyMap<AgentId, number>,
  prng: PrngState,
  agentEpoch: number,
  forceReplaceId: AgentId | null = null,
): [readonly Agent[], readonly AgentId[], PrngState] {
  let p = prng;
  const n = agents.length;

  const rate = Math.min(0.99, Math.max(0.01, config.replacementRate));
  const numToReplace = Math.min(Math.max(Math.ceil(n * rate), 1), n - 1);

  // Sort ascending by fitness so the worst are at the front
  const sorted = [...agents].sort(
    (a, b) => (fitnessValues.get(a.id) ?? 0) - (fitnessValues.get(b.id) ?? 0),
  );

  const replacedSet = new Set<AgentId>(sorted.slice(0, numToReplace).map((a) => a.id));
  // Force-include the caught oracle if not already culled, without exceeding n-1 total.
  if (forceReplaceId !== null && !replacedSet.has(forceReplaceId) && replacedSet.size < n - 1) {
    replacedSet.add(forceReplaceId);
  }
  const replacedIds = [...replacedSet];
  // survivors is sorted ascending; the best performers are at the end
  const survivors = sorted.filter((a) => !replacedSet.has(a.id));

  const newAgents: Agent[] = [...survivors];
  let childIdx = 0;
  while (newAgents.length < n) {
    let childGenome: Genome;
    let parentAgent: Agent;
    [childGenome, parentAgent, p] = breedChild(survivors, config, p);
    newAgents.push({
      ...parentAgent,
      id: `agent_gen${agentEpoch}_${childIdx}`,
      genome: childGenome,
      portfolio: { cash: config.startingCapital, positions: new Map() },
      isOracle: false,
    });
    childIdx++;
  }

  return [newAgents, replacedIds, p];
}

export function evolveGeneration(
  agents: readonly Agent[],
  config: SimConfig,
  fitnessValues: ReadonlyMap<AgentId, number>,
  prng: PrngState,
  agentEpoch: number,
): [readonly Agent[], PrngState] {
  let p = prng;

  // Rank descending by fitness; fall back to 0 for unknown agents.
  const ranked = [...agents].sort(
    (a, b) => (fitnessValues.get(b.id) ?? 0) - (fitnessValues.get(a.id) ?? 0),
  );

  const n = ranked.length;
  const cullCount = Math.floor(n / 4);
  const survivors = ranked.slice(0, n - cullCount);

  // Fill culled slots with mutated/crossed copies of top performers
  const newAgents: Agent[] = [...survivors];
  const topPerformers = ranked.slice(0, Math.max(1, Math.floor(n / 2)));

  let childIdx = 0;
  while (newAgents.length < n) {
    let childGenome: Genome;
    let parentAgent: Agent;
    [childGenome, parentAgent, p] = breedChild(topPerformers, config, p);
    newAgents.push({
      ...parentAgent,
      id: `agent_gen${agentEpoch}_${childIdx}`,
      genome: childGenome,
      portfolio: { cash: config.startingCapital, positions: new Map() },
      isOracle: false,
    });
    childIdx++;
  }

  // Randomly reassign oracle role
  let oracleIdx: number;
  [p, oracleIdx] = nextInt(p, 0, newAgents.length - 1);
  const finalAgents: Agent[] = newAgents.map((a, i) => ({ ...a, isOracle: i === oracleIdx }));

  return [finalAgents, p];
}
