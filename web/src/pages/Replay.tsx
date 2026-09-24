import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import {
  CAUSE_ACTIONS, DEMO_DAY, PROVIDED_TELEMETRY, RISK_THRESHOLD, STATES, backtest, heatIndex, idleRootCause, rng, run, shiftWindows,
  type ShiftOptions,
} from '../engine';
import { Bars, Gauge, RiskChart } from '../components/a/charts';
import { say } from '../components/a/say';
import '../components/a/a.css';

type Scenario = 'demo' | 'control';
const hhmm = (iso: string) => iso.slice(11, 16);

/** Backtest over many simulated shifts with a late truck at a random time. */
function backtestSuite(link: boolean) {
  const days = Array.from({ length: 40 }, (_, i) => {
    const r = rng(100 + i);
    const startMin = 8 * 60 + Math.floor(r.next() * 5 * 60 / 5) * 5;
    const start = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
    const o: ShiftOptions = { date: '2025-05-01', seed: 500 + i, truckDelays: [{ start, minutes: 35 + Math.floor(r.next() * 40) }], linkIdleToBelt: link };
    return backtest(shiftWindows(o));
  });
  const events = days.reduce((s, d) => s + d.events, 0), caught = days.reduce((s, d) => s + d.caught, 0);
  const leads = days.filter((d) => d.caught).map((d) => d.avgLeadMin);
  return {
    shifts: days.length, events, caught,
    catchRate: events ? caught / events : 0,
    avgLead: leads.length ? leads.reduce((s, x) => s + x, 0) / leads.length : 0,
    falsePerShift: days.reduce((s, d) => s + d.falseAlarms, 0) / days.length,
  };
}

