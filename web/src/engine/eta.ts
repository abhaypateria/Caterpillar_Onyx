import type { Skill, TaskRecord, Weather } from '../types';
import { dot, invert, matVec } from './math';

/**
 * Bayesian log-ratio model:  log(actual / planned) = w · x + noise
 * x = [1, Beginner, Intermediate, Cloudy, Windy, Rainy, (age − 3)]
 * Priors come from domain knowledge; with only 5 real tasks the posterior
 * stays close to the priors and tightens as more tasks are completed.
 */
export const FEATURES = ['base', 'Beginner', 'Intermediate', 'Cloudy', 'Windy', 'Rainy', 'machineAge'] as const;
const PRIOR_MEAN = [0, 0.25, 0.08, 0.04, 0.07, 0.12, 0.01];
const PRIOR_SD = [0.05, 0.15, 0.1, 0.08, 0.08, 0.1, 0.01];
const NOISE_SD = 0.07;

export interface EtaInput { estimated: number; skill: Skill; weather: Weather; machineAge: number }

export function features(t: EtaInput): number[] {
  return [1, +(t.skill === 'Beginner'), +(t.skill === 'Intermediate'),
    +(t.weather === 'Cloudy'), +(t.weather === 'Windy'), +(t.weather === 'Rainy'), t.machineAge - 3];
}

export interface EtaModel { w: number[]; cov: number[][]; n: number }

export function fitEta(rows: TaskRecord[]): EtaModel {
  const p = FEATURES.length;
  const prec0 = PRIOR_SD.map((s) => 1 / s ** 2);
  // Posterior precision A = X'X/σ² + Λ0,  b = X'y/σ² + Λ0 μ0
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? prec0[i] : 0)));
  const b = PRIOR_MEAN.map((m, i) => m * prec0[i]);
  for (const r of rows) {
    const x = features(r), y = Math.log(r.actual / r.estimated);
    for (let i = 0; i < p; i++) {
      b[i] += (x[i] * y) / NOISE_SD ** 2;
      for (let j = 0; j < p; j++) A[i][j] += (x[i] * x[j]) / NOISE_SD ** 2;
    }
  }
  const cov = invert(A);
  return { w: matVec(cov, b), cov, n: rows.length };
}

export interface Contribution { factor: string; minutes: number }
export interface EtaPrediction {
  minutes: number; low: number; high: number; sdLog: number;
  contributions: Contribution[];   // "+7 min: Rainy"
  confidence: number;              // 0..1, for the UI
}

export function predictEta(m: EtaModel, t: EtaInput): EtaPrediction {
  const x = features(t);
  const mu = dot(m.w, x);
  const varLog = dot(x, matVec(m.cov, x)) + NOISE_SD ** 2;
  const sdLog = Math.sqrt(varLog);
  const minutes = t.estimated * Math.exp(mu);
  const contributions: Contribution[] = [];
  x.forEach((xi, i) => {
    if (i === 0 || xi === 0) return;
    const mins = t.estimated * (Math.exp(m.w[i] * xi) - 1);
    if (Math.abs(mins) >= 0.5) contributions.push({ factor: i === 6 ? `machineAge:${t.machineAge}` : FEATURES[i], minutes: Math.round(mins) });
  });
  return {
    minutes, sdLog, contributions,
    low: minutes * Math.exp(-1.645 * sdLog), high: minutes * Math.exp(1.645 * sdLog),
    confidence: Math.max(0, Math.min(1, 1 - sdLog * 2)),
  };
}

/**
 * Live ETA during a task (Normal–Normal conjugate update on minutes per load cycle).
 * prior: the model's prediction spread over totalCycles; data: observed cycles so far.
 */
export function liveEta(pred: EtaPrediction, totalCycles: number, doneCycles: number, elapsedMin: number) {
  const mu0 = pred.minutes / totalCycles;
  const sd0 = mu0 * pred.sdLog;
  const sdObs = mu0 * 0.3; // per-cycle variability
  const n = doneCycles;
  let muPost = mu0, varPost = sd0 ** 2;
  if (n > 0) {
    const xbar = elapsedMin / n;
    const prec = 1 / sd0 ** 2 + n / sdObs ** 2;
    muPost = (mu0 / sd0 ** 2 + (n * xbar) / sdObs ** 2) / prec;
    varPost = 1 / prec;
  }
  const left = Math.max(0, totalCycles - n);
  const eta = elapsedMin + left * muPost;
  const sd = Math.sqrt(left ** 2 * varPost + left * sdObs ** 2);
  return { eta, low: Math.max(elapsedMin, eta - 1.645 * sd), high: eta + 1.645 * sd, perCycle: muPost };
}

/** Mean absolute percentage error helper for the validation table. */
export function mape(rows: TaskRecord[], f: (r: TaskRecord) => number) {
  return rows.reduce((s, r) => s + Math.abs(r.actual - f(r)) / r.actual, 0) / rows.length;
}
