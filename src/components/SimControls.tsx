import React, { useState, useEffect } from 'react';
import type { SimConfig } from '../engine';

interface Props {
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  continueGeneration: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  config: SimConfig;
  onConfigChange: (c: Partial<SimConfig>) => void;
  phase: string;
  tick: number;
  generation: number;
  autoContinue: boolean;
  onAutoContinueChange: (v: boolean) => void;
}

const PHASE_COLOR: Record<string, string> = {
  finished: '#f06292',
  running: '#81c784',
};

const BTN: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 13,
  fontWeight: 'bold',
};

const INPUT_BASE: React.CSSProperties = {
  background: '#222',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 3,
  padding: '2px 4px',
  fontFamily: 'monospace',
};

export function SimControls({
  isRunning,
  start,
  pause,
  reset,
  continueGeneration,
  speed,
  onSpeedChange,
  config,
  onConfigChange,
  phase,
  tick,
  generation,
  autoContinue,
  onAutoContinueChange,
}: Props) {
  const [agentsStr, setAgentsStr] = useState(String(config.numAgents));
  const [stocksStr, setStocksStr] = useState(String(config.numStocks));
  const [ticksStr, setTicksStr] = useState(String(config.numTicks));
  const [roundsStr, setRoundsStr] = useState(String(config.roundsPerGeneration));
  const [maxGensStr, setMaxGensStr] = useState(String(config.maxGenerations));
  const [cullStr, setCullStr] = useState(String(Math.round(config.replacementRate * 100)));

  useEffect(() => {
    setAgentsStr(String(config.numAgents));
    setStocksStr(String(config.numStocks));
    setTicksStr(String(config.numTicks));
    setRoundsStr(String(config.roundsPerGeneration));
    setMaxGensStr(String(config.maxGenerations));
    setCullStr(String(Math.round(config.replacementRate * 100)));
  }, [
    config.numAgents,
    config.numStocks,
    config.numTicks,
    config.roundsPerGeneration,
    config.maxGenerations,
    config.replacementRate,
  ]);

  const atGenerationEnd = phase === 'generationEnd';
  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '8px 0' }}
    >
      {atGenerationEnd && !autoContinue ? (
        <button
          style={{ ...BTN, background: '#4fc3f7', color: '#111' }}
          onClick={continueGeneration}
        >
          Continue →
        </button>
      ) : (
        <button
          style={{ ...BTN, background: isRunning ? '#555' : '#81c784', color: '#111' }}
          onClick={isRunning ? pause : start}
          disabled={phase === 'finished'}
        >
          {isRunning ? 'Pause' : 'Start'}
        </button>
      )}
      <button style={{ ...BTN, background: '#444', color: '#eee' }} onClick={reset}>
        Reset
      </button>
      <button
        style={{
          ...BTN,
          background: autoContinue ? '#7c4dff' : '#333',
          color: autoContinue ? '#fff' : '#aaa',
          border: '1px solid #555',
        }}
        onClick={() => onAutoContinueChange(!autoContinue)}
        title="When enabled, generations advance automatically without pausing"
      >
        {autoContinue ? 'No-Pause ●' : 'No-Pause ○'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ color: '#888', fontSize: 12 }}>Speed</label>
        <input
          type="range"
          min={1}
          max={200}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        />
        <span style={{ color: '#aaa', fontSize: 12, minWidth: 50 }}>{speed} t/s</span>
      </div>

      <div style={{ color: '#666', fontSize: 12 }}>
        <span style={{ marginRight: 12 }}>
          Tick <span style={{ color: '#aaa' }}>{tick}</span>
        </span>
        <span style={{ marginRight: 12 }}>
          Gen <span style={{ color: '#aaa' }}>{generation}</span>
        </span>
        <span
          style={{
            color: PHASE_COLOR[phase] ?? '#ffb74d',
          }}
        >
          [{phase}]
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ color: '#888', fontSize: 12 }}>Agents</label>
        <input
          type="number"
          min={2}
          max={100}
          value={agentsStr}
          style={{ ...INPUT_BASE, width: 50 }}
          onChange={(e) => {
            setAgentsStr(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 2 && v <= 100) onConfigChange({ numAgents: v });
          }}
          onBlur={() => setAgentsStr(String(config.numAgents))}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Stocks</label>
        <input
          type="number"
          min={1}
          max={100}
          value={stocksStr}
          style={{ ...INPUT_BASE, width: 50 }}
          onChange={(e) => {
            setStocksStr(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 100) onConfigChange({ numStocks: v });
          }}
          onBlur={() => setStocksStr(String(config.numStocks))}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Ticks/Gen</label>
        <input
          type="number"
          min={10}
          max={10000}
          step={10}
          value={ticksStr}
          style={{ ...INPUT_BASE, width: 70 }}
          onChange={(e) => {
            setTicksStr(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 10 && v <= 10000) onConfigChange({ numTicks: v });
          }}
          onBlur={() => setTicksStr(String(config.numTicks))}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Rounds/Gen</label>
        <input
          type="number"
          min={1}
          max={20}
          value={roundsStr}
          style={{ ...INPUT_BASE, width: 50 }}
          onChange={(e) => {
            setRoundsStr(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 20)
              onConfigChange({ roundsPerGeneration: v });
          }}
          onBlur={() => setRoundsStr(String(config.roundsPerGeneration))}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Max Gens</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={maxGensStr}
          style={{ ...INPUT_BASE, width: 60 }}
          onChange={(e) => {
            setMaxGensStr(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 1000) onConfigChange({ maxGenerations: v });
          }}
          onBlur={() => setMaxGensStr(String(config.maxGenerations))}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Cull%</label>
        <input
          type="number"
          min={1}
          max={99}
          step={1}
          value={cullStr}
          style={{ ...INPUT_BASE, width: 50 }}
          onChange={(e) => {
            setCullStr(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 99)
              onConfigChange({ replacementRate: v / 100 });
          }}
          onBlur={() => setCullStr(String(Math.round(config.replacementRate * 100)))}
        />
      </div>
    </div>
  );
}
