"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { ageOn, isIsoDate } from "@/lib/domain/day";
import { ftInToCm } from "@/lib/domain/units";

export type SettingsState = { ok?: boolean; errors?: Record<string, string>; message?: string } | null;

const oneOf = <T extends string>(v: FormDataEntryValue | null, opts: readonly T[]): T | null =>
  opts.includes(String(v) as T) ? (String(v) as T) : null;
const n = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? NaN : Number(v));

export async function saveSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { supabase, profile } = await requireUser();
  const errors: Record<string, string> = {};

  const goal = oneOf(form.get("goal"), ["cut", "maintain", "bulk"] as const);
  const proteinRule = oneOf(form.get("protein_rule"), ["per_lb", "per_kg", "fixed"] as const);
  const weightUnit = oneOf(form.get("weight_unit"), ["lb", "kg"] as const);
  const heightUnit = oneOf(form.get("height_unit"), ["ftin", "cm"] as const);
  const activity = oneOf(form.get("activity_level"), ["sedentary", "light", "moderate", "very_active"] as const);
  const sex = oneOf(form.get("sex"), ["male", "female"] as const);
  const adjust = Math.round(n(form.get("goal_adjust_kcal")));
  const proteinValue = n(form.get("protein_value"));
  const dayEnd = Math.round(n(form.get("day_end_hour")));
  const birth = String(form.get("birth_date") ?? "");
  const heightCm = heightUnit === "cm" ? n(form.get("height_cm")) : ftInToCm(n(form.get("height_ft")), n(form.get("height_in")) || 0);

  if (!goal) errors.goal = "Pick one.";
  if (!proteinRule) errors.protein_rule = "Pick one.";
  if (!weightUnit || !heightUnit) errors.units = "Pick units.";
  if (!activity) errors.activity_level = "Pick one.";
  if (!sex) errors.sex = "Pick one.";
  if (goal === "cut" && !(adjust <= -100 && adjust >= -1500)) errors.goal_adjust_kcal = "A cut needs a deficit of 100–1,500 kcal.";
  if (goal === "bulk" && !(adjust >= 100 && adjust <= 1500)) errors.goal_adjust_kcal = "A bulk needs a surplus of 100–1,500 kcal.";
  const maxProtein = proteinRule === "fixed" ? 500 : proteinRule === "per_kg" ? 4.4 : 2;
  if (!(proteinValue > 0 && proteinValue <= maxProtein)) errors.protein_value = `Enter a number above 0 and up to ${maxProtein}.`;
  if (!(dayEnd >= 0 && dayEnd <= 6)) errors.day_end_hour = "Pick midnight to 6 AM.";
  const today = todayFor(profile);
  if (!isIsoDate(birth) || ageOn(birth, today) < 13 || ageOn(birth, today) > 100) errors.birth_date = "Age must be 13–100.";
  if (!(heightCm >= 120 && heightCm <= 230)) errors.height = "Height looks off.";
  if (Object.keys(errors).length) return { errors };

  const { error } = await supabase
    .from("profiles")
    .update({
      goal,
      goal_adjust_kcal: goal === "maintain" ? 0 : adjust,
      protein_rule: proteinRule,
      protein_value: proteinValue,
      weight_unit: weightUnit,
      height_unit: heightUnit,
      day_end_hour: dayEnd,
      require_protein: form.get("require_protein") === "on",
      require_fat: form.get("require_fat") === "on",
      require_carbs: form.get("require_carbs") === "on",
      activity_level: activity,
      sex,
      birth_date: birth,
      height_cm: Math.round(heightCm * 10) / 10,
    })
    .eq("user_id", profile.user_id);
  if (error) {
    console.error("saveSettings failed", error.code);
    return { message: "Couldn't save." };
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, message: "Saved. Check the suggested targets below." };
}

export async function saveTargets(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { supabase, profile } = await requireUser();
  const kcal = Math.round(n(form.get("kcal")));
  const protein = Math.round(n(form.get("protein_g")));
  const errors: Record<string, string> = {};
  if (!(kcal >= 800 && kcal <= 8000)) errors.kcal = "800–8,000 kcal.";
  if (!(protein >= 0 && protein <= 500)) errors.protein_g = "0–500 g.";
  if (Object.keys(errors).length) return { errors };
  const source = form.get("suggested_kcal") === String(kcal) && form.get("suggested_protein") === String(protein) ? "suggested" : "manual";
  const { error } = await supabase.from("targets").insert({ effective_from: todayFor(profile), kcal, protein_g: protein, source });
  if (error) return { message: "Couldn't save targets." };
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, message: "Targets updated from today on. Past days keep their old targets." };
}
