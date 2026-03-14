import { makeAccusation } from '../engine/auditor';
import { portfolioValue } from '../engine/agent';
import type { GameState } from '../engine';
import { AGENT_COLORS } from './agentColors';

interface Props {
  state: GameState;
  onContinue: () => void;
}

export function RoundSummary({ state, onContinue }: Props) {
  const accusedId = makeAccusation(state.auditor);
  const oracle = state.agents.find((a) => a.isOracle);
  const oracleId = oracle?.id ?? null;
  const oracleCaught = accusedId !== null && accusedId === oracleId;

  // Preserve original index so each agent keeps their color from the Portfolio Race
  const ranked = [...state.agents]
    .map((a, originalIndex) => ({
      agent: a,
      value: portfolioValue(a, state.market),
      originalIndex,
    }))
    .sort((a, b) => b.value - a.value);

  const isLastRound = state.round + 1 >= state.config.roundsPerGeneration;

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
        <span style={{ color: '#4fc3f7', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>
          ROUND {state.round} COMPLETE
          {isLastRound && (
            <span style={{ color: '#ffb74d', marginLeft: 8 }}>— GEN {state.generation} END</span>
          )}
        </span>
        <button
          onClick={onContinue}
          style={{
            background: '#4fc3f7',
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
          {ranked.map(({ agent, value, originalIndex }, i) => {
            const agentColor = AGENT_COLORS[originalIndex % AGENT_COLORS.length]!;
            return (
              <div
                key={agent.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2px 0',
                  fontSize: 11,
                }}
              >
                <span>
                  <span style={{ color: '#555', marginRight: 6 }}>#{i + 1}</span>
                  <span style={{ color: agentColor }}>
                    {agent.id.slice(0, 12)}
                    {agent.isOracle && ' ★'}
                  </span>
                  {accusedId === agent.id && (
                    <span style={{ color: '#f06292', marginLeft: 4 }}>[accused]</span>
                  )}
                </span>
                <span style={{ color: '#ddd' }}>${value.toFixed(0)}</span>
              </div>
            );
          })}
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
              <span style={{ color: '#ffb74d' }}>{oracleId?.slice(0, 12) ?? '—'}</span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Accused: </span>
              <span style={{ color: accusedId ? '#f06292' : '#555' }}>
                {accusedId?.slice(0, 12) ?? 'nobody'}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              {oracleCaught ? (
                <span style={{ color: '#81c784', fontWeight: 'bold' }}>✓ ORACLE CAUGHT</span>
              ) : (
                <span style={{ color: '#f06292', fontWeight: 'bold' }}>✗ ORACLE ESCAPED</span>
              )}
            </div>
            {isLastRound && (
              <div style={{ marginTop: 6, color: '#ffb74d', fontSize: 10 }}>
                Genetic algorithm will evolve agents on Continue.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
