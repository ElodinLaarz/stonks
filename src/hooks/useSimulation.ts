import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGameState, tickGame, resolveRound, resolveGeneration } from '../engine/gameLoop';
import { makeAccusation } from '../engine/auditor';
import { portfolioValue } from '../engine/agent';
import type { AgentId, GameState, RoundResult, SimConfig } from '../engine';

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

interface RoundEndData {
  summary: RoundSummaryData;
  nextState: GameState;
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
  const [roundEndData, setRoundEndData] = useState<RoundEndData | null>(null);
  const roundEndDataRef = useRef<RoundEndData | null>(null);

  const advanceState = useCallback((state: GameState): GameState => {
    // roundEnd is NOT auto-resolved here — the loop stops so the UI can show a round summary.
    // generationEnd is auto-resolved (GA runs silently; the generation log is future work).
    if (state.phase === 'generationEnd') return resolveGeneration(state);
    return tickGame(state);
  }, []);

  const buildRoundEndData = useCallback((state: GameState): RoundEndData => {
    const [nextState, result]: [GameState, RoundResult] = resolveRound(state);
    const rankedAgents = state.agents
      .map((a, originalIndex) => ({
        agentId: a.id,
        value: portfolioValue(a, state.market),
        originalIndex,
        isOracle: a.isOracle,
      }))
      .sort((a, b) => b.value - a.value);
    const summary: RoundSummaryData = {
      round: result.round,
      generation: result.generation,
      accusedId: result.auditorAccusation,
      oracleId: result.oracleId,
      oracleCaught: result.auditorCorrect,
      rankedAgents,
      isLastRound: result.round + 1 >= state.config.roundsPerGeneration,
    };
    return { summary, nextState };
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
        if (s.phase === 'roundEnd' && roundEndDataRef.current === null) {
          const data = buildRoundEndData(s);
          roundEndDataRef.current = data;
          setRoundEndData(data);
        }
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
    [advanceState, buildRoundEndData],
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
    roundEndDataRef.current = null;
    setRoundEndData(null);
    const fresh = createGameState(configRef.current);
    stateRef.current = fresh;
    setSnapshot(fresh);
  }, [pause]);

  const continueRound = useCallback(() => {
    if (stateRef.current.phase !== 'roundEnd') return;
    // Use the pre-resolved next state if available (avoids re-running resolveRound).
    const data = roundEndDataRef.current;
    const resolved = data ? data.nextState : resolveRound(stateRef.current)[0];
    roundEndDataRef.current = null;
    setRoundEndData(null);
    // Auto-resolve generationEnd so the GA runs without a second pause.
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
      roundEndDataRef.current = null;
      setRoundEndData(null);
      const fresh = createGameState(config);
      stateRef.current = fresh;
      setSnapshot(fresh);
    }
  }, [config, pause]);

  useEffect(() => () => pause(), [pause]);

  const currentAccusation = useMemo(() => makeAccusation(snapshot.auditor), [snapshot.auditor]);

  const roundSummary = useMemo((): RoundSummaryData | null => {
    if (snapshot.phase !== 'roundEnd') return null;
    return roundEndData?.summary ?? null;
  }, [snapshot.phase, roundEndData]);

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
