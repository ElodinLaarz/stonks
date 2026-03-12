/**
 * Seeded PRNG — Xoshiro128+ with immutable state threading.
 *
 * State is an opaque value type, not a class. Every function returns a new
 * state so callers can fork a copy (e.g. Oracle lookahead) without aliasing.
 *
 * Reference: https://prng.di.unimi.it/xoshiro128plus.c
 */

export interface PrngState {
  readonly s: readonly [number, number, number, number];
}

/**
 * SplitMix32 single step — advances the seed by the golden-ratio constant and
 * returns [nextSeed, mixedOutput]. Threading the seed (rather than re-hashing
 * the previous output) avoids correlation between consecutive state words.
 */
function splitMix32Step(seed: number): [number, number] {
  const next = (seed + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return [next, (z ^ (z >>> 16)) >>> 0];
}

/**
 * Public single-output variant for external callers (e.g. tests that need a
 * deterministic hash of a number). Not used for seeding internally.
 */
export function splitMix32(seed: number): number {
  return splitMix32Step(seed >>> 0)[1];
}

/** Create a new PRNG from a 32-bit integer seed. */
export function createPrng(seed: number): PrngState {
  const seed0 = seed >>> 0;
  const [seed1, s0] = splitMix32Step(seed0);
  const [seed2, s1] = splitMix32Step(seed1);
  const [seed3, s2] = splitMix32Step(seed2);
  const [, s3] = splitMix32Step(seed3);
  return { s: [s0, s1, s2, s3] };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Advance one step. Returns [newState, uint32 in [0, 2^32)]. */
export function nextUint32(state: PrngState): [PrngState, number] {
  const [s0, s1, s2, s3] = state.s;
  const result = (s0 + s3) >>> 0;
  const t = (s1 << 9) >>> 0;

  const ns2 = (s2 ^ s0) >>> 0;
  const ns3 = (s3 ^ s1) >>> 0;
  const ns1 = (s1 ^ ns2) >>> 0;
  const ns0 = (s0 ^ ns3) >>> 0;

  return [{ s: [ns0, ns1, (ns2 ^ t) >>> 0, rotl(ns3, 11)] }, result];
}

/** Returns [newState, float in [0, 1)]. */
export function nextFloat(state: PrngState): [PrngState, number] {
  const [newState, u32] = nextUint32(state);
  return [newState, u32 / 4294967296]; // divide by 2^32
}

/** Returns [newState, float in [lo, hi)]. */
export function nextFloatRange(state: PrngState, lo: number, hi: number): [PrngState, number] {
  const [newState, f] = nextFloat(state);
  return [newState, lo + f * (hi - lo)];
}

/**
 * Returns [newState, integer in [lo, hi] inclusive].
 *
 * Uses rejection sampling to eliminate modulo bias: draws are discarded if
 * they fall in the remainder region that would over-represent low values.
 * The loop iterates at most twice on average for any range size.
 */
export function nextInt(state: PrngState, lo: number, hi: number): [PrngState, number] {
  if (
    !Number.isFinite(lo) ||
    !Number.isFinite(hi) ||
    !Number.isSafeInteger(lo) ||
    !Number.isSafeInteger(hi)
  ) {
    throw new RangeError(`nextInt: lo (${lo}) and hi (${hi}) must be finite safe integers`);
  }
  if (hi < lo) {
    throw new RangeError(`nextInt: hi (${hi}) must be >= lo (${lo})`);
  }
  const span = hi - lo + 1;
  if (span > 0x100000000) {
    throw new RangeError(`nextInt: range size (hi - lo + 1 = ${span}) must be <= 0x100000000`);
  }
  // Largest multiple of span that fits in [0, 2^32): values >= limit are rejected.
  const limit = Math.floor(0x100000000 / span) * span;
  let p = state;
  for (;;) {
    let u32: number;
    [p, u32] = nextUint32(p);
    if (u32 < limit) {
      return [p, lo + (u32 % span)];
    }
  }
}
