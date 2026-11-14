import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProfile, targetFor, todayFor, type Profile } from "@/lib/profile";
import { isIsoDate, mealFor, MEALS, type Meal } from "@/lib/domain/day";
import { parseEntry, totals } from "@/lib/domain/entries";
import { burned, parseWorkout } from "@/lib/domain/workouts";
import { fromDisplayWeight, toDisplayWeight, type WeightUnit } from "@/lib/domain/units";
import { latestWeighIn } from "@/lib/suggest";
import { loadPicker } from "@/lib/foods-data";

/** Errors the model should read and act on (shown to it as a tool error, not a crash). */
export class ToolError extends Error {}

export type Ctx = { supabase: SupabaseClient; userId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function profileOf(ctx: Ctx): Promise<Profile> {
  const p = await getProfile(ctx.supabase, ctx.userId);
  if (!p || !p.onboarded_at) throw new ToolError("Finish setting up the Fitness Tracker app first (open it on your phone).");
  return p;
}

function pickDate(p: Profile, date: string | undefined): string {
  const today = todayFor(p);
  if (date === undefined || date === "" || date === "today") return today;
  if (!isIsoDate(date)) throw new ToolError("date must be YYYY-MM-DD.");
  if (date > today) throw new ToolError(`Can't log a future day (today is ${today} for this user).`);
  return date;
}

function pickId(id: string | undefined): string {
  if (id === undefined || id === "") return crypto.randomUUID();
  if (!UUID.test(id)) throw new ToolError("The id must be a UUID (e.g. 3f2b…). Generate a new random one.");
  return id.toLowerCase();
}

const formOf = (o: Record<string, unknown>) => ({
  get: (k: string) => (o[k] === undefined || o[k] === null ? null : String(o[k])),
});

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const ENTRY_COLS = "id, log_date, meal, name, kcal, protein_g, fat_g, carbs_g, notes, source, food_id";
type EntryRowDb = { id: string; log_date: string; meal: string; name: string; kcal: unknown; protein_g: unknown; fat_g: unknown; carbs_g: unknown; notes: string | null; source: string };
const entryOut = (e: EntryRowDb) => ({
  id: e.id, date: e.log_date, meal: e.meal, name: e.name, kcal: Number(e.kcal), protein_g: n(e.protein_g),
  fat_g: n(e.fat_g), carbs_g: n(e.carbs_g), notes: e.notes, via: e.source === "claude" ? "claude" : "app",
});

// ------------------------------------------------------------------ get_day
export async function getDay(ctx: Ctx, args: { date?: string }) {
  const p = await profileOf(ctx);
  const today = todayFor(p);
  const date = pickDate(p, args.date);
  const [target, entriesRes, workoutsRes, weigh] = await Promise.all([
    targetFor(ctx.supabase, date),
    ctx.supabase.from("entries").select(ENTRY_COLS).eq("log_date", date).is("deleted_at", null).order("logged_at"),
    ctx.supabase.from("workouts").select("id, type, minutes, kcal, notes, source").eq("log_date", date).is("deleted_at", null).order("created_at"),
    latestWeighIn(ctx.supabase, date),
  ]);
  if (entriesRes.error || workoutsRes.error) throw new Error("load failed");
  const entries = (entriesRes.data ?? []) as EntryRowDb[];
  const t = totals(entries.map((e) => ({ kcal: Number(e.kcal), protein_g: n(e.protein_g), fat_g: n(e.fat_g), carbs_g: n(e.carbs_g) })));
  const workouts = (workoutsRes.data ?? []).map((w) => ({ id: w.id, type: w.type, minutes: w.minutes, kcal: w.kcal, notes: w.notes, via: w.source }));
  const unit = p.weight_unit as WeightUnit;
  return {
    date,
    is_today: date === today,
    target: target ? { kcal: target.kcal, protein_g: target.protein_g } : null,
    eaten: {
      kcal: t.kcal, protein_g: t.protein, fat_g: t.fat, carbs_g: t.carbs,
      entries_missing_fat: t.missingFat, entries_missing_carbs: t.missingCarbs,
    },
    left: target ? { kcal: target.kcal - t.kcal, protein_g: Math.round((target.protein_g - t.protein) * 10) / 10 } : null,
    entries: entries.map(entryOut),
    workouts,
    workout_kcal_burned: burned(workouts).kcal,
    note: "Workout calories are context only; they never raise the calorie target.",
    latest_weight: weigh ? { date: weigh.log_date, value: toDisplayWeight(weigh.weight_kg, unit), unit } : null,
    settings: { weight_unit: unit, required: { protein: p.require_protein, fat: p.require_fat, carbs: p.require_carbs } },
  };
}

// ------------------------------------------------------------------ log_food
export type FoodArgs = {
  name: string; kcal: number; protein_g?: number; fat_g?: number; carbs_g?: number;
  meal?: string; date?: string; notes?: string; entry_id?: string; confirm_large?: boolean;
};

function checkEntry(p: Profile, a: Partial<FoodArgs>) {
  const parsed = parseEntry(formOf(a), { protein: p.require_protein, fat: p.require_fat, carbs: p.require_carbs });
  if (!parsed.ok) throw new ToolError(Object.entries(parsed.errors).map(([k, v]) => `${k}: ${v}`).join(" "));
  if (parsed.needsConfirm && !a.confirm_large) {
    throw new ToolError("That's over 5,000 kcal in one entry. Check with the user, then call again with confirm_large: true.");
  }
  return parsed.value;
}

function checkMeal(meal: string | undefined, p: Profile): Meal {
  if (meal === undefined || meal === "") return mealFor(new Date(), p.timezone, p.day_end_hour);
  const m = meal.toLowerCase().trim() as Meal;
  if (!MEALS.includes(m)) throw new ToolError(`meal must be one of ${MEALS.join(", ")}.`);
  return m;
}

export async function logFood(ctx: Ctx, a: FoodArgs) {
  const p = await profileOf(ctx);
  const value = checkEntry(p, a);
  const date = pickDate(p, a.date);
  const meal = checkMeal(a.meal, p);
  const id = pickId(a.entry_id);
  const { error } = await ctx.supabase
    .from("entries")
    .upsert({ id, log_date: date, meal, ...value, source: "claude" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("mcp log_food failed", error.code);
    throw new Error("save failed");
  }
  const { data } = await ctx.supabase.from("entries").select(ENTRY_COLS).eq("id", id).maybeSingle();
  if (!data) throw new ToolError("That entry_id is already used. Generate a new UUID for a new item.");
  const day = await getDay(ctx, { date });
  return { saved: entryOut(data as EntryRowDb), day_total: day.eaten, left: day.left };
}

// ------------------------------------------------------------------ edit_entry
export async function editEntry(ctx: Ctx, a: Partial<FoodArgs> & { entry_id: string }) {
  const p = await profileOf(ctx);
  if (!UUID.test(a.entry_id ?? "")) throw new ToolError("entry_id must be the id from get_day.");
  const { data: cur } = await ctx.supabase.from("entries").select(ENTRY_COLS).eq("id", a.entry_id).is("deleted_at", null).maybeSingle();
  if (!cur) throw new ToolError("No entry with that id (or it was deleted). Call get_day to find it.");
  const c = cur as EntryRowDb;
  const keep = <T,>(v: T | undefined, old: T) => (v === undefined ? old : v);
  const merged = {
    name: keep(a.name, c.name), kcal: keep(a.kcal, Number(c.kcal)), protein_g: keep(a.protein_g, n(c.protein_g)),
    fat_g: keep(a.fat_g, n(c.fat_g)), carbs_g: keep(a.carbs_g, n(c.carbs_g)), notes: keep(a.notes, c.notes), confirm_large: a.confirm_large,
  };
  const value = checkEntry(p, merged as Partial<FoodArgs>);
  const date = a.date === undefined ? c.log_date : pickDate(p, a.date);
  const meal = a.meal === undefined ? (c.meal as Meal) : checkMeal(a.meal, p);
  const { data, error } = await ctx.supabase
    .from("entries")
    .update({ ...value, log_date: date, meal, updated_at: new Date().toISOString() })
    .eq("id", a.entry_id)
    .is("deleted_at", null)
    .select(ENTRY_COLS)
    .maybeSingle();
  if (error || !data) {
    console.error("mcp edit_entry failed", error?.code);
    throw new Error("edit failed");
  }
  return { updated: entryOut(data as EntryRowDb), before: entryOut(c) };
}

// ------------------------------------------------------------------ log_weight
export async function logWeight(ctx: Ctx, a: { weight: number; unit?: string; date?: string; weigh_in_id?: string }) {
  const p = await profileOf(ctx);
  const unit = (a.unit ?? p.weight_unit) as WeightUnit;
  if (unit !== "lb" && unit !== "kg") throw new ToolError("unit must be lb or kg.");
  const kg = Math.round(fromDisplayWeight(Number(a.weight), unit) * 100) / 100;
  if (!Number.isFinite(kg) || kg < 30 || kg > 230) throw new ToolError("That weight is out of range (30–230 kg / 66–507 lb).");
  const date = pickDate(p, a.date);
  const { data, error } = await ctx.supabase.rpc("save_weigh_in", { p_id: pickId(a.weigh_in_id), p_log_date: date, p_weight_kg: kg, p_source: "claude" });
  if (error) {
    console.error("mcp log_weight failed", error.code);
    throw new Error("save failed");
  }
  const shown = p.weight_unit as WeightUnit;
  return {
    saved: { date, value: toDisplayWeight(kg, shown), unit: shown },
    replaced: data === null ? null : { value: toDisplayWeight(Number(data), shown), unit: shown },
    note: "One weigh-in per day: a second one replaces that day's value.",
  };
}

// ------------------------------------------------------------------ log_workout
export async function logWorkout(ctx: Ctx, a: { type: string; minutes: number; kcal?: number; notes?: string; date?: string; workout_id?: string }) {
  const p = await profileOf(ctx);
  const parsed = parseWorkout(formOf(a));
  if (!parsed.ok) throw new ToolError(Object.entries(parsed.errors).map(([k, v]) => `${k}: ${v}`).join(" "));
  const date = pickDate(p, a.date);
  const id = pickId(a.workout_id);
  const { error } = await ctx.supabase
    .from("workouts")
    .upsert({ id, log_date: date, ...parsed.value, source: "claude" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("mcp log_workout failed", error.code);
    throw new Error("save failed");
  }
  const { data } = await ctx.supabase.from("workouts").select("id, log_date, type, minutes, kcal, notes").eq("id", id).maybeSingle();
  if (!data) throw new ToolError("That workout_id is already used. Generate a new UUID.");
  return { saved: { ...data, date: data.log_date }, note: "Workout calories don't change the calorie target." };
}

// ------------------------------------------------------------------ list_recent_foods
export async function listRecentFoods(ctx: Ctx, a: { limit?: number }) {
  await profileOf(ctx);
  const { foods, recents, meals } = await loadPicker(ctx.supabase);
  const limit = Math.min(Math.max(Math.round(a.limit ?? 25), 1), 100);
  const seen = new Set<string>();
  const ordered = [...recents, ...foods].filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).slice(0, limit);
  return {
    foods: ordered.map((f) => ({
      name: f.name, serving: f.serving_label, serving_g: f.serving_g,
      kcal: f.kcal, protein_g: f.protein_g, fat_g: f.fat_g, carbs_g: f.carbs_g, recently_used: recents.some((r) => r.id === f.id),
    })),
    saved_meals: meals.slice(0, 20).map((m) => ({
      name: m.name,
      items: m.items.map((i) => ({ food: i.food.name, servings: i.servings })),
    })),
    note: "Numbers are per one serving. To log one, call log_food with these numbers times the servings eaten.",
  };
}
