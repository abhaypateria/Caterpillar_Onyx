import type { TFunction } from 'i18next';
import type { Machine, Operator, ScheduledTask, Weather } from '../../types';
import { MACHINES, OPERATORS, PROVIDED_TASKS, fitEta, predictEta } from '../../engine';

/** ETA model fitted on the organisers' 5 tasks (priors carry the rest; see engine/eta.ts). */
export const etaModel = fitEta(PROVIDED_TASKS);

export const opById = (id: string | null): Operator => OPERATORS.find((o) => o.id === id) ?? OPERATORS[0];
export const machineById = (id: string): Machine => MACHINES.find((m) => m.id === id) ?? MACHINES[0];

const PLAN: Record<Machine['type'], [string, string, string, number, number][]> = {
  Excavator: [
    ['08:00', 'Earth Excavation', 'Zone A · foundation', 60, 30],
    ['09:30', 'Trenching', 'Zone B · utility line', 45, 24],
    ['11:00', 'Demolition', 'Old pump house', 90, 40],
    ['14:00', 'Trenching', 'Zone C · drainage', 45, 24],
  ],
  'Wheel Loader': [
    ['08:00', 'Material Loading', 'Stockpile 1', 30, 18],
    ['09:00', 'Grading', 'Access road', 35, 14],
    ['11:00', 'Material Loading', 'Stockpile 2', 30, 18],
    ['14:00', 'Grading', 'Parking area', 35, 14],
  ],
};

/** Today's schedule for an operator + machine. Ids carry the key so a new login resets the plan. */
export function defaultTasks(opId: string, machineId: string): ScheduledTask[] {
  const key = `${opId}-${machineId}-${new Date().toISOString().slice(0, 10)}`;
  return PLAN[machineById(machineId).type].map(([time, type, site, plannedMin, totalCycles], i) => ({
    id: `${key}-${i}`, time, type, site, plannedMin, totalCycles, doneCycles: 0, startedAt: null, status: 'scheduled', elapsedMin: 0,
  }));
}
export const tasksKey = (opId: string, machineId: string) => `${opId}-${machineId}-${new Date().toISOString().slice(0, 10)}`;

export function predict(task: ScheduledTask, op: Operator, m: Machine, weather: Weather) {
  return predictEta(etaModel, { estimated: task.plannedMin, skill: op.skill, weather, machineAge: m.ageYrs });
}

/** "+7 min: Rain" style label for a model contribution. */
export function factorLabel(t: TFunction, factor: string) {
  if (factor.startsWith('machineAge:')) return t('factor.machineAge', { years: factor.split(':')[1] });
  return t(`factor.${factor}`);
}

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`);
export const addMin = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const tot = h * 60 + m + Math.round(min);
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
};
