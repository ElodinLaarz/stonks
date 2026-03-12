# stonks

A browser-based multi-agent stock trading simulation with an evolutionary twist.

## Overview

A set of AI trading agents compete in a live market where one hidden agent — the **Oracle** — has access to future price data. A non-trading **Auditor** watches all trades in real time and attempts to identify which agent holds insider knowledge.

The simulation runs a genetic algorithm across trading agents, allowing profitable strategies to survive and evolve over generations. This creates an emergent ecosystem of strategies where the Oracle tries to maximize profit without being detected, while the Auditor performs behavioral forensics on the trade log.

## Features

- **Simulated Market:** Live stock price generation via geometric Brownian motion.
- **Genetic Algorithm:** Strategy evolution through natural selection, mutation, and culling.
- **Asymmetric Information:** A hidden "Oracle" agent balances profit-seeking against concealment.
- **Auditor Analytics:** Real-time behavioral forensics to detect insider trading.
- **Client-Side Engine:** Tick-based simulation engine running entirely in the browser (TypeScript).

## Current Implementation Status

**Phase 0: Project Scaffolding — complete**

- ✅ Toolchain: Vite, TypeScript 5.x (strict), ESLint 9.x flat config, Prettier, Husky + lint-staged.
- ✅ Testing: Vitest + React Testing Library configured; pre-push hook runs typecheck + tests.
- ✅ Directory structure: `src/engine/`, `src/components/`, `src/hooks/`, `src/store/`.

**Phase 1: Core Engine (in progress)**

- ✅ Domain types (`src/engine/types.ts`): `PriceBar`, `Stock`, `MarketState`, `SimConfig`, `DEFAULT_SIM_CONFIG`.
- ✅ Seeded PRNG (`src/engine/prng.ts`): Xoshiro128+ with immutable state threading; `createPrng`, `nextUint32`, `nextFloat`, `nextFloatRange`, `nextInt` (rejection-sampled, safe-integer validated).
- ✅ Market engine (`src/engine/market.ts`): GBM price model with configurable per-stock drift/volatility, shock events, OHLC bars, constant PRNG advancement per tick.
- ✅ 35 tests passing; determinism verified with golden-output and full-state equality checks.

_Next Up: Agent genomes and trading logic (`src/engine/agent.ts`)_
