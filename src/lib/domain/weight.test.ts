import { describe, expect, it } from "vitest";
import { latestOnOrBefore, mondayOf, series, sevenDayAverage, shouldSuggest, weightForTargets, windowOf } from "./weight";

const w = (log_date: string, weight_kg: number) => ({ log_date, weight_kg });

describe("sevenDayAverage", () => {
  const data = [w("2026-11-01", 90), w("2026-11-06", 82), w("2026-11-08", 81), w("2026-11-12", 80)];
  it("averages only the 7 days ending on the date", () => {
    // window 11-06..11-12 → 82, 81, 80
    expect(windowOf(data, "2026-11-12").map((x) => x.weight_kg)).toEqual([82, 81, 80]);
    expect(sevenDayAverage(data, "2026-11-12")).toBe(81);
  });
  it("needs 3 weigh-ins in the window", () => {
    expect(sevenDayAverage(data, "2026-11-13")).toBeNull(); // 11-08, 11-12 only
  });
  it("ignores future weigh-ins", () => {
    expect(sevenDayAverage([...data, w("2026-11-13", 70)], "2026-11-12")).toBe(81);
  });
});

describe("weightForTargets", () => {
  it("falls back to the latest weigh-in", () => {
    expect(weightForTargets([w("2026-11-01", 80), w("2026-11-03", 79)], "2026-11-12")).toEqual({ kg: 79, source: "latest" });
    expect(latestOnOrBefore([w("2026-11-20", 1)], "2026-11-12")).toBeNull();
    expect(weightForTargets([], "2026-11-12")).toBeNull();
  });
});

describe("mondayOf", () => {
  it.each([
    ["2026-11-16", "2026-11-16"], // Monday
    ["2026-11-22", "2026-11-16"], // Sunday
    ["2026-11-12", "2026-11-09"], // Thursday
    ["2027-01-01", "2026-12-28"], // across the year
  ])("%s -> %s", (d, m) => expect(mondayOf(d)).toBe(m));
});

describe("shouldSuggest", () => {
  const base = {
    today: "2026-11-18", // Wednesday, week of 11-16
    current: { kcal: 2300, protein_g: 180, effective_from: "2026-11-05" },
    suggestion: { kcal: 2260, proteinG: 177 },
    dismissedWeek: null,
  };
  it("shows when the suggestion differs and targets are from an earlier week", () => {
    expect(shouldSuggest(base)).toBe(true);
  });
  it("not when targets were already set this week", () => {
    expect(shouldSuggest({ ...base, current: { ...base.current, effective_from: "2026-11-16" } })).toBe(false);
  });
  it("not when dismissed this week, but again next week", () => {
    expect(shouldSuggest({ ...base, dismissedWeek: "2026-11-16" })).toBe(false);
    expect(shouldSuggest({ ...base, today: "2026-11-23", dismissedWeek: "2026-11-16" })).toBe(true);
  });
  it("not for tiny differences", () => {
    expect(shouldSuggest({ ...base, suggestion: { kcal: 2305, proteinG: 180 } })).toBe(false);
  });
  it("not without data", () => {
    expect(shouldSuggest({ ...base, suggestion: null })).toBe(false);
    expect(shouldSuggest({ ...base, current: null })).toBe(false);
  });
});

describe("series", () => {
  it("one point per day with averages where available", () => {
    const s = series([w("2026-11-10", 80), w("2026-11-11", 81), w("2026-11-12", 82)], "2026-11-10", "2026-11-12");
    expect(s).toEqual([
      { date: "2026-11-10", kg: 80, avgKg: null },
      { date: "2026-11-11", kg: 81, avgKg: null },
      { date: "2026-11-12", kg: 82, avgKg: 81 },
    ]);
  });
});
