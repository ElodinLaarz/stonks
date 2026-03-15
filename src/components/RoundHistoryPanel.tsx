import React, { useState } from 'react';
import type { RoundSummaryData } from '../hooks/useSimulation';
import { THEME } from './agentColors';

interface Props {
  history: readonly RoundSummaryData[];
}

const PANEL: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
};

const ROW_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px',
  cursor: 'pointer',
  borderBottom: '1px solid #1e1e30',
  userSelect: 'none',
};

const BADGE: React.CSSProperties = {
  fontSize: 10,
  padding: '1px 5px',
  borderRadius: 3,
  fontWeight: 'bold',
};

function RoundRow({ summary, index }: { summary: RoundSummaryData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { round, generation, accusedId, oracleId, oracleCaught, rankedAgents, replacedAgentIds } =
    summary;

  const winner = rankedAgents[0];
  const oracleWon = !oracleCaught && winner?.agentId === oracleId;

  return (
    <div>
      <div
        style={{
          ...ROW_BASE,
          background: index % 2 === 0 ? '#0f0f1e' : '#12121f',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ color: '#555', minWidth: 24, textAlign: 'right' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ color: '#666', minWidth: 56 }}>
          G{generation} R{round}
        </span>
        <span
          style={{
            color: '#aaa',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          🏆 {winner?.agentId ?? '—'}
        </span>
        {oracleCaught ? (
          <span style={{ ...BADGE, background: THEME.success + '33', color: THEME.success }}>
            CAUGHT
          </span>
        ) : oracleWon ? (
          <span style={{ ...BADGE, background: THEME.danger + '33', color: THEME.danger }}>
            ORACLE WIN
          </span>
        ) : (
          <span style={{ ...BADGE, background: '#33333366', color: '#666' }}>escaped</span>
        )}
        <span style={{ color: '#444', minWidth: 50, textAlign: 'right' }}>
          −{replacedAgentIds.length} culled
        </span>
      </div>

      {expanded && (
        <div
          style={{
            background: '#0a0a18',
            padding: '6px 12px 8px 36px',
            borderBottom: '1px solid #222',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          <div style={{ color: '#555', marginBottom: 4 }}>
            Oracle: <span style={{ color: '#aaa' }}>{oracleId}</span>
            {'  '}Accused:{' '}
            <span style={{ color: accusedId === oracleId ? THEME.success : THEME.danger }}>
              {accusedId ?? 'none'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rankedAgents.map((entry, rank) => {
              const isCulled = replacedAgentIds.includes(entry.agentId);
              const isOrc = entry.agentId === oracleId;
              return (
                <div
                  key={entry.agentId}
                  style={{
                    display: 'flex',
                    gap: 8,
                    opacity: isCulled ? 0.45 : 1,
                    textDecoration: isCulled ? 'line-through' : 'none',
                    color: isOrc ? THEME.warning : '#aaa',
                  }}
                >
                  <span style={{ color: '#444', minWidth: 20, textAlign: 'right' }}>
                    #{rank + 1}
                  </span>
                  <span style={{ flex: 1 }}>
                    {entry.agentId}
                    {isOrc && ' ★'}
                  </span>
                  <span style={{ color: '#666' }}>
                    ${entry.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  {isCulled && <span style={{ color: '#555', fontSize: 10 }}>[culled]</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function RoundHistoryPanel({ history }: Props) {
  if (history.length === 0) {
    return (
      <div style={{ ...PANEL, color: '#444', padding: '8px 0' }}>No rounds completed yet.</div>
    );
  }

  // Display newest first
  const reversed = [...history].reverse();

  return (
    <div style={PANEL}>
      <div
        style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #1e1e30', borderRadius: 4 }}
      >
        {reversed.map((summary, i) => (
          <RoundRow key={`g${summary.generation}r${summary.round}`} summary={summary} index={i} />
        ))}
      </div>
    </div>
  );
}
