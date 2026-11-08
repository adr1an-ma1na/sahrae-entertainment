import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';

const W = 340, H = 180, PAD_X = 26, PAD_Y = 16;
const MAX = 1500;
const LABELS = [['60', 'Sub'], ['230', 'Bass'], ['910', 'Mids'], ['3.6k', 'Presence'], ['14k', 'Air']];

const xOf = (i: number, n: number) => PAD_X + (i * (W - 2 * PAD_X)) / (n - 1);
const yOf = (mb: number) => H / 2 - (mb / MAX) * (H / 2 - PAD_Y);

/** A smooth line through the points (Catmull-Rom as Bézier), the shape a listener hears. */
function curvePath(pts: [number, number][]): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** The equaliser as one curve to shape with a finger, as in Spotify. Drag anywhere near a point. */
export default function EqCurve({ bands, dimmed, onChange }: { bands: number[]; dimmed?: boolean; onChange: (i: number, mb: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState<number | null>(null);
  const pts = bands.map((b, i) => [xOf(i, bands.length), yOf(b)] as [number, number]);
  const line = curvePath(pts);

  const valueFrom = (clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    const y = ((clientY - r.top) / r.height) * H;
    const mb = ((H / 2 - y) / (H / 2 - PAD_Y)) * MAX;
    return Math.max(-MAX, Math.min(MAX, Math.round(mb / 50) * 50));
  };
  const bandFrom = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((x - PAD_X) / (W - 2 * PAD_X)) * (bands.length - 1));
    return Math.max(0, Math.min(bands.length - 1, i));
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    const i = bandFrom(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(i);
    onChange(i, valueFrom(e.clientY));
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => { if (held !== null) onChange(held, valueFrom(e.clientY)); };
  const up = () => setHeld(null);

  return (
    <div className={`transition-opacity ${dimmed ? 'opacity-60' : ''}`}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto cursor-ns-resize" style={{ touchAction: 'none' }}
        role="img" aria-label="Equaliser curve. Drag a point up or down." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <defs>
          <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--acc-400)" stopOpacity="0.42" />
            <stop offset="1" stopColor="var(--acc-400)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[-MAX, -MAX / 2, 0, MAX / 2, MAX].map((g) => (
          <line key={g} x1={PAD_X} x2={W - PAD_X} y1={yOf(g)} y2={yOf(g)} stroke="rgba(255,255,255,0.09)" strokeWidth={g === 0 ? 1.2 : 0.7} strokeDasharray={g === 0 ? undefined : '2 5'} />
        ))}
        {pts.map(([x], i) => <line key={i} x1={x} x2={x} y1={PAD_Y} y2={H - PAD_Y} stroke="rgba(255,255,255,0.05)" />)}
        <path d={`${line} L${pts[pts.length - 1][0]},${H - PAD_Y} L${pts[0][0]},${H - PAD_Y} Z`} fill="url(#eq-fill)" />
        <path d={line} fill="none" stroke="var(--acc-400)" strokeWidth={3} strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <g key={i}>
            {held === i && <circle cx={x} cy={y} r={16} fill="var(--acc-400)" opacity={0.25} />}
            <circle cx={x} cy={y} r={7.5} fill="#fff" stroke="var(--acc-400)" strokeWidth={3} />
            {held === i && <text x={x} y={Math.max(13, y - 20)} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">{bands[i] > 0 ? '+' : ''}{(bands[i] / 100).toFixed(1)} dB</text>}
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-5 -mt-1 px-1">
        {LABELS.map(([hz, name]) => (
          <div key={hz} className="text-center">
            <p className="text-[11px] font-bold text-zinc-200 tabular">{hz}</p>
            <p className="text-[10px] text-zinc-500">{name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
