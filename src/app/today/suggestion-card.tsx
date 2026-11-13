"use client";

import { useTransition } from "react";
import { acceptSuggestion, dismissSuggestion } from "../weight/actions";

export function SuggestionCard({ kcal, protein, fromKcal, fromProtein }: { kcal: number; protein: number; fromKcal: number; fromProtein: number }) {
  const [pending, start] = useTransition();
  return (
    <section className="card flex flex-col gap-2 border-accent" data-testid="suggestion">
      <p className="font-semibold">New suggested targets</p>
      <p className="text-sm tabular-nums">
        {kcal} kcal · {protein} g protein <span className="text-muted">(now {fromKcal} · {fromProtein} g)</span>
      </p>
      <p className="text-xs text-muted">Based on your 7-day average weight. Applies from today; past days keep their targets.</p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" disabled={pending} onClick={() => start(async () => { await dismissSuggestion(); })}>Dismiss</button>
        <button type="button" className="btn flex-1" disabled={pending} onClick={() => start(async () => { await acceptSuggestion(); })}>Accept</button>
      </div>
    </section>
  );
}
