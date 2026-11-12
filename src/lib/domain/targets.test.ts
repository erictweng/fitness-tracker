import { describe, expect, it } from "vitest";
import { bmr, proteinTarget, suggestTargets } from "./targets";
import { lbToKg } from "./units";

describe("bmr (Mifflin-St Jeor)", () => {
  it("matches a hand-computed male example", () => {
    // 80 kg, 180 cm, 25 y: 800 + 1125 - 125 + 5 = 1805
    expect(bmr("male", 80, 180, 25)).toBe(1805);
  });
  it("matches a hand-computed female example", () => {
    // 60 kg, 165 cm, 30 y: 600 + 1031.25 - 150 - 161 = 1320.25
    expect(bmr("female", 60, 165, 30)).toBeCloseTo(1320.25);
  });
});

describe("proteinTarget", () => {
  it("1 g per lb", () => expect(proteinTarget("per_lb", 1, lbToKg(180))).toBe(180));
  it("g per kg", () => expect(proteinTarget("per_kg", 2, 80)).toBe(160));
  it("fixed", () => expect(proteinTarget("fixed", 150, 80)).toBe(150));
});

describe("suggestTargets", () => {
  const base = {
    sex: "male" as const, weightKg: 80, heightCm: 180, ageYears: 25,
    activity: "moderate" as const, proteinRule: "per_lb" as const, proteinValue: 1,
  };
  it("cut: burn − 500, rounded to 10", () => {
    // 1805 × 1.55 = 2797.75 − 500 = 2297.75 → 2300
    const s = suggestTargets({ ...base, goal: "cut", adjustKcal: -500 });
    expect(s.kcal).toBe(2300);
    expect(s.burn).toBe(2798);
    expect(s.proteinG).toBe(176); // 80 kg = 176.4 lb
    expect(s.flooredAtBmr).toBe(false);
  });
  it("maintain ignores the adjustment", () => {
    expect(suggestTargets({ ...base, goal: "maintain", adjustKcal: -500 }).kcal).toBe(2800);
  });
  it("bulk adds the surplus", () => {
    expect(suggestTargets({ ...base, goal: "bulk", adjustKcal: 250 }).kcal).toBe(3050);
  });
  it("an aggressive cut is floored at resting burn", () => {
    const s = suggestTargets({ ...base, activity: "sedentary", goal: "cut", adjustKcal: -1500 });
    // burn 2166 − 1500 = 666 < bmr 1805 → 1805 → 1810 (rounded)
    expect(s.flooredAtBmr).toBe(true);
    expect(s.kcal).toBe(1810);
  });
});
