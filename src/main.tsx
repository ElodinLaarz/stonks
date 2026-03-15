import React, { StrictMode, useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SIM_CONFIG } from './engine';
import { makeAccusation } from './engine/auditor';
import type { SimConfig } from './engine';
import { useSimulation } from './hooks/useSimulation';
import { PriceChart } from './components/PriceChart';
import { PortfolioRace } from './components/PortfolioRace';
import { TradeFeed } from './components/TradeFeed';
import { AuditorPanel } from './components/AuditorPanel';
import { SimControls } from './components/SimControls';
import { GenerationSummary } from './components/GenerationSummary';
import { RoundHistoryPanel } from './components/RoundHistoryPanel';

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
    "Each agent's total portfolio value (cash + open positions) over time. The Oracle is shown as a dashed line (★). Higher is better — rankings at generation end determine survival in the genetic algorithm.",
  'Trade Feed':
    'Real-time log of executed trades. Green = buy, red = sell. Agents trade one stock per tick based on six weighted signals: momentum, mean reversion, volatility, relative strength, volume proxy, and peer copying.',
  'Auditor Panel':
    'Suspicion scores computed from the trade log each tick. Four signals (predictive correlation, win rate, timing clustering, behavioral fingerprint) combine into a composite score. The highest-scoring agent is accused at generation end.',
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
  const [displayRoundIndex, setDisplayRoundIndex] = useState(0);

  const sim = useSimulation(config, speed);

  const handleSpeedChange = useCallback((s: number) => {
    setSpeed(s);
  }, []);

  const handleConfigChange = useCallback((partial: Partial<SimConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setDisplayRoundIndex(0);
  }, []);

  const { state } = sim;
  const atGenerationEnd = state.phase === 'generationEnd';

  // Clamp displayRoundIndex in case roundsPerGeneration was reduced.
  const safeRoundIndex = Math.min(displayRoundIndex, state.rounds.length - 1);
  const displayRound = state.rounds[safeRoundIndex]!;

  const currentAccusation = useMemo(
    () => makeAccusation(displayRound.auditor),
    [displayRound.auditor],
  );

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
          continueGeneration={sim.continueGeneration}
          speed={speed}
          onSpeedChange={handleSpeedChange}
          config={config}
          onConfigChange={handleConfigChange}
          phase={state.phase}
          tick={state.tick}
          generation={state.generation}
          autoContinue={sim.autoContinue}
          onAutoContinueChange={sim.setAutoContinue}
        />
      </div>

      {atGenerationEnd && !sim.autoContinue && sim.generationSummary !== null && (
        <GenerationSummary summary={sim.generationSummary} onContinue={sim.continueGeneration} />
      )}

      {sim.generationHistory.length > 0 && (
        <div style={{ ...PANEL_STYLE, marginTop: 12 }}>
          <PanelLabel>Generation History</PanelLabel>
          <RoundHistoryPanel
            history={sim.generationHistory}
            startingCapital={config.startingCapital}
          />
        </div>
      )}

      {/* Round selector — only shown when there are multiple parallel rounds */}
      {state.rounds.length > 1 && (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 4,
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#555', fontSize: 11, marginRight: 4 }}>Viewing round:</span>
          {state.rounds.map((_, i) => (
            <button
              key={i}
              onClick={() => setDisplayRoundIndex(i)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontFamily: 'monospace',
                borderRadius: 3,
                border: `1px solid ${safeRoundIndex === i ? '#4fc3f7' : '#333'}`,
                background: safeRoundIndex === i ? '#1a1a2e' : 'transparent',
                color: safeRoundIndex === i ? '#eee' : '#666',
                cursor: 'pointer',
              }}
            >
              R{i + 1}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={PANEL_STYLE}>
          <PanelLabel>Price Chart</PanelLabel>
          <PriceChart stocks={displayRound.market.stocks} tick={state.tick} />
        </div>

        <div style={PANEL_STYLE}>
          <PanelLabel>Portfolio Race</PanelLabel>
          <PortfolioRace
            portfolioHistory={displayRound.portfolioHistory}
            agents={displayRound.agents}
            tick={state.tick}
          />
        </div>

        <div style={PANEL_STYLE}>
          <PanelLabel>Trade Feed</PanelLabel>
          <TradeFeed trades={displayRound.tradeLog} maxVisible={30} />
        </div>

        <div style={PANEL_STYLE}>
          <PanelLabel>Auditor Panel</PanelLabel>
          <AuditorPanel
            auditorState={displayRound.auditor}
            agents={displayRound.agents}
            currentAccusation={currentAccusation}
          />
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
