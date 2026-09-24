import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { api } from '../api/client';
import { pauseSpeaking, resumeSpeaking, speakSequence, stopSpeaking, useSpeechState } from '../voice';
import type { IncidentType } from '../types';

/** Owner: Person B. Micro-learning: catalog + audio player + quiz, plus near-miss → lesson. */
interface Quiz { q: string; options: string[]; answer: number }
interface Lesson { id: string; title: string; reason?: string; steps: string[]; quiz: Quiz[] }

// Built-in catalog (mirrors the API's template lessons; the API localises when a key is present).
const CATALOG: Lesson[] = [
  { id: 'idle', title: 'Reducing unnecessary idle time', reason: 'idle time above your average', steps: [
    'Switch the engine off when you wait more than three minutes.',
    'Line up the next load before the truck arrives.',
    'Idling burns 3–5 litres an hour and adds engine hours for no work.',
  ], quiz: [{ q: 'The truck is 10 minutes away. What is best?', options: ['Keep idling', 'Switch off and stay ready', 'Rev the engine'], answer: 1 }] },
  { id: 'proximity', title: 'Keeping people out of the swing radius', reason: 'a proximity near-miss', steps: [
    'Sound the horn twice before you swing or reverse.',
    'Never move while a person is inside the swing radius.',
    'Use a spotter for blind-side moves and keep eye contact.',
  ], quiz: [{ q: 'A worker walks behind you while reversing. First action?', options: ['Reverse faster', 'Stop and wait until clear', 'Keep moving, horn on'], answer: 1 }] },
  { id: 'seatbelt', title: 'Seatbelt every time the engine runs', reason: 'a seatbelt alert', steps: [
    'Fasten the belt before you start the engine.',
    'It keeps you inside the cab if the machine tips or jolts.',
    'Keep it on even for short moves across the site.',
  ], quiz: [{ q: 'When must the seatbelt be fastened?', options: ['On slopes only', 'Whenever the engine runs', 'On roads only'], answer: 1 }] },
  { id: 'heat', title: 'Working safely in heat', reason: 'high heat this shift', steps: [
    'Drink water every hour, before you feel thirsty.',
    'Take the recommended break when Onyx suggests it.',
    'Watch for dizziness or cramps and tell your supervisor.',
  ], quiz: [{ q: 'When should you drink water?', options: ['Only at lunch', 'Every hour', 'When dizzy'], answer: 1 }] },
];

const INCIDENT_TO_LESSON: Record<string, string> = { proximity: 'proximity', seatbelt: 'seatbelt', near_miss: 'proximity' };

