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
};

function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG);
  const [speed, setSpeed] = useState(10);

  const sim = useSimulation(config, speed);

  const handleSpeedChange = useCallback((s: number) => {
    setSpeed(s);
  }, []);

  const handleConfigChange = useCallback(
    (partial: Partial<SimConfig>) => {
      const next = { ...config, ...partial };
      setConfig(next);
      sim.reset();
    },
    [config, sim],
  );

  const { state } = sim;

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={PANEL_STYLE}>
          <div style={LABEL}>Price Chart</div>
          <PriceChart stocks={state.market.stocks} tick={state.tick} />
        </div>

        <div style={PANEL_STYLE}>
          <div style={LABEL}>Portfolio Race</div>
          <PortfolioRace
            portfolioHistory={state.portfolioHistory}
            agents={state.agents}
            tick={state.tick}
          />
        </div>

        <div style={PANEL_STYLE}>
          <div style={LABEL}>Trade Feed</div>
          <TradeFeed trades={state.tradeLog} maxVisible={30} />
        </div>

        <div style={PANEL_STYLE}>
          <div style={LABEL}>Auditor Panel</div>
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
