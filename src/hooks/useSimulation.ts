import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameState, tickGame, resolveRound, resolveGeneration } from '../engine/gameLoop';
import type { GameState, SimConfig } from '../engine';

export interface SimulationControls {
  state: GameState;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Resolve the current roundEnd/generationEnd state and resume the simulation. */
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

  return { state: snapshot, isRunning, start, pause, reset, continueRound };
}
