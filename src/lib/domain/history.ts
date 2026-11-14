import { addDays } from "./day";
import { sevenDayAverage, type WeighIn } from "./weight";

export type DayEntry = { log_date: string; kcal: number; protein_g: number | null };
export type TargetRow = { effective_from: string; kcal: number; protein_g: number };

export type HistoryDay = {
  date: string;
  /** null = nothing logged that day (a gap, not a zero). */
  kcal: number | null;
  protein: number | null;
  targetKcal: number | null;
  targetProtein: number | null;
  weightKg: number | null;
  avgKg: number | null;
};

/** The target in effect on `date`: latest effective_from on or before it. */
export function targetOn(targets: TargetRow[], date: string): TargetRow | null {
  let best: TargetRow | null = null;
  for (const t of targets) if (t.effective_from <= date && (!best || t.effective_from >= best.effective_from)) best = t;
  return best;
}

export function historyDays(o: {
  from: string;
  to: string;
  entries: DayEntry[];
  targets: TargetRow[];
  weighIns: WeighIn[];
}): HistoryDay[] {
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const e of o.entries) {
    const d = byDay.get(e.log_date) ?? { kcal: 0, protein: 0 };
    d.kcal += Number(e.kcal);
    d.protein += Number(e.protein_g ?? 0);
    byDay.set(e.log_date, d);
  }
  const weights = new Map(o.weighIns.map((w) => [w.log_date, Number(w.weight_kg)]));
  const out: HistoryDay[] = [];
  for (let date = o.from; date <= o.to; date = addDays(date, 1)) {
    const d = byDay.get(date);
    const t = targetOn(o.targets, date);
    out.push({
      date,
      kcal: d ? Math.round(d.kcal) : null,
      protein: d ? Math.round(d.protein * 10) / 10 : null,
      targetKcal: t?.kcal ?? null,
      targetProtein: t?.protein_g ?? null,
      weightKg: weights.get(date) ?? null,
      avgKg: sevenDayAverage(o.weighIns, date),
    });
  }
  return out;
}

export type Averages = { days: number; kcal: number | null; protein: number | null; kcalVsTarget: number | null };

/**
 * Averages over days that have something logged, excluding `today` (still in progress).
 * Missed days are left out, not counted as zero.
 */
export function averages(days: HistoryDay[], today: string): Averages {
  const logged = days.filter((d) => d.date !== today && d.kcal !== null);
  if (!logged.length) return { days: 0, kcal: null, protein: null, kcalVsTarget: null };
  const kcal = logged.reduce((s, d) => s + (d.kcal ?? 0), 0) / logged.length;
  const protein = logged.reduce((s, d) => s + (d.protein ?? 0), 0) / logged.length;
  const withTarget = logged.filter((d) => d.targetKcal !== null);
  const diff = withTarget.length
    ? withTarget.reduce((s, d) => s + ((d.kcal ?? 0) - (d.targetKcal ?? 0)), 0) / withTarget.length
    : null;
  return {
    days: logged.length,
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    kcalVsTarget: diff === null ? null : Math.round(diff),
  };
}