export default function Replay() {
  const { t } = useTranslation();
  const setRisk = useStore((s) => s.setRisk);
  const weather = useStore((s) => s.conditions.weather);
  const [scenario, setScenario] = useState<Scenario>('demo');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  const windows = useMemo(() => shiftWindows({ ...DEMO_DAY, linkIdleToBelt: scenario === 'demo' }), [scenario]);
  const steps = useMemo(() => run(windows, (w) => heatIndex(w.tempC, w.humidity)), [windows]);
  const suite = useMemo(() => ({ linked: backtestSuite(true), control: backtestSuite(false) }), []);

  const firstAlarm = steps.findIndex((s, i) => s.alarm && !(i > 0 && steps[i - 1].alarm));
  const beltOff = windows.findIndex((w, i) => w.engineOn && !w.seatbelt && (i === 0 || windows[i - 1].seatbelt));

  const w = windows[idx], s = steps[idx];
  const hi = heatIndex(w.tempC, w.humidity);
  const cause = idleRootCause(w, { heatIndexC: hi, weather });
  const action = cause !== 'none' ? CAUSE_ACTIONS[cause] : null;
  const params = { min: w.truckEtaMin ?? Math.round(w.idleMin), machine: w.machineId };

  // Playback clock.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setIdx((i) => (i + 1 < windows.length ? i + 1 : (setPlaying(false), i))), 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, windows.length]);

  // Publish risk for other screens; speak the nudge when the alarm rises.
  const spokenAt = useRef(-1);
  useEffect(() => {
    setRisk({ value: s.risk, state: s.state, cause });
    const rising = s.alarm && !(idx > 0 && steps[idx - 1].alarm);
    if (playing && rising && spokenAt.current !== idx && action) {
      spokenAt.current = idx;
      say(action.operator, 'warning', params);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row controls">
          <button onClick={() => { if (idx >= windows.length - 1) setIdx(0); setPlaying(!playing); }}>{playing ? '❚❚' : '▶'} {t('replay.play')}</button>
          <button className="ghost" onClick={() => { setPlaying(false); setIdx(0); }} aria-label="restart">⟲</button>
          <button className="ghost" onClick={() => { setIdx(windows.findIndex((x) => x.t.slice(11, 16) >= "08:50")); setPlaying(true); }}>⏭ 08:50</button>
          <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">
            {[2, 4, 8].map((x) => <option key={x} value={x}>{x}×</option>)}
          </select>
          <select className="scenario" value={scenario} onChange={(e) => { setScenario(e.target.value as Scenario); setIdx(0); setPlaying(false); }}>
            <option value="demo">{t('replay.demoDay')}</option>
            <option value="control">{t('replay.controlDay')}</option>
          </select>
        </div>
        <span className="pill">{t('common.simulated')}</span>
      </div>

      <section className="hero">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="kicker">{DEMO_DAY.operatorId} · {DEMO_DAY.machineId} · {w.t.slice(0, 10)}</div>
              <div className="bignum mono">{hhmm(w.t)}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className={`pill ${w.seatbelt ? 'ok' : 'stop'}`}>{t('safety.seatbelt')}: {w.seatbelt ? t('safety.fastened') : t('safety.unfastened')}</span>
                <span className="pill mono">{w.cycles} {t('unit.cycles')} · {w.idleMin} {t('common.minutes')} {t('unit.idle')}</span>
                {w.truckEtaMin !== null && <span className="pill warn">🚚 +{w.truckEtaMin} {t('common.minutes')}</span>}
                <span className="pill mono">{w.tempC}°C</span>
              </div>
            </div>
            <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
              <Gauge value={s.risk} threshold={RISK_THRESHOLD} label={t('replay.riskLabel')} />
              <span className={`pill ${s.fatigue > 0.5 ? "warn" : ""}`}>{t('replay.fatigue')} {Math.round(s.fatigue * 100)}%</span>
            </div>
          </div>
          <RiskChart
            points={steps.map((x) => ({ label: hhmm(x.t), value: x.risk }))}
            threshold={RISK_THRESHOLD} thresholdLabel={t('replay.alarmLine')} cursor={idx} onPick={(i) => { setPlaying(false); setIdx(i); }}
            markers={[
              ...(firstAlarm >= 0 ? [{ index: firstAlarm, label: `${t('replay.warns')} ${hhmm(windows[firstAlarm].t)}`, tone: 'warn' as const }] : []),
              ...(beltOff >= 0 ? [{ index: beltOff, label: `${t('replay.beltOff')} ${hhmm(windows[beltOff].t)}`, tone: 'stop' as const }] : []),
            ]} />
        </div>

        <div className="card" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div>
            <div className="kicker">{t('replay.state')}</div>
            <div className="display" style={{ fontSize: 36 }}>{t(`state.${s.state}`)}</div>
          </div>
          <Bars rows={STATES.map((st, i) => ({ label: t(`state.${st}`), value: s.belief[i], highlight: st === s.state }))} />
          <div>
            <div className="kicker">{t('replay.cause')}</div>
            <div style={{ fontWeight: 700 }}>{!w.seatbelt && w.engineOn ? t('cause.unbelted') : t(`cause.${cause}`)}</div>
          </div>
          {action && (
            <div className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="kicker">🎙 {t('replay.toOperator')}</div>
              <div>{t(action.operator, params)}</div>
              {action.supervisor && <><div className="kicker" style={{ marginTop: 8 }}>{t('replay.toSupervisor')}</div><div>{t(action.supervisor, params)}</div></>}
            </div>
          )}
        </div>
      </section>

      {scenario === 'demo' && firstAlarm >= 0 && beltOff >= 0 && idx >= beltOff && (
        <div className="card reveal">
          <div className="display" style={{ fontSize: 'clamp(24px, 4vw, 40px)' }}>
            {t('replay.reveal', { warn: hhmm(windows[firstAlarm].t), off: hhmm(windows[beltOff].t), lead: (beltOff - firstAlarm) * 5 })}
          </div>
          <p className="muted">{t('replay.revealNote', { off: hhmm(windows[beltOff].t) })}</p>
        </div>
      )}

      <section className="grid">
        <div className="card">
          <h3>{t('replay.realRows')}</h3>
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th>{t('col.time')}</th><th>{t('col.cycles')}</th><th>{t('col.idle')}</th><th>{t('col.lPerCycle')}</th><th>{t('safety.seatbelt')}</th></tr></thead>
              <tbody>
                {PROVIDED_TELEMETRY.map((r) => (
                  <tr key={r.timestamp}>
                    <td className="mono">{r.timestamp.slice(5, 16).replace('T', ' ')}</td><td className="mono">{r.loadCycles}</td>
                    <td className="mono">{r.idleMin}</td><td className="mono">{(r.fuelUsed / r.loadCycles).toFixed(2)}</td>
                    <td><span className={`pill ${r.seatbelt === 'Fastened' ? 'ok' : 'stop'}`}>{r.seatbelt === 'Fastened' ? t('safety.fastened') : t('safety.unfastened')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{t('replay.realNote')}</p>
        </div>

        <div className="card">
          <h3>{t('replay.backtest')}</h3>
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th></th><th>{t('replay.linked')}</th><th>{t('replay.control')}</th><th>{t('replay.beep')}</th></tr></thead>
              <tbody>
                <tr><td>{t('replay.btEvents')}</td><td className="mono">{suite.linked.events}</td><td className="mono">{suite.control.events}</td><td className="mono">—</td></tr>
                <tr><td>{t('replay.btCatch')}</td><td className="mono"><b>{Math.round(suite.linked.catchRate * 100)}%</b></td><td className="mono">{Math.round(suite.control.catchRate * 100)}%</td><td className="mono">0%</td></tr>
                <tr><td>{t('replay.btLead')}</td><td className="mono"><b>{suite.linked.avgLead.toFixed(0)} {t('common.minutes')}</b></td><td className="mono">{suite.control.avgLead.toFixed(0)} {t('common.minutes')}</td><td className="mono">0</td></tr>
                <tr><td>{t('replay.btFalse')}</td><td className="mono">{suite.linked.falsePerShift.toFixed(2)}</td><td className="mono">{suite.control.falsePerShift.toFixed(2)}</td><td className="mono">—</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{t('replay.btNote', { n: suite.linked.shifts })}</p>
        </div>
      </section>
    </div>
  );
}
