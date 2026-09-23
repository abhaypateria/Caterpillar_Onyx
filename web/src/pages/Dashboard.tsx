import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { PROVIDED_TASKS, liveEta, mape, predictEta } from '../engine';
import { addMin, defaultTasks, etaModel, factorLabel, fmtMin, machineById, opById, predict, tasksKey } from '../components/a/model';
import '../components/a/a.css';

export default function Dashboard() {
  const { t } = useTranslation();
  const { operatorId, machineId, tasks, setTasks, updateTask, conditions } = useStore();
  const op = opById(operatorId), machine = machineById(machineId);

  // New operator/machine/day → fresh schedule.
  useEffect(() => {
    if (!tasks.length || !tasks[0].id.startsWith(tasksKey(op.id, machineId))) setTasks(defaultTasks(op.id, machineId));
  }, [op.id, machineId, tasks, setTasks]);

  const current = tasks.find((x) => x.status === 'active') ?? tasks.find((x) => x.status === 'scheduled');
  const pred = current ? predict(current, op, machine, conditions.weather) : null;
  const live = current && pred && current.status === 'active'
    ? liveEta(pred, current.totalCycles, current.doneCycles, current.elapsedMin ?? 0) : null;

  const eta = live?.eta ?? pred?.minutes ?? 0;
  const low = live?.low ?? pred?.low ?? 0, high = live?.high ?? pred?.high ?? 0;
  const pct = current ? Math.round((current.doneCycles / current.totalCycles) * 100) : 0;

  /** Demo clock: each load cycle takes the operator's true pace (skill) with some noise. */
  function addCycle() {
    if (!current || !pred) return;
    const perCycle = (pred.minutes / current.totalCycles) * (0.85 + Math.random() * 0.4);
    const doneCycles = current.doneCycles + 1;
    updateTask(current.id, { doneCycles, elapsedMin: (current.elapsedMin ?? 0) + perCycle, ...(doneCycles >= current.totalCycles ? { status: 'done' } : {}) });
  }

  const validation = useMemo(() => ({
    onyx: mape(PROVIDED_TASKS, (r) => predictEta(etaModel, r).minutes),
    planner: mape(PROVIDED_TASKS, (r) => r.estimated),
  }), []);

  if (!current) {
    return <div className="card"><h2>{t('dashboard.noTasks')}</h2>
      <button onClick={() => setTasks(defaultTasks(op.id, machineId))}>↻</button></div>;
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="hero">
        <div className="card">
          <div className="kicker">{t('dashboard.currentTask')} · {current.time} · {current.site}</div>
          <h1 className="display" style={{ fontSize: 'clamp(32px, 6vw, 52px)', margin: '6px 0 14px' }}>{current.type}</h1>
          <div className="row" style={{ alignItems: 'flex-end', gap: 24 }}>
            <div>
              <div className="kicker">{t('dashboard.eta')}</div>
              <div className="bignum mono">{fmtMin(eta)}</div>
            </div>
            <div className="muted">
              <div>{t('dashboard.planned')}: <b className="mono" style={{ color: 'var(--text)' }}>{fmtMin(current.plannedMin)}</b></div>
              <div>{t('dashboard.range')}: <span className="mono">{fmtMin(low)} – {fmtMin(high)}</span></div>
              <div>≈ {addMin(current.time, eta)}</div>
            </div>
          </div>
          <div className="progress" aria-label={`${pct}%`}><span style={{ width: `${pct}%` }} /></div>
          <div className="row muted mono" style={{ justifyContent: 'space-between' }}>
            <span>{current.doneCycles}/{current.totalCycles} cycles</span>
            <span>{fmtMin(current.elapsedMin ?? 0)} elapsed</span>
            {live && <span>{live.perCycle.toFixed(2)} min/cycle</span>}
          </div>
          <div className="actions">
            <button disabled={current.status === 'active'} onClick={() => updateTask(current.id, { status: 'active', startedAt: Date.now() })}>▶ {t('dashboard.start')}</button>
            <button className="ghost" disabled={current.status !== 'active'} onClick={addCycle}>{t('dashboard.cycle')}</button>
            <button className="ghost" onClick={() => updateTask(current.id, { status: 'done' })}>✓ {t('dashboard.done')}</button>
          </div>
        </div>

        <div className="card">
          <div className="kicker">{t('dashboard.why')}</div>
          <ul className="why">
            {pred!.contributions.length === 0 && <li><span>{t('dashboard.onPlan')}</span></li>}
            {pred!.contributions.map((c) => (
              <li key={c.factor}><span>{factorLabel(t, c.factor)}</span>
                <b className="mono">{c.minutes > 0 ? '+' : ''}{c.minutes} {t('common.minutes')}</b></li>
            ))}
            {live && (
              <li><span>{t('dashboard.livePace')}</span>
                <b className="mono">{live.eta - pred!.minutes > 0 ? '+' : ''}{Math.round(live.eta - pred!.minutes)} {t('common.minutes')}</b></li>
            )}
          </ul>
          <p className="muted" style={{ fontSize: 13 }}>{t('dashboard.confidence')}: {Math.round(pred!.confidence * 100)}% · {op.skill} · {conditions.weather} · {machine.id} ({machine.ageYrs}y)</p>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h3>{t('dashboard.today')}</h3>
          <ul className="tasklist">
            {tasks.map((x) => {
              const p = predict(x, op, machine, conditions.weather);
              const tone = x.status === 'done' ? 'ok' : x.status === 'active' ? 'warn' : '';
              return (
                <li key={x.id}>
                  <b className="mono">{x.time}</b>
                  <span>{x.type}<br /><small className="muted">{x.site} · {t('dashboard.planned')} {fmtMin(x.plannedMin)} → {t('dashboard.eta')} {fmtMin(p.minutes)}</small></span>
                  <span className={`pill ${tone}`}>{t(`status.${x.status}`)}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card">
          <h3>{t('dashboard.validation')}</h3>
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th>Task</th><th>Skill</th><th>Weather</th><th>{t('dashboard.planned')}</th><th>Onyx</th><th>Actual</th></tr></thead>
              <tbody>
                {PROVIDED_TASKS.map((r) => {
                  const p = Math.round(predictEta(etaModel, r).minutes);
                  const closer = Math.abs(p - r.actual) < Math.abs(r.estimated - r.actual);
                  return <tr key={r.id}><td>{r.id} {r.type}</td><td>{r.skill}</td><td>{r.weather}</td>
                    <td className="mono">{r.estimated}</td><td className="mono"><b>{p}</b> {closer ? '✓' : ''}</td><td className="mono">{r.actual}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {t('dashboard.errorLine', { onyx: (validation.onyx * 100).toFixed(1), planner: (validation.planner * 100).toFixed(1) })}
          </p>
        </div>
      </section>
    </div>
  );
}
