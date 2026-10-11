import { useId, useMemo, useState } from 'react';
import type { ReadingsResp } from '../types';

const W = 300, H = 64;

function colorFor(delta: number) {
  const a = Math.abs(delta);
  if (a >= 20) return { line: '#d92d20', bg: '#fef3f2', fg: '#b42318' };
  if (a >= 8) return { line: '#f79009', bg: '#fffaeb', fg: '#b54708' };
  return { line: '#1d4ed8', bg: '#eff4ff', fg: '#1d4ed8' };
}

function Mini({ meta, values, nominal }: { meta: { key: string; name: string; unit: string }; values: number[]; nominal: number }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const m = useMemo(() => {
    if (n < 2) return null;
    let lo = Math.min(...values, nominal), hi = Math.max(...values, nominal);
    const pad = (hi - lo || Math.abs(hi) * 0.02 || 1) * 0.2;
    lo -= pad; hi += pad;
    const x = (i: number) => (i / (n - 1)) * W;
    const y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return { x, y, line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [values, nominal, n]);
  if (!m) return <div className="chart" />;
  const last = values[n - 1];
  const shown = hover != null ? values[hover] : last;
  const delta = nominal ? ((last - nominal) / Math.abs(nominal)) * 100 : 0;
  const c = colorFor(delta);
  const digits = Math.abs(shown) >= 100 ? 0 : Math.abs(shown) >= 10 ? 1 : 2;
  return (
    <div className="chart">
      <div className="t">
        <span>{meta.name}</span>
        <span className="delta num" style={{ background: c.bg, color: c.fg }}>{delta >= 0 ? '+' : ''}{delta.toFixed(0)}%</span>
      </div>
      <div className="val num">{shown.toFixed(digits)}<small>{meta.unit}</small></div>
      <svg
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Grafik ${meta.name}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.line} stopOpacity=".16" /><stop offset="100%" stopColor={c.line} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={m.y(nominal)} y2={m.y(nominal)} stroke="#98a2b3" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={m.area} fill={`url(#g${uid})`} />
        <path d={m.line} fill="none" stroke={c.line} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={m.x(hover)} x2={m.x(hover)} y1="0" y2={H} stroke="#98a2b3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}

export default function SensorChart({ data }: { data: ReadingsResp }) {
  return (
    <div className="charts">
      {data.sensors.map((s) => (
        <Mini key={s.key} meta={s} values={data.readings.map((r) => r[s.key] as number)} nominal={data.nominal[s.key]} />
      ))}
    </div>
  );
}
