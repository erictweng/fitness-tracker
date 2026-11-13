import type { Required } from "./entries";

export type Food = {
  id: string;
  name: string;
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  serving_label: string;
  serving_g: number | null;
  archived_at?: string | null;
};

export type Amount = { servings: number } | { grams: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** How many servings an amount is. Grams only work when the food has a serving weight. */
export function servingsOf(food: Pick<Food, "serving_g">, amount: Amount): number | null {
  if ("servings" in amount) return amount.servings > 0 && amount.servings <= 100 ? amount.servings : null;
  if (!food.serving_g || !(amount.grams > 0) || amount.grams > 10_000) return null;
  return amount.grams / food.serving_g;
}

/** Nutrition for an amount of a saved food, snapshotted onto the entry. */
export function scaleFood(food: Food, amount: Amount) {
  const s = servingsOf(food, amount);
  if (s === null) return null;
  const m = (v: number | null) => (v === null ? null : r1(Number(v) * s));
  return {
    name: food.name,
    kcal: r1(Number(food.kcal) * s),
    protein_g: m(food.protein_g),
    fat_g: m(food.fat_g),
    carbs_g: m(food.carbs_g),
    servings: "servings" in amount ? amount.servings : null,
    grams: "grams" in amount ? amount.grams : null,
  };
}

/** Text shown under a food in pickers, e.g. "1 cup · 150 kcal · 15g P". */
export function foodSummary(f: Food): string {
  return `${f.serving_label} · ${Math.round(Number(f.kcal))} kcal${f.protein_g === null ? "" : ` · ${Number(f.protein_g)}g P`}`;
}

/** Recent distinct food ids, newest first, from entries ordered by logged_at desc. */
export function recentFoodIds(entries: { food_id: string | null }[], limit = 8): string[] {
  const seen: string[] = [];
  for (const e of entries) {
    if (e.food_id && !seen.includes(e.food_id)) seen.push(e.food_id);
    if (seen.length >= limit) break;
  }
  return seen;
}

export function searchFoods<T extends { name: string }>(foods: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return foods;
  const starts = foods.filter((f) => f.name.toLowerCase().startsWith(needle));
  const contains = foods.filter((f) => !f.name.toLowerCase().startsWith(needle) && f.name.toLowerCase().includes(needle));
  return [...starts, ...contains];
}

export type FoodInput = Omit<Food, "id" | "archived_at">;

/** Validates a saved-food form. Required macros follow the user's settings. */
export function parseFood(form: { get(k: string): FormDataEntryValue | null }, req: Required):
  { ok: true; value: FoodInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = String(form.get("name") ?? "").trim();
  if (!name) errors.name = "Give it a name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  const label = String(form.get("serving_label") ?? "").trim() || "1 serving";
  if (label.length > 40) errors.serving_label = "Keep it under 40 characters.";
  const num = (k: string, required: boolean, max: number) => {
    const s = String(form.get(k) ?? "").trim();
    if (s === "") { if (required) errors[k] = "Required."; return null; }
    const n = Number(s);
    if (!Number.isFinite(n)) { errors[k] = "Enter a number."; return null; }
    if (n < 0) { errors[k] = "Can't be negative."; return null; }
    if (n > max) { errors[k] = "That's too big."; return null; }
    return n;
  };
  const kcal = num("kcal", true, 9999);
  const protein_g = num("protein_g", req.protein, 999);
  const fat_g = num("fat_g", req.fat, 999);
  const carbs_g = num("carbs_g", req.carbs, 999);
  const serving_g = num("serving_g", false, 10000);
  if (serving_g === 0) errors.serving_g = "Must be more than 0.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, kcal: kcal as number, protein_g, fat_g, carbs_g, serving_label: label, serving_g } };
}
