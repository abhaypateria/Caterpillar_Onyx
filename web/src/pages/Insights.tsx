import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { BENCH, PROVIDED_TELEMETRY, analyse, clamp, idleCost, mean } from '../engine';
import type { TelemetryRow } from '../types';
import { Bars, Meter } from '../components/a/charts';
import '../components/a/a.css';

/** One clearly-labelled synthetic row so the fuel-mismatch check has something to show. */
const MISMATCH_EXAMPLE: TelemetryRow = {
  timestamp: '2025-05-02T11:00:00', machineId: 'EXC001', operatorId: 'OP1001', engineHours: 1532.2,
  fuelUsed: 9.0, loadCycles: 4, idleMin: 20, seatbelt: 'Fastened', safetyAlert: false, source: 'synthetic',
};

export default function Insights() {
  const { t } = useTranslation();
  const operatorId = useStore((s) => s.operatorId);
  const rows = useMemo(() => analyse([...PROVIDED_TELEMETRY, MISMATCH_EXAMPLE], PROVIDED_TELEMETRY), []);
  const real = rows.filter((r) => r.source === 'provided');

  const idleMin = real.reduce((s, r) => s + r.idleMin, 0);
  const cost = idleCost(idleMin);
  const withRun = real.filter((r) => r.idlePct !== null);
  const avgIdlePct = mean(withRun.map((r) => r.idlePct!));

  const mine = real.filter((r) => r.operatorId === operatorId);
  const profile = mine.length ? (() => {
    const run = mine.filter((r) => r.runMin);
    const cph = run.length ? mean(run.map((r) => r.loadCycles / (r.runMin! / 60))) : 0;
    return {
      safety: Math.round((mine.filter((r) => r.seatbelt === 'Fastened').length / mine.length) * 100),
      idle: Math.round(clamp(100 - (mean(run.map((r) => r.idlePct!)) - BENCH.idleTargetPct) * 2, 0, 100)),
      productivity: Math.round(clamp((cph / 10) * 100, 0, 100)),
      fuel: Math.round(clamp((0.6 / mean(mine.map((r) => r.fuelPerCycle))) * 100, 0, 100)),
    };
  })() : null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="grid">
        <div className="card">
          <div className="kicker">{t('insights.idleCost')}</div>
          <div className="bignum mono" style={{ fontSize: 64 }}>₹{cost.inr}</div>
          <p className="muted mono">{idleMin} {t('common.minutes')} · {cost.litres} L · {cost.co2Kg} kg CO₂</p>
          <p className="muted" style={{ fontSize: 13 }}>{t('insights.costNote', { lph: BENCH.idleBurnLph, inr: BENCH.dieselInrPerL })}</p>
        </div>
        <div className="card">
          <h3>{t('insights.idleShare')}</h3>
          <Bars
            rows={[
              ...withRun.map((r) => ({ label: r.timestamp.slice(5, 16).replace('T', ' '), value: r.idlePct! / 100 })),
              { label: t('insights.fleetAvg'), value: BENCH.fleetIdlePct / 100, highlight: false },
            ]}
            reference={{ value: BENCH.idleTargetPct / 100, label: t('insights.target', { pct: BENCH.idleTargetPct }) }} />
          <p className="muted" style={{ fontSize: 13 }}>{t('insights.avgIdle', { pct: avgIdlePct.toFixed(0) })}</p>
        </div>
        <div className="card">
          <h3>{t('insights.profile')} · {operatorId}</h3>
          {profile ? (
            <div className="bars">
              <Meter label={t('insights.pSafety')} value={profile.safety} />
              <Meter label={t('insights.pIdle')} value={profile.idle} />
              <Meter label={t('insights.pProductivity')} value={profile.productivity} />
              <Meter label={t('insights.pFuel')} value={profile.fuel} />
            </div>
          ) : <p className="muted">{t('insights.noData')}</p>}
          <p className="muted" style={{ fontSize: 13 }}>{t('insights.coaching')}</p>
        </div>
      </section>

      <div className="card">
        <h3>{t('insights.observations')}</h3>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{t('col.time')}</th><th>{t('col.machine')}</th><th>{t('col.cycles')}</th><th>{t('col.idle')}</th><th>{t('col.idlePct')}</th><th>{t('col.fuelExp')}</th><th>{t('col.lPerCycle')}</th><th>{t('safety.seatbelt')}</th><th>{t('insights.findings')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.timestamp}>
                  <td className="mono">{r.timestamp.slice(5, 16).replace('T', ' ')} {r.source === 'synthetic' && <span className="pill">{t('insights.example')}</span>}</td>
                  <td>{r.machineId}</td><td className="mono">{r.loadCycles}</td><td className="mono">{r.idleMin}</td>
                  <td className="mono">{r.idlePct !== null ? `${r.idlePct.toFixed(0)}%` : '–'}</td>
                  <td className="mono">{r.fuelUsed} ({r.expectedFuel !== null ? r.expectedFuel.toFixed(1) : '–'})</td>
                  <td className="mono">{r.fuelPerCycle.toFixed(2)}</td>
                  <td>{r.seatbelt === 'Fastened' ? t('safety.fastened') : t('safety.unfastened')}</td>
                  <td>
                    {r.findings.length === 0 && <span className="pill ok">✓ {t('insights.normal')}</span>}
                    {r.findings.map((f) => (
                      <span key={f.kind} className={`pill ${f.level === 'bad' ? 'stop' : 'warn'}`} style={{ marginRight: 6 }}>
                        {f.level === 'bad' ? '⛔' : '⚠'} {t(`finding.${f.kind}`, { value: f.value, baseline: f.baseline })}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>{t('insights.observationNote')}</p>
      </div>
    </div>
  );
}
