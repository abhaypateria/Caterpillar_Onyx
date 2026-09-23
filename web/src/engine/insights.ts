import type { TelemetryRow, Weather, Window } from '../types';
import { BENCH } from './data';
import { mean, std } from './math';

// ---------------------------------------------------------------------------
// Idle root cause — only *unexplained* idle counts as an anomaly.
// ---------------------------------------------------------------------------
export type RootCause = 'truck_delay' | 'fatigue_heat' | 'weather' | 'unexplained' | 'none';

export function idleRootCause(w: Window, ctx: { heatIndexC: number; weather: Weather; nextTaskType?: string }): RootCause {
  if (w.idleMin < 3) return 'none';
  if (w.truckEtaMin !== null && w.truckEtaMin > 0) return 'truck_delay';
  if (w.hoursIntoShift >= 5 || ctx.heatIndexC >= 40) return 'fatigue_heat';
  if ((ctx.weather === 'Rainy' || ctx.weather === 'Windy') && /demolition|grading/i.test(ctx.nextTaskType ?? '')) return 'weather';
  return 'unexplained';
}

/** Who gets told what, per cause. Keys are i18n keys (see src/i18n). */
export const CAUSE_ACTIONS: Record<Exclude<RootCause, 'none'>, { operator: string; supervisor?: string }> = {
  truck_delay: { operator: 'nudge.truckDelay', supervisor: 'nudge.dispatcherResequence' },
  fatigue_heat: { operator: 'nudge.breakNow' },
  weather: { operator: 'nudge.weatherCaution', supervisor: 'nudge.swapTaskOrder' },
  unexplained: { operator: 'nudge.idleUnexplained' },
};

// ---------------------------------------------------------------------------
// Row-level observations on the organisers' telemetry (2-hourly rows).
// ---------------------------------------------------------------------------
export type FindingKind = 'excess_idle' | 'low_productivity' | 'seatbelt' | 'fuel_mismatch' | 'outlier';
export interface Finding { kind: FindingKind; level: 'warn' | 'bad'; value: number; baseline?: number }
export interface AnalysedRow extends TelemetryRow { runMin: number | null; idlePct: number | null; fuelPerCycle: number; expectedFuel: number | null; findings: Finding[] }

export function analyse(rows: TelemetryRow[], fleet: TelemetryRow[] = rows): AnalysedRow[] {
  const sorted = [...rows].sort((a, b) => a.machineId.localeCompare(b.machineId) || a.timestamp.localeCompare(b.timestamp));
  const fpc = (r: TelemetryRow) => (r.loadCycles ? r.fuelUsed / r.loadCycles : r.fuelUsed);
  const idleM = mean(fleet.map((r) => r.idleMin)), idleS = std(fleet.map((r) => r.idleMin)) || 1;
  const fpcM = mean(fleet.map(fpc)), fpcS = std(fleet.map(fpc)) || 1;
  const prev: Record<string, TelemetryRow> = {};
  return sorted.map((r) => {
    const p = prev[r.machineId]; prev[r.machineId] = r;
    const dh = p ? r.engineHours - p.engineHours : null;
    const runMin = dh !== null && dh > 0 && dh < 8 ? dh * 60 : null;
    const idlePct = runMin ? (r.idleMin / runMin) * 100 : null;
    // Expected fuel = idle burn + per-cycle work fuel; flags possible pilferage or leaks for review.
    const expectedFuel = runMin ? (r.idleMin / 60) * BENCH.idleBurnLph + r.loadCycles * 0.45 + ((runMin - r.idleMin) / 60) * 0.5 : null;
    const f: Finding[] = [];
    if (r.idleMin > 40) f.push({ kind: 'excess_idle', level: 'bad', value: r.idleMin, baseline: Math.round(idleM) });
    else if (idlePct !== null && idlePct > 50) f.push({ kind: 'excess_idle', level: 'warn', value: Math.round(idlePct) });
    if (fpc(r) > 1.0) f.push({ kind: 'low_productivity', level: 'warn', value: +fpc(r).toFixed(2), baseline: +fpcM.toFixed(2) });
    if (r.seatbelt === 'Unfastened') f.push({ kind: 'seatbelt', level: 'bad', value: 1 });
    if (expectedFuel !== null && r.fuelUsed > expectedFuel * 1.35) f.push({ kind: 'fuel_mismatch', level: 'warn', value: r.fuelUsed, baseline: +expectedFuel.toFixed(1) });
    const z = Math.max((r.idleMin - idleM) / idleS, (fpc(r) - fpcM) / fpcS);
    if (z > 2) f.push({ kind: 'outlier', level: 'warn', value: +z.toFixed(1) });
    return { ...r, runMin, idlePct, fuelPerCycle: fpc(r), expectedFuel, findings: f };
  });
}

/** Idle cost for summaries (₹, litres, kg CO₂). */
export function idleCost(idleMin: number) {
  const litres = (idleMin / 60) * BENCH.idleBurnLph;
  return { litres: +litres.toFixed(1), inr: Math.round(litres * BENCH.dieselInrPerL), co2Kg: +(litres * BENCH.co2KgPerL).toFixed(1) };
}

// ---------------------------------------------------------------------------
// Seatbelt escalation (deterministic; never an LLM). Onyx never controls hydraulics.
// ---------------------------------------------------------------------------
export type BeltStage = 'ok' | 'voice' | 'repeat' | 'supervisor';
export function seatbeltStage(engineOn: boolean, belted: boolean, unbeltedForSec: number): BeltStage {
  if (!engineOn || belted) return 'ok';
  if (unbeltedForSec >= 60) return 'supervisor';
  if (unbeltedForSec >= 20) return 'repeat';
  return 'voice';
}
