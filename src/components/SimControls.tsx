import React from 'react';
import type { SimConfig } from '../engine';

interface Props {
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  config: SimConfig;
  onConfigChange: (c: Partial<SimConfig>) => void;
  phase: string;
  tick: number;
  round: number;
  generation: number;
}

const BTN: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 13,
  fontWeight: 'bold',
};

export function SimControls({
  isRunning,
  start,
  pause,
  reset,
  speed,
  onSpeedChange,
  config,
  onConfigChange,
  phase,
  tick,
  round,
  generation,
}: Props) {
  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '8px 0' }}
    >
      <button
        style={{ ...BTN, background: isRunning ? '#555' : '#81c784', color: '#111' }}
        onClick={isRunning ? pause : start}
        disabled={phase === 'finished'}
      >
        {isRunning ? 'Pause' : 'Start'}
      </button>
      <button style={{ ...BTN, background: '#444', color: '#eee' }} onClick={reset}>
        Reset
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
          Round <span style={{ color: '#aaa' }}>{round}</span>
        </span>
        <span style={{ marginRight: 12 }}>
          Gen <span style={{ color: '#aaa' }}>{generation}</span>
        </span>
        <span
          style={{
            color: phase === 'finished' ? '#f06292' : phase === 'running' ? '#81c784' : '#ffb74d',
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
          max={10}
          value={config.numAgents}
          style={{
            width: 50,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 3,
            padding: '2px 4px',
            fontFamily: 'monospace',
          }}
          onChange={(e) => onConfigChange({ numAgents: Number(e.target.value) })}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Stocks</label>
        <input
          type="number"
          min={1}
          max={10}
          value={config.numStocks}
          style={{
            width: 50,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 3,
            padding: '2px 4px',
            fontFamily: 'monospace',
          }}
          onChange={(e) => onConfigChange({ numStocks: Number(e.target.value) })}
        />
        <label style={{ color: '#888', fontSize: 12 }}>Ticks/Round</label>
        <input
          type="number"
          min={10}
          max={500}
          step={10}
          value={config.numTicks}
          style={{
            width: 60,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            borderRadius: 3,
            padding: '2px 4px',
            fontFamily: 'monospace',
          }}
          onChange={(e) => onConfigChange({ numTicks: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
