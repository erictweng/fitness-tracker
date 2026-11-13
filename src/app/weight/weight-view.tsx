"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toDisplayWeight, type WeightUnit } from "@/lib/domain/units";
import type { WeighIn } from "@/lib/domain/weight";
import { deleteWeighIn, restoreWeighIn, saveWeighIn } from "./actions";

type Point = { date: string; kg: number | null; avgKg: number | null };

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

export function WeightView({ unit, today, points, recent }: { unit: WeightUnit; today: string; points: Point[]; recent: WeighIn[] }) {
  const show = (kg: number) => toDisplayWeight(kg, unit).toFixed(1);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<{ text: string; logDate: string; previousKg: number | null } | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useRef<string | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const latestAvg = [...points].reverse().find((p) => p.avgKg !== null)?.avgKg ?? null;
  const last = recent[0];

  function toast(text: string, logDate: string, previousKg: number | null) {
    setUndo({ text, logDate, previousKg });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5000);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    id.current ??= crypto.randomUUID();
    const fd = new FormData();
    fd.set("id", id.current);
    fd.set("log_date", date);
    fd.set("weight", value);
    start(async () => {
      const r = await saveWeighIn(fd);
      id.current = null;
      if (!r.ok) { setErrors(r.errors ?? { weight: r.message ?? "Couldn't save." }); return; }
      setErrors({});
      setValue("");
      toast(r.previousKg === null ? `Saved ${value} ${unit}` : `Replaced ${show(r.previousKg)} ${unit}`, r.logDate, r.previousKg);
    });
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-sm text-muted">Latest</p>
          <p className="text-3xl font-bold tabular-nums" data-testid="latest-weight">{last ? `${show(last.weight_kg)}` : "—"}</p>
          <p className="text-xs text-muted">{last ? `${unit} · ${fmtDay(last.log_date)}` : unit}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">7-day average</p>
          <p className="text-3xl font-bold tabular-nums" data-testid="avg-weight">{latestAvg === null ? "—" : show(latestAvg)}</p>
          <p className="text-xs text-muted">{latestAvg === null ? "Need 3 weigh-ins this week" : unit}</p>
        </div>
      </section>

      <form className="card flex flex-col gap-3" onSubmit={save}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Weight ({unit})</span>
            <input className="input" inputMode="decimal" aria-label="Weight" value={value} onChange={(e) => setValue(e.target.value)} required />
            {errors.weight && <span className="text-sm text-warn">{errors.weight}</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Day</span>
            <input className="input" type="date" aria-label="Day" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            {errors.log_date && <span className="text-sm text-warn">{errors.log_date}</span>}
          </label>
        </div>
        <button className="btn" type="submit" disabled={pending}>Save weigh-in</button>
      </form>

      <Chart points={points} unit={unit} />

      <section className="card flex flex-col gap-2">
        <h2 className="font-semibold">Recent</h2>
        {recent.length === 0 && <p className="text-sm text-muted">No weigh-ins yet.</p>}
        <ul className="flex flex-col divide-y divide-border" data-testid="weigh-ins">
          {recent.map((w) => (
            <li key={w.log_date} className="flex items-center justify-between py-2">
              <button type="button" className="flex flex-1 justify-between pr-4 text-left" onClick={() => { setDate(w.log_date); setValue(show(w.weight_kg)); }}>
                <span>{fmtDay(w.log_date)}</span>
                <span className="tabular-nums font-medium">{show(w.weight_kg)} {unit}</span>
              </button>
              <button
                type="button"
                className="text-sm text-danger"
                aria-label={`Delete ${w.log_date}`}
                onClick={() => start(async () => {
                  const r = await deleteWeighIn(w.log_date);
                  if (r.ok && r.previousKg !== null) toast(`Deleted ${show(r.previousKg)} ${unit}`, w.log_date, r.previousKg);
                })}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      {undo && (
        <div role="status" className="card fixed bottom-6 left-1/2 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between" data-testid="undo-toast">
          <span className="truncate">{undo.text}</span>
          <button
            type="button"
            className="font-semibold text-accent"
            onClick={() => {
              const u = undo;
              setUndo(null);
              start(async () => { await restoreWeighIn(u.logDate, u.previousKg); });
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}

function Chart({ points, unit }: { points: Point[]; unit: WeightUnit }) {
  const vals = points.flatMap((p) => [p.kg, p.avgKg]).filter((v): v is number => v !== null).map((v) => toDisplayWeight(v, unit));
  if (vals.length < 2) {
    return <p className="card text-sm text-muted" data-testid="chart-empty">Log a few weigh-ins to see your trend.</p>;
  }
  const W = 340, H = 160, P = 24;
  const min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / (max - min);
  const avgPath = points
    .map((p, i) => (p.avgKg === null ? null : `${x(i)},${y(toDisplayWeight(p.avgKg, unit))}`))
    .filter(Boolean)
    .join(" L ");
  return (
    <figure className="card" data-testid="weight-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Weight trend with 7-day average, in ${unit}`}>
        <text x={P} y={14} className="fill-muted text-[10px]">{max.toFixed(1)}</text>
        <text x={P} y={H - 6} className="fill-muted text-[10px]">{min.toFixed(1)}</text>
        {avgPath && <path d={`M ${avgPath}`} fill="none" stroke="var(--accent)" strokeWidth={2.5} />}
        {points.map((p, i) => (p.kg === null ? null : <circle key={p.date} cx={x(i)} cy={y(toDisplayWeight(p.kg, unit))} r={3} fill="var(--text)" opacity={0.7} />))}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted">
        <span>● daily</span><span className="text-accent">— 7-day average</span><span>up to 30 days</span>
      </figcaption>
    </figure>
  );
}
