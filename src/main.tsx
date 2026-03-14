import React, { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SIM_CONFIG } from './engine';
import type { SimConfig } from './engine';
import { useSimulation } from './hooks/useSimulation';
import { PriceChart } from './components/PriceChart';
import { PortfolioRace } from './components/PortfolioRace';
import { TradeFeed } from './components/TradeFeed';
import { AuditorPanel } from './components/AuditorPanel';
import { SimControls } from './components/SimControls';
import { RoundSummary } from './components/RoundSummary';

const PANEL_STYLE: React.CSSProperties = {
  background: '#13131f',
  borderRadius: 6,
  padding: 12,
  border: '1px solid #2a2a3e',
};

const LABEL: React.CSSProperties = {
  color: '#4fc3f7',
  fontFamily: 'monospace',
  fontSize: 12,
  fontWeight: 'bold',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 1,
  cursor: 'default',
};

const PANEL_TOOLTIPS: Record<string, string> = {
  'Price Chart':
    'Geometric Brownian Motion price series for each stock. Occasional shock events cause sharp moves. All agents see this history; only the Oracle sees N ticks ahead.',
  'Portfolio Race':
    "Each agent's total portfolio value (cash + open positions) over time. The Oracle is shown as a dashed line (★). Higher is better — rankings at round end determine survival in the genetic algorithm.",
  'Trade Feed':
    'Real-time log of executed trades. Green = buy, red = sell. Agents trade one stock per tick based on six weighted signals: momentum, mean reversion, volatility, relative strength, volume proxy, and peer copying.',
  'Auditor Panel':
    'Suspicion scores computed from the trade log each tick. Four signals (predictive correlation, win rate, timing clustering, behavioral fingerprint) combine into a composite score. The highest-scoring agent is accused at round end.',
};

function PanelLabel({ children }: { children: string }) {
  return (
    <div style={LABEL} title={PANEL_TOOLTIPS[children]}>
      {children}
      {PANEL_TOOLTIPS[children] && (
        <span style={{ color: '#444', fontSize: 10, marginLeft: 4, fontWeight: 'normal' }}>
          (?)
        </span>
      )}
    </div>
  );
}

function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG);
  const [speed, setSpeed] = useState(10);

  const sim = useSimulation(config, speed);

  const handleSpeedChange = useCallback((s: number) => {
    setSpeed(s);
  }, []);

  const handleConfigChange = useCallback((partial: Partial<SimConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const { state } = sim;
  const atRoundEnd = state.phase === 'roundEnd';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0d0d1a',
        color: '#eee',
        fontFamily: 'monospace',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ color: '#4fc3f7', margin: '0 0 12px', fontSize: 20, letterSpacing: 2 }}>
        STONKS — Multi-Agent Trading Simulation
      </h1>

      <div style={PANEL_STYLE}>
        <SimControls
          isRunning={sim.isRunning}
          start={sim.start}
          pause={sim.pause}
          reset={sim.reset}
          continueRound={sim.continueRound}
          speed={speed}
          onSpeedChange={handleSpeedChange}
          config={config}
          onConfigChange={handleConfigChange}
          phase={state.phase}
          tick={state.tick}
          round={state.round}
          generation={state.generation}
        />
      </div>

      {atRoundEnd && <RoundSummary state={state} onContinue={sim.continueRound} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={PANEL_STYLE}>
          <PanelLabel>Price Chart</PanelLabel>
          <PriceChart stocks={state.market.stocks} tick={state.tick} />
        </div>

        <div style={PANEL_STYLE}>
          <PanelLabel>Portfolio Race</PanelLabel>
          <PortfolioRace
            portfolioHistory={state.portfolioHistory}
            agents={state.agents}
            tick={state.tick}
          />
        </div>

        <div style={PANEL_STYLE}>
          <PanelLabel>Trade Feed</PanelLabel>
          <TradeFeed trades={state.tradeLog} maxVisible={30} />
        </div>

        <div style={PANEL_STYLE}>
          <PanelLabel>Auditor Panel</PanelLabel>
          <AuditorPanel auditorState={state.auditor} agents={state.agents} />
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No #root element found');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
