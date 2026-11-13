import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity, Goal, ProteinRule, Sex } from "./domain/targets";
import type { WeightUnit } from "./domain/units";
import { logDateFor } from "./domain/day";

export type Profile = {
  user_id: string;
  email: string;
  is_admin: boolean;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  activity_level: Activity | null;
  goal: Goal;
  goal_adjust_kcal: number;
  protein_rule: ProteinRule;
  protein_value: number;
  weight_unit: WeightUnit;
  height_unit: "ftin" | "cm";
  day_end_hour: number;
  require_protein: boolean;
  require_fat: boolean;
  require_carbs: boolean;
  timezone: string;
  onboarded_at: string | null;
  suggestion_dismissed_week: string | null;
};

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return {
    ...data,
    height_cm: data.height_cm === null ? null : Number(data.height_cm),
    protein_value: Number(data.protein_value),
  } as Profile;
}

export function todayFor(p: Pick<Profile, "timezone" | "day_end_hour">, now = new Date()): string {
  return logDateFor(now, p.timezone, p.day_end_hour);
}

export type Target = { kcal: number; protein_g: number; effective_from: string };

/** The target row in effect on `date` (latest effective_from on or before it). */
export async function targetFor(supabase: SupabaseClient, date: string): Promise<Target | null> {
  const { data } = await supabase
    .from("targets")
    .select("kcal, protein_g, effective_from")
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length <= 64;
  } catch {
    return false;
  }
}
