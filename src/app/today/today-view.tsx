import Link from "next/link";
import { addDays } from "@/lib/domain/day";
import { totals } from "@/lib/domain/entries";
import type { Profile, Target } from "@/lib/profile";
import { DayLog, type EntryRow } from "./day-log";

type Props = {
  profile: Profile;
  date: string;
  today: string;
  target: Target | null;
  entries: EntryRow[];
};

function fmtDate(iso: string, today: string) {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function TodayView({ profile, date, today, target, entries }: Props) {
  const t = totals(entries);
  const kcalLeft = target ? target.kcal - t.kcal : null;
  const proteinLeft = target ? Math.round((target.protein_g - t.protein) * 10) / 10 : null;
  const isToday = date === today;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5 pb-28">
      <header className="flex items-center justify-between gap-2">
        <nav className="flex items-center gap-1" aria-label="Day">
          <Link className="btn btn-ghost px-3" href={`/?date=${addDays(date, -1)}`} aria-label="Previous day">‹</Link>
          <form action="/" className="flex">
            <input
              type="date"
              name="date"
              max={today}
              defaultValue={date}
              aria-label="Pick a day"
              className="input w-auto px-2"
            />
            <button className="sr-only" type="submit">Go</button>
          </form>
          {!isToday && <Link className="btn btn-ghost px-3" href={`/?date=${addDays(date, 1)}`} aria-label="Next day">›</Link>}
        </nav>
        <Link className="btn btn-ghost px-3" href="/settings" aria-label="Settings">⚙︎</Link>
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
      <p className="text-sm text-muted" data-testid="fat-carbs">Fat {t.fat}g · Carbs {t.carbs}g</p>

      <DayLog
        entries={entries}
        date={date}
        isToday={isToday}
        timezone={profile.timezone}
        dayEndHour={profile.day_end_hour}
        required={{ protein: profile.require_protein, fat: profile.require_fat, carbs: profile.require_carbs }}
      />
    </main>
  );
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
