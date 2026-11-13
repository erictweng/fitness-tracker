"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { isIsoDate, MEALS, type Meal } from "@/lib/domain/day";
import { parseFood, scaleFood } from "@/lib/domain/foods";
import { getFood } from "@/lib/foods-data";

export type FoodResult = { ok: true; id?: string } | { ok: false; errors?: Record<string, string>; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done() {
  revalidatePath("/");
  revalidatePath("/foods");
}

function checkDayMeal(logDate: string, meal: string, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isIsoDate(logDate)) e.log_date = "Bad date.";
  else if (logDate > today) e.log_date = "Can't log a future day.";
  if (!MEALS.includes(meal as Meal)) e.meal = "Pick a meal.";
  return e;
}

export async function saveFood(form: FormData): Promise<FoodResult> {
  const { supabase, profile } = await requireUser();
  const parsed = parseFood(form, { protein: profile.require_protein, fat: profile.require_fat, carbs: profile.require_carbs });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const id = String(form.get("id") ?? "");
  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Bad request." };
    const { error } = await supabase.from("foods").update(parsed.value).eq("id", id);
    if (error) return { ok: false, message: "Couldn't save." };
    done();
    return { ok: true, id };
  }
  const { data, error } = await supabase.from("foods").insert(parsed.value).select("id").single();
  if (error) return { ok: false, message: "Couldn't save." };
  done();
  return { ok: true, id: data.id };
}

export async function setFoodArchived(id: string, archived: boolean): Promise<FoodResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  const { error } = await supabase.from("foods").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, message: "Couldn't update." };
  done();
  return { ok: true };
}

/** Log a saved food: nutrition is copied onto the entry so later food edits never rewrite history. */
export async function logFood(form: FormData): Promise<FoodResult> {
  const { supabase, profile } = await requireUser();
  const id = String(form.get("id") ?? "");
  const foodId = String(form.get("food_id") ?? "");
  if (!UUID.test(id) || !UUID.test(foodId)) return { ok: false, message: "Bad request." };
  const logDate = String(form.get("log_date") ?? "");
  const meal = String(form.get("meal") ?? "");
  const errors = checkDayMeal(logDate, meal, todayFor(profile, new Date(Date.now() + 86_400_000)));
  const food = await getFood(supabase, foodId);
  if (!food) return { ok: false, message: "That food is gone." };
  const unit = form.get("unit") === "grams" ? "grams" : "servings";
  const qty = Number(form.get("qty"));
  const scaled = scaleFood(food, unit === "grams" ? { grams: qty } : { servings: qty });
  if (!scaled) errors.qty = unit === "grams" ? "Enter grams above 0." : "Enter 0.1–100 servings.";
  if (Object.keys(errors).length || !scaled) return { ok: false, errors };
  const { error } = await supabase.from("entries").upsert(
    { id, food_id: foodId, log_date: logDate, meal, ...scaled, source: "app", logged_at: new Date().toISOString() },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("logFood failed", error.code);
    return { ok: false, message: "Couldn't log it." };
  }
  done();
  return { ok: true };
}

/** Log every item of a saved meal as separate entries in one insert (all or nothing). */
export async function logMeal(form: FormData): Promise<FoodResult> {
  const { supabase, profile } = await requireUser();
  const mealId = String(form.get("meal_id") ?? "");
  const ids = String(form.get("ids") ?? "").split(",").filter(Boolean);
  if (!UUID.test(mealId) || ids.some((i) => !UUID.test(i))) return { ok: false, message: "Bad request." };
  const logDate = String(form.get("log_date") ?? "");
  const slot = String(form.get("meal") ?? "");
  const errors = checkDayMeal(logDate, slot, todayFor(profile, new Date(Date.now() + 86_400_000)));
  if (Object.keys(errors).length) return { ok: false, errors };

  const { data: items } = await supabase
    .from("meal_items")
    .select("id, servings, foods(id, name, kcal, protein_g, fat_g, carbs_g, serving_label, serving_g)")
    .eq("meal_id", mealId)
    .order("id");
  if (!items?.length) return { ok: false, message: "That meal has no foods." };
  if (ids.length < items.length) return { ok: false, message: "Bad request." };

  const now = new Date().toISOString();
  const rows = items.map((it, i) => {
    const f = it.foods as unknown as Parameters<typeof scaleFood>[0];
    const scaled = scaleFood({ ...f, kcal: Number(f.kcal) }, { servings: Number(it.servings) })!;
    return { id: ids[i], food_id: f.id, log_date: logDate, meal: slot, ...scaled, source: "app", logged_at: now };
  });
  const { error } = await supabase.from("entries").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("logMeal failed", error.code);
    return { ok: false, message: "Couldn't log the meal." };
  }
  done();
  return { ok: true };
}

type MealItemInput = { food_id: string; servings: number };

export async function saveMeal(form: FormData): Promise<FoodResult> {
  const { supabase } = await requireUser();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  let items: MealItemInput[] = [];
  try {
    items = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    return { ok: false, message: "Bad request." };
  }
  const errors: Record<string, string> = {};
  if (!name || name.length > 80) errors.name = "Name it (up to 80 characters).";
  if (!Array.isArray(items) || items.length === 0) errors.items = "Add at least one food.";
  else if (items.length > 30 || items.some((i) => !UUID.test(String(i.food_id)) || !(Number(i.servings) > 0 && Number(i.servings) <= 100))) {
    errors.items = "Each food needs 0.1–100 servings.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  let mealId = id;
  if (id) {
    if (!UUID.test(id)) return { ok: false, message: "Bad request." };
    const { error } = await supabase.from("meals").update({ name }).eq("id", id);
    if (error) return { ok: false, message: "Couldn't save." };
    await supabase.from("meal_items").delete().eq("meal_id", id);
  } else {
    const { data, error } = await supabase.from("meals").insert({ name }).select("id").single();
    if (error) return { ok: false, message: "Couldn't save." };
    mealId = data.id;
  }
  const { error } = await supabase
    .from("meal_items")
    .insert(items.map((i) => ({ meal_id: mealId, food_id: i.food_id, servings: Number(i.servings) })));
  if (error) {
    console.error("saveMeal items failed", error.code);
    return { ok: false, message: "Couldn't save the foods in this meal." };
  }
  done();
  return { ok: true, id: mealId };
}

export async function deleteMeal(id: string): Promise<FoodResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) return { ok: false, message: "Couldn't delete." };
  done();
  return { ok: true };
}
