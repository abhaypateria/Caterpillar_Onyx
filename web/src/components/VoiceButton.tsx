import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { api } from '../api/client';
import { listen, parseIntent, speak, stopListening, stopSpeaking, type Intent } from '../voice';
import { fitEta, predictEta, liveEta, PROVIDED_TASKS, OPERATORS, MACHINES } from '../engine';
import type { ScheduledTask } from '../types';
import { term } from '../i18n/term';

/**
 * Push-to-talk button. Owner: Person B.
 * Routes each intent to an action. Data-changing actions (task done) ask for a spoken confirm.
 * Everything degrades gracefully offline: keyword intents, browser speech, local incident log.
 */
type Pending = { kind: 'confirmDone'; task: ScheduledTask } | null;

export default function VoiceButton() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const store = useStore();
  const { lang } = store;
  // idle → listening (tap again to stop) → thinking (transcribing / answering) → idle
  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const [heard, setHeard] = useState('');
  const [pending, setPending] = useState<Pending>(null);

  // ETA model is cheap but constant — fit once from the provided tasks.
  const model = useMemo(() => fitEta(PROVIDED_TASKS), []);

  function say(key: string, params?: Record<string, string | number>, priority: 'critical' | 'warning' | 'info' = 'info') {
    const text = t(key, params);
    setHeard(text);
    speak(text, lang, priority);
  }

  function etaInput(task: ScheduledTask) {
    const op = OPERATORS.find((o) => o.id === store.operatorId);
    const machine = MACHINES.find((m) => m.id === store.machineId);
    return { estimated: task.plannedMin, skill: op?.skill ?? 'Intermediate', weather: store.conditions.weather, machineAge: machine?.ageYrs ?? 3 };
  }

  function etaMinutes(task: ScheduledTask): number {
    const pred = predictEta(model, etaInput(task));
    if (task.startedAt && task.doneCycles > 0) {
      // Match the Today screen: prefer the demo work clock (advanced per load cycle), else wall clock.
      const elapsed = task.elapsedMin ?? (Date.now() - task.startedAt) / 60000;
      return Math.round(liveEta(pred, task.totalCycles, task.doneCycles, elapsed).eta);
    }
    return Math.round(pred.minutes);
  }

  function whyReason(task: ScheduledTask): string {
    const pred = predictEta(model, etaInput(task));
    const top = [...pred.contributions].sort((a, b) => Math.abs(b.minutes) - Math.abs(a.minutes))[0];
    if (!top) return t('voice.noActiveTask');
    const [name, years] = top.factor.split(':');
    const label = name === 'machineAge' ? t('factor.machineAge', { years }) : t(`factor.${name}`, name);
    return `${top.minutes > 0 ? '+' : ''}${top.minutes} ${t('common.minutes')}: ${label}`;
  }

  async function reportIncident(text: string) {
    say('voice.incidentPrompt');
    const structured = (await api.structureIncident(text, lang)) ?? {
      type: /person|aadmi|worker|peeche|behind|near|आदमी|व्यक्ति|मज़दूर|पीछे|ஆள்|தொழிலாளி|பின்னால்|ವ್ಯಕ್ತಿ|ಕಾರ್ಮಿಕ|ಹಿಂದೆ/i.test(text) ? ('proximity' as const) : ('near_miss' as const),
      severity: 'medium' as const,
      description: text,
    };
    const inc = store.addIncident({
      operatorId: store.operatorId ?? 'OP1001',
      machineId: store.machineId,
      type: structured.type,
      severity: structured.severity,
      description: structured.description,
      auto: false,
      snapshot: { risk: store.risk?.value, state: store.risk?.state },
    });
    say('voice.incidentLogged', { type: t(`incident.types.${structured.type}`, structured.type) });
    // Best-effort sync; stays in the local store if offline.
    const res = await api.syncIncidents([inc]);
    if (res?.saved?.length) store.markSynced(res.saved);
  }

  async function dispatch(intent: Intent) {
    const tasks = store.tasks;
    const active = tasks.find((t2) => t2.status === 'active');
    const next = tasks.find((t2) => t2.status === 'scheduled');

    // Resolve a pending confirmation first.
    if (pending) {
      if (intent.name === 'confirm') {
        store.updateTask(pending.task.id, { status: 'done', doneCycles: pending.task.totalCycles });
        say('voice.markedDone', { task: term(t, 'task', pending.task.type) });
      } else if (intent.name === 'cancel') {
        say('voice.cancelled');
      } else {
        say('voice.confirm');
        return; // keep pending until a clear confirm/cancel
      }
      setPending(null);
      return;
    }

    switch (intent.name) {
      case 'next_task':
        if (next) say('voice.nextTask', { task: term(t, 'task', next.type), min: next.plannedMin });
        else say('voice.noNextTask');
        break;
      case 'task_done':
        if (active) { setPending({ kind: 'confirmDone', task: active }); say('voice.confirmDone', { task: term(t, 'task', active.type) }); }
        else if (next) { setPending({ kind: 'confirmDone', task: next }); say('voice.confirmDone', { task: term(t, 'task', next.type) }); }
        else say('voice.noActiveTask');
        break;
      case 'eta': {
        const task = active ?? next;
        if (task) say('voice.etaSpoken', { task: term(t, 'task', task.type), min: etaMinutes(task) });
        else say('voice.noActiveTask');
        break;
      }
      case 'why_late': {
        const task = active ?? next;
        if (task) { setHeard(whyReason(task)); speak(whyReason(task), lang); }
        else say('voice.noActiveTask');
        break;
      }
      case 'report_incident':
        await reportIncident(intent.text);
        break;
      case 'start_lesson':
        say('voice.opening', { screen: t('nav.training') });
        nav('/training');
        break;
      case 'shift_summary':
        say('voice.opening', { screen: t('nav.summary') });
        nav('/summary');
        break;
      case 'mayday':
        store.pushAlert({ priority: 'critical', key: 'voice.mayday' });
        store.addIncident({
          operatorId: store.operatorId ?? 'OP1001', machineId: store.machineId,
          type: 'other', severity: 'high', description: 'Emergency (mayday) reported by operator', auto: true,
          snapshot: { risk: store.risk?.value, state: store.risk?.state },
        });
        say('voice.mayday', undefined, 'critical');
        break;
      case 'confirm':
      case 'cancel':
        say('voice.didntCatch');
        break;
      default:
        say('voice.didntCatch');
    }
  }

  // Mic is a toggle: tap to start, tap again to stop listening now.
  async function go() {
    if (phase === 'listening') { stopListening(); setPhase('thinking'); return; }
    if (phase === 'thinking') return;
    stopSpeaking(); // don't talk over the operator
    setPhase('listening');
    setHeard(t('voice.listening'));
    try {
      const text = await listen(lang);
      setPhase('thinking');
      if (!text.trim()) { say('voice.didntCatch'); return; } // nothing heard: no LLM round-trip
      let intent = parseIntent(text);
      // Online fallback: let the LLM classify what the offline keywords missed.
      if (intent.name === 'unknown') {
        const remote = await api.intent(text, lang);
        if (remote?.name && remote.name !== 'unknown') intent = { name: remote.name, text } as Intent;
      }
      setHeard(`“${text}” → ${intent.name}`);
      await dispatch(intent);
    } catch {
      setHeard(t('voice.didntCatch'));
    } finally {
      setPhase('idle');
    }
  }

  return (
    <>
      {heard && <div className="voicetext card">{heard}</div>}
      <button className={`voicebtn ${phase === 'listening' ? 'on' : ''}`} onClick={go} aria-busy={phase === 'thinking'}
        aria-label={phase === 'listening' ? t('voice.tapToStop') : t('voice.tap')}>{phase === 'listening' ? '⏹' : phase === 'thinking' ? '⏳' : '🎙'}</button>
    </>
  );
}
