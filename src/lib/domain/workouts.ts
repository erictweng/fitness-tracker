import { NOTES_MAX } from "./entries";

export type WorkoutInput = { type: string; minutes: number; kcal: number | null; notes: string | null };
export type WorkoutParsed = { ok: true; value: WorkoutInput } | { ok: false; errors: Record<string, string> };

export const WORKOUT_TYPE_MAX = 60;

function int(raw: unknown): number | null | "bad" {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : "bad";
}

/** type 1–60 chars, minutes 1–600, kcal 0–3000 (optional), notes ≤ 280 (optional). */
export function parseWorkout(form: { get(k: string): unknown }): WorkoutParsed {
  const errors: Record<string, string> = {};
  const type = String(form.get("type") ?? "").trim();
  if (!type) errors.type = "What did you do?";
  else if (type.length > WORKOUT_TYPE_MAX) errors.type = `Keep it under ${WORKOUT_TYPE_MAX} characters.`;
  const minutes = int(form.get("minutes"));
  if (minutes === null || minutes === "bad" || minutes < 1 || minutes > 600) errors.minutes = "Minutes must be 1–600.";
  const kcal = int(form.get("kcal"));
  if (kcal === "bad" || (kcal !== null && (kcal < 0 || kcal > 3000))) errors.kcal = "Calories burned must be 0–3,000.";
  const notes = String(form.get("notes") ?? "").trim();
  if (notes.length > NOTES_MAX) errors.notes = `Keep notes under ${NOTES_MAX} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type, minutes: minutes as number, kcal: kcal as number | null, notes: notes || null } };
}

/** Context only: never added to the calorie target. */
export function burned(workouts: { kcal: number | null }[]): { kcal: number; unknown: number } {
  let kcal = 0, unknown = 0;
  for (const w of workouts) {
    if (w.kcal === null) unknown += 1;
    else kcal += w.kcal;
  }
  return { kcal, unknown };
}
