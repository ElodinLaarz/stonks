import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGameState, tickGame, resolveRound, resolveGeneration } from '../engine/gameLoop';
import { makeAccusation } from '../engine/auditor';
import { portfolioValue } from '../engine/agent';
import type { AgentId, GameState, SimConfig } from '../engine';

export interface AgentRankEntry {
  agentId: AgentId;
  value: number;
  originalIndex: number;
  isOracle: boolean;
}

export interface RoundSummaryData {
  round: number;
  generation: number;
  accusedId: AgentId | null;
  oracleId: AgentId | null;
  oracleCaught: boolean;
  rankedAgents: AgentRankEntry[];
  isLastRound: boolean;
}

export interface SimulationControls {
  state: GameState;
  isRunning: boolean;
  /** Live accusation derived from current suspicion scores (null until there is positive evidence). */
  currentAccusation: AgentId | null;
  /** Non-null only when phase === 'roundEnd'. Pre-computed for display without engine imports in components. */
  roundSummary: RoundSummaryData | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Resolve the current roundEnd state and resume the simulation. */
  continueRound: () => void;
}

export function useSimulation(config: SimConfig, speed: number = 10): SimulationControls {
  const [snapshot, setSnapshot] = useState<GameState>(() => createGameState(config));
  const stateRef = useRef<GameState>(snapshot);
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const advanceState = useCallback((state: GameState): GameState => {
    // roundEnd is NOT auto-resolved here — the loop stops so the UI can show a round summary.
    // generationEnd is auto-resolved (GA runs silently; the generation log is future work).
    if (state.phase === 'generationEnd') return resolveGeneration(state);
    return tickGame(state);
  }, []);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const loop = useCallback(
    (timestamp: number) => {
      if (!isRunningRef.current) return;

      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;
      const msPerTick = 1000 / speedRef.current;
      const ticksToDo = Math.min(Math.floor(elapsed / msPerTick), 50); // cap at 50 ticks/frame

      if (ticksToDo > 0) {
        lastTimeRef.current = timestamp - (elapsed % msPerTick);
        let s = stateRef.current;
        for (let i = 0; i < ticksToDo; i++) {
          if (s.phase === 'finished' || s.phase === 'roundEnd') break;
          s = advanceState(s);
        }
        stateRef.current = s;
        setSnapshot(s);
      }

      const phase = stateRef.current.phase;
      if (phase === 'running' || phase === 'generationEnd') {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // Pause at roundEnd (show summary) and stop at finished
        isRunningRef.current = false;
        setIsRunning(false);
      }
    },
    [advanceState],
  );

  const start = useCallback(() => {
    const phase = stateRef.current.phase;
    // roundEnd is handled by continueRound, not start
    if (isRunningRef.current || phase === 'finished' || phase === 'roundEnd') return;
    isRunningRef.current = true;
    lastTimeRef.current = null;
    setIsRunning(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const reset = useCallback(() => {
    pause();
    const fresh = createGameState(configRef.current);
    stateRef.current = fresh;
    setSnapshot(fresh);
  }, [pause]);

  const continueRound = useCallback(() => {
    if (stateRef.current.phase !== 'roundEnd') return;
    // Resolve the round; auto-resolve generationEnd so the GA runs without a second pause
    const [resolved] = resolveRound(stateRef.current);
    const next = resolved.phase === 'generationEnd' ? resolveGeneration(resolved) : resolved;
    stateRef.current = next;
    setSnapshot(next);
    if (next.phase === 'running') {
      isRunningRef.current = true;
      lastTimeRef.current = null;
      setIsRunning(true);
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [loop]);

  // Reset the simulation whenever config changes (e.g. from the controls panel).
  const prevConfigRef = useRef(config);
  useEffect(() => {
    if (prevConfigRef.current !== config) {
      prevConfigRef.current = config;
      pause();
      const fresh = createGameState(config);
      stateRef.current = fresh;
      setSnapshot(fresh);
    }
  }, [config, pause]);

  useEffect(() => () => pause(), [pause]);

  const currentAccusation = useMemo(() => makeAccusation(snapshot.auditor), [snapshot.auditor]);

  const roundSummary = useMemo((): RoundSummaryData | null => {
    if (snapshot.phase !== 'roundEnd') return null;
    const accusedId = makeAccusation(snapshot.auditor);
    const oracle = snapshot.agents.find((a) => a.isOracle);
    const oracleId = oracle?.id ?? null;
    const oracleCaught = accusedId !== null && accusedId === oracleId;
    const rankedAgents = snapshot.agents
      .map((a, originalIndex) => ({
        agentId: a.id,
        value: portfolioValue(a, snapshot.market),
        originalIndex,
        isOracle: a.isOracle,
      }))
      .sort((a, b) => b.value - a.value);
    const isLastRound = snapshot.round + 1 >= snapshot.config.roundsPerGeneration;
    return {
      round: snapshot.round,
      generation: snapshot.generation,
      accusedId,
      oracleId,
      oracleCaught,
      rankedAgents,
      isLastRound,
    };
  }, [snapshot]);

  return {
    state: snapshot,
    isRunning,
    currentAccusation,
    roundSummary,
    start,
    pause,
    reset,
    continueRound,
  };
}
