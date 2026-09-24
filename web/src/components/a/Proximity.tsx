import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { proximityThresholds } from '../../engine';
import { say } from './say';
import { personDistance } from './distance';

type Dir = 'front' | 'rear' | 'left' | 'right';
const DIRS: Dir[] = ['front', 'rear', 'left', 'right'];

/**
 * Proximity hazards: simulated 4-zone sensor plus optional webcam person detection (COCO-SSD,
 * runs in the browser). The camera is treated as the rear camera; distance is estimated from
 * the person's box height (≈1.7 m tall, ~50° vertical field of view).
 */
export default function Proximity() {
  const { t } = useTranslation();
  const conditions = useStore((s) => s.conditions);
  const engineOn = useStore((s) => s.machine.engineOn);
  const th = proximityThresholds(conditions);
  const [zones, setZones] = useState<Record<Dir, number>>({ front: 14, rear: 16, left: 12, right: 15 });
  // camWanted is the on/off switch; cam is only the status. Keeping them apart matters: the stream
  // must not restart (or stop) when the status changes from 'loading' to 'on'.
  const [camWanted, setCamWanted] = useState(false);
  const [cam, setCam] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const thRef = useRef(th);
  thRef.current = th;
  const [camDist, setCamDist] = useState<{ d: number; dir: Dir } | null>(null);
  const intrusion = useRef<{ dir: Dir; d: number } | null>(null);
  const lastLog = useRef(0);
  const lastLevel = useRef<'ok' | 'warn' | 'stop'>('ok');
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Simulated sensor: gentle random walk + scripted "worker approaching".
  useEffect(() => {
    const id = setInterval(() => {
      setZones((z) => {
        const n = { ...z };
        for (const d of DIRS) n[d] = Math.min(20, Math.max(6, n[d] + (Math.random() - 0.5)));
        if (intrusion.current) { n[intrusion.current.dir] = intrusion.current.d; intrusion.current.d -= 0.5; if (intrusion.current.d < 0.8) intrusion.current = null; }
        return n;
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Webcam detection loop (live until the operator stops it).
  useEffect(() => {
    if (!camWanted) { setCam('off'); setCamDist(null); return; }
    setCam('loading');
    let stop = false, stream: MediaStream | null = null;
    (async () => {
      try {
        const [tf, coco] = await Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')]);
        await tf.ready();
        // Bundled in public/models so the camera starts fast and works offline (no Google download).
        const model = await coco.load({ base: 'lite_mobilenet_v2', modelUrl: '/models/ssdlite_mobilenet_v2/model.json' });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stop) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        const v = video.current!; v.srcObject = stream; await v.play();
        setCam('on');
        const loop = async () => {
          if (stop) return;
          const th = thRef.current;
          const preds = (await model.detect(v)).filter((p) => p.class === 'person' && p.score > 0.5);
          const c = canvas.current!, g = c.getContext('2d')!;
          c.width = v.videoWidth; c.height = v.videoHeight;
          g.clearRect(0, 0, c.width, c.height);
          let best: { d: number; dir: Dir } | null = null;
          for (const p of preds) {
            const [x, y, w, h] = p.bbox;
            const d = personDistance([x, y, w, h], v.videoWidth, v.videoHeight);
            const cx = (x + w / 2) / v.videoWidth;
            const dir: Dir = cx < 0.33 ? 'left' : cx > 0.66 ? 'right' : 'rear';
            const tone = d < th.stop ? '#ff3b30' : d < th.warn ? '#ffa000' : '#3ddc84';
            g.strokeStyle = tone; g.lineWidth = 4; g.strokeRect(x, y, w, h);
            g.fillStyle = tone; g.font = 'bold 22px sans-serif'; g.fillText(`${d} m`, x + 6, y + 26);
            if (!best || d < best.d) best = { d, dir };
          }
          setCamDist(best);
          if (!stop) setTimeout(loop, 120);
        };
        loop();
      } catch (e) { console.error(e); if (!stop) setCam('error'); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [camWanted]);

  // Nearest hazard → alerts, speech and auto incident.
  const all: { d: number; dir: Dir }[] = DIRS.map((dir) => ({ d: zones[dir], dir }));
  if (camDist) all.push(camDist);
  const nearest = all.reduce((a, b) => (b.d < a.d ? b : a));
  const level = nearest.d < th.stop ? 'stop' : nearest.d < th.warn ? 'warn' : 'ok';

  useEffect(() => {
    const s = useStore.getState();
    const dirLabel = t(`dir.${nearest.dir}`);
    const params = { dist: nearest.d.toFixed(1), dir: dirLabel };
    if (!engineOn || level === 'ok') { s.clearAlert('alert.proximityStop'); s.clearAlert('alert.proximityWarn'); }
    else if (level === 'stop') {
      s.clearAlert('alert.proximityWarn');
      s.pushAlert({ priority: 'critical', key: 'alert.proximityStop', params });
      if (lastLevel.current !== 'stop') say('alert.proximityStop', 'critical', params);
      if (Date.now() - lastLog.current > 30000) {
        lastLog.current = Date.now();
        s.addIncident({ operatorId: s.operatorId ?? '', machineId: s.machineId, type: 'proximity', severity: 'high', auto: true,
          description: `Person/object ${nearest.d.toFixed(1)} m ${nearest.dir} while engine running (stop distance ${th.stop} m).`,
          snapshot: { engineOn: true, seatbelt: s.machine.belted, tempC: s.conditions.tempC } });
      }
    } else {
      s.clearAlert('alert.proximityStop');
      s.pushAlert({ priority: 'warning', key: 'alert.proximityWarn', params });
      if (lastLevel.current === 'ok') say('alert.proximityWarn', 'warning', params);
    }
    lastLevel.current = engineOn ? level : 'ok';
  }, [level, engineOn, nearest.dir, th.stop, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the banner distance current while an alert is showing (without re-speaking).
  const shown = nearest.d.toFixed(1);
  useEffect(() => {
    const k = level === 'stop' ? 'alert.proximityStop' : 'alert.proximityWarn';
    useStore.setState((st) => ({ alerts: st.alerts.map((a) => (a.key === k ? { ...a, params: { ...a.params, dist: shown } } : a)) }));
  }, [shown, level]);

  // Radar drawing: rings at stop / warn / 20 m.
  const R = 130, scale = R / 20, c = 150;
  const pos: Record<Dir, [number, number]> = { front: [0, -1], rear: [0, 1], left: [-1, 0], right: [1, 0] };
  const tone = (d: number) => (d < th.stop ? 'var(--stop)' : d < th.warn ? 'var(--warn)' : 'var(--ok)');

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{t('safety.proximity')}</h3>
        <span className={`pill ${level === 'ok' ? 'ok' : level}`}>{level === 'ok' ? t('safety.clear') : `${nearest.d.toFixed(1)} m · ${t(`dir.${nearest.dir}`)}`}</span>
      </div>
      <svg viewBox="0 0 300 300" className="radar" width={300} height={300} role="img" aria-label={t('safety.proximity')}>
        <circle cx={c} cy={c} r={R} fill="none" stroke="var(--line)" />
        <circle cx={c} cy={c} r={th.warn * scale} fill="color-mix(in srgb, var(--warn) 10%, transparent)" stroke="var(--warn)" strokeDasharray="4 4" />
        <circle cx={c} cy={c} r={th.stop * scale} fill="color-mix(in srgb, var(--stop) 14%, transparent)" stroke="var(--stop)" />
        <rect x={c - 12} y={c - 22} width={24} height={44} rx={4} fill="var(--cat)" />
        {DIRS.map((d) => {
          const [dx, dy] = pos[d];
          return <circle key={d} cx={c + dx * zones[d] * scale} cy={c + dy * zones[d] * scale} r={7} fill={tone(zones[d])} stroke="var(--surface)" strokeWidth={2} />;
        })}
        <text x={c + R - 4} y={c - 4} fill="var(--muted)" fontSize={11} textAnchor="end">20 m</text>
      </svg>
      <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>{t('safety.buffers', { warn: th.warn, stop: th.stop })}</p>
      <div className="row">
        <button className="ghost" onClick={() => { intrusion.current = { dir: DIRS[Math.floor(Math.random() * 4)], d: 9 }; }}>{t('safety.simulate')}</button>
        <button className="ghost" onClick={() => setCamWanted(!camWanted)}>
          📷 {cam === 'on' ? t('safety.camOff') : cam === 'loading' ? '…' : t('safety.camOn')}
        </button>
      </div>
      {cam === 'error' && <p className="pill stop">{t('safety.camError')}</p>}
      {(cam === 'loading' || cam === 'on') && (
        <div className="camwrap" style={{ marginTop: 12 }}>
          <video ref={video} muted playsInline />
          <canvas ref={canvas} />
        </div>
      )}
    </div>
  );
}
