import { create } from 'zustand';
import type { AgentId } from '../engine';

interface UIState {
  selectedAgentId: AgentId | null;
  simulationSpeed: number; // ticks per second
  panelVisibility: Record<'price' | 'portfolio' | 'trades' | 'auditor', boolean>;
  setSelectedAgent: (id: AgentId | null) => void;
  setSimulationSpeed: (speed: number) => void;
  togglePanel: (panel: 'price' | 'portfolio' | 'trades' | 'auditor') => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedAgentId: null,
  simulationSpeed: 10,
  panelVisibility: { price: true, portfolio: true, trades: true, auditor: true },
  setSelectedAgent: (id) => set({ selectedAgentId: id }),
  setSimulationSpeed: (simulationSpeed) => set({ simulationSpeed }),
  togglePanel: (panel) =>
    set((s) => ({
      panelVisibility: { ...s.panelVisibility, [panel]: !s.panelVisibility[panel] },
    })),
}));
