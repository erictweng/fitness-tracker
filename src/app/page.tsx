import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getMe, requireUser } from "@/lib/session";
import { targetFor, todayFor } from "@/lib/profile";
import { addDays, isIsoDate } from "@/lib/domain/day";
import { sevenDayAverage, shouldSuggest } from "@/lib/domain/weight";
import { latestWeighIn, loadWeighIns, loadWhoopDays, suggestionFor } from "@/lib/suggest";
import { whoopStatus } from "@/lib/whoop/sync";
import { TodayView } from "./today/today-view";
import { ClearQueues } from "./clear-queues";
import { loadPicker } from "@/lib/foods-data";
import type { EntryRow } from "./today/day-log";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { AUTH_ERROR_COPY, isAuthErrorCode } from "@/lib/auth-errors";

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const sp = await searchParams;
  const rawError = Array.isArray(sp.auth_error) ? sp.auth_error[0] : sp.auth_error;
  const authError = isAuthErrorCode(rawError) ? AUTH_ERROR_COPY[rawError] : null;
  const configured = getSupabaseConfig() !== null;
  const me = configured ? await getMe() : null;

  if (!me) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
        <h1 className="text-3xl font-bold">Fitness Tracker</h1>
        <p className="text-muted">Log food fast. Hit your calorie and protein targets.</p>
        {sp.deleted === "1" && (
          <p role="status" className="card" data-testid="account-deleted">
            Your account and everything you logged were deleted.
            <ClearQueues />
          </p>
        )}
        {authError && (
          <p role="alert" className="card text-warn" data-testid="auth-error">
            {authError}
          </p>
        )}
        {configured ? (
          <a className="btn" href="/auth/google" data-testid="google-sign-in">
            Sign in with Google
          </a>
        ) : (
          <p className="card text-muted" data-testid="not-configured">
            Sign-in isn&apos;t set up on this deployment yet. See docs/SETUP.md.
          </p>
        )}
        <p className="text-sm text-muted">
          Invite-only. Your log is private to you. <Link className="underline" href="/privacy">Privacy policy</Link>
        </p>
      </main>
    );
  }

  if (!me.onboarded) redirect("/onboarding");
  const { supabase, profile } = await requireUser();
  await supabase.rpc("touch_last_active");

  const today = todayFor(profile);
  const rawDate = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const date = rawDate && isIsoDate(rawDate) && rawDate <= today ? rawDate : today;

  const [target, picker, weighIns, lastWeighIn, todaysTarget, sugg, { data: entries }, { data: workouts }, whoopDays, whoop] = await Promise.all([
    targetFor(supabase, date),
    loadPicker(supabase),
    loadWeighIns(supabase, addDays(today, -6), today),
    latestWeighIn(supabase, today),
    targetFor(supabase, today),
    suggestionFor(supabase, profile, today),
    supabase
      .from("entries")
      .select("id, name, meal, kcal, protein_g, fat_g, carbs_g, source, log_date, notes")
      .eq("log_date", date)
      .is("deleted_at", null)
      .order("logged_at", { ascending: true }),
    supabase
      .from("workouts")
      .select("id, type, minutes, kcal, notes, source")
      .eq("log_date", date)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    loadWhoopDays(supabase, date, date),
    whoopStatus(supabase),
  ]);

  const rows: EntryRow[] = (entries ?? []).map((e) => ({
    ...e,
    kcal: Number(e.kcal),
    protein_g: e.protein_g === null ? null : Number(e.protein_g),
    fat_g: e.fat_g === null ? null : Number(e.fat_g),
    carbs_g: e.carbs_g === null ? null : Number(e.carbs_g),
  })) as EntryRow[];

    const avg = sevenDayAverage(weighIns, today);
  const latest = lastWeighIn;
  const weight = { latestKg: latest?.weight_kg ?? null, avgKg: avg };
  const suggestion =
    date === today &&
    sugg &&
    todaysTarget &&
    shouldSuggest({ today, current: todaysTarget, suggestion: sugg.suggestion, dismissedWeek: profile.suggestion_dismissed_week })
      ? { kcal: sugg.suggestion.kcal, protein: sugg.suggestion.proteinG, fromKcal: todaysTarget.kcal, fromProtein: todaysTarget.protein_g, burnSource: sugg.suggestion.burnSource }
      : null;

  return (
    <TodayView profile={profile} date={date} today={today} target={target} entries={rows} workouts={workouts ?? []} picker={picker} weight={weight} suggestion={suggestion} whoop={{ connected: whoop.connected, day: whoopDays[0] ?? null }} />
  );
}