export default function Training() {
  const { t } = useTranslation();
  const { incidents, lang } = useStore();
  const speech = useSpeechState();
  // Built-in lessons in the operator's language (English text stays as the fallback).
  const catalog = useMemo(() => CATALOG.map((l): Lesson => ({
    ...l,
    title: t(`lesson.${l.id}.title`, { defaultValue: l.title }),
    reason: l.reason && t(`lesson.${l.id}.reason`, { defaultValue: l.reason }),
    steps: l.steps.map((st, i) => t(`lesson.${l.id}.s${i}`, { defaultValue: st })),
    quiz: l.quiz.map((q) => ({ ...q, q: t(`lesson.${l.id}.q`, { defaultValue: q.q }), options: q.options.map((o, i) => t(`lesson.${l.id}.o${i}`, { defaultValue: o })) })),
  })), [t]);
  const [open, setOpen] = useState<Lesson | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [booked, setBooked] = useState(false);
  const [loading, setLoading] = useState(false);

  const latest = incidents[0];
  const recommended = useMemo(() => {
    if (latest) return catalog.find((l) => l.id === INCIDENT_TO_LESSON[latest.type]) ?? catalog[0];
    return catalog[0];
  }, [latest, catalog]);

  function startLesson(l: Lesson) { setOpen(l); setAnswers({}); }
  // Play always restarts from the beginning (never queues a second copy); sentence by sentence
  // so Pause/Resume continue where they left off.
  function playAudio(l: Lesson) { speakSequence([l.title, ...l.steps], lang); }
  function closeLesson() { stopSpeaking(); setOpen(null); }
  const score = open ? open.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0) : 0;
  const allAnswered = open ? open.quiz.every((_, i) => answers[i] !== undefined) : false;

  async function lessonFromIncident() {
    if (!latest) return;
    setLoading(true);
    const res = await api.lessonFromIncident(latest, lang);
    setLoading(false);
    const l: Lesson = res
      ? { id: 'incident', title: res.title, reason: t('training.fromIncident'), steps: res.steps, quiz: res.quiz }
      : { ...(catalog.find((c) => c.id === INCIDENT_TO_LESSON[latest.type]) ?? catalog[1]), id: 'incident', reason: t('training.fromIncident') };
    startLesson(l);
  }

  if (open) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="row"><button className="ghost" onClick={closeLesson}>←</button><h2 style={{ margin: 0 }}>{open.title}</h2></div>
        {open.reason && <span className="pill warn">{open.reason}</span>}
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{t('training.steps')}</strong>
            <div className="row">
              <button onClick={() => playAudio(open)}>▶ {t('training.play')}</button>
              {speech === 'speaking' && <button className="ghost" onClick={pauseSpeaking}>⏸ {t('speech.pause')}</button>}
              {speech === 'paused' && <button className="ghost" onClick={resumeSpeaking}>▶ {t('speech.resume')}</button>}
              {speech !== 'idle' && <button className="ghost" onClick={stopSpeaking}>⏹ {t('speech.stop')}</button>}
            </div>
          </div>
          <ol style={{ lineHeight: 1.7, marginBottom: 0 }}>{open.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
        {open.quiz.map((q, qi) => (
          <div key={qi} className="card">
            <strong>{t('training.quiz')}</strong>
            <p>{q.q}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {q.options.map((o, oi) => {
                const chosen = answers[qi] === oi;
                const cls = answers[qi] === undefined ? 'ghost' : oi === q.answer ? '' : chosen ? 'ghost' : 'ghost';
                const mark = answers[qi] !== undefined && oi === q.answer ? ' ✓' : chosen && oi !== q.answer ? ' ✗' : '';
                return <button key={oi} className={cls} style={{ textAlign: 'left', ...(answers[qi] !== undefined && oi === q.answer ? { outline: '2px solid var(--ok)' } : {}) }}
                  onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}>{o}{mark}</button>;
              })}
            </div>
            {answers[qi] !== undefined && <p className="muted">{answers[qi] === q.answer ? t('training.correct') : t('training.wrong')}</p>}
          </div>
        ))}
        {allAnswered && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="mono" style={{ fontSize: 20 }}>{t('training.score', { score, total: open.quiz.length })}</p>
            <button onClick={() => { try { localStorage.setItem('onyx-lessons', String((+(localStorage.getItem('onyx-lessons') ?? 0)) + 1)); } catch { /* ignore */ } setOpen(null); }}>{t('training.finish')}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2>{t('training.title')}</h2>
      <div className="card" style={{ borderColor: 'var(--cat)' }}>
        <span className="pill">{t('training.recommended')}</span>
        <h3 style={{ margin: '10px 0 4px' }}>{recommended.title}</h3>
        {recommended.reason && <p className="muted" style={{ marginTop: 0 }}>{t('training.why', { reason: recommended.reason })}</p>}
        <button onClick={() => startLesson(recommended)}>{t('training.start')}</button>
      </div>

      <div className="card">
        <strong>{t('training.fromIncident')}</strong>
        {latest
          ? <>
              <p className="muted">{t(`incident.types.${latest.type as IncidentType}`)} · {latest.description}</p>
              <button className="ghost" disabled={loading} onClick={lessonFromIncident}>{loading ? '…' : t('training.makeLesson')}</button>
            </>
          : <p className="muted">{t('training.noIncidents')}</p>}
      </div>

      <h3>{t('training.lessons')}</h3>
      <div className="grid">
        {catalog.map((l) => (
          <div key={l.id} className="card">
            <h3 style={{ marginBottom: 8 }}>{l.title}</h3>
            <button className="ghost" onClick={() => startLesson(l)}>{t('training.start')}</button>
          </div>
        ))}
      </div>

      <button className="ghost" onClick={() => setBooked(true)} disabled={booked}>{booked ? t('training.booked') : t('training.book')}</button>
    </div>
  );
}
