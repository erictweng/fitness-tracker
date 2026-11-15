import Link from "next/link";
import { addDays } from "@/lib/domain/day";
import { totals } from "@/lib/domain/entries";
import type { Profile, Target } from "@/lib/profile";
import { DayLog, type EntryRow } from "./day-log";
import type { Picker } from "./add-sheet";
import { SuggestionCard } from "./suggestion-card";
import { toDisplayWeight } from "@/lib/domain/units";
import { WorkoutsCard, type WorkoutRow } from "./workouts-card";
import { WhoopAutoSync } from "./whoop-auto-sync";
import { netKcal, type DayRow } from "@/lib/domain/whoop";

type Props = {
  profile: Profile;
  date: string;
  today: string;
  target: Target | null;
  entries: EntryRow[];
  workouts: WorkoutRow[];
  picker: Picker;
  weight: { latestKg: number | null; avgKg: number | null };
  suggestion: { kcal: number; protein: number; fromKcal: number; fromProtein: number; burnSource: "formula" | "whoop" } | null;
  whoop: { connected: boolean; day: DayRow | null };
};

function fmtDate(iso: string, today: string) {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function TodayView({ profile, date, today, target, entries, workouts, picker, weight, suggestion, whoop }: Props) {
  const u = profile.weight_unit;
  const t = totals(entries);
  const kcalLeft = target ? target.kcal - t.kcal : null;
  const proteinLeft = target ? Math.round((target.protein_g - t.protein) * 10) / 10 : null;
  const isToday = date === today;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5 pb-28">
      <header className="flex items-center justify-between gap-2">
        <nav className="flex min-w-0 items-center gap-1" aria-label="Day">
          <Link className="btn btn-ghost w-10! px-0!" href={`/?date=${addDays(date, -1)}`} aria-label="Previous day">‹</Link>
          <form action="/" className="flex">
            <input
              type="date"
              name="date"
              max={today}
              defaultValue={date}
              aria-label="Pick a day"
              className="input w-32! px-2! text-sm"
            />
            <button className="sr-only" type="submit">Go</button>
          </form>
          {!isToday && <Link className="btn btn-ghost w-10! px-0!" href={`/?date=${addDays(date, 1)}`} aria-label="Next day">›</Link>}
        </nav>
        <span className="flex shrink-0 gap-1">
          <Link className="btn btn-ghost w-10! px-0!" href="/history" aria-label="History">▥</Link>
          <Link className="btn btn-ghost w-10! px-0!" href="/foods" aria-label="Foods and meals">☰</Link>
          <Link className="btn btn-ghost w-10! px-0!" href="/settings" aria-label="Settings">⚙︎</Link>
        </span>
      </header>
      <h1 className="text-2xl font-bold" data-testid="day-title">{fmtDate(date, today)}</h1>

      <section className="grid grid-cols-2 gap-3" aria-label="Totals">
        <Stat
          label="Calories left"
          big={kcalLeft === null ? "—" : String(kcalLeft)}
          small={`${t.kcal} eaten${target ? ` / ${target.kcal}` : ""}`}
          over={kcalLeft !== null && kcalLeft < 0}
          testId="kcal"
        />
        <Stat
          label="Protein left"
          big={proteinLeft === null ? "—" : `${proteinLeft}g`}
          small={`${t.protein}g eaten${target ? ` / ${target.protein_g}g` : ""}`}
          over={false}
          testId="protein"
        />
      </section>
      <p className="text-sm text-muted" data-testid="fat-carbs">
        Fat {macroText(t.fat, t.missingFat, t.count)} · Carbs {macroText(t.carbs, t.missingCarbs, t.count)}
      </p>
      <Link href="/weight" className="card flex items-center justify-between py-3" data-testid="weight-line">
        <span className="text-sm text-muted">Weight</span>
        <span className="tabular-nums">
          {weight.latestKg === null ? "Log a weigh-in" : `${toDisplayWeight(weight.latestKg, u).toFixed(1)} ${u}`}
          {weight.avgKg !== null && <span className="text-muted"> · 7-day avg {toDisplayWeight(weight.avgKg, u).toFixed(1)}</span>}
          <span className="text-muted"> ›</span>
        </span>
      </Link>
      {(whoop.connected || whoop.day) && <EnergyLine eaten={t.kcal} day={whoop.day} isToday={isToday} />}
      {whoop.connected && isToday && <WhoopAutoSync />}
      {suggestion && <SuggestionCard {...suggestion} />}

      <DayLog
        userId={profile.user_id}
        entries={entries}
        date={date}
        isToday={isToday}
        timezone={profile.timezone}
        dayEndHour={profile.day_end_hour}
        required={{ protein: profile.require_protein, fat: profile.require_fat, carbs: profile.require_carbs }}
        picker={picker}
      />
      <WorkoutsCard key={date} workouts={workouts} date={date} whoopBurn={whoop.day?.kcal ?? null} />
    </main>
  );
}

/** WHOOP's burn for the day and eaten − burned. Context only: the calorie target never changes. */
function EnergyLine({ eaten, day, isToday }: { eaten: number; day: DayRow | null; isToday: boolean }) {
  const burned = day?.kcal ?? null;
  const net = netKcal(eaten, burned);
  let text: string;
  if (!day) text = isToday ? "Waiting on WHOOP…" : "No WHOOP data for this day";
  else if (burned === null) text = "Waiting on WHOOP to score this day";
  else text = `Burned ${burned.toLocaleString("en-US")} kcal${day.in_progress ? " so far" : ""}`;
  return (
    <section className="card flex items-center justify-between gap-2 py-3" data-testid="energy" aria-label="WHOOP energy">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-muted">WHOOP</span>
        <span className="tabular-nums" data-testid="whoop-burned">{text}</span>
      </span>
      {net !== null && (
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-sm text-muted">Eaten − burned</span>
          <span className={`text-lg font-semibold tabular-nums ${net > 0 ? "text-warn" : ""}`} data-testid="net-kcal">
            {net > 0 ? `+${net}` : net}
          </span>
        </span>
      )}
    </section>
  );
}

/** Unknown is not zero: "30g", "30g + 2 unknown", or "not entered" when no entry has it. */
function macroText(known: number, missing: number, count: number) {
  if (count > 0 && missing === count) return "not entered";
  return missing > 0 ? `${known}g + ${missing} unknown` : `${known}g`;
}

function Stat({ label, big, small, over, testId }: { label: string; big: string; small: string; over: boolean; testId: string }) {
  return (
    <div className="card flex flex-col gap-1" data-testid={`stat-${testId}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-4xl font-bold tabular-nums ${over ? "text-warn" : ""}`} data-testid={`${testId}-left`}>{big}</span>
      <span className="text-sm text-muted tabular-nums" data-testid={`${testId}-eaten`}>{small}</span>
    </div>
  );
}
