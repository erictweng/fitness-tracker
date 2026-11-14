import type { HistoryDay } from "@/lib/domain/history";

const W = 340, H = 150, PL = 34, PR = 8, PT = 10, PB = 20;

function dayLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

/** Bars per day with the target as a step line. Missing days are gaps, never zero bars. */
export function BarChart({
  days,
  value,
  target,
  unit,
  label,
  testId,
}: {
  days: HistoryDay[];
  value: (d: HistoryDay) => number | null;
  target: (d: HistoryDay) => number | null;
  unit: string;
  label: string;
  testId: string;
}) {
  const vals = days.flatMap((d) => [value(d), target(d)]).filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals) * 1.1;
  const n = days.length;
  const slot = (W - PL - PR) / n;
  const x = (i: number) => PL + i * slot;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const step = days
    .map((d, i) => {
      const t = target(d);
      return t === null ? null : `M ${x(i)} ${y(t)} H ${x(i + 1)}`;
    })
    .filter(Boolean)
    .join(" ");
  const tick = n <= 7 ? 1 : 7;
  return (
    <figure className="card flex flex-col gap-2" data-testid={testId}>
      <figcaption className="text-sm font-semibold">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}, daily ${unit} with target line`}>
        <text x={2} y={PT + 8} className="fill-muted text-[9px]">{Math.round(max)}</text>
        <text x={2} y={H - PB} className="fill-muted text-[9px]">0</text>
        {days.map((d, i) => {
          const v = value(d);
          if (v === null) return null;
          const t = target(d);
          const over = t !== null && v > t;
          return (
            <rect
              key={d.date}
              x={x(i) + slot * 0.15}
              y={y(v)}
              width={slot * 0.7}
              height={Math.max(0, H - PB - y(v))}
              rx={Math.min(3, slot * 0.2)}
              fill={over ? "var(--warn)" : "var(--accent)"}
              opacity={0.85}
              data-testid={`${testId}-bar`}
            >
              <title>{`${d.date}: ${v} ${unit}${t !== null ? ` (target ${t})` : ""}`}</title>
            </rect>
          );
        })}
        {step && <path d={step} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" opacity={0.7} />}
        {days.map((d, i) => (i % tick === 0 || i === n - 1 ? (
          <text key={d.date} x={x(i) + slot / 2} y={H - 5} textAnchor="middle" className="fill-muted text-[9px]">{dayLabel(d.date)}</text>
        ) : null))}
      </svg>
      <span className="flex gap-4 text-xs text-muted">
        <span><span className="text-accent">■</span> at/under target</span>
        <span><span className="text-warn">■</span> over</span>
        <span>- - target</span>
      </span>
    </figure>
  );
}

export function WeightChart({ days, toUnit, unit }: { days: HistoryDay[]; toUnit: (kg: number) => number; unit: string }) {
  const vals = days.flatMap((d) => [d.weightKg, d.avgKg]).filter((v): v is number => v !== null).map(toUnit);
  if (vals.length < 2) {
    return <p className="card text-sm text-muted" data-testid="history-weight-empty">Not enough weigh-ins in this range for a trend.</p>;
  }
  const min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
  const n = days.length;
  const x = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, n - 1);
  const y = (v: number) => PT + (H - PT - PB) * (1 - (v - min) / (max - min));
  const avg = days
    .map((d, i) => (d.avgKg === null ? null : `${x(i)},${y(toUnit(d.avgKg))}`))
    .filter(Boolean)
    .join(" L ");
  return (
    <figure className="card flex flex-col gap-2" data-testid="history-weight">
      <figcaption className="text-sm font-semibold">Weight ({unit})</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Weight in ${unit}, daily points and 7-day average`}>
        <text x={2} y={PT + 8} className="fill-muted text-[9px]">{max.toFixed(1)}</text>
        <text x={2} y={H - PB} className="fill-muted text-[9px]">{min.toFixed(1)}</text>
        {avg && <path d={`M ${avg}`} fill="none" stroke="var(--accent)" strokeWidth={2.5} />}
        {days.map((d, i) => (d.weightKg === null ? null : (
          <circle key={d.date} cx={x(i)} cy={y(toUnit(d.weightKg))} r={3} fill="var(--text)" opacity={0.7} />
        )))}
      </svg>
      <span className="flex gap-4 text-xs text-muted"><span>● daily</span><span className="text-accent">— 7-day average</span></span>
    </figure>
  );
}
