import { describe, it, expect } from 'vitest';
import { createPrng } from '../prng';
import { createMarket } from '../market';
import { createAgent, portfolioValue, DEFAULT_GENOME, DEFAULT_CONCEALMENT_GENOME } from '../agent';
import {
  rankAgents,
  mutateGenome,
  crossoverGenomes,
  evolveGeneration,
  replaceBottomAgents,
} from '../genetics';
import { DEFAULT_SIM_CONFIG } from '../types';
import type { Agent, SimConfig } from '../types';

const config: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  numStocks: 2,
  shockFrequency: 999_999,
  mutationRate: 0.5,
  mutationMagnitude: 0.1,
};

function makeAgents(n: number) {
  return Array.from({ length: n }, (_, i) =>
    createAgent(`a${i}`, DEFAULT_GENOME, DEFAULT_CONCEALMENT_GENOME, 10_000 + i * 1000, i === 0),
  );
}

function fitnessFromAgents(agents: readonly Agent[], config: SimConfig) {
  const market = createMarket(config);
  return new Map(agents.map((a) => [a.id, portfolioValue(a, market)]));
}

describe('rankAgents', () => {
  it('sorts by descending portfolio value', () => {
    const agents = makeAgents(4);
    const market = createMarket(config);
    const ranked = rankAgents(agents, market, null);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(portfolioValue(ranked[i]!, market)).toBeGreaterThanOrEqual(
        portfolioValue(ranked[i + 1]!, market),
      );
    }
  });

  it('excludes caught oracle', () => {
    const agents = makeAgents(4);
    const market = createMarket(config);
    const ranked = rankAgents(agents, market, 'a0');
    expect(ranked.find((a) => a.id === 'a0')).toBeUndefined();
    expect(ranked.length).toBe(3);
  });

  it('includes oracle when not caught', () => {
    const agents = makeAgents(4);
    const market = createMarket(config);
    const ranked = rankAgents(agents, market, null);
    expect(ranked.length).toBe(4);
  });
});

describe('mutateGenome', () => {
  it('returns different genome with mutationRate=1', () => {
    const prng = createPrng(1);
    const [mutated] = mutateGenome(DEFAULT_GENOME, { ...config, mutationRate: 1.0 }, prng);
    expect(mutated).not.toEqual(DEFAULT_GENOME);
  });

  it('returns identical genome with mutationRate=0', () => {
    const prng = createPrng(1);
    const [mutated] = mutateGenome(DEFAULT_GENOME, { ...config, mutationRate: 0 }, prng);
    expect(mutated.signalWeights).toEqual(DEFAULT_GENOME.signalWeights);
    expect(mutated.lookbackWindow).toBe(DEFAULT_GENOME.lookbackWindow);
    expect(mutated.buyThreshold).toBe(DEFAULT_GENOME.buyThreshold);
    expect(mutated.sellThreshold).toBe(DEFAULT_GENOME.sellThreshold);
    expect(mutated.positionSize).toBe(DEFAULT_GENOME.positionSize);
    expect(mutated.riskTolerance).toBe(DEFAULT_GENOME.riskTolerance);
  });

  it('advances PRNG', () => {
    const prng = createPrng(1);
    const [, newPrng] = mutateGenome(DEFAULT_GENOME, config, prng);
    expect(newPrng.s).not.toEqual(prng.s);
  });

  it('is deterministic', () => {
    const [m1] = mutateGenome(DEFAULT_GENOME, config, createPrng(7));
    const [m2] = mutateGenome(DEFAULT_GENOME, config, createPrng(7));
    expect(m1).toEqual(m2);
  });
});

describe('crossoverGenomes', () => {
  it('produces a child with genes from both parents', () => {
    const genomeA = { ...DEFAULT_GENOME, buyThreshold: 0.1, sellThreshold: 0.2 };
    const genomeB = { ...DEFAULT_GENOME, buyThreshold: 0.3, sellThreshold: 0.4 };
    const [child] = crossoverGenomes(genomeA, genomeB, createPrng(1));
    expect([0.1, 0.3]).toContain(child.buyThreshold);
    expect([0.2, 0.4]).toContain(child.sellThreshold);
  });

  it('is deterministic', () => {
    const [c1] = crossoverGenomes(DEFAULT_GENOME, DEFAULT_GENOME, createPrng(5));
    const [c2] = crossoverGenomes(DEFAULT_GENOME, DEFAULT_GENOME, createPrng(5));
    expect(c1).toEqual(c2);
  });
});

