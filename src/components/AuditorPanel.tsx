import type { AuditorState, Agent } from '../engine';

interface Props {
  auditorState: AuditorState;
  agents: readonly Agent[];
}

const BAR_COLORS = {
  predictiveCorrelation: '#4fc3f7',
  winRate: '#81c784',
  timingClustering: '#ffb74d',
  behavioralFingerprint: '#f06292',
};

export function AuditorPanel({ auditorState, agents }: Props) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
      {agents.map((agent) => {
        const scores = auditorState.scores.get(agent.id);
        const isAccused = auditorState.accusation === agent.id;
        const composite = scores?.composite ?? 0;
        return (
          <div
            key={agent.id}
            style={{
              marginBottom: 8,
              padding: 4,
              border: isAccused ? '1px solid #f06292' : '1px solid #333',
              borderRadius: 3,
              background: isAccused ? '#2a1a1a' : '#111',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: agent.isOracle ? '#ffb74d' : '#aaa' }}>
                {agent.id.slice(0, 10)}
                {agent.isOracle ? ' [oracle]' : ''}
              </span>
              {isAccused && <span style={{ color: '#f06292' }}>ACCUSED</span>}
              <span style={{ color: '#ddd' }}>composite: {composite.toFixed(3)}</span>
            </div>
            {/* Composite bar */}
            <div style={{ height: 8, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, composite * 100).toFixed(1)}%`,
                  background: composite > 0.6 ? '#f06292' : composite > 0.3 ? '#ffb74d' : '#4fc3f7',
                  transition: 'width 0.2s',
                }}
              />
            </div>
            {scores !== undefined && (
              <div style={{ display: 'flex', gap: 8, marginTop: 3, color: '#666', fontSize: 10 }}>
                <span style={{ color: BAR_COLORS.predictiveCorrelation }}>
                  pred:{scores.predictiveCorrelation.toFixed(2)}
                </span>
                <span style={{ color: BAR_COLORS.winRate }}>win:{scores.winRate.toFixed(2)}</span>
                <span style={{ color: BAR_COLORS.timingClustering }}>
                  time:{scores.timingClustering.toFixed(2)}
                </span>
                <span style={{ color: BAR_COLORS.behavioralFingerprint }}>
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
