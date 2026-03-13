import type { Trade } from '../engine';

interface Props {
  trades: readonly Trade[];
  maxVisible?: number;
}

const ACTION_COLOR: Record<string, string> = {
  buy: '#81c784',
  sell: '#f06292',
  hold: '#aaa',
};

export function TradeFeed({ trades, maxVisible = 20 }: Props) {
  const visible = trades.slice(-maxVisible).reverse();
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11, overflowY: 'auto', maxHeight: 180 }}>
      {visible.length === 0 && <div style={{ color: '#555' }}>No trades yet.</div>}
      {visible.map((t, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: 6, padding: '1px 0', borderBottom: '1px solid #222' }}
        >
          <span style={{ color: '#555', minWidth: 36 }}>t{t.tick}</span>
          <span
            style={{ color: '#aaa', minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {t.agentId.slice(0, 8)}
          </span>
          <span style={{ color: ACTION_COLOR[t.action] ?? '#fff', minWidth: 32 }}>{t.action}</span>
          <span style={{ color: '#ddd', minWidth: 48 }}>{t.stockId.slice(0, 6)}</span>
          <span style={{ color: '#bbb' }}>
            {t.shares}@${t.price.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}
