import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/lib/profile";
import { addDays } from "@/lib/domain/day";
import { averages, historyDays } from "@/lib/domain/history";
import { toDisplayWeight } from "@/lib/domain/units";
import { loadWeighIns } from "@/lib/suggest";
import { BarChart, WeightChart } from "./charts";

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await connection();
  const { supabase, profile } = await requireUser();
  if (!profile.onboarded_at) redirect("/onboarding");
  const sp = await searchParams;
  const range = (Array.isArray(sp.range) ? sp.range[0] : sp.range) === "30" ? 30 : 7;
  const today = todayFor(profile);
  const from = addDays(today, -(range - 1));

  const [{ data: entries }, { data: targets }, weighIns] = await Promise.all([
    supabase
      .from("entries")
      .select("log_date, kcal, protein_g")
      .is("deleted_at", null)
      .gte("log_date", from)
      .lte("log_date", today)
      .limit(5000),
    supabase.from("targets").select("effective_from, kcal, protein_g").lte("effective_from", today).order("effective_from"),
    loadWeighIns(supabase, addDays(from, -6), today),
  ]);
  const days = historyDays({
    from,
    to: today,
    entries: (entries ?? []).map((e) => ({ log_date: e.log_date, kcal: Number(e.kcal), protein_g: e.protein_g === null ? null : Number(e.protein_g) })),
    targets: targets ?? [],
    weighIns,
  });
  const avg = averages(days, today);
  const u = profile.weight_unit;
  const pastDays = range - 1;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5 pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">History</h1>
        <Link className="btn btn-ghost" href="/">Done</Link>
      </header>
      <nav className="grid grid-cols-2 gap-2" aria-label="Range">
        {[7, 30].map((r) => (
          <Link
            key={r}
            href={`/history?range=${r}`}
            className={`btn ${r === range ? "" : "btn-ghost"}`}
            aria-current={r === range ? "page" : undefined}
          >
            {r} days
          </Link>
        ))}
      </nav>

      <section className="card grid grid-cols-2 gap-3" data-testid="history-averages">
        <div>
          <p className="text-sm text-muted">Avg calories</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="avg-kcal">{avg.kcal ?? "—"}</p>
          {avg.kcalVsTarget !== null && (
            <p className={`text-xs tabular-nums ${avg.kcalVsTarget > 0 ? "text-warn" : "text-muted"}`} data-testid="avg-vs-target">
              {avg.kcalVsTarget > 0 ? "+" : ""}{avg.kcalVsTarget} vs target
            </p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted">Avg protein</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="avg-protein">{avg.protein === null ? "—" : `${avg.protein}g`}</p>
        </div>
        <p className="col-span-2 text-xs text-muted" data-testid="days-logged">
          {avg.days} of the last {pastDays} days logged · averages skip missed days and today
        </p>
      </section>

      <BarChart days={days} value={(d) => d.kcal} target={(d) => d.targetKcal} unit="kcal" label="Calories vs target" testId="history-kcal" />
      <BarChart days={days} value={(d) => d.protein} target={(d) => d.targetProtein} unit="g" label="Protein vs target (g)" testId="history-protein" />
      <WeightChart days={days} toUnit={(kg) => toDisplayWeight(kg, u)} unit={u} />
    </main>
  );
}
