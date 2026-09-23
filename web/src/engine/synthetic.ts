import type { Skill, TaskRecord, Weather, Window } from '../types';
import { TASK_TYPES } from './data';
import { rng } from './math';

/**
 * Synthetic data — always labelled `synthetic`.
 *
 * shiftWindows(): 5-minute windows for one shift. Scenario "provided" reproduces the
 * organisers' 2-hourly aggregates (e.g. 10:00 window ≈ 2 cycles, 55 idle min, belt off)
 * by simulating a late truck. `linkIdleToBelt=false` generates a control day where
 * unbuckling is random, for the circularity check in the backtest.
 */
export interface ShiftOptions {
  date: string; seed?: number; operatorId?: string; machineId?: string;
  truckDelays?: { start: string; minutes: number }[];
  linkIdleToBelt?: boolean; baseTempC?: number; humidity?: number;
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (date: string, min: number) =>
  `${date}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

export function shiftWindows(o: ShiftOptions): Window[] {
  const r = rng(o.seed ?? 7);
  const start = toMin('07:00'), end = toMin('15:00');
  const delays = (o.truckDelays ?? []).map((d) => ({ s: toMin(d.start), e: toMin(d.start) + d.minutes }));
  const link = o.linkIdleToBelt ?? true;
  const out: Window[] = [];
  let idleStreak = 0, belt = true;
  for (let t = start; t < end; t += 5) {
    const delay = delays.find((d) => t >= d.s - 20 && t < d.e);
    const waiting = delays.some((d) => t >= d.s && t < d.e);
    const truckEtaMin = delay ? Math.max(0, delay.e - t) : null;
    const hours = (t - start) / 60;
    const lunch = t >= toMin('12:00') && t < toMin('12:45');
    const engineOn = !lunch;
    let cycles = 0, idle = 0;
    if (!engineOn) { idle = 0; }
    else if (waiting) { cycles = r.next() < 0.1 ? 1 : 0; idle = 4 + Math.round(r.next()); }
    else { cycles = 3 + Math.round(r.next() * 3 - (hours > 6 ? 1 : 0)); idle = Math.round(r.next() * 2); }
    idleStreak = idle >= 4 ? idleStreak + 5 : 0;
    if (link) {
      if (idleStreak >= 25 && r.next() < 0.5) belt = false;
      if (!waiting && cycles >= 3 && r.next() < 0.6) belt = true;
    } else {
      belt = r.next() > 0.04;
    }
    const temp = (o.baseTempC ?? 32) + 6 * Math.sin(((t - start) / (end - start)) * Math.PI);
    out.push({
      t: fmt(o.date, t), machineId: o.machineId ?? 'EXC001', operatorId: o.operatorId ?? 'OP1001',
      cycles, idleMin: Math.min(5, idle), seatbelt: engineOn ? belt : true, engineOn,
      fuelL: engineOn ? +(cycles * 0.4 + (idle / 60) * 3.5 + r.next() * 0.1).toFixed(2) : 0,
      truckEtaMin, tempC: +temp.toFixed(1), humidity: o.humidity ?? 55, hoursIntoShift: +hours.toFixed(2),
    });
  }
  return out;
}

/** The demo day: truck delays that reproduce the organisers' 10:00 row. */
export const DEMO_DAY: ShiftOptions = {
  date: '2025-05-01', seed: 11, operatorId: 'OP1001', machineId: 'EXC001',
  truckDelays: [{ start: '09:05', minutes: 60 }], baseTempC: 33, humidity: 60,
};

/** Synthetic task history following the observed pattern (skill and weather ↔ overrun). */
export function taskHistory(n = 300, seed = 20250501): TaskRecord[] {
  const r = rng(seed);
  const W: Record<Weather, number> = { Sunny: 1, Cloudy: 1.05, Windy: 1.08, Rainy: 1.12 };
  const S: Record<Skill, number> = { Beginner: 1.3, Intermediate: 1.05, Expert: 0.95 };
  const planned: Record<string, number> = { 'Earth Excavation': 60, Trenching: 45, 'Material Loading': 30, Grading: 35, Demolition: 90 };
  return Array.from({ length: n }, (_, i) => {
    const type = r.pick(TASK_TYPES), weather = r.pick(Object.keys(W) as Weather[]), skill = r.pick(Object.keys(S) as Skill[]);
    const machineAge = Math.floor(r.next() * 11);
    const estimated = Math.round((planned[type] * (0.5 + r.next() * 1.5)) / 5) * 5;
    const actual = Math.round(estimated * W[weather] * S[skill] * (1 + 0.01 * (machineAge - 3)) * (1 + r.gauss() * 0.06));
    return { id: `H${String(i + 1).padStart(3, '0')}`, type, weather, skill, machineAge, estimated, actual, source: 'synthetic' as const };
  });
}
