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
 * SplitMix32 — expands a single 32-bit seed into one uint32 output.
 * Used internally to initialize the four Xoshiro128+ state words.
 */
export function splitMix32(seed: number): number {
  let z = (seed + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/** Create a new PRNG from a 32-bit integer seed. */
export function createPrng(seed: number): PrngState {
  const s0 = splitMix32(seed >>> 0);
  const s1 = splitMix32(s0);
  const s2 = splitMix32(s1);
  const s3 = splitMix32(s2);
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

/** Returns [newState, integer in [lo, hi] inclusive]. */
export function nextInt(state: PrngState, lo: number, hi: number): [PrngState, number] {
  const [newState, f] = nextFloat(state);
  return [newState, Math.min(hi, Math.floor(lo + f * (hi - lo + 1)))];
}
