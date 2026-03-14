import { useRef, useEffect } from 'react';
import type { Agent } from '../engine';

interface Props {
  portfolioHistory: ReadonlyMap<string, readonly number[]>;
  agents: readonly Agent[];
  tick: number;
}

const COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8', '#80cbc4'];

export function PortfolioRace({ portfolioHistory, agents, tick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const { width, height } = canvas;
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
      if (s.isOracle) {
        ctx.setLineDash([4, 3]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      for (let i = 0; i < s.values.length; i++) {
        const x = pad.left + (i / (maxLen - 1)) * chartW;
        const y = pad.top + chartH - ((s.values[i]! - minVal) / (maxVal - minVal)) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [portfolioHistory, agents, tick]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={180}
      style={{ width: '100%', height: '180px', background: '#1a1a2e', borderRadius: 4 }}
    />
  );
}
