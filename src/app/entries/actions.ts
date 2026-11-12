"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { isIsoDate, MEALS, type Meal } from "@/lib/domain/day";
import { parseEntry } from "@/lib/domain/entries";

export type EntryResult =
  | { ok: true }
  | { ok: false; errors?: Record<string, string>; message?: string; needsConfirm?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readDateAndMeal(form: FormData, today: string) {
  const logDate = String(form.get("log_date") ?? "");
  const meal = String(form.get("meal") ?? "");
  const errors: Record<string, string> = {};
  if (!isIsoDate(logDate)) errors.log_date = "Bad date.";
  else if (logDate > today) errors.log_date = "Can't log a future day.";
  if (!MEALS.includes(meal as Meal)) errors.meal = "Pick a meal.";
  return { logDate, meal, errors };
}

export async function addEntry(form: FormData): Promise<EntryResult> {
  const { supabase, profile } = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  // Allow one day of slack: the phone decides "today" and may be ahead of the server's clock.
  const { logDate, meal, errors } = readDateAndMeal(form, todayFor(profile, new Date(Date.now() + 86_400_000)));
  const parsed = parseEntry(form, { protein: profile.require_protein, fat: profile.require_fat, carbs: profile.require_carbs });
  if (!parsed.ok || Object.keys(errors).length) {
    return { ok: false, errors: { ...errors, ...(parsed.ok ? {} : parsed.errors) } };
  }
  if (parsed.needsConfirm && form.get("confirm") !== "1") return { ok: false, needsConfirm: true };

  const loggedAt = String(form.get("logged_at") ?? "");
  const { error } = await supabase.from("entries").upsert(
    {
      id,
      log_date: logDate,
      meal,
      ...parsed.value,
      logged_at: Number.isNaN(Date.parse(loggedAt)) ? new Date().toISOString() : loggedAt,
      source: "app",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("addEntry failed", error.code);
    return { ok: false, message: "Couldn't save. Try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function updateEntry(form: FormData): Promise<EntryResult> {
  const { supabase, profile } = await requireUser();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  const { logDate, meal, errors } = readDateAndMeal(form, todayFor(profile, new Date(Date.now() + 86_400_000)));
  const parsed = parseEntry(form, { protein: profile.require_protein, fat: profile.require_fat, carbs: profile.require_carbs });
  if (!parsed.ok || Object.keys(errors).length) {
    return { ok: false, errors: { ...errors, ...(parsed.ok ? {} : parsed.errors) } };
  }
  if (parsed.needsConfirm && form.get("confirm") !== "1") return { ok: false, needsConfirm: true };
  const { error } = await supabase
    .from("entries")
    .update({ log_date: logDate, meal, ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: "Couldn't save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteEntry(id: string): Promise<EntryResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  const { error } = await supabase
    .from("entries")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: "Couldn't delete." };
  revalidatePath("/");
  return { ok: true };
}

export async function restoreEntry(id: string): Promise<EntryResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  const { error } = await supabase
    .from("entries")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: "Couldn't undo." };
  revalidatePath("/");
  return { ok: true };
}
