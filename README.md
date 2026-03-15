# stonks

A browser-based multi-agent stock trading simulation with an evolutionary twist.

## Overview

A set of AI trading agents compete in a live market where one hidden agent — the **Oracle** — has access to future price data. A non-trading **Auditor** watches all trades in real time and attempts to identify which agent holds insider knowledge.

The simulation runs a genetic algorithm across trading agents, allowing profitable strategies to survive and evolve over generations. This creates an emergent ecosystem of strategies where the Oracle tries to maximize profit without being detected, while the Auditor performs behavioral forensics on the trade log.

## Features

- **Simulated Market:** Live stock price generation via geometric Brownian motion with configurable volatility, drift, and shock events.
- **Genetic Algorithm:** Strategy evolution through natural selection, mutation, and uniform crossover across generations.
- **Asymmetric Information:** A hidden Oracle agent balances profit-seeking against concealment via noise injection and delay jitter.
- **Auditor Analytics:** Real-time behavioral forensics (predictive correlation, win rate, timing clustering, behavioral fingerprint) to detect insider trading.
- **Client-Side Engine:** Fully deterministic tick-based simulation engine running in the browser; reproducible from a seed.

## Quick Start

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173
npm run test:run   # Run all tests (101)
npm run build      # Production build
```

## Current Implementation Status

### Phase 0 — Scaffolding ✅

- Vite 5 + TypeScript 5 (strict), ESLint 9 flat config, Prettier 3
- Vitest + React Testing Library; Husky pre-push hook (typecheck + tests)
- Directory structure: `src/engine/`, `src/components/`, `src/hooks/`

### Phase 1 — Core Engine ✅

| Module               | Description                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/types.ts`    | All domain types — single source of truth                                                                                                                                                                                        |
| `engine/prng.ts`     | Xoshiro128+ seeded PRNG; immutable state threading; `nextFloat`, `nextInt`                                                                                                                                                       |
| `engine/market.ts`   | GBM price model; OHLC bars; configurable shock events                                                                                                                                                                            |
| `engine/agent.ts`    | 6-signal genome (momentum, mean reversion, volatility, relative strength, volume proxy, peer copying); `selectAndDecide` draws `volumeNoise` once for consistent stock selection and action evaluation; immutable `executeTrade` |
| `engine/oracle.ts`   | PRNG-forked lookahead; delay jitter queue; noise gate delegates to `selectAndDecide` to match regular-agent behavior                                                                                                             |
| `engine/auditor.ts`  | Incremental suspicion scoring (only agents with new trades are rescored per tick); `makeAccusation` at round end                                                                                                                 |
| `engine/genetics.ts` | Cull bottom quartile; uniform crossover via `pickFrom`; per-gene mutation via `maybeMutateNumber`; deterministic agent ID generation from PRNG                                                                                   |
| `engine/gameLoop.ts` | `createGameState` / `tickGame` / `resolveRound` / `resolveGeneration`; phase FSM: `running → roundEnd → generationEnd → finished`; `tradeLog` and `portfolioHistory` append in-place within a round (O(1) per tick)              |

**101 tests passing.** Determinism verified: fixed-seed runs produce identical output.

### Phase 2 — React Visualization ✅

| Module                         | Description                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useSimulation.ts`       | RAF loop; batches up to 50 ticks/frame; pauses at `roundEnd` for summary display; auto-resolves `generationEnd`; resets on config change                              |
| `components/PriceChart.tsx`    | Canvas multi-line chart of all stock close prices; dynamic legend spacing                                                                                             |
| `components/PortfolioRace.tsx` | Canvas portfolio value per agent over time; oracle shown dashed                                                                                                       |
| `components/TradeFeed.tsx`     | Color-coded scrolling trade log (most recent first); stable React keys                                                                                                |
| `components/AuditorPanel.tsx`  | Per-agent suspicion bars (predictive correlation, win rate, timing clustering, behavioral fingerprint) with composite indicator; accusation highlight after round end |
| `components/SimControls.tsx`   | Start/Pause/Reset, speed slider (1–200 t/s), agents/stocks/ticks config inputs                                                                                        |
| `main.tsx`                     | 2-column dark-theme grid layout                                                                                                                                       |

---

## Proposed Next Steps

### Near-term: close gaps in the current implementation

- **`risk_tolerance` gene is unused** — it's carried in the genome and evolved but never referenced in signal computation. Wire it into `executeTrade` as a stop-loss threshold, or remove it if the design has changed.
- **Oracle concealment genome doesn't evolve** — `concealmentGenome` is initialized to `DEFAULT_CONCEALMENT_GENOME` for all agents and is not mutated by the GA. Either add it to the mutation/crossover cycle or document the decision.
- **No component tests** — `src/components/__tests__/` is empty. Add React Testing Library tests for at least `AuditorPanel` and `TradeFeed` mocking `useSimulation`.
- **No generation log** — the design calls for a timeline of evolution events (who was culled, mutations applied). Currently `resolveGeneration` is silent.

### Medium-term: Phase 3 features

- **Evolved auditor** — replace the rule-based composite scoring with a parameterized weight vector that the GA can tune, creating an arms-race dynamic between Oracle concealment and Auditor detection.
- **Oracle concealment evolution** — include `concealmentGenome` fields in the mutation/crossover cycle so Oracle behavior adapts across generations.
- **Oracle Reveal panel** — dedicated end-of-round view showing who was accused, whether it was correct, and the Oracle's unmasked trade history overlaid on suspicion scores.
- **Shareable seed links** — encode `SimConfig.seed` in the URL query string so any run can be replayed exactly.

### Longer-term

- **Performance at scale** — profile 100-agent / 1000-tick simulations; consider a Web Worker for the tick loop to keep the UI thread free.
- **Golang backend (Phase 6)** — migrate the engine to a Go server with HTMX for multiplayer / server-authoritative runs as described in `design.md`.
