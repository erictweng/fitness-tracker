import { describe, expect, it } from "vitest";
import { averages, historyDays, targetOn } from "./history";

const targets = [
  { effective_from: "2026-11-01", kcal: 2300, protein_g: 180 },
  { effective_from: "2026-11-10", kcal: 2200, protein_g: 176 },
];

describe("targetOn", () => {
  it("picks the latest target on or before the date", () => {
    expect(targetOn(targets, "2026-10-31")).toBeNull();
    expect(targetOn(targets, "2026-11-09")?.kcal).toBe(2300);
    expect(targetOn(targets, "2026-11-10")?.kcal).toBe(2200);
  });
});

describe("historyDays", () => {
  const days = historyDays({
    from: "2026-11-08",
    to: "2026-11-11",
    entries: [
      { log_date: "2026-11-08", kcal: 1000, protein_g: 80 },
      { log_date: "2026-11-08", kcal: 1100.4, protein_g: null },
      { log_date: "2026-11-10", kcal: 2400, protein_g: 150.25 },
      { log_date: "2026-11-11", kcal: 500, protein_g: 40 },
    ],
    targets,
    weighIns: [
      { log_date: "2026-11-08", weight_kg: 82 },
      { log_date: "2026-11-09", weight_kg: 81 },
      { log_date: "2026-11-10", weight_kg: 80 },
    ],
  });
  it("one row per day; missed days are gaps", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(days[0]).toMatchObject({ kcal: 2100, protein: 80, targetKcal: 2300, weightKg: 82, avgKg: null });
    expect(days[1]).toMatchObject({ kcal: null, protein: null, targetKcal: 2300, weightKg: 81 });
    expect(days[2]).toMatchObject({ kcal: 2400, protein: 150.3, targetKcal: 2200, targetProtein: 176, avgKg: 81 });
    expect(days[3].weightKg).toBeNull();
  });
  it("averages skip missed days and today", () => {
    // logged past days: 11-08 (2100 vs 2300) and 11-10 (2400 vs 2200); 11-11 is today
    expect(averages(days, "2026-11-11")).toEqual({ days: 2, kcal: 2250, protein: 115.2, kcalVsTarget: 0 });
  });
  it("no logged days → nulls", () => {
    expect(averages(days.slice(1, 2), "2026-11-11")).toEqual({ days: 0, kcal: null, protein: null, kcalVsTarget: null });
  });
});
