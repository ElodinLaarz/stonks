import { useRef, useEffect } from 'react';
import type { Stock } from '../engine';

interface Props {
  stocks: readonly Stock[];
  tick: number;
}

const COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ce93d8'];

export function PriceChart({ stocks, tick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    // Scale canvas buffer to device pixel ratio to eliminate blur on HiDPI screens.
    // Only resize the backing store when physical dimensions change — resizing resets
    // the canvas and is expensive; setTransform is absolute so it never accumulates.
    const dpr = window.devicePixelRatio ?? 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW;
      canvas.height = physH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = cssW;
    const height = cssH;
    ctx.clearRect(0, 0, width, height);

    if (stocks.length === 0) return;

    // Compute global min/max price across all stocks and bars
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const stock of stocks) {
      for (const bar of stock.bars) {
        if (bar.close < minPrice) minPrice = bar.close;
        if (bar.close > maxPrice) maxPrice = bar.close;
      }
    }
    if (minPrice === Infinity) {
      minPrice = 0;
      maxPrice = 1;
    }
    if (minPrice === maxPrice) {
      maxPrice = minPrice + 1;
    }

    const pad = { top: 10, right: 10, bottom: 30, left: 50 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const price = minPrice + (maxPrice - minPrice) * (i / 4);
      const y = pad.top + chartH - (chartH * i) / 4;
      ctx.fillText(price.toFixed(0), pad.left - 4, y + 3);
    }

    // Max bars to show (use the longest stock's bars count)
    const maxBars = Math.max(...stocks.map((s) => s.bars.length));

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText(`Tick ${tick}`, pad.left + chartW / 2, height - 4);

    // Draw each stock line
    for (let si = 0; si < stocks.length; si++) {
      const stock = stocks[si]!;
      if (stock.bars.length < 2) continue;
      ctx.strokeStyle = COLORS[si % COLORS.length]!;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < stock.bars.length; i++) {
        const bar = stock.bars[i]!;
        const x = pad.left + (i / Math.max(maxBars - 1, 1)) * chartW;
        const y = pad.top + chartH - ((bar.close - minPrice) / (maxPrice - minPrice)) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Legend (above tick label)
    ctx.textAlign = 'left';
    let legendX = pad.left;
    for (let si = 0; si < stocks.length; si++) {
      const stock = stocks[si]!;
      const legendY = height - 16;
      ctx.fillStyle = COLORS[si % COLORS.length]!;
      ctx.fillRect(legendX, legendY - 8, 10, 8);
      ctx.fillStyle = '#aaa';
      ctx.fillText(stock.name, legendX + 14, legendY);
      legendX += 14 + Math.ceil(ctx.measureText(stock.name).width) + 8;
    }
  }, [stocks, tick]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '200px',
        background: '#1a1a2e',
        borderRadius: 4,
      }}
    />
  );
}
