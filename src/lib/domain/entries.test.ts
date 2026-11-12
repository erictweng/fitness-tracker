import { describe, expect, it } from "vitest";
import { parseEntry, totals } from "./entries";

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
const req = { protein: true, fat: false, carbs: false };

describe("totals", () => {
  it("sums live entries and skips deleted ones", () => {
    const t = totals([
      { kcal: 650, protein_g: 48, fat_g: 20, carbs_g: 60 },
      { kcal: 300.4, protein_g: 25.5, fat_g: null, carbs_g: null },
      { kcal: 999, protein_g: 99, fat_g: 9, carbs_g: 9, deleted_at: "2026-11-12T00:00:00Z" },
    ]);
    expect(t).toEqual({ kcal: 950, protein: 73.5, fat: 20, carbs: 60, count: 2 });
  });
});

describe("parseEntry", () => {
  it("requires kcal and protein by default", () => {
    const r = parseEntry(form({ kcal: "" }), req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["kcal", "protein_g"]);
  });
  it("respects required fat/carbs settings", () => {
    const r = parseEntry(form({ kcal: "100", protein_g: "10" }), { protein: true, fat: true, carbs: true });
    expect(r.ok).toBe(false);
  });
  it("rejects negatives and non-numbers", () => {
    const r = parseEntry(form({ kcal: "-5", protein_g: "abc" }), req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ kcal: "Can't be negative.", protein_g: "Enter a number." });
  });
  it("warns when macros don't match kcal by >15%", () => {
    const r = parseEntry(form({ kcal: "100", protein_g: "30", fat_g: "10", carbs_g: "30" }), req);
    expect(r.ok && r.warnings.length).toBe(1);
  });
  it("no warning when macros match", () => {
    const r = parseEntry(form({ kcal: "330", protein_g: "30", fat_g: "10", carbs_g: "30" }), req);
    expect(r.ok && r.warnings.length).toBe(0);
  });
  it("asks to confirm over 5,000 kcal", () => {
    const r = parseEntry(form({ kcal: "5200", protein_g: "10" }), req);
    expect(r.ok && r.needsConfirm).toBe(true);
  });
  it("keeps emoji names, rejects >80 chars", () => {
    expect(parseEntry(form({ name: "🍜 ramen", kcal: "500", protein_g: "20" }), req).ok).toBe(true);
    expect(parseEntry(form({ name: "x".repeat(81), kcal: "1", protein_g: "1" }), req).ok).toBe(false);
  });
});
