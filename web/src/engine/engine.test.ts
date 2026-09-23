import { describe, expect, it } from 'vitest';
import {
  DEMO_DAY, PROVIDED_TASKS, PROVIDED_TELEMETRY, analyse, backtest, breakDue, fitEta, liveEta,
  mape, predictEta, seatbeltStage, shiftWindows, taskHistory, wbgt,
} from './index';

describe('ETA model', () => {
  const model = fitEta(PROVIDED_TASKS);
  it('beats the planner on the provided tasks', () => {
    const onyx = mape(PROVIDED_TASKS, (r) => predictEta(model, r).minutes);
    const planner = mape(PROVIDED_TASKS, (r) => r.estimated);
    expect(onyx).toBeLessThan(planner);
  });
  it('explains a beginner overrun', () => {
    const p = predictEta(model, { estimated: 30, skill: 'Beginner', weather: 'Cloudy', machineAge: 3 });
    expect(p.minutes).toBeGreaterThan(36);
    expect(p.contributions.find((c) => c.factor === 'Beginner')!.minutes).toBeGreaterThan(0);
    expect(p.low).toBeLessThan(p.minutes);
  });
  it('generalises to synthetic history', () => {
    const hist = taskHistory(300);
    const m = fitEta(hist.slice(0, 240));
    expect(mape(hist.slice(240), (r) => predictEta(m, r).minutes)).toBeLessThan(0.1);
  });
  it('live ETA moves toward observed pace', () => {
    const p = predictEta(model, { estimated: 45, skill: 'Intermediate', weather: 'Rainy', machineAge: 4 });
    const slow = liveEta(p, 30, 10, 25);
    expect(slow.eta).toBeGreaterThan(p.minutes);
  });
});

describe('telemetry insights', () => {
  const a = analyse(PROVIDED_TELEMETRY);
  it('flags the two alert rows and not the productive ones', () => {
    const byTime = Object.fromEntries(a.map((r) => [r.timestamp.slice(0, 13), r.findings.map((f) => f.kind)]));
    expect(byTime['2025-05-01T10']).toContain('seatbelt');
    expect(byTime['2025-05-01T10']).toContain('excess_idle');
    expect(byTime['2025-05-02T09']).toContain('seatbelt');
    expect(byTime['2025-05-01T08']).toEqual([]);
  });
});

describe('state engine', () => {
  const days = [11, 12, 13, 14, 15].map((seed) => shiftWindows({ ...DEMO_DAY, seed }));
  it('demo day reproduces the provided 10:00 row roughly', () => {
    const all = shiftWindows(DEMO_DAY);
    const sum = (from: string, to: string, k: 'cycles' | 'idleMin') =>
      all.filter((x) => x.t >= `2025-05-01T${from}` && x.t < `2025-05-01T${to}`).reduce((s, x) => s + x[k], 0);
    // The delayed hour has far fewer cycles and far more idle than a productive hour, and the belt comes off.
    expect(sum('09:05', '10:05', 'cycles')).toBeLessThan(sum('07:00', '08:00', 'cycles') / 4);
    expect(sum('09:05', '10:05', 'idleMin')).toBeGreaterThan(40);
    expect(all.some((x) => x.t < '2025-05-01T10:05' && !x.seatbelt)).toBe(true);
  });
  it('warns before unbuckling with lead time', () => {
    const r = days.map((d) => backtest(d));
    const events = r.reduce((s, x) => s + x.events, 0), caught = r.reduce((s, x) => s + x.caught, 0);
    expect(events).toBeGreaterThan(0);
    expect(caught / events).toBeGreaterThan(0.5);
  });
});

describe('safety rules', () => {
  it('escalates seatbelt', () => {
    expect(seatbeltStage(true, false, 0)).toBe('voice');
    expect(seatbeltStage(true, false, 90)).toBe('supervisor');
    expect(seatbeltStage(false, false, 90)).toBe('ok');
  });
  it('shortens work time in extreme heat', () => {
    expect(wbgt(42, 50)).toBeGreaterThan(32);
    expect(breakDue(42, 50, 20).due).toBe(true);
    expect(breakDue(25, 40, 20).due).toBe(false);
  });
});
