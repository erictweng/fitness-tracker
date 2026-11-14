import { describe, expect, it } from "vitest";
import { burned, parseWorkout } from "./workouts";

const f = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("parseWorkout", () => {
  it("accepts a normal workout and trims", () => {
    expect(parseWorkout(f({ type: " Push day ", minutes: "45", kcal: "250", notes: " felt good " }))).toEqual({
      ok: true,
      value: { type: "Push day", minutes: 45, kcal: 250, notes: "felt good" },
    });
  });
  it("kcal and notes are optional", () => {
    expect(parseWorkout(f({ type: "Walk", minutes: "20" }))).toEqual({ ok: true, value: { type: "Walk", minutes: 20, kcal: null, notes: null } });
  });
  it("enforces the limits", () => {
    const r = parseWorkout(f({ type: "", minutes: "0", kcal: "3001", notes: "x".repeat(281) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["kcal", "minutes", "notes", "type"]);
    expect(parseWorkout(f({ type: "x".repeat(61), minutes: "601" })).ok).toBe(false);
    expect(parseWorkout(f({ type: "Run", minutes: "600", kcal: "3000" })).ok).toBe(true);
    expect(parseWorkout(f({ type: "Run", minutes: "abc" })).ok).toBe(false);
  });
});

describe("burned", () => {
  it("sums known calories and counts unknown ones", () => {
    expect(burned([{ kcal: 250 }, { kcal: null }, { kcal: 100 }])).toEqual({ kcal: 350, unknown: 1 });
    expect(burned([])).toEqual({ kcal: 0, unknown: 0 });
  });
});
