import React, { useState } from 'react';
import type { GenerationSummaryData, PerRoundSummary } from '../hooks/useSimulation';
import { AGENT_COLORS, THEME } from './agentColors';

interface Props {
  summary: GenerationSummaryData;
  onContinue: () => void;
}

function RoundTab({ round, replacedSet }: { round: PerRoundSummary; replacedSet: Set<string> }) {
  const { accusedId, oracleId, oracleCaught, oracleWon, rankedAgents } = round;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
        {/* Rankings */}
        <div>
          <div
            style={{
              color: '#666',
              fontSize: 10,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Final Rankings
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {rankedAgents.map(({ agentId, value, originalIndex, isOracle }, i) => {
              const isReplaced = replacedSet.has(agentId);
              const agentColor = isReplaced
                ? '#444'
                : AGENT_COLORS[originalIndex % AGENT_COLORS.length]!;
              return (
                <div
                  key={agentId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '2px 0',
                    fontSize: 11,
                    opacity: isReplaced ? 0.5 : 1,
                  }}
                >
                  <span>
                    <span style={{ color: '#555', marginRight: 6 }}>#{i + 1}</span>
                    <span
                      style={{
                        color: agentColor,
                        textDecoration: isReplaced ? 'line-through' : 'none',
                      }}
                    >
                      {agentId.slice(0, 14)}
                      {isOracle && ' ★'}
                    </span>
                    {accusedId === agentId && (
                      <span style={{ color: THEME.danger, marginLeft: 4 }}>[accused]</span>
                    )}
                    {isReplaced && (
                      <span style={{ color: '#555', marginLeft: 4, fontSize: 10 }}>[culled]</span>
                    )}
                  </span>
                  <span style={{ color: isReplaced ? '#444' : '#ddd' }}>${value.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Intel */}
        <div>
          <div
            style={{
              color: '#666',
              fontSize: 10,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Intel Report
          </div>
          <div style={{ fontSize: 11, lineHeight: '1.8' }}>
            <div>
              <span style={{ color: '#555' }}>Oracle: </span>
              <span style={{ color: THEME.warning }}>{oracleId.slice(0, 14)}</span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Accused: </span>
              <span style={{ color: accusedId ? THEME.danger : '#555' }}>
                {accusedId?.slice(0, 14) ?? 'nobody'}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              {oracleCaught && round.oracleWasLeading ? (
                <span style={{ color: THEME.warning, fontWeight: 'bold' }}>
                  ✓ CAUGHT WHILE LEADING
                </span>
              ) : oracleCaught ? (
                <span style={{ color: THEME.success, fontWeight: 'bold' }}>✓ ORACLE CAUGHT</span>
              ) : oracleWon ? (
                <span style={{ color: THEME.danger, fontWeight: 'bold' }}>✗ ORACLE WON</span>
              ) : (
                <span style={{ color: '#ffb74d', fontWeight: 'bold' }}>✗ ORACLE ESCAPED</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GenerationSummary({ summary, onContinue }: Props) {
  const { generation, rounds, replacedAgentIds } = summary;
  const [activeRound, setActiveRound] = useState(0);
  const replacedSet = new Set(replacedAgentIds);

  const currentRound = rounds[activeRound] ?? rounds[0]!;

  return (
    <div
      style={{
        background: '#0f0f1e',
        border: '1px solid #2a2a3e',
        borderRadius: 6,
        padding: '12px 16px',
        marginTop: 12,
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <span style={{ color: THEME.info, fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>
          GEN {generation} COMPLETE
          <span style={{ color: '#555', fontWeight: 'normal', marginLeft: 8, fontSize: 11 }}>
            −{replacedAgentIds.length} culled
          </span>
        </span>
        <button
          onClick={onContinue}
          style={{
            background: THEME.info,
            color: '#0d0d1a',
            border: 'none',
            borderRadius: 4,
            padding: '5px 16px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Continue →
        </button>
      </div>

      {/* Round tabs */}
      {rounds.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {rounds.map((r, i) => {
            const caughtLeading = r.oracleCaught && r.oracleWasLeading;
            const caughtTrailing = r.oracleCaught && !r.oracleWasLeading;
            const tabColor = caughtLeading
              ? THEME.warning
              : caughtTrailing
                ? THEME.success
                : r.oracleWon
                  ? THEME.danger
                  : activeRound === i
                    ? '#eee'
                    : '#666';
            return (
              <button
                key={i}
                onClick={() => setActiveRound(i)}
                style={{
                  padding: '3px 10px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  borderRadius: 3,
                  border: `1px solid ${activeRound === i ? THEME.info : '#333'}`,
                  background: activeRound === i ? '#1a1a2e' : 'transparent',
                  color: tabColor,
                  cursor: 'pointer',
                }}
              >
                R{i + 1}
                {caughtLeading ? ' ✓★' : caughtTrailing ? ' ✓' : r.oracleWon ? ' ✗' : ''}
              </button>
            );
          })}
        </div>
      )}

      <RoundTab round={currentRound} replacedSet={replacedSet} />
    </div>
  );
}
