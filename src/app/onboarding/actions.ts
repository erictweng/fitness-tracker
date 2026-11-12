"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isValidTimeZone, todayFor } from "@/lib/profile";
import { ageOn, isIsoDate } from "@/lib/domain/day";
import { ftInToCm, fromDisplayWeight, type WeightUnit } from "@/lib/domain/units";
import { DEFAULT_ADJUST, suggestTargets, type Activity, type Goal, type ProteinRule, type Sex } from "@/lib/domain/targets";

export type OnboardingState = { errors?: Record<string, string>; message?: string } | null;

const SEX = ["male", "female"];
const ACTIVITY = ["sedentary", "light", "moderate", "very_active"];
const GOAL = ["cut", "maintain", "bulk"];

const n = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? NaN : Number(v));

export async function completeOnboarding(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const { supabase, profile } = await requireUser();
  const errors: Record<string, string> = {};

  const sex = String(form.get("sex"));
  const activity = String(form.get("activity"));
  const goal = String(form.get("goal"));
  const birth = String(form.get("birth_date") ?? "");
  const weightUnit = (form.get("weight_unit") === "kg" ? "kg" : "lb") as WeightUnit;
  const heightUnit = form.get("height_unit") === "cm" ? "cm" : "ftin";
  const tzRaw = String(form.get("timezone") ?? "");
  const timezone = isValidTimeZone(tzRaw) ? tzRaw : "America/Los_Angeles";
  const today = todayFor({ timezone, day_end_hour: profile.day_end_hour });

  if (!SEX.includes(sex)) errors.sex = "Pick one.";
  if (!ACTIVITY.includes(activity)) errors.activity = "Pick one.";
  if (!GOAL.includes(goal)) errors.goal = "Pick one.";
  if (!isIsoDate(birth)) errors.birth_date = "Enter your birth date.";
  else {
    const age = ageOn(birth, today);
    if (age < 13 || age > 100) errors.birth_date = "Age must be 13–100.";
  }

  const heightCm = heightUnit === "cm" ? n(form.get("height_cm")) : ftInToCm(n(form.get("height_ft")), n(form.get("height_in")) || 0);
  if (!(heightCm >= 120 && heightCm <= 230)) errors.height = "Height looks off (120–230 cm / 3'11\"–7'6\").";

  const weightKg = fromDisplayWeight(n(form.get("weight")), weightUnit);
  if (!(weightKg >= 30 && weightKg <= 230)) errors.weight = weightUnit === "lb" ? "Weight must be 66–507 lb." : "Weight must be 30–230 kg.";

  if (Object.keys(errors).length) return { errors };

  const s = suggestTargets({
    sex: sex as Sex,
    weightKg,
    heightCm,
    ageYears: ageOn(birth, today),
    activity: activity as Activity,
    goal: goal as Goal,
    adjustKcal: DEFAULT_ADJUST[goal as Goal],
    proteinRule: profile.protein_rule as ProteinRule,
    proteinValue: profile.protein_value,
  });
  const kcal = Math.round(n(form.get("kcal_target")));
  const protein = Math.round(n(form.get("protein_target")));
  const finalKcal = kcal >= 800 && kcal <= 8000 ? kcal : s.kcal;
  const finalProtein = protein >= 0 && protein <= 500 ? protein : s.proteinG;
  const source = finalKcal === s.kcal && finalProtein === s.proteinG ? "suggested" : "manual";

  const { error } = await supabase.rpc("complete_onboarding", {
    p_sex: sex,
    p_birth_date: birth,
    p_height_cm: Math.round(heightCm * 10) / 10,
    p_weight_kg: Math.round(weightKg * 100) / 100,
    p_activity_level: activity,
    p_goal: goal,
    p_goal_adjust_kcal: DEFAULT_ADJUST[goal as Goal],
    p_protein_rule: profile.protein_rule,
    p_protein_value: profile.protein_value,
    p_weight_unit: weightUnit,
    p_height_unit: heightUnit,
    p_timezone: timezone,
    p_today: today,
    p_kcal_target: finalKcal,
    p_protein_target: finalProtein,
    p_target_source: source,
  });
  if (error) {
    console.error("complete_onboarding failed", error.code);
    return { message: "Couldn't save. Please try again." };
  }
  redirect("/");
}
