import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { say } from './say';
import { breakDue, seatbeltStage, type BeltStage } from '../../engine';

/**
 * Always-on safety loop (mounted once in Layout). Deterministic rules only — no LLM.
 * Seatbelt: voice → repeat → supervisor + auto incident. Heat: WBGT-based break reminder.
 * Onyx never controls the machine; the OEM interlock stays in charge.
 */
export default function SafetyMonitor() {
  const stageRef = useRef<BeltStage>('ok');
  const breakRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const s = useStore.getState();
      const { engineOn, belted, unbeltedSince, lastBreak } = s.machine;
      const sec = unbeltedSince ? (Date.now() - unbeltedSince) / 1000 : 0;
      const stage = seatbeltStage(engineOn, belted, sec);
      if (stage !== stageRef.current) {
        if (stage === 'ok') { s.clearAlert('alert.seatbelt'); s.clearAlert('alert.seatbeltSupervisor'); }
        if (stage === 'voice') { s.pushAlert({ priority: 'critical', key: 'alert.seatbelt' }); say('alert.seatbelt', 'critical'); }
        if (stage === 'repeat') say('alert.seatbelt', 'critical');
        if (stage === 'supervisor') {
          s.clearAlert('alert.seatbelt');
          s.pushAlert({ priority: 'critical', key: 'alert.seatbeltSupervisor' });
          say('alert.seatbeltSupervisor', 'critical');
          s.addIncident({
            operatorId: s.operatorId ?? '', machineId: s.machineId, type: 'seatbelt', severity: 'medium', auto: true,
            description: `Seatbelt unfastened for ${Math.round(sec)} s with engine running. Supervisor notified.`,
            snapshot: { seatbelt: false, engineOn: true, tempC: s.conditions.tempC, risk: s.risk?.value, state: s.risk?.state },
          });
        }
        stageRef.current = stage;
      }

      const b = breakDue(s.conditions.tempC, s.conditions.humidity, engineOn ? (Date.now() - lastBreak) / 60000 : 0);
      if (b.due && !breakRef.current) { s.pushAlert({ priority: 'warning', key: 'safety.breakNow' }); say('nudge.breakNow', 'warning'); }
      if (!b.due && breakRef.current) s.clearAlert('safety.breakNow');
      breakRef.current = b.due;
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, []);

  return null;
}
