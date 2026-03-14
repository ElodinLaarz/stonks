import { useRef, useEffect } from 'react';
import type { Agent } from '../engine';
import { AGENT_COLORS } from './agentColors';

interface Props {
  portfolioHistory: ReadonlyMap<string, readonly number[]>;
  agents: readonly Agent[];
  tick: number;
}

const COLORS = AGENT_COLORS;

export function PortfolioRace({ portfolioHistory, agents, tick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    // Scale canvas buffer to device pixel ratio to eliminate blur on HiDPI screens
    const dpr = window.devicePixelRatio ?? 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);

    const width = cssW;
    const height = cssH;
    ctx.clearRect(0, 0, width, height);

    // Gather all series
    const series = agents.map((a) => ({
      id: a.id,
      isOracle: a.isOracle,
      values: portfolioHistory.get(a.id) ?? [],
    }));

    const maxLen = Math.max(...series.map((s) => s.values.length), 1);
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
    if (minVal === Infinity) {
      minVal = 0;
      maxVal = 10000;
    }
    if (minVal === maxVal) {
      maxVal = minVal + 1;
    }

    const pad = { top: 10, right: 10, bottom: 20, left: 60 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    // Axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const val = minVal + (maxVal - minVal) * (i / 3);
      const y = pad.top + chartH - (chartH * i) / 3;
      ctx.fillText(`$${(val / 1000).toFixed(1)}k`, pad.left - 4, y + 3);
    }

    ctx.textAlign = 'center';
    ctx.fillText(`Tick ${tick}`, pad.left + chartW / 2, height - 2);

    for (let ai = 0; ai < series.length; ai++) {
      const s = series[ai]!;
      if (s.values.length < 2) continue;
      ctx.strokeStyle = COLORS[ai % COLORS.length]!;
      ctx.lineWidth = s.isOracle ? 2.5 : 1.5;
      ctx.setLineDash(s.isOracle ? [4, 3] : []);
      ctx.beginPath();
      for (let i = 0; i < s.values.length; i++) {
        const x = pad.left + (i / Math.max(maxLen - 1, 1)) * chartW;
        const y = pad.top + chartH - ((s.values[i]! - minVal) / (maxVal - minVal)) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [portfolioHistory, agents, tick]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '160px',
          background: '#1a1a2e',
          borderRadius: 4,
        }}
      />
      {/* HTML legend so names are always crisp and don't crowd the chart */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 5 }}>
        {agents.map((a, ai) => (
          <span
            key={a.id}
            title={
              a.isOracle
                ? 'Oracle agent (has lookahead into future prices)'
                : 'Regular trading agent'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontFamily: 'monospace',
              color: '#aaa',
              cursor: 'default',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 20,
                height: 3,
                background: COLORS[ai % COLORS.length],
                borderRadius: 1,
                // Mirror oracle dashed style
                ...(a.isOracle
                  ? { background: 'none', borderTop: `2px dashed ${COLORS[ai % COLORS.length]}` }
                  : {}),
              }}
            />
            {a.id.slice(0, 10)}
            {a.isOracle && <span style={{ color: '#ffb74d' }}> ★</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
