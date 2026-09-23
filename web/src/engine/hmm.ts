import type { Window } from '../types';
import { vecMat } from './math';

/**
 * Operator State Engine — a Hidden Markov Model over 5-minute windows.
 * Emissions factorise over discretised observations (naive-Bayes style), which
 * keeps the model explainable and small enough to run offline on a phone.
 */
export const STATES = ['Productive', 'Waiting', 'Disengaged', 'Fatigued'] as const;
export type State = (typeof STATES)[number];
const [P, W, D, F] = [0, 1, 2, 3];

export const BASE_A = [
  [0.85, 0.12, 0.02, 0.01],
  [0.30, 0.55, 0.14, 0.01],
  [0.20, 0.10, 0.68, 0.02],
  [0.05, 0.05, 0.10, 0.80],
];
const PI = [0.7, 0.2, 0.05, 0.05];

type Obs = { cycles: 0 | 1 | 2; idle: 0 | 1 | 2; belt: 0 | 1; shift: 0 | 1 | 2; heat: 0 | 1 | 2 };

/** P(level | state) for each observation feature. Rows: states P, W, D, F. */
const B: Record<keyof Obs, number[][]> = {
  // Disengaged allows some work: resuming unbelted is still the unsafe state.
  cycles: [[0.05, 0.25, 0.70], [0.60, 0.35, 0.05], [0.55, 0.30, 0.15], [0.25, 0.55, 0.20]],
  idle:   [[0.75, 0.20, 0.05], [0.10, 0.40, 0.50], [0.05, 0.20, 0.75], [0.30, 0.45, 0.25]],
  belt:   [[0.02, 0.98], [0.08, 0.92], [0.70, 0.30], [0.05, 0.95]],
  shift:  [[0.40, 0.40, 0.20], [0.35, 0.40, 0.25], [0.30, 0.40, 0.30], [0.05, 0.25, 0.70]],
  heat:   [[0.50, 0.35, 0.15], [0.45, 0.35, 0.20], [0.40, 0.35, 0.25], [0.10, 0.30, 0.60]],
};

export function discretise(w: Window, heatIndexC: number): Obs {
  return {
    cycles: w.cycles >= 4 ? 2 : w.cycles >= 1 ? 1 : 0,
    idle: w.idleMin >= 4 ? 2 : w.idleMin >= 2 ? 1 : 0,
    belt: w.seatbelt ? 1 : 0,
    shift: w.hoursIntoShift >= 5 ? 2 : w.hoursIntoShift >= 2.5 ? 1 : 0,
    heat: heatIndexC >= 40 ? 2 : heatIndexC >= 32 ? 1 : 0,
  };
}

function emission(o: Obs): number[] {
  return STATES.map((_, s) => (Object.keys(o) as (keyof Obs)[]).reduce((p, k) => p * B[k][s][o[k]], 1));
}

/** Context-aware transitions: a known late truck or a long hot shift shifts probability before idling shows. */
export function contextA(w: Window, heatIndexC: number): number[][] {
  const A = BASE_A.map((r) => [...r]);
  const bump = (from: number, to: number, amt: number) => {
    const take = Math.min(amt, A[from][from] - 0.05);
    A[from][from] -= take; A[from][to] += take;
  };
  if (w.truckEtaMin !== null && w.truckEtaMin > 10) { bump(P, W, 0.15); bump(W, D, 0.12); }
  if (w.hoursIntoShift >= 5) { bump(P, F, 0.04); bump(W, F, 0.04); }
  if (heatIndexC >= 40) { bump(P, F, 0.04); bump(W, F, 0.03); }
  return A;
}

const normalise = (v: number[]) => { const s = v.reduce((a, b) => a + b, 0) || 1; return v.map((x) => x / s); };

export interface FilterStep {
  t: string; belief: number[]; forecast: number[]; risk: number; state: State; alarm: boolean;
}

export const RISK_THRESHOLD = 0.6;
export const FORECAST_STEPS = 3; // 3 × 5 min = 15 min ahead

/** Forward algorithm step: α_t = normalise((α_{t−1} · A) ⊙ B(o_t)). */
export function step(prev: number[] | null, w: Window, heatIndexC: number): FilterStep {
  const A = contextA(w, heatIndexC);
  const e = emission(discretise(w, heatIndexC));
  const prior = prev ? vecMat(prev, A) : PI;
  const belief = normalise(prior.map((p, i) => p * e[i]));
  // Risk = P(reaching Disengaged or Fatigued at any point in the next 15 min):
  // forecast with those states made absorbing so a brief recovery doesn't hide the danger.
  const absorbing = A.map((r, i) => (i === D || i === F ? r.map((_, j) => +(i === j)) : r));
  let forecast = belief;
  for (let k = 0; k < FORECAST_STEPS; k++) forecast = vecMat(forecast, absorbing);
  const risk = forecast[D] + forecast[F];
  const state = STATES[belief.indexOf(Math.max(...belief))];
  return { t: w.t, belief, forecast, risk, state, alarm: risk > RISK_THRESHOLD && state !== 'Disengaged' };
}

/** Run the filter over a whole replay. heat(w) supplies the heat index for each window. */
export function run(windows: Window[], heat: (w: Window) => number): FilterStep[] {
  const out: FilterStep[] = [];
  let prev: number[] | null = null;
  for (const w of windows) { const s = step(prev, w, heat(w)); out.push(s); prev = s.belief; }
  return out;
}
