import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { api } from '../api/client';
import { MACHINES, OPERATORS, PROVIDED_TELEMETRY, analyse, CAUSE_ACTIONS } from '../engine';
import type { RootCause } from '../engine';
import type { Incident } from '../types';

/** Owner: Person B. Fleet overview, incident timeline replay, dispatcher nudges, sync. */
export default function Supervisor() {
  const { t } = useTranslation();
  const { incidents, machineId, risk, markSynced } = useStore();
  const [open, setOpen] = useState<Incident | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncedMsg, setSyncedMsg] = useState('');

  const analysed = useMemo(() => analyse(PROVIDED_TELEMETRY), []);

  const fleet = useMemo(() => MACHINES.map((m) => {
    const rows = analysed.filter((r) => r.machineId === m.id);
    const bad = rows.flatMap((r) => r.findings).filter((f) => f.level === 'bad');
    const opId = rows[0]?.operatorId;
    const op = OPERATORS.find((o) => o.id === opId);
    const status: 'ok' | 'warn' | 'stop' = bad.some((f) => f.kind === 'seatbelt') ? 'stop' : bad.length ? 'warn' : 'ok';
    return { m, op, status, findings: rows.flatMap((r) => r.findings).length, isCurrent: m.id === machineId };
  }), [analysed, machineId]);

  // Dispatcher nudges from root cause + fleet idle findings (de-duplicated).
  const nudges = useMemo(() => {
    const out: { key: string; params?: Record<string, string | number> }[] = [];
    const cause = risk?.cause as RootCause | undefined;
    if (cause && cause !== 'none' && CAUSE_ACTIONS[cause]?.supervisor) {
      out.push({ key: CAUSE_ACTIONS[cause].supervisor!, params: { machine: machineId } });
    }
    for (const f of fleet) {
      if (f.status !== 'ok' && f.findings) out.push({ key: 'nudge.dispatcherResequence', params: { machine: f.m.id } });
    }
    return out.filter((n, i, a) => a.findIndex((x) => x.key === n.key && x.params?.machine === n.params?.machine) === i);
  }, [risk, fleet, machineId]);

  function timeline(inc: Incident): { at: string; label: string }[] {
    const base = new Date(inc.at).getTime();
    const fmt = (ms: number) => new Date(base + ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const trigger = inc.type === 'proximity' ? 'Person detected in operating zone'
      : inc.type === 'seatbelt' ? 'Seatbelt unfastened while engine running'
      : 'Unsafe condition began';
    return [
      { at: fmt(-9000), label: 'Normal operation' },
      { at: fmt(-5000), label: trigger },
      { at: fmt(-2000), label: 'Safety threshold crossed' },
      { at: fmt(0), label: 'Onyx alert triggered' },
      { at: fmt(3000), label: 'Operator responded' },
    ];
  }

  async function sync() {
    const unsynced = incidents.filter((i) => !i.synced);
    if (!unsynced.length) { setSyncedMsg(t('supervisor.synced', { n: 0 })); return; }
    setSyncing(true);
    const res = await api.syncIncidents(unsynced);
    setSyncing(false);
    if (res?.saved?.length) { markSynced(res.saved); setSyncedMsg(t('supervisor.synced', { n: res.saved.length })); }
    else setSyncedMsg(t('supervisor.offline'));
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2>{t('supervisor.title')}</h2>

      <h3>{t('supervisor.fleet')}</h3>
      <div className="grid">
        {fleet.map((f) => (
          <div key={f.m.id} className="card" style={f.isCurrent ? { borderColor: 'var(--cat)' } : undefined}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{f.m.id}</strong>
              <span className={`pill ${f.status}`}>{f.status === 'ok' ? t('safety.clear') : f.status === 'stop' ? t('safety.unfastened') : t('supervisor.risk')}</span>
            </div>
            <div className="muted">{f.m.model} · {f.m.ageYrs} yr</div>
            <div className="muted">{t('supervisor.operator')}: {f.op?.name ?? '—'}</div>
          </div>
        ))}
      </div>

      {nudges.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <strong>{t('supervisor.nudges')}</strong>
          <ul style={{ lineHeight: 1.7, marginBottom: 0 }}>{nudges.map((n, i) => <li key={i}>{t(n.key, n.params)}</li>)}</ul>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{t('supervisor.incidents')} ({incidents.length})</h3>
        <button className="ghost" onClick={sync} disabled={syncing}>{syncing ? t('supervisor.syncing') : t('supervisor.sync')}</button>
      </div>
      {syncedMsg && <span className="muted">{syncedMsg}</span>}

      {incidents.length === 0 && <p className="muted">{t('supervisor.noIncidents')}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {incidents.map((inc) => (
          <div key={inc.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <span className={`pill ${inc.severity === 'high' ? 'stop' : 'warn'}`}>{t(`incident.types.${inc.type}`)}</span>
                <span className="muted" style={{ marginLeft: 8 }}>{new Date(inc.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {inc.machineId}</span>
                {inc.auto && <span className="pill" style={{ marginLeft: 8 }}>{t('supervisor.auto')}</span>}
                {inc.synced && <span className="pill ok" style={{ marginLeft: 8 }}>✓</span>}
              </div>
              <button className="ghost" onClick={() => setOpen(open?.id === inc.id ? null : inc)}>{open?.id === inc.id ? t('supervisor.close') : t('supervisor.open')}</button>
            </div>
            <p style={{ marginBottom: open?.id === inc.id ? 12 : 0 }}>{inc.description}</p>
            {open?.id === inc.id && (
              <div style={{ borderLeft: '2px solid var(--line)', paddingLeft: 14 }}>
                <strong>{t('supervisor.timeline')}</strong>
                {timeline(inc).map((s, i) => (
                  <div key={i} className="row" style={{ gap: 12, alignItems: 'baseline' }}>
                    <span className="mono muted" style={{ minWidth: 92 }}>{s.at}</span>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
