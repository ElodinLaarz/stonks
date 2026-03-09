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
