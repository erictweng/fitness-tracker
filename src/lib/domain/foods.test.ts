import { describe, expect, it } from "vitest";
import { foodSummary, parseFood, recentFoodIds, scaleFood, searchFoods, servingsOf, type Food } from "./foods";

const rice: Food = { id: "r", name: "Rice", kcal: 130, protein_g: 2.7, fat_g: 0.3, carbs_g: 28, serving_label: "100 g", serving_g: 100 };
const shake: Food = { id: "s", name: "Protein shake", kcal: 120, protein_g: 24, fat_g: null, carbs_g: null, serving_label: "1 scoop", serving_g: null };
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("scaleFood", () => {
  it("scales by servings", () => {
    expect(scaleFood(shake, { servings: 1.5 })).toEqual({ name: "Protein shake", kcal: 180, protein_g: 36, fat_g: null, carbs_g: null, servings: 1.5, grams: null });
  });
  it("scales by grams using the serving weight", () => {
    expect(scaleFood(rice, { grams: 180 })).toMatchObject({ kcal: 234, protein_g: 4.9, carbs_g: 50.4, servings: null, grams: 180 });
  });
  it("refuses grams for a food without a serving weight", () => {
    expect(scaleFood(shake, { grams: 50 })).toBeNull();
  });
  it("refuses zero, negative and silly amounts", () => {
    expect(servingsOf(rice, { servings: 0 })).toBeNull();
    expect(servingsOf(rice, { servings: -1 })).toBeNull();
    expect(servingsOf(rice, { servings: 101 })).toBeNull();
    expect(servingsOf(rice, { grams: 0 })).toBeNull();
  });
});

describe("recentFoodIds", () => {
  it("dedupes, keeps order, skips quick adds, caps", () => {
    const e = [{ food_id: "a" }, { food_id: null }, { food_id: "b" }, { food_id: "a" }, { food_id: "c" }];
    expect(recentFoodIds(e)).toEqual(["a", "b", "c"]);
    expect(recentFoodIds(e, 2)).toEqual(["a", "b"]);
  });
});

describe("searchFoods", () => {
  it("prefix matches first, then contains, case-insensitive", () => {
    const foods = [{ name: "Brown rice" }, { name: "Rice" }, { name: "Shake" }];
    expect(searchFoods(foods, "RICE").map((f) => f.name)).toEqual(["Rice", "Brown rice"]);
    expect(searchFoods(foods, "  ")).toHaveLength(3);
  });
});

describe("parseFood", () => {
  it("defaults the serving label and validates", () => {
    const r = parseFood(form({ name: " Yogurt ", kcal: "150", protein_g: "15" }), { protein: true, fat: false, carbs: false });
    expect(r).toEqual({ ok: true, value: { name: "Yogurt", kcal: 150, protein_g: 15, fat_g: null, carbs_g: null, serving_label: "1 serving", serving_g: null } });
  });
  it("needs a name and required macros", () => {
    const r = parseFood(form({ kcal: "150" }), { protein: true, fat: false, carbs: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["carbs_g", "name", "protein_g"]);
  });
  it("rejects a zero serving weight", () => {
    expect(parseFood(form({ name: "x", kcal: "1", protein_g: "1", serving_g: "0" }), { protein: true, fat: false, carbs: false }).ok).toBe(false);
  });
});

describe("foodSummary", () => {
  it("formats", () => expect(foodSummary(rice)).toBe("100 g · 130 kcal · 2.7g P"));
});