describe('evolveGeneration', () => {
  it('preserves population count', () => {
    const agents = makeAgents(8);
    const fitness = fitnessFromAgents(agents, config);
    const [newAgents] = evolveGeneration(agents, config, fitness, createPrng(1), 1);
    expect(newAgents.length).toBe(8);
  });

  it('exactly one oracle in new generation', () => {
    const agents = makeAgents(6);
    const fitness = fitnessFromAgents(agents, config);
    const [newAgents] = evolveGeneration(agents, config, fitness, createPrng(1), 1);
    expect(newAgents.filter((a) => a.isOracle).length).toBe(1);
  });

  it('is deterministic', () => {
    const agents = makeAgents(4);
    const fitness = fitnessFromAgents(agents, config);
    const [a] = evolveGeneration(agents, config, fitness, createPrng(42), 1);
    const [b] = evolveGeneration(agents, config, fitness, createPrng(42), 1);
    expect(a.map((x) => x.genome)).toEqual(b.map((x) => x.genome));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
});

describe('replaceBottomAgents', () => {
  it('preserves population count', () => {
    const agents = makeAgents(6);
    const fitness = fitnessFromAgents(agents, config);
    const [newAgents] = replaceBottomAgents(agents, config, fitness, createPrng(1), 1);
    expect(newAgents.length).toBe(6);
  });

  it('replaces at least one and keeps at least one', () => {
    // Even with extreme rates, floor/ceil guarantees [1, n-1]
    for (const rate of [0.01, 0.5, 0.99]) {
      const agents = makeAgents(4);
      const fitness = fitnessFromAgents(agents, config);
      const [newAgents, replacedIds] = replaceBottomAgents(
        agents,
        { ...config, replacementRate: rate },
        fitness,
        createPrng(1),
        1,
      );
      expect(replacedIds.length).toBeGreaterThanOrEqual(1);
      expect(newAgents.filter((a) => !replacedIds.includes(a.id)).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('new agents carry the correct epoch in their ID', () => {
    const agents = makeAgents(4);
    const fitness = fitnessFromAgents(agents, config);
    const [newAgents] = replaceBottomAgents(agents, config, fitness, createPrng(1), 7);
    // The replaced slots should be filled by agents whose IDs reference epoch 7
    const newlyBorn = newAgents.filter((a) => !agents.some((orig) => orig.id === a.id));
    expect(newlyBorn.every((a) => a.id.startsWith('agent_gen7_'))).toBe(true);
  });

  it('is deterministic', () => {
    const agents = makeAgents(4);
    const fitness = fitnessFromAgents(agents, config);
    const [a, idsA] = replaceBottomAgents(agents, config, fitness, createPrng(99), 2);
    const [b, idsB] = replaceBottomAgents(agents, config, fitness, createPrng(99), 2);
    expect(idsA).toEqual(idsB);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it('force-culls the specified agent even if they would have survived by fitness', () => {
    const agents = makeAgents(4);
    const fitness = fitnessFromAgents(agents, config);
    // a3 has the highest cash (10_000 + 3*1000) — would normally survive
    const topAgent = agents[agents.length - 1]!;
    const [, replacedIds] = replaceBottomAgents(
      agents,
      { ...config, replacementRate: 0.25 }, // only 1 of 4 replaced normally
      fitness,
      createPrng(1),
      1,
      topAgent.id,
    );
    expect(replacedIds).toContain(topAgent.id);
  });

  it('force-cull does not push replacements past n-1 when already at the cap', () => {
    // replacementRate=0.99 on 4 agents → numToReplace = min(ceil(4*0.99)=4, 4-1=3) = 3
    const agents = makeAgents(4);
    const fitness = fitnessFromAgents(agents, config);
    const topAgent = agents[agents.length - 1]!;
    const [newAgents, replacedIds] = replaceBottomAgents(
      agents,
      { ...config, replacementRate: 0.99 },
      fitness,
      createPrng(1),
      1,
      topAgent.id, // already in replaced set, or cap prevents adding
    );
    expect(replacedIds.length).toBeLessThanOrEqual(agents.length - 1);
    expect(newAgents.length).toBe(agents.length);
  });
});
