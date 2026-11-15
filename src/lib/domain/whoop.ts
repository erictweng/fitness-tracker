import { addDays, logDateFor } from "./day";

/** WHOOP reports energy in kilojoules. */
export const kjToKcal = (kj: number) => Math.round(kj / 4.184);

/** Fields we read from WHOOP v2 cycles / workouts (docs/SPEC-v0-research.md §2). */
export type WhoopCycle = {
  id: number;
  start: string;
  end?: string | null;
  score_state: string; // SCORED | PENDING_SCORE | UNSCORABLE
  score?: { kilojoule?: number | null } | null;
};
export type WhoopWorkout = {
  id: string;
  start: string;
  end: string;
  sport_name: string;
  score_state: string;
  score?: { kilojoule?: number | null; strain?: number | null } | null;
};

export type DayRow = { log_date: string; kcal: number | null; in_progress: boolean };
export type WorkoutImport = { external_id: string; log_date: string; type: string; minutes: number; kcal: number | null; notes: string | null };

type DayRule = { timezone: string; day_end_hour: number };

/**
 * A WHOOP "day" is a cycle (wake to next sleep), not midnight to midnight. Each cycle
 * counts toward the app day its start falls on (user's timezone + day-end hour).
 * Two cycles starting the same app day are added together. A day is "in progress" while
 * its cycle has no end; its kcal is unknown (null) if WHOOP hasn't scored it.
 * Only days on/after `fromDate` are returned (earlier ones may be partial).
 */
export function cyclesToDays(cycles: WhoopCycle[], rule: DayRule, fromDate: string): DayRow[] {
  const days = new Map<string, DayRow>();
  for (const c of cycles) {
    const date = logDateFor(new Date(c.start), rule.timezone, rule.day_end_hour);
    if (date < fromDate) continue;
    const scored = c.score_state === "SCORED" && typeof c.score?.kilojoule === "number";
    const prev = days.get(date) ?? { log_date: date, kcal: 0, in_progress: false };
    days.set(date, {
      log_date: date,
      kcal: prev.kcal === null || !scored ? null : prev.kcal + kjToKcal(c.score!.kilojoule!),
      in_progress: prev.in_progress || !c.end,
    });
  }
  return [...days.values()].sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export function workoutToImport(w: WhoopWorkout, rule: DayRule): WorkoutImport {
  const mins = Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60_000);
  const scored = w.score_state === "SCORED" && typeof w.score?.kilojoule === "number";
  const name = (w.sport_name || "Workout").replace(/[-_]+/g, " ").trim();
  return {
    external_id: String(w.id),
    log_date: logDateFor(new Date(w.start), rule.timezone, rule.day_end_hour),
    type: (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 60),
    minutes: Math.min(600, Math.max(1, Number.isFinite(mins) ? mins : 1)),
    kcal: scored ? Math.min(3000, kjToKcal(w.score!.kilojoule!)) : null,
    notes: scored && typeof w.score?.strain === "number" ? `Strain ${w.score.strain.toFixed(1)}` : null,
  };
}

export const BURN_WINDOW_DAYS = 14;
export const BURN_MIN_DAYS = 7;

/**
 * Average daily burn over the 14 full days before `today` (today is still growing).
 * Only finished, scored days count; needs at least 7, else null (fall back to the formula).
 */
export function averageBurn(days: DayRow[], today: string): { kcal: number; days: number } | null {
  const from = addDays(today, -BURN_WINDOW_DAYS);
  const good = days.filter((d) => d.log_date >= from && d.log_date < today && !d.in_progress && d.kcal !== null && d.kcal > 0);
  if (good.length < BURN_MIN_DAYS) return null;
  const sum = good.reduce((s, d) => s + (d.kcal as number), 0);
  return { kcal: Math.round(sum / good.length), days: good.length };
}

/** Today screen line: eaten − burned (negative = deficit). Null when burn is unknown. */
export function netKcal(eaten: number, burned: number | null): number | null {
  return burned === null ? null : eaten - burned;
}
