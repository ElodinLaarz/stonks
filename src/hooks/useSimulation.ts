import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameState, tickGame, resolveRound, resolveGeneration } from '../engine/gameLoop';
import type { GameState, SimConfig } from '../engine';

export interface SimulationControls {
  state: GameState;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
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
    if (state.phase === 'roundEnd') {
      const [nextState] = resolveRound(state);
      return nextState.phase === 'generationEnd' ? resolveGeneration(nextState) : nextState;
    }
    if (state.phase === 'generationEnd') {
      return resolveGeneration(state);
    }
    return tickGame(state);
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
          if (s.phase === 'finished') break;
          s = advanceState(s);
        }
        stateRef.current = s;
        setSnapshot(s);
      }

      if (stateRef.current.phase !== 'finished') {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        isRunningRef.current = false;
        setIsRunning(false);
      }
    },
    [advanceState],
  );

  const start = useCallback(() => {
    if (isRunningRef.current || stateRef.current.phase === 'finished') return;
    isRunningRef.current = true;
    lastTimeRef.current = null;
    setIsRunning(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    pause();
    const fresh = createGameState(configRef.current);
    stateRef.current = fresh;
    setSnapshot(fresh);
  }, [pause]);

  // Reset the simulation whenever config changes (e.g. from the controls panel).
  // Using a ref to skip the initial mount so we don't double-initialize on first render.
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

  return { state: snapshot, isRunning, start, pause, reset };
}
