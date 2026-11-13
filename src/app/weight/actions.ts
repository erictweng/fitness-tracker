"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { isIsoDate } from "@/lib/domain/day";
import { fromDisplayWeight } from "@/lib/domain/units";
import { mondayOf } from "@/lib/domain/weight";
import { suggestionFor } from "@/lib/suggest";

export type WeightResult =
  | { ok: true; logDate: string; previousKg: number | null }
  | { ok: false; errors?: Record<string, string>; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done() {
  revalidatePath("/");
  revalidatePath("/weight");
  revalidatePath("/settings");
}

export async function saveWeighIn(form: FormData): Promise<WeightResult> {
  const { supabase, profile } = await requireUser();
  const id = String(form.get("id") ?? "");
  const logDate = String(form.get("log_date") ?? "");
  const value = Number(String(form.get("weight") ?? "").trim() || NaN);
  const errors: Record<string, string> = {};
  if (!UUID.test(id)) return { ok: false, message: "Bad request." };
  if (!isIsoDate(logDate)) errors.log_date = "Pick a date.";
  else if (logDate > todayFor(profile, new Date(Date.now() + 86_400_000))) errors.log_date = "Can't weigh in on a future day.";
  const kg = fromDisplayWeight(value, profile.weight_unit);
  if (!(kg >= 30 && kg <= 230)) errors.weight = profile.weight_unit === "lb" ? "Enter 66–507 lb." : "Enter 30–230 kg.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const { data, error } = await supabase.rpc("save_weigh_in", { p_id: id, p_log_date: logDate, p_weight_kg: Math.round(kg * 100) / 100 });
  if (error) {
    console.error("save_weigh_in failed", error.code);
    return { ok: false, message: "Couldn't save." };
  }
  done();
  return { ok: true, logDate, previousKg: data === null ? null : Number(data) };
}

/** Delete = soft delete. Returns the deleted value so Undo can put it back. */
export async function deleteWeighIn(logDate: string): Promise<WeightResult> {
  const { supabase } = await requireUser();
  if (!isIsoDate(logDate)) return { ok: false, message: "Bad request." };
  const { data, error } = await supabase
    .from("weigh_ins")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("log_date", logDate)
    .is("deleted_at", null)
    .select("weight_kg")
    .maybeSingle();
  if (error) return { ok: false, message: "Couldn't delete." };
  done();
  return { ok: true, logDate, previousKg: data ? Number(data.weight_kg) : null };
}

/** Undo a save or delete: put the previous value back, or clear the day if there was none. */
export async function restoreWeighIn(logDate: string, previousKg: number | null): Promise<WeightResult> {
  const { supabase } = await requireUser();
  if (!isIsoDate(logDate)) return { ok: false, message: "Bad request." };
  if (previousKg === null) {
    await supabase.from("weigh_ins").update({ deleted_at: new Date().toISOString() }).eq("log_date", logDate);
  } else {
    if (!(previousKg >= 30 && previousKg <= 230)) return { ok: false, message: "Bad request." };
    await supabase.rpc("save_weigh_in", { p_id: crypto.randomUUID(), p_log_date: logDate, p_weight_kg: previousKg });
  }
  done();
  return { ok: true, logDate, previousKg: null };
}

/** Accept the weekly suggestion. Recomputed on the server; the client's numbers aren't trusted. */
export async function acceptSuggestion(): Promise<{ ok: boolean }> {
  const { supabase, profile } = await requireUser();
  const today = todayFor(profile);
  const s = await suggestionFor(supabase, profile, today);
  if (!s) return { ok: false };
  const { error } = await supabase
    .from("targets")
    .insert({ effective_from: today, kcal: s.suggestion.kcal, protein_g: s.suggestion.proteinG, source: "suggested" });
  if (error) return { ok: false };
  done();
  return { ok: true };
}

export async function dismissSuggestion(): Promise<{ ok: boolean }> {
  const { supabase, profile } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ suggestion_dismissed_week: mondayOf(todayFor(profile)) })
    .eq("user_id", profile.user_id);
  done();
  return { ok: !error };
}
