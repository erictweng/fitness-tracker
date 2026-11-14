"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { isIsoDate } from "@/lib/domain/day";
import { parseWorkout } from "@/lib/domain/workouts";

export type WorkoutResult = { ok: true } | { ok: false; errors?: Record<string, string>; message?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Add (new client id) or edit (existing id) a workout. */
export async function saveWorkout(form: FormData): Promise<WorkoutResult> {
  const { supabase, profile } = await requireUser();
  const id = String(form.get("id") ?? "");
  const logDate = String(form.get("log_date") ?? "");
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  if (!isIsoDate(logDate) || logDate > todayFor(profile, new Date(Date.now() + 86_400_000))) {
    return { ok: false, errors: { log_date: "Bad date." } };
  }
  const parsed = parseWorkout(form);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const editing = form.get("mode") === "edit";
  const { error } = editing
    ? await supabase.from("workouts").update({ ...parsed.value, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("workouts").upsert({ id, log_date: logDate, ...parsed.value, source: "app" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("saveWorkout failed", error.code);
    return { ok: false, message: "Couldn't save. Try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteWorkout(id: string) {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return;
  await supabase.from("workouts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/");
}

export async function restoreWorkout(id: string) {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return;
  await supabase.from("workouts").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/");
}
