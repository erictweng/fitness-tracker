import { addDays } from "./day";

export type WeighIn = { log_date: string; weight_kg: number };

/** Weigh-ins in the 7 days ending on `onDate` (inclusive). */
export function windowOf(weighIns: WeighIn[], onDate: string): WeighIn[] {
  const from = addDays(onDate, -6);
  return weighIns.filter((w) => w.log_date >= from && w.log_date <= onDate);
}

/** 7-day average; needs at least 3 weigh-ins in the window (spec), else null. */
export function sevenDayAverage(weighIns: WeighIn[], onDate: string): number | null {
  const w = windowOf(weighIns, onDate);
  if (w.length < 3) return null;
  return w.reduce((s, x) => s + Number(x.weight_kg), 0) / w.length;
}

export function latestOnOrBefore(weighIns: WeighIn[], onDate: string): WeighIn | null {
  let best: WeighIn | null = null;
  for (const w of weighIns) if (w.log_date <= onDate && (!best || w.log_date > best.log_date)) best = w;
  return best;
}

/** Weight used for targets: the 7-day average, else the latest weigh-in. */
export function weightForTargets(weighIns: WeighIn[], onDate: string): { kg: number; source: "average" | "latest" } | null {
  const avg = sevenDayAverage(weighIns, onDate);
  if (avg !== null) return { kg: avg, source: "average" };
  const last = latestOnOrBefore(weighIns, onDate);
  return last ? { kg: Number(last.weight_kg), source: "latest" } : null;
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/**
 * The weekly suggestion card. Targets change at most once a week: the card
 * shows from Monday when the suggestion differs from the current target, the
 * current target was set before this week, and it wasn't dismissed this week.
 */
export function shouldSuggest(o: {
  today: string;
  current: { kcal: number; protein_g: number; effective_from: string } | null;
  suggestion: { kcal: number; proteinG: number } | null;
  dismissedWeek: string | null;
}): boolean {
  if (!o.suggestion || !o.current) return false;
  const week = mondayOf(o.today);
  if (o.current.effective_from >= week) return false;
  if (o.dismissedWeek === week) return false;
  return Math.abs(o.current.kcal - o.suggestion.kcal) >= 10 || Math.abs(o.current.protein_g - o.suggestion.proteinG) >= 1;
}

/** Points for the chart: each day's weigh-in and the 7-day average where it exists. */
export function series(weighIns: WeighIn[], from: string, to: string) {
  const byDate = new Map(weighIns.map((w) => [w.log_date, Number(w.weight_kg)]));
  const out: { date: string; kg: number | null; avgKg: number | null }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push({ date: d, kg: byDate.get(d) ?? null, avgKg: sevenDayAverage(weighIns, d) });
  }
  return out;
}
