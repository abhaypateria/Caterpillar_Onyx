import { useState } from 'react';

/**
 * Small inline-SVG charts (Person A). Single-measure charts: one hue (CAT yellow for the
 * data line/bars), recessive grid, text in text colours. Safety colours only mark real states.
 */

const INK = 'var(--text)', MUTED = 'var(--muted)', GRID = 'var(--line)';

/** Risk over time with threshold, event markers and a hover crosshair. */
export function RiskChart({ points, threshold, cursor, markers, onPick, thresholdLabel = 'alarm' }: {
  points: { label: string; value: number }[]; threshold: number; cursor?: number; thresholdLabel?: string;
  markers?: { index: number; label: string; tone: 'warn' | 'stop' }[]; onPick?: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, L = 36, R = 12, T = 16, B = 28;
  const x = (i: number) => L + (i / Math.max(1, points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const h = hover ?? cursor;
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width * W - L) / (W - L - R) * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, i));
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, display: 'block' }} role="img" aria-label="Risk over time"
        onMouseMove={(e) => setHover(pick(e))} onMouseLeave={() => setHover(null)} onClick={(e) => onPick?.(pick(e))}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} fill={MUTED} fontSize={11} textAnchor="end">{v * 100}%</text></g>
        ))}
        <line x1={L} x2={W - R} y1={y(threshold)} y2={y(threshold)} stroke="var(--warn)" strokeDasharray="5 4" strokeWidth={1.5} />
        <text x={W - R} y={y(threshold) - 6} fill={MUTED} fontSize={11} textAnchor="end">{thresholdLabel} {threshold * 100}%</text>
        {points.filter((_, i) => i % 12 === 0).map((p) => {
          const i = points.indexOf(p);
          return <text key={i} x={x(i)} y={H - 8} fill={MUTED} fontSize={11} textAnchor="middle">{p.label}</text>;
        })}
        <path d={path} fill="none" stroke="var(--cat)" strokeWidth={2} strokeLinejoin="round" />
        {markers?.map((m, k) => (
          <g key={m.label}>
            <line x1={x(m.index)} x2={x(m.index)} y1={T} y2={H - B} stroke={`var(--${m.tone})`} strokeWidth={1.5} />
            <circle cx={x(m.index)} cy={y(points[m.index].value)} r={5} fill={`var(--${m.tone})`} stroke="var(--surface)" strokeWidth={2} />
            {/* Labels sit in the lower band, staggered so neighbouring markers don't collide. */}
            <text x={x(m.index) + 6} y={H - B - 10 - k * 16} fill={INK} fontSize={12}>{m.label}</text>
          </g>
        ))}
        {h !== undefined && h !== null && points[h] && (
          <g pointerEvents="none">
            <line x1={x(h)} x2={x(h)} y1={T} y2={H - B} stroke={MUTED} strokeWidth={1} />
            <circle cx={x(h)} cy={y(points[h].value)} r={4} fill="var(--cat)" stroke="var(--surface)" strokeWidth={2} />
            <g transform={`translate(${Math.min(x(h) + 8, W - 110)},${Math.max(y(points[h].value) - 34, T)})`}>
              <rect width={100} height={26} rx={6} fill="var(--surface-2)" stroke={GRID} />
              <text x={8} y={17} fill={INK} fontSize={12} className="mono">{points[h].label} · {(points[h].value * 100).toFixed(0)}%</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Horizontal bars (0..max) with optional reference line. Labels in text colours; value at bar end. */
export function Bars({ rows, max = 1, fmt = (v: number) => `${Math.round(v * 100)}%`, reference }: {
  rows: { label: string; value: number; highlight?: boolean }[]; max?: number; fmt?: (v: number) => string;
  reference?: { value: number; label: string };
}) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className="barrow" title={`${r.label}: ${fmt(r.value)}`}>
          <span className="barlabel">{r.label}</span>
          <span className="bartrack">
            <span className="barfill" style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, opacity: r.highlight === false ? 0.45 : 1 }} />
            {reference && <span className="barref" style={{ left: `${(reference.value / max) * 100}%` }} title={reference.label} />}
          </span>
          <span className="barval mono">{fmt(r.value)}</span>
        </div>
      ))}
      {reference && <div className="muted" style={{ fontSize: 13 }}>┆ {reference.label}</div>}
    </div>
  );
}

/** Semicircle gauge for a single 0..1 value (the one hero number on the Replay screen). */
export function Gauge({ value, threshold, label }: { value: number; threshold: number; label: string }) {
  const a = (v: number) => Math.PI * (1 - v);
  const pt = (v: number, r: number) => [100 + r * Math.cos(a(v)), 100 - r * Math.sin(a(v))];
  const arc = (v0: number, v1: number, r: number) => {
    const [x0, y0] = pt(v0, r), [x1, y1] = pt(v1, r);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  const tone = value > threshold ? 'var(--stop)' : value > threshold * 0.7 ? 'var(--warn)' : 'var(--ok)';
  const [tx, ty] = pt(threshold, 92);
  return (
    <svg viewBox="0 0 200 118" style={{ width: '100%', maxWidth: 300 }} role="img" aria-label={`${label} ${Math.round(value * 100)}%`}>
      <path d={arc(0, 1, 80)} stroke="var(--surface-2)" strokeWidth={16} fill="none" strokeLinecap="round" />
      <path d={arc(0, Math.max(0.001, Math.min(1, value)), 80)} stroke={tone} strokeWidth={16} fill="none" strokeLinecap="round" />
      <line x1={pt(threshold, 68)[0]} y1={pt(threshold, 68)[1]} x2={tx} y2={ty} stroke={INK} strokeWidth={2} />
      <text x={100} y={92} textAnchor="middle" fill={INK} fontSize={34} fontWeight={800} className="mono">{Math.round(value * 100)}%</text>
      <text x={100} y={112} textAnchor="middle" fill={MUTED} fontSize={11}>{label}</text>
    </svg>
  );
}

/** Labelled meter 0..100 for profile scores. */
export function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="barrow" title={`${label}: ${value}`}>
      <span className="barlabel">{label}</span>
      <span className="bartrack"><span className="barfill" style={{ width: `${value}%` }} /></span>
      <span className="barval mono">{value}</span>
    </div>
  );
}
