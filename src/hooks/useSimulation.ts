import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGameState, tickGame, resolveGeneration } from '../engine/gameLoop';
import { makeAccusation } from '../engine/auditor';
import { portfolioValue } from '../engine/agent';
import type { AgentId, GameState, SimConfig } from '../engine';

export interface AgentRankEntry {
  agentId: AgentId;
  value: number;
  originalIndex: number;
  isOracle: boolean;
}

export interface PerRoundSummary {
  roundIndex: number;
  accusedId: AgentId | null;
  oracleId: AgentId;
  oracleCaught: boolean;
  oracleWasLeading: boolean;
  oracleWon: boolean;
  rankedAgents: AgentRankEntry[];
}

export interface GenerationSummaryData {
  generation: number;
  rounds: readonly PerRoundSummary[];
  replacedAgentIds: readonly AgentId[];
}

export interface SimulationControls {
  state: GameState;
  isRunning: boolean;
  /** Live accusation derived from current suspicion scores for rounds[0]. */
  currentAccusation: AgentId | null;
  /** Non-null only when phase === 'generationEnd' and autoContinue is false. */
  generationSummary: GenerationSummaryData | null;
  /** Ordered oldest-first history of completed generations. */
  generationHistory: readonly GenerationSummaryData[];
  autoContinue: boolean;
  setAutoContinue: (v: boolean) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Resolve the current generationEnd state and resume the simulation. */
  continueGeneration: () => void;
}

interface GenerationEndData {
  summary: GenerationSummaryData;
  nextState: GameState;
}

function buildGenerationEndData(state: GameState): GenerationEndData {
  const [nextState, result] = resolveGeneration(state);
  const rounds: PerRoundSummary[] = result.roundResults.map((rr) => {
    const round = state.rounds[rr.roundIndex]!;
    const rankedAgents = round.agents
      .map((a, originalIndex) => ({
        agentId: a.id,
        value: portfolioValue(a, round.market),
        originalIndex,
        isOracle: a.isOracle,
      }))
      .sort((a, b) => b.value - a.value);
    return {
      roundIndex: rr.roundIndex,
      accusedId: rr.auditorAccusation,
      oracleId: rr.oracleId,
      oracleCaught: rr.auditorCorrect,
      oracleWasLeading: rr.oracleWasLeading,
      oracleWon: rr.oracleWon,
      rankedAgents,
    };
  });
  const summary: GenerationSummaryData = {
    generation: result.generation,
    rounds,
    replacedAgentIds: result.replacedAgentIds,
  };
  return { summary, nextState };
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
  const [generationEndData, setGenerationEndData] = useState<GenerationEndData | null>(null);
  const generationEndDataRef = useRef<GenerationEndData | null>(null);
  const [autoContinue, setAutoContinue] = useState(false);
  const autoContinueRef = useRef(false);
  const [generationHistory, setGenerationHistory] = useState<readonly GenerationSummaryData[]>([]);

  const handleSetAutoContinue = useCallback((v: boolean) => {
    autoContinueRef.current = v;
    setAutoContinue(v);
  }, []);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const loop = useCallback((timestamp: number) => {
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
      const newHistoryEntries: GenerationSummaryData[] = [];

      for (let i = 0; i < ticksToDo; i++) {
        if (s.phase === 'finished') break;
        if (s.phase === 'generationEnd') {
          const data = buildGenerationEndData(s);
          if (autoContinueRef.current) {
            newHistoryEntries.push(data.summary);
            s = data.nextState;
            if (s.phase === 'finished') break;
          } else {
            if (generationEndDataRef.current === null) {
              generationEndDataRef.current = data;
              setGenerationEndData(data);
            }
            break;
          }
        } else {
          s = tickGame(s);
        }
      }

      // If tickGame produced generationEnd on the last tick, handle it now.
      if (
        s.phase === 'generationEnd' &&
        !autoContinueRef.current &&
        generationEndDataRef.current === null
      ) {
        const data = buildGenerationEndData(s);
        generationEndDataRef.current = data;
        setGenerationEndData(data);
      }

      stateRef.current = s;
      if (newHistoryEntries.length > 0) {
        setGenerationHistory((prev) => [...prev, ...newHistoryEntries]);
      }
      setSnapshot(s);
    }

    const phase = stateRef.current.phase;
    if (phase === 'running' || (phase === 'generationEnd' && autoContinueRef.current)) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      // Pause at generationEnd (show summary) and stop at finished
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  const start = useCallback(() => {
    const phase = stateRef.current.phase;
    if (isRunningRef.current || phase === 'finished' || phase === 'generationEnd') return;
    isRunningRef.current = true;
    lastTimeRef.current = null;
    setIsRunning(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const reset = useCallback(() => {
    pause();
    generationEndDataRef.current = null;
    setGenerationEndData(null);
    setGenerationHistory([]);
    try {
      const fresh = createGameState(configRef.current);
      stateRef.current = fresh;
      setSnapshot(fresh);
    } catch {
      // Invalid config (e.g. numAgents < 2 while user is mid-edit); keep current state.
    }
  }, [pause]);

  const continueGeneration = useCallback(() => {
    if (stateRef.current.phase !== 'generationEnd') return;
    const data = generationEndDataRef.current;
    const nextState = data ? data.nextState : resolveGeneration(stateRef.current)[0];
    if (data) {
      setGenerationHistory((prev) => [...prev, data.summary]);
    }
    generationEndDataRef.current = null;
    setGenerationEndData(null);
    stateRef.current = nextState;
    setSnapshot(nextState);
    if (nextState.phase === 'running') {
      isRunningRef.current = true;
      lastTimeRef.current = null;
      setIsRunning(true);
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [loop]);

  // Reset when config changes.
  const prevConfigRef = useRef(config);
  useEffect(() => {
    if (prevConfigRef.current !== config) {
      prevConfigRef.current = config;
      pause();
      generationEndDataRef.current = null;
      setGenerationEndData(null);
      setGenerationHistory([]);
      try {
        const fresh = createGameState(config);
        stateRef.current = fresh;
        setSnapshot(fresh);
      } catch {
        // Invalid config; keep current state.
      }
    }
  }, [config, pause]);

  useEffect(() => () => pause(), [pause]);

  // When autoContinue is switched on while paused at generationEnd, kick the loop.
  useEffect(() => {
    if (autoContinue && stateRef.current.phase === 'generationEnd' && !isRunningRef.current) {
      generationEndDataRef.current = null;
      setGenerationEndData(null);
      isRunningRef.current = true;
      lastTimeRef.current = null;
      setIsRunning(true);
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [autoContinue, loop]);

  const currentAccusation = useMemo(
    () => makeAccusation(snapshot.rounds[0]!.auditor),
    [snapshot.rounds],
  );

  const generationSummary = useMemo((): GenerationSummaryData | null => {
    if (snapshot.phase !== 'generationEnd') return null;
    return generationEndData?.summary ?? null;
  }, [snapshot.phase, generationEndData]);

  return {
    state: snapshot,
    isRunning,
    currentAccusation,
    generationSummary,
    generationHistory,
    autoContinue,
    setAutoContinue: handleSetAutoContinue,
    start,
    pause,
    reset,
    continueGeneration,
  };
}
