"use client";

import { useRef, useState, useTransition } from "react";
import { parseWorkout, burned } from "@/lib/domain/workouts";
import { NOTES_MAX } from "@/lib/domain/entries";
import { deleteWorkout, restoreWorkout, saveWorkout } from "../workouts/actions";

export type WorkoutRow = { id: string; type: string; minutes: number; kcal: number | null; notes: string | null; source: string };

/** Workouts for the day. Burned calories are context only: the calorie target never changes. */
export function WorkoutsCard({ workouts, date }: { workouts: WorkoutRow[]; date: string }) {
  const [sheet, setSheet] = useState<WorkoutRow | "new" | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<WorkoutRow | null>(null);
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = workouts.filter((w) => !hidden.has(w.id));
  const b = burned(visible);

  function remove(w: WorkoutRow) {
    setSheet(null);
    setHidden((h) => new Set(h).add(w.id));
    setUndo(w);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5000);
    start(async () => { await deleteWorkout(w.id); });
  }
  function undoRemove() {
    if (!undo) return;
    const id = undo.id;
    setUndo(null);
    start(async () => {
      await restoreWorkout(id);
      setHidden((h) => { const n = new Set(h); n.delete(id); return n; });
    });
  }

  return (
    <section className="card flex flex-col gap-2" data-testid="workouts">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Workouts</h2>
        <button type="button" className="text-sm font-semibold text-accent" onClick={() => setSheet("new")} data-testid="add-workout">+ Add</button>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted">None logged.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {visible.map((w) => (
              <li key={w.id}>
                <button type="button" className="flex w-full items-center justify-between py-1 text-left" onClick={() => setSheet(w)} data-testid="workout">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{w.type}</span>
                    <span className="text-xs text-muted">
                      {w.minutes} min{w.source === "claude" && " · via Claude"}{w.notes && ` · ${w.notes}`}
                    </span>
                  </span>
                  <span className="tabular-nums text-sm">{w.kcal === null ? "—" : `${w.kcal} kcal`}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted" data-testid="burned">
            Burned {b.kcal} kcal{b.unknown > 0 && ` + ${b.unknown} unknown`} · not added to your calorie target
          </p>
        </>
      )}
      {sheet && (
        <WorkoutSheet
          initial={sheet === "new" ? null : sheet}
          date={date}
          onClose={() => setSheet(null)}
          onDelete={sheet === "new" ? undefined : () => remove(sheet)}
        />
      )}
      {undo && (
        <div role="status" className="card fixed bottom-28 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between" data-testid="workout-undo">
          <span className="truncate">Deleted {undo.type}</span>
          <button type="button" className="font-semibold text-accent" onClick={undoRemove}>Undo</button>
        </div>
      )}
    </section>
  );
}

function WorkoutSheet({ initial, date, onClose, onDelete }: { initial: WorkoutRow | null; date: string; onClose: () => void; onDelete?: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idRef = useRef(initial?.id ?? crypto.randomUUID());

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const local = parseWorkout(fd);
    if (!local.ok) { setErrors(local.errors); return; }
    fd.set("id", idRef.current);
    fd.set("log_date", date);
    fd.set("mode", initial ? "edit" : "new");
    start(async () => {
      try {
        const r = await saveWorkout(fd);
        if (r.ok) onClose();
        else { setErrors(r.errors ?? {}); setMessage(r.message ?? null); }
      } catch {
        setMessage("You're offline. Workouts need a connection.");
      }
    });
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <input name={name} className="input" aria-invalid={!!errors[name]} {...props} />
      {errors[name] && <span className="text-sm text-warn">{errors[name]}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60" onClick={onClose}>
      <form role="dialog" aria-label={initial ? "Edit workout" : "Add workout"} className="card m-0 flex w-full max-w-md flex-col gap-3 rounded-b-none" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? "Edit workout" : "Add workout"}</h2>
          <button type="button" className="text-muted" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {field("type", "Type", { defaultValue: initial?.type ?? "", placeholder: "Push day, 5k run…", maxLength: 60, autoFocus: !initial })}
        <div className="grid grid-cols-2 gap-2">
          {field("minutes", "Minutes", { defaultValue: initial?.minutes ?? "", inputMode: "numeric" })}
          {field("kcal", "Calories burned (optional)", { defaultValue: initial?.kcal ?? "", inputMode: "numeric" })}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted">Notes (optional)</span>
          <textarea name="notes" className="input min-h-16" maxLength={NOTES_MAX} defaultValue={initial?.notes ?? ""} />
          {errors.notes && <span className="text-sm text-warn">{errors.notes}</span>}
        </label>
        {message && <p role="alert" className="text-sm text-warn">{message}</p>}
        <div className="flex gap-2">
          {onDelete && <button type="button" className="btn btn-ghost flex-1 text-danger" onClick={onDelete}>Delete</button>}
          <button type="submit" className="btn flex-1" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
