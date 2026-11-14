import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zipSync, strToU8 } from "fflate";
import { toCsv } from "./domain/csv";

const TABLES = {
  entries: "id, log_date, logged_at, meal, name, food_id, servings, grams, kcal, protein_g, fat_g, carbs_g, notes, source, updated_at",
  foods: "id, name, kcal, protein_g, fat_g, carbs_g, serving_label, serving_g, archived_at, created_at",
  meals: "id, name, created_at",
  meal_items: "id, meal_id, food_id, servings",
  weigh_ins: "id, log_date, weight_kg, source, updated_at",
  targets: "id, effective_from, kcal, protein_g, source, created_at",
  workouts: "id, log_date, type, minutes, kcal, notes, source, created_at, updated_at",
} as const;

const SETTINGS =
  "email, sex, birth_date, height_cm, activity_level, goal, goal_adjust_kcal, protein_rule, protein_value, weight_unit, height_unit, day_end_hour, require_protein, require_fat, require_carbs, timezone, onboarded_at, created_at";

/** Zip of the signed-in user's own rows (RLS scopes every query to them). Deleted entries/weigh-ins are left out. */
export async function buildExport(supabase: SupabaseClient, userId: string): Promise<{ zip: Uint8Array; counts: Record<string, number> }> {
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};
  for (const [table, cols] of Object.entries(TABLES)) {
    let q = supabase.from(table).select(cols).eq("user_id", userId);
    if (table === "entries" || table === "weigh_ins" || table === "workouts") q = q.is("deleted_at", null);
    const { data, error } = await q.order("id").limit(100_000);
    if (error) throw new Error(`export ${table}: ${error.code}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    files[`${table}.csv`] = strToU8(toCsv(rows, cols.split(", ")));
    counts[table] = rows.length;
  }
  const { data: profile, error } = await supabase.from("profiles").select(SETTINGS).eq("user_id", userId).single();
  if (error) throw new Error(`export settings: ${error.code}`);
  files["settings.csv"] = strToU8(toCsv([profile as unknown as Record<string, unknown>], SETTINGS.split(", ")));
  files["README.txt"] = strToU8(
    "Fitness Tracker export. Weights are in kg, heights in cm, energy in kcal, macros in grams.\r\n" +
      "Dates are your local day (log_date); timestamps are UTC.\r\n",
  );
  return { zip: zipSync(files, { level: 6 }), counts };
}
