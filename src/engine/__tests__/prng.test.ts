import { describe, it, expect } from 'vitest';
import { createPrng, nextFloat, nextFloatRange, nextInt, splitMix32 } from '../prng';

describe('splitMix32', () => {
  it('produces different outputs for different seeds', () => {
    expect(splitMix32(1)).not.toBe(splitMix32(2));
  });

  it('returns a uint32 (non-negative integer)', () => {
    const result = splitMix32(42);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('createPrng', () => {
  it('produces the same initial state for the same seed', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    expect(a.s).toEqual(b.s);
  });

  it('produces different states for different seeds', () => {
    const a = createPrng(1);
    const b = createPrng(2);
    expect(a.s).not.toEqual(b.s);
  });
});

describe('nextFloat', () => {
  it('produces golden output sequence for seed 42', () => {
    const expected = [
      0.9912137037608773, 0.2961617140099406, 0.4880494561512023, 0.6134312842041254,
      0.0722450080793351, 0.8027467406354845, 0.11665430176071823, 0.8107217408251017,
      0.8094386181328446, 0.19368571927770972,
    ];
    let state = createPrng(42);
    for (const exp of expected) {
      let f: number;
      [state, f] = nextFloat(state);
      expect(f).toBe(exp);
    }
  });

  it('all outputs are in [0, 1)', () => {
    let state = createPrng(7);
    for (let i = 0; i < 10_000; i++) {
      let f: number;
      [state, f] = nextFloat(state);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('mean of 10k samples is close to 0.5', () => {
    let state = createPrng(99);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      let f: number;
      [state, f] = nextFloat(state);
      sum += f;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  it('two independent states from the same seed produce identical sequences', () => {
    let a = createPrng(42);
    let b = createPrng(42);
    for (let i = 0; i < 100; i++) {
      let fa: number;
      let fb: number;
      [a, fa] = nextFloat(a);
      [b, fb] = nextFloat(b);
      expect(fa).toBe(fb);
    }
  });

  it('advancing state does not mutate the original', () => {
    const original = createPrng(42);
    const sCopy = [...original.s];
    nextFloat(original);
    expect(original.s).toEqual(sCopy);
  });
});

describe('nextFloatRange', () => {
  it('all outputs are in [lo, hi)', () => {
    let state = createPrng(5);
    for (let i = 0; i < 1_000; i++) {
      let f: number;
      [state, f] = nextFloatRange(state, -10, 10);
      expect(f).toBeGreaterThanOrEqual(-10);
      expect(f).toBeLessThan(10);
    }
  });
});

describe('nextInt', () => {
  it('throws when hi < lo', () => {
    expect(() => nextInt(createPrng(1), 5, 3)).toThrow(RangeError);
  });

  it('all outputs are in [lo, hi] inclusive', () => {
    let state = createPrng(3);
    for (let i = 0; i < 1_000; i++) {
      let n: number;
      [state, n] = nextInt(state, 0, 9);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(9);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('covers the full range over many samples', () => {
    let state = createPrng(13);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      let n: number;
      [state, n] = nextInt(state, 0, 9);
      seen.add(n);
    }
    expect(seen.size).toBe(10);
  });
});
