import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Alert, Incident, Lang, ScheduledTask } from '../types';
import type { Conditions } from '../engine';

/**
 * Single app store (persisted to localStorage, so it works offline).
 * Both workstreams read from it; add new slices at the bottom rather than reshaping existing ones.
 */
export interface Machine { engineOn: boolean; belted: boolean; unbeltedSince: number | null; shiftStart: number; lastBreak: number }

interface State {
  operatorId: string | null; machineId: string; lang: Lang;
  tasks: ScheduledTask[];
  incidents: Incident[];
  conditions: Conditions;
  machine: Machine;
  alerts: Alert[];
  risk: { value: number; state: string; cause: string } | null;

  login: (operatorId: string, lang: Lang) => void;
  logout: () => void;
  setLang: (l: Lang) => void;
  setMachine: (id: string) => void;
  setTasks: (t: ScheduledTask[]) => void;
  updateTask: (id: string, patch: Partial<ScheduledTask>) => void;
  addIncident: (i: Omit<Incident, 'id' | 'at'>) => Incident;
  markSynced: (ids: string[]) => void;
  setConditions: (c: Partial<Conditions>) => void;
  setMachineState: (m: Partial<Machine>) => void;
  pushAlert: (a: Omit<Alert, 'id' | 'at'>) => void;
  clearAlert: (key: string) => void;
  setRisk: (r: State['risk']) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>()(persist((set, get) => ({
  operatorId: null, machineId: 'EXC001', lang: 'en',
  tasks: [], incidents: [], alerts: [], risk: null,
  conditions: { weather: 'Sunny', tempC: 34, humidity: 55, ground: 'Firm', light: 'Day', dust: false },
  machine: { engineOn: false, belted: true, unbeltedSince: null, shiftStart: Date.now(), lastBreak: Date.now() },

  login: (operatorId, lang) => set({ operatorId, lang, machine: { ...get().machine, shiftStart: Date.now(), lastBreak: Date.now() } }),
  logout: () => set({ operatorId: null }),
  setLang: (lang) => set({ lang }),
  setMachine: (machineId) => set({ machineId }),
  setTasks: (tasks) => set({ tasks }),
  updateTask: (id, patch) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  addIncident: (i) => {
    const inc: Incident = { ...i, id: uid(), at: new Date().toISOString(), synced: false };
    set({ incidents: [inc, ...get().incidents].slice(0, 300) });
    return inc;
  },
  markSynced: (ids) => set({ incidents: get().incidents.map((i) => (ids.includes(i.id) ? { ...i, synced: true } : i)) }),
  setConditions: (c) => set({ conditions: { ...get().conditions, ...c } }),
  setMachineState: (m) => set({ machine: { ...get().machine, ...m } }),
  pushAlert: (a) => {
    if (get().alerts.some((x) => x.key === a.key)) return;
    set({ alerts: [...get().alerts, { ...a, id: uid(), at: Date.now() }] });
  },
  clearAlert: (key) => set({ alerts: get().alerts.filter((a) => a.key !== key) }),
  setRisk: (risk) => set({ risk }),
}), { name: 'onyx', partialize: (s) => ({ ...s, alerts: [] }) }));
