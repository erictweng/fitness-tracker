import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recentFoodIds, type Food } from "./domain/foods";

export type MealWithItems = {
  id: string;
  name: string;
  items: { id: string; servings: number; food: Food }[];
};

const toFood = (f: Record<string, unknown>): Food => ({
  id: f.id as string,
  name: f.name as string,
  kcal: Number(f.kcal),
  protein_g: f.protein_g === null ? null : Number(f.protein_g),
  fat_g: f.fat_g === null ? null : Number(f.fat_g),
  carbs_g: f.carbs_g === null ? null : Number(f.carbs_g),
  serving_label: f.serving_label as string,
  serving_g: f.serving_g === null ? null : Number(f.serving_g),
  archived_at: (f.archived_at as string | null) ?? null,
});

const FOOD_COLS = "id, name, kcal, protein_g, fat_g, carbs_g, serving_label, serving_g, archived_at";

/** Everything the add sheet needs: active foods, meals with items, recents. RLS scopes it to the caller. */
export async function loadPicker(supabase: SupabaseClient) {
  const [foodsRes, mealsRes, recentRes] = await Promise.all([
    supabase.from("foods").select(FOOD_COLS).is("archived_at", null).order("name"),
    supabase
      .from("meals")
      .select(`id, name, meal_items(id, servings, foods(${FOOD_COLS}))`)
      .order("name"),
    supabase
      .from("entries")
      .select("food_id")
      .not("food_id", "is", null)
      .is("deleted_at", null)
      .order("logged_at", { ascending: false })
      .limit(60),
  ]);
  const foods = (foodsRes.data ?? []).map(toFood);
  const byId = new Map(foods.map((f) => [f.id, f]));
  const recents = recentFoodIds(recentRes.data ?? []).map((id) => byId.get(id)).filter((f): f is Food => !!f);
  const meals: MealWithItems[] = (mealsRes.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    items: ((m.meal_items ?? []) as unknown as { id: string; servings: number; foods: Record<string, unknown> }[])
      .filter((i) => i.foods)
      .map((i) => ({ id: i.id, servings: Number(i.servings), food: toFood(i.foods) })),
  }));
  return { foods, meals, recents };
}

export async function loadAllFoods(supabase: SupabaseClient) {
  const { data } = await supabase.from("foods").select(FOOD_COLS).order("name");
  return (data ?? []).map(toFood);
}

export async function getFood(supabase: SupabaseClient, id: string): Promise<Food | null> {
  const { data } = await supabase.from("foods").select(FOOD_COLS).eq("id", id).maybeSingle();
  return data ? toFood(data) : null;
}
