/**
 * Day rules. A "day" runs from the user's day-end hour (0–6) to the same hour
 * the next calendar day, in the user's timezone. 1:30 AM with a 3 AM day end
 * belongs to the previous date.
 */
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

type LocalParts = { y: number; m: number; d: number; h: number };

export function localParts(at: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD shifted by `days` (pure calendar math, no timezone involved). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function logDateFor(at: Date, timeZone: string, dayEndHour: number): string {
  const { y, m, d, h } = localParts(at, timeZone);
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return h < dayEndHour ? addDays(iso, -1) : iso;
}

export function mealFor(at: Date, timeZone: string, dayEndHour: number): Meal {
  const { h } = localParts(at, timeZone);
  if (h >= dayEndHour && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 21) return "dinner";
  return "snack";
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return addDays(v, 0) === v;
}

export function ageOn(birthDate: string, onDate: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
