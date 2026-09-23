import type { Window } from '../types';
import { heatIndex } from './conditions';
import { run } from './hmm';

/**
 * Backtest the state engine: an "event" is the window where the seatbelt comes off while the
 * engine runs. It is "caught" if an alarm rose within the preceding 30 min.
 */
export function backtest(windows: Window[], horizonMin = 30) {
  const steps = run(windows, (w) => heatIndex(w.tempC, w.humidity));
  const events: number[] = [], alarms: number[] = [];
  windows.forEach((w, i) => {
    const prev = windows[i - 1];
    if (w.engineOn && !w.seatbelt && (!prev || prev.seatbelt)) events.push(i);
    if (steps[i].alarm && !(i > 0 && steps[i - 1].alarm)) alarms.push(i);
  });
  const k = horizonMin / 5;
  const leads = events.map((e) => { const a = alarms.filter((x) => x <= e && e - x <= k); return a.length ? (e - a[0]) * 5 : null; });
  const falseAlarms = alarms.filter((a) => !events.some((e) => e >= a && e - a <= k)).length;
  const caught = leads.filter((l) => l !== null) as number[];
  return {
    events: events.length, caught: caught.length,
    catchRate: events.length ? caught.length / events.length : 0,
    avgLeadMin: caught.length ? caught.reduce((s, x) => s + x, 0) / caught.length : 0,
    falseAlarms, steps,
  };
}
