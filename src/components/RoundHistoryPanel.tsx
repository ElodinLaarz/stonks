import React, { useState, useMemo } from 'react';
import type { GenerationSummaryData } from '../hooks/useSimulation';
import { THEME } from './agentColors';

interface Props {
  history: readonly GenerationSummaryData[];
  startingCapital: number;
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

function GenerationRow({ summary, index }: { summary: GenerationSummaryData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { generation, rounds, replacedAgentIds } = summary;

  // Aggregate outcomes across all parallel rounds
  const caughtLeadingCount = rounds.filter((r) => r.oracleCaught && r.oracleWasLeading).length;
  const caughtTrailingCount = rounds.filter((r) => r.oracleCaught && !r.oracleWasLeading).length;
  const caughtCount = caughtLeadingCount + caughtTrailingCount;
  const wonCount = rounds.filter((r) => r.oracleWon).length;
  const escapedCount = rounds.length - caughtCount - wonCount;

  // Best agent across all rounds by portfolio value
  const bestEntry = useMemo(() => {
    let best: { agentId: string; value: number; roundIndex: number } | null = null;
    for (const r of rounds) {
      const winner = r.rankedAgents[0];
      if (!winner) continue;
      if (r.oracleCaught && winner.agentId === r.oracleId) continue;
      if (best === null || winner.value > best.value) {
        best = { agentId: winner.agentId, value: winner.value, roundIndex: r.roundIndex };
      }
    }
    return best;
  }, [rounds]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        style={{ ...ROW_BASE, background: index % 2 === 0 ? '#0f0f1e' : '#12121f' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ color: '#555', minWidth: 24, textAlign: 'right' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ color: '#666', minWidth: 40 }}>G{generation}</span>
        <span
          style={{
            color: '#aaa',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bestEntry ? `🏆 ${bestEntry.agentId}` : '—'}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <span
            title="Caught while leading"
            style={{
              ...BADGE,
              background: THEME.warning + '22',
              color: caughtLeadingCount > 0 ? THEME.warning : '#444',
            }}
          >
            ✓★{caughtLeadingCount}
          </span>
          <span
            title="Caught while not leading"
            style={{
              ...BADGE,
              background: THEME.success + '22',
              color: caughtTrailingCount > 0 ? THEME.success : '#444',
            }}
          >
            ✓{caughtTrailingCount}
          </span>
          <span
            title="Oracle won (escaped and finished first)"
            style={{
              ...BADGE,
              background: THEME.danger + '22',
              color: wonCount > 0 ? THEME.danger : '#444',
            }}
          >
            ★{wonCount}
          </span>
          <span
            title="Oracle escaped without winning"
            style={{ ...BADGE, background: '#22222266', color: escapedCount > 0 ? '#888' : '#444' }}
          >
            ~{escapedCount}
          </span>
        </span>
        <span style={{ color: '#444', minWidth: 50, textAlign: 'right' }}>
          −{replacedAgentIds.length} culled
        </span>
      </button>

      {expanded && (
        <div
          style={{
            background: '#0a0a18',
            padding: '6px 12px 8px 36px',
            borderBottom: '1px solid #222',
          }}
        >
          {rounds.map((r) => (
            <div key={r.roundIndex} style={{ marginBottom: 6 }}>
              <div style={{ color: '#555', fontSize: 10, marginBottom: 2 }}>
                Round {r.roundIndex + 1} — Oracle:{' '}
                <span style={{ color: '#aaa' }}>{r.oracleId.slice(0, 14)}</span>
                {'  '}Accused:{' '}
                <span style={{ color: r.accusedId === r.oracleId ? THEME.success : THEME.danger }}>
                  {r.accusedId?.slice(0, 14) ?? 'none'}
                </span>
                {'  '}
                {r.oracleCaught ? (
                  <span style={{ color: THEME.success }}>CAUGHT</span>
                ) : r.oracleWon ? (
                  <span style={{ color: THEME.danger }}>ORACLE WIN</span>
                ) : (
                  <span style={{ color: '#555' }}>escaped</span>
                )}
              </div>
              <div
                style={{
                  maxHeight: 120,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {r.rankedAgents.slice(0, 5).map((entry, rank) => {
                  const isOrc = entry.agentId === r.oracleId;
                  return (
                    <div
                      key={entry.agentId}
                      style={{
                        display: 'flex',
                        gap: 8,
                        color: isOrc ? THEME.warning : '#aaa',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: '#444', minWidth: 20, textAlign: 'right' }}>
                        #{rank + 1}
                      </span>
                      <span style={{ flex: 1 }}>
                        {entry.agentId.slice(0, 16)}
                        {isOrc && ' ★'}
                      </span>
                      <span style={{ color: '#666' }}>
                        ${entry.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RoundHistoryPanel({ history, startingCapital }: Props) {
  const reversed = useMemo(() => [...history].reverse(), [history]);

  const allTimeBest = useMemo(() => {
    let best: { agentId: string; value: number; generation: number } | null = null;
    for (const summary of history) {
      for (const r of summary.rounds) {
        const winner = r.rankedAgents[0];
        if (!winner) continue;
        if (r.oracleCaught && winner.agentId === r.oracleId) continue;
        if (best === null || winner.value > best.value) {
          best = { agentId: winner.agentId, value: winner.value, generation: summary.generation };
        }
      }
    }
    return best;
  }, [history]);

  if (reversed.length === 0) {
    return (
      <div style={{ ...PANEL, color: '#444', padding: '8px 0' }}>No generations completed yet.</div>
    );
  }

  return (
    <div style={PANEL}>
      {allTimeBest !== null && (
        <div
          style={{
            marginBottom: 8,
            padding: '6px 10px',
            background: '#0f0f1e',
            border: '1px solid #2a2a3e',
            borderRadius: 4,
            fontSize: 11,
            display: 'flex',
            gap: 16,
            alignItems: 'baseline',
          }}
        >
          <span
            style={{ color: '#555', textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}
          >
            All-time best
          </span>
          <span style={{ color: THEME.warning, fontWeight: 'bold' }}>{allTimeBest.agentId}</span>
          <span style={{ color: '#81c784' }}>
            +$
            {(allTimeBest.value - startingCapital).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </span>
          <span style={{ color: '#444' }}>G{allTimeBest.generation}</span>
        </div>
      )}
      <div
        style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #1e1e30', borderRadius: 4 }}
      >
        {reversed.map((summary, i) => (
          <GenerationRow key={`g${summary.generation}`} summary={summary} index={i} />
        ))}
      </div>
    </div>
  );
}
