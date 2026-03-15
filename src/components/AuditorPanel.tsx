import type { AgentId, AuditorState, Agent } from '../engine';
import { AGENT_COLORS, THEME } from './agentColors';

interface Props {
  auditorState: AuditorState;
  agents: readonly Agent[];
  currentAccusation: AgentId | null;
}

export function AuditorPanel({ auditorState, agents, currentAccusation }: Props) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11, maxHeight: 500, overflowY: 'auto' }}>
      {agents.map((agent, ai) => {
        const scores = auditorState.scores.get(agent.id);
        const isAccused = currentAccusation === agent.id;
        const composite = scores?.composite ?? 0;
        const agentColor = AGENT_COLORS[ai % AGENT_COLORS.length]!;
        return (
          <div
            key={agent.id}
            style={{
              marginBottom: 8,
              padding: 4,
              border: isAccused ? `1px solid ${agentColor}` : '1px solid #333',
              borderRadius: 3,
              background: isAccused ? '#1a1a2e' : '#111',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: agentColor }}>
                {agent.id.slice(0, 10)}
                {agent.isOracle ? ' ★' : ''}
              </span>
              {isAccused && <span style={{ color: agentColor }}>▲ ACCUSED</span>}
              <span style={{ color: '#ddd' }}>composite: {composite.toFixed(3)}</span>
            </div>
            {/* Composite bar — uses agent identity color so it stays consistent with Portfolio Race */}
            <div style={{ height: 8, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, composite * 100).toFixed(1)}%`,
                  background: agentColor,
                  opacity: 0.4 + composite * 0.6, // dim when low suspicion, bright when high
                  transition: 'width 0.2s',
                }}
              />
            </div>
            {scores !== undefined && (
              <div style={{ display: 'flex', gap: 8, marginTop: 3, color: '#666', fontSize: 10 }}>
                <span style={{ color: THEME.info }}>
                  pred:{scores.predictiveCorrelation.toFixed(2)}
                </span>
                <span style={{ color: THEME.success }}>win:{scores.winRate.toFixed(2)}</span>
                <span style={{ color: THEME.warning }}>
                  time:{scores.timingClustering.toFixed(2)}
                </span>
                <span style={{ color: THEME.danger }}>
                  behav:{scores.behavioralFingerprint.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
