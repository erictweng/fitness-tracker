"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { logDateFor, mealFor, MEALS, type Meal } from "@/lib/domain/day";
import { parseEntry, type Required } from "@/lib/domain/entries";
import { addEntry, deleteEntry, restoreEntry, updateEntry, type EntryResult } from "../entries/actions";

export type EntryRow = {
  id: string;
  name: string;
  meal: Meal;
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  source: "app" | "claude";
  log_date: string;
};

type Props = {
  entries: EntryRow[];
  date: string;
  isToday: boolean;
  timezone: string;
  dayEndHour: number;
  required: Required;
};

const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

export function DayLog({ entries, date, isToday, timezone, dayEndHour, required }: Props) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const visible = entries.filter((e) => !hidden.has(e.id));

  function remove(e: EntryRow) {
    setHidden((h) => new Set(h).add(e.id));
    setEditing(null);
    setUndo({ id: e.id, name: e.name || `${e.kcal} kcal` });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5000);
    start(async () => { await deleteEntry(e.id); });
  }

  function undoRemove() {
    if (!undo) return;
    const id = undo.id;
    setUndo(null);
    start(async () => {
      await restoreEntry(id);
      setHidden((h) => { const n = new Set(h); n.delete(id); return n; });
    });
  }

  return (
    <>
      {visible.length === 0 ? (
        <p className="card text-muted" data-testid="empty-day">Nothing logged yet — tap + to add your first food.</p>
      ) : (
        MEALS.map((m) => {
          const rows = visible.filter((e) => e.meal === m);
          if (!rows.length) return null;
          return (
            <section key={m} className="flex flex-col gap-2" aria-label={MEAL_LABEL[m]} data-testid={`meal-${m}`}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{MEAL_LABEL[m]}</h2>
              <ul className="flex flex-col gap-2">
                {rows.map((e) => (
                  <SwipeRow key={e.id} onSwipeLeft={() => remove(e)}>
                    <button type="button" className="card flex w-full items-center justify-between text-left" onClick={() => setEditing(e)} data-testid="entry">
                      <span className="flex flex-col">
                        <span className="font-medium">{e.name || "Quick add"}</span>
                        <span className="text-xs text-muted">
                          {e.protein_g ?? 0}g protein{e.source === "claude" && " · via Claude"}
                        </span>
                      </span>
                      <span className="tabular-nums font-semibold">{Math.round(e.kcal)}</span>
                    </button>
                  </SwipeRow>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <button
        type="button"
        className="btn fixed bottom-6 right-6 h-16 w-16 rounded-full text-3xl shadow-lg"
        aria-label="Add food"
        onClick={() => setAdding(true)}
        data-testid="add-food"
      >
        +
      </button>

      {adding && (
        <EntrySheet
          title="Quick add"
          required={required}
          initial={null}
          onClose={() => setAdding(false)}
          submit={(fd) => addEntry(fd)}
          prepare={(fd) => {
            const now = new Date();
            fd.set("id", crypto.randomUUID());
            fd.set("logged_at", now.toISOString());
            // "Today" is decided on the phone at entry time (spec: day rules).
            fd.set("log_date", isToday ? logDateFor(now, timezone, dayEndHour) : date);
          }}
          defaultMeal={mealFor(new Date(), timezone, dayEndHour)}
        />
      )}
      {editing && (
        <EntrySheet
          title="Edit"
          required={required}
          initial={editing}
          onClose={() => setEditing(null)}
          submit={(fd) => updateEntry(fd)}
          prepare={(fd) => { fd.set("id", editing.id); fd.set("log_date", editing.log_date); }}
          defaultMeal={editing.meal}
          onDelete={() => remove(editing)}
        />
      )}

      {undo && (
        <div role="status" className="card fixed bottom-28 left-1/2 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between" data-testid="undo-toast">
          <span className="truncate">Deleted {undo.name}</span>
          <button type="button" className="font-semibold text-accent" onClick={undoRemove}>Undo</button>
        </div>
      )}
    </>
  );
}

function SwipeRow({ children, onSwipeLeft }: { children: React.ReactNode; onSwipeLeft: () => void }) {
  const startX = useRef<number | null>(null);
  const [drag, setDrag] = useState<{ active: boolean; dx: number }>({ active: false, dx: 0 });
  const end = (commit: boolean) => {
    if (commit && drag.dx < -90) onSwipeLeft();
    startX.current = null;
    setDrag({ active: false, dx: 0 });
  };
  return (
    <li
      className="touch-pan-y"
      style={{ transform: `translateX(${Math.min(0, drag.dx)}px)`, transition: drag.active ? "none" : "transform 150ms" }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        startX.current = e.clientX;
        setDrag({ active: true, dx: 0 });
      }}
      onPointerMove={(e) => { if (startX.current !== null) setDrag({ active: true, dx: e.clientX - startX.current }); }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
    >
      {children}
    </li>
  );
}

type SheetProps = {
  title: string;
  required: Required;
  initial: EntryRow | null;
  defaultMeal: Meal;
  onClose: () => void;
  submit: (fd: FormData) => Promise<EntryResult>;
  prepare: (fd: FormData) => void;
  onDelete?: () => void;
};

function EntrySheet({ title, required, initial, defaultMeal, onClose, submit, prepare, onDelete }: SheetProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [confirmBig, setConfirmBig] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ackWarning = useRef(false);
  const idRef = useRef<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const local = parseEntry(fd, required);
    if (!local.ok) { setErrors(local.errors); return; }
    setErrors({});
    if (local.warnings.length && !ackWarning.current) {
      setWarning(local.warnings[0]);
      ackWarning.current = true;
      return;
    }
    if (local.needsConfirm && !confirmBig) { setConfirmBig(true); return; }
    if (confirmBig) fd.set("confirm", "1");
    prepare(fd);
    // Keep the same id across retries/double taps so the server stores one entry.
    if (!initial) {
      if (idRef.current) fd.set("id", idRef.current);
      else idRef.current = String(fd.get("id"));
    }
    start(async () => {
      const r = await submit(fd);
      if (r.ok) onClose();
      else if (r.needsConfirm) setConfirmBig(true);
      else { setErrors(r.errors ?? {}); setMessage(r.message ?? null); }
    });
  }

  const v = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  const label = (k: "protein" | "fat" | "carbs", text: string) => `${text}${required[k] ? "" : " (optional)"}`;

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60" onClick={onClose}>
      <form
        role="dialog"
        aria-label={title}
        className="card m-0 flex w-full max-w-md flex-col gap-3 rounded-b-none"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        onChange={() => { ackWarning.current = false; setWarning(null); setConfirmBig(false); }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="text-muted" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <Input name="name" label="Name (optional)" defaultValue={initial?.name ?? ""} error={errors.name} inputMode="text" />
        <div className="grid grid-cols-2 gap-2">
          <Input name="kcal" label="Calories" defaultValue={v(initial?.kcal)} error={errors.kcal} autoFocus={!initial} />
          <Input name="protein_g" label={label("protein", "Protein g")} defaultValue={v(initial?.protein_g)} error={errors.protein_g} />
          <Input name="fat_g" label={label("fat", "Fat g")} defaultValue={v(initial?.fat_g)} error={errors.fat_g} />
          <Input name="carbs_g" label={label("carbs", "Carbs g")} defaultValue={v(initial?.carbs_g)} error={errors.carbs_g} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted">Meal</span>
          <select name="meal" className="input" defaultValue={defaultMeal}>
            {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
          </select>
        </label>
        {errors.log_date && <p className="text-sm text-warn">{errors.log_date}</p>}
        {warning && <p role="alert" className="text-sm text-warn">{warning} Tap Save again to keep it.</p>}
        {confirmBig && <p role="alert" className="text-sm text-warn">That&apos;s over 5,000 kcal in one entry. Sure? Tap Save again.</p>}
        {message && <p role="alert" className="text-sm text-warn">{message}</p>}
        <div className="flex gap-2">
          {onDelete && <button type="button" className="btn btn-ghost text-danger" onClick={onDelete}>Delete</button>}
          <button className="btn flex-1" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function Input({ name, label, error, ...rest }: { name: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <input name={name} className="input" inputMode="decimal" autoComplete="off" aria-invalid={!!error} {...rest} />
      {error && <span className="text-sm text-warn">{error}</span>}
    </label>
  );
}
