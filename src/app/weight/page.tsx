import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { addDays } from "@/lib/domain/day";
import { series } from "@/lib/domain/weight";
import { loadWeighIns } from "@/lib/suggest";
import { WeightView } from "./weight-view";

export default async function WeightPage() {
  await connection();
  const { supabase, profile } = await requireUser();
  if (!profile.onboarded_at) redirect("/onboarding");
  const today = todayFor(profile);
  const from = addDays(today, -29);
  // Load 6 extra days so the first chart days still get a 7-day average.
  const weighIns = await loadWeighIns(supabase, addDays(from, -6), today);
  // Start the chart at the first weigh-in (at least a week, at most 30 days) so a new user's dots aren't squeezed to one edge.
  const first = weighIns.find((w) => w.log_date >= from)?.log_date ?? today;
  const start = [first, addDays(today, -6)].sort()[0];
  const points = series(weighIns, start, today);
  const recent = [...weighIns].reverse().slice(0, 30);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5 pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Weight</h1>
        <Link className="btn btn-ghost" href="/">Done</Link>
      </header>
      <WeightView unit={profile.weight_unit} today={today} points={points} recent={recent} />
    </main>
  );
}
