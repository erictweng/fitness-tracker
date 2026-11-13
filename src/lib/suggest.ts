import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, ageOn } from "./domain/day";
import { suggestTargets, type Suggestion } from "./domain/targets";
import { weightForTargets, type WeighIn } from "./domain/weight";
import type { Profile } from "./profile";

export async function loadWeighIns(supabase: SupabaseClient, from: string, to: string): Promise<WeighIn[]> {
  const { data } = await supabase
    .from("weigh_ins")
    .select("log_date, weight_kg")
    .is("deleted_at", null)
    .gte("log_date", from)
    .lte("log_date", to)
    .order("log_date");
  return (data ?? []).map((w) => ({ log_date: w.log_date, weight_kg: Number(w.weight_kg) }));
}

/** Latest weigh-in at or before `to`, even if older than the loaded window. */
export async function latestWeighIn(supabase: SupabaseClient, to: string): Promise<WeighIn | null> {
  const { data } = await supabase
    .from("weigh_ins")
    .select("log_date, weight_kg")
    .is("deleted_at", null)
    .lte("log_date", to)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { log_date: data.log_date, weight_kg: Number(data.weight_kg) } : null;
}

/** Target suggestion from the user's settings and weight (7-day average, else latest). */
export async function suggestionFor(
  supabase: SupabaseClient,
  profile: Profile,
  today: string,
): Promise<{ suggestion: Suggestion; weightKg: number; weightSource: "average" | "latest" } | null> {
  if (!profile.sex || !profile.birth_date || !profile.height_cm || !profile.activity_level) return null;
  const recent = await loadWeighIns(supabase, addDays(today, -6), today);
  let w = weightForTargets(recent, today);
  if (!w) {
    const last = await latestWeighIn(supabase, today);
    if (!last) return null;
    w = { kg: last.weight_kg, source: "latest" };
  }
  const suggestion = suggestTargets({
    sex: profile.sex,
    weightKg: w.kg,
    heightCm: profile.height_cm,
    ageYears: ageOn(profile.birth_date, today),
    activity: profile.activity_level,
    goal: profile.goal,
    adjustKcal: profile.goal_adjust_kcal,
    proteinRule: profile.protein_rule,
    proteinValue: profile.protein_value,
  });
  return { suggestion, weightKg: w.kg, weightSource: w.source };
}
