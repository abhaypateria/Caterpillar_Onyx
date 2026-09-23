import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { api, whatsappLink } from '../api/client';
import { speak } from '../voice';
import { PROVIDED_TELEMETRY, idleCost, OPERATORS, MACHINES } from '../engine';

/** Owner: Person B. End-of-shift facts → spoken summary + WhatsApp link to the owner. */
export default function Summary() {
  const { t } = useTranslation();
  const store = useStore();
  const { lang, machineId, operatorId, tasks, incidents, machine } = store;
  const [audience, setAudience] = useState<'operator' | 'owner'>('operator');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('91');

  const facts = useMemo(() => {
    const rows = PROVIDED_TELEMETRY.filter((r) => r.machineId === machineId);
    const idleMin = rows.reduce((s, r) => s + r.idleMin, 0);
    const durMs = Date.now() - machine.shiftStart;
    const hours = Math.max(0, durMs / 3600000);
    const done = tasks.filter((t2) => t2.status === 'done').length;
    const safetyAlerts = incidents.filter((i) => i.type === 'seatbelt' || i.type === 'proximity' || i.severity === 'high').length;
    let lessons = 0; try { lessons = +(localStorage.getItem('onyx-lessons') ?? 0); } catch { /* ignore */ }
    const op = OPERATORS.find((o) => o.id === operatorId);
    const mc = MACHINES.find((m) => m.id === machineId);
    return {
      operator: op?.name ?? operatorId ?? 'OP1001', machine: mc?.model ?? machineId,
      durationH: +hours.toFixed(1), tasksDone: done, tasksTotal: tasks.length || 3,
      idleMin, cost: idleCost(idleMin), safetyAlerts, lessons,
    };
  }, [machineId, operatorId, tasks, incidents, machine.shiftStart]);

  function fallbackText(): string {
    const who = audience === 'operator' ? t('summary.forOperator') : t('summary.forOwner');
    const good = facts.safetyAlerts ? t('summary.reviewSafety') : t('summary.goodShift');
    return `${who}: ${facts.tasksDone}/${facts.tasksTotal} ${t('summary.tasks').toLowerCase()}, ${facts.idleMin} ${t('common.minutes')} ${t('summary.idle').toLowerCase()} (₹${facts.cost.inr}), ${facts.safetyAlerts} ${t('summary.alerts').toLowerCase()}, ${facts.lessons} ${t('summary.lessons').toLowerCase()}. ${good}.`;
  }

  async function generate() {
    setBusy(true);
    const apiFacts = { tasksDone: facts.tasksDone, tasksTotal: facts.tasksTotal, idleMin: facts.idleMin, safetyAlerts: facts.safetyAlerts, lessons: facts.lessons, durationH: facts.durationH };
    const res = await api.summary(apiFacts, lang, audience === 'owner' ? 'owner' : 'operator');
    const out = res?.text ?? fallbackText();
    setText(out);
    setBusy(false);
    speak(out, lang);
  }

  const shareText = text || fallbackText();

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2>{t('summary.title')}</h2>

      <div className="grid">
        <div className="card"><div className="muted">{t('summary.operator')}</div><div style={{ fontSize: 20 }}>{facts.operator} · {facts.machine}</div></div>
        <div className="card"><div className="muted">{t('summary.duration')}</div><div className="mono" style={{ fontSize: 20 }}>{facts.durationH} h</div></div>
        <div className="card"><div className="muted">{t('summary.tasks')}</div><div className="mono" style={{ fontSize: 20 }}>{facts.tasksDone} / {facts.tasksTotal}</div></div>
        <div className="card"><div className="muted">{t('summary.idle')}</div><div className="mono" style={{ fontSize: 20 }}>{facts.idleMin} {t('common.minutes')}</div></div>
        <div className="card"><div className="muted">{t('summary.cost')}</div><div className="mono" style={{ fontSize: 20 }}>₹{facts.cost.inr} · {facts.cost.litres} L · {facts.cost.co2Kg} kg CO₂</div></div>
        <div className="card"><div className="muted">{t('summary.alerts')}</div><div className="mono" style={{ fontSize: 20, color: facts.safetyAlerts ? 'var(--warn)' : 'var(--ok)' }}>{facts.safetyAlerts}</div></div>
        <div className="card"><div className="muted">{t('summary.lessons')}</div><div className="mono" style={{ fontSize: 20 }}>{facts.lessons}</div></div>
      </div>

      <div className="row">
        <button className={audience === 'operator' ? '' : 'ghost'} onClick={() => setAudience('operator')}>{t('summary.forOperator')}</button>
        <button className={audience === 'owner' ? '' : 'ghost'} onClick={() => setAudience('owner')}>{t('summary.forOwner')}</button>
      </div>

      <div className="card">
        <p style={{ fontSize: 18, lineHeight: 1.6, minHeight: 28 }}>{busy ? t('summary.generating') : shareText}</p>
        <div className="row">
          <button onClick={generate} disabled={busy}>🔊 {t('summary.speak')}</button>
          <a className="button" href={whatsappLink(phone, shareText)} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 'var(--tap)', padding: '0 20px', borderRadius: 'var(--radius)', background: 'var(--ok)', color: '#111', fontWeight: 800, textDecoration: 'none' }}>
            💬 {t('summary.whatsapp')}
          </a>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" style={{ maxWidth: 160 }} aria-label="owner phone" />
        </div>
      </div>
    </div>
  );
}
