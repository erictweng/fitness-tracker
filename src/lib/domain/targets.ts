import { kgToLb } from "./units";

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very_active";
export type Goal = "cut" | "maintain" | "bulk";
export type ProteinRule = "per_lb" | "per_kg" | "fixed";

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export const DEFAULT_ADJUST: Record<Goal, number> = { cut: -500, maintain: 0, bulk: 250 };

/** Mifflin-St Jeor resting burn, kcal/day. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161);
}

export function proteinTarget(rule: ProteinRule, value: number, weightKg: number): number {
  if (rule === "fixed") return Math.round(value);
  return Math.round(value * (rule === "per_lb" ? kgToLb(weightKg) : weightKg));
}

export type TargetInput = {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  activity: Activity;
  goal: Goal;
  adjustKcal: number;
  proteinRule: ProteinRule;
  proteinValue: number;
};

export type Suggestion = {
  kcal: number;
  proteinG: number;
  bmr: number;
  burn: number;
  /** true when a cut would have gone below resting burn and was raised to it */
  flooredAtBmr: boolean;
};

const round10 = (n: number) => Math.round(n / 10) * 10;

export function suggestTargets(i: TargetInput): Suggestion {
  const rest = bmr(i.sex, i.weightKg, i.heightCm, i.ageYears);
  const burn = rest * ACTIVITY_FACTOR[i.activity];
  const adjust = i.goal === "maintain" ? 0 : i.adjustKcal;
  let kcal = burn + adjust;
  let flooredAtBmr = false;
  if (i.goal === "cut" && kcal < rest) {
    kcal = rest;
    flooredAtBmr = true;
  }
  return {
    kcal: Math.min(8000, Math.max(800, round10(kcal))),
    proteinG: Math.min(500, proteinTarget(i.proteinRule, i.proteinValue, i.weightKg)),
    bmr: Math.round(rest),
    burn: Math.round(burn),
    flooredAtBmr,
  };
}
