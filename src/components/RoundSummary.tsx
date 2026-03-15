import type { RoundSummaryData } from '../hooks/useSimulation';
import { AGENT_COLORS, THEME } from './agentColors';

interface Props {
  summary: RoundSummaryData;
  onContinue: () => void;
}

export function RoundSummary({ summary, onContinue }: Props) {
  const {
    round,
    generation,
    accusedId,
    oracleId,
    oracleCaught,
    rankedAgents,
    isLastRound,
    replacedAgentIds,
  } = summary;
  const replacedSet = new Set(replacedAgentIds);

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
          ROUND {round} COMPLETE
          {isLastRound && (
            <span style={{ color: THEME.warning, marginLeft: 8 }}>— GEN {generation} END</span>
          )}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Portfolio rankings */}
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

        {/* Oracle / Auditor outcome */}
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
              <span style={{ color: THEME.warning }}>{oracleId?.slice(0, 14) ?? '—'}</span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Accused: </span>
              <span style={{ color: accusedId ? THEME.danger : '#555' }}>
                {accusedId?.slice(0, 14) ?? 'nobody'}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              {oracleCaught ? (
                <span style={{ color: THEME.success, fontWeight: 'bold' }}>✓ ORACLE CAUGHT</span>
              ) : (
                <span style={{ color: THEME.danger, fontWeight: 'bold' }}>✗ ORACLE ESCAPED</span>
              )}
            </div>
            <div style={{ marginTop: 4, color: '#555', fontSize: 10 }}>
              {replacedAgentIds.length} agent{replacedAgentIds.length !== 1 ? 's' : ''} culled this
              round
            </div>
            {isLastRound && (
              <div style={{ marginTop: 4, color: THEME.warning, fontSize: 10 }}>
                Genetic algorithm will evolve agents on Continue.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
