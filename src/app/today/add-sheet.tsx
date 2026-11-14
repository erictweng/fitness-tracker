"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { MEALS, type Meal } from "@/lib/domain/day";
import { foodSummary, scaleFood, searchFoods, type Food } from "@/lib/domain/foods";
import { submitOrQueue } from "@/lib/offline-queue";

export type Picker = {
  foods: Food[];
  recents: Food[];
  meals: { id: string; name: string; items: { id: string; servings: number; food: Food }[] }[];
};

const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

type Props = {
  userId: string;
  picker: Picker;
  defaultMeal: Meal;
  logDate: () => string;
  onClose: () => void;
  onQuickAdd: () => void;
};

type View = { kind: "pick" } | { kind: "food"; food: Food } | { kind: "meal"; meal: Picker["meals"][number] };

export function AddSheet({ userId, picker, defaultMeal, logDate, onClose, onQuickAdd }: Props) {
  const [view, setView] = useState<View>({ kind: "pick" });
  const [q, setQ] = useState("");
  const results = useMemo(() => searchFoods(picker.foods, q), [picker.foods, q]);

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Add food"
        className="card m-0 flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-b-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          {view.kind === "pick" ? (
            <h2 className="text-lg font-semibold">Add food</h2>
          ) : (
            <button type="button" className="text-muted" onClick={() => setView({ kind: "pick" })}>‹ Back</button>
          )}
          <button type="button" className="text-muted" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {view.kind === "pick" && (
          <>
            <input
              type="search"
              className="input"
              placeholder="Search your foods"
              aria-label="Search your foods"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" className="btn btn-ghost" onClick={onQuickAdd} data-testid="quick-add">
              Quick add (type numbers)
            </button>
            {!q && picker.recents.length > 0 && (
              <List title="Recent" testId="recents">
                {picker.recents.map((f) => <FoodRow key={f.id} food={f} onPick={() => setView({ kind: "food", food: f })} />)}
              </List>
            )}
            {!q && picker.meals.length > 0 && (
              <List title="Meals" testId="meals">
                {picker.meals.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="flex w-full items-center justify-between py-2 text-left" onClick={() => setView({ kind: "meal", meal: m })}>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-sm text-muted">{m.items.length} foods</span>
                    </button>
                  </li>
                ))}
              </List>
            )}
            <List title={q ? "Matches" : "Saved foods"} testId="saved-foods">
              {results.length ? (
                results.map((f) => <FoodRow key={f.id} food={f} onPick={() => setView({ kind: "food", food: f })} />)
              ) : (
                <li className="py-2 text-sm text-muted">
                  {picker.foods.length ? "No match." : "No saved foods yet. Use Quick add and tick \u201cSave as food\u201d, or add them under Manage foods."}
                </li>
              )}
            </List>
            <Link href="/foods" className="text-center text-sm text-accent">Manage foods & meals</Link>
          </>
        )}

        {view.kind === "food" && <FoodAmount userId={userId} food={view.food} defaultMeal={defaultMeal} logDate={logDate} onDone={onClose} />}
        {view.kind === "meal" && <MealConfirm userId={userId} meal={view.meal} defaultMeal={defaultMeal} logDate={logDate} onDone={onClose} />}
      </div>
    </div>
  );
}

function List({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function FoodRow({ food, onPick }: { food: Food; onPick: () => void }) {
  return (
    <li>
      <button type="button" className="flex w-full flex-col py-2 text-left" onClick={onPick} data-testid="food-option">
        <span className="font-medium">{food.name}</span>
        <span className="text-xs text-muted">{foodSummary(food)}</span>
      </button>
    </li>
  );
}

function MealSelect({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">Meal</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Meal)}>
        {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
      </select>
    </label>
  );
}

function FoodAmount({ userId, food, defaultMeal, logDate, onDone }: { userId: string; food: Food; defaultMeal: Meal; logDate: () => string; onDone: () => void }) {
  const [unit, setUnit] = useState<"servings" | "grams">("servings");
  const [qty, setQty] = useState("1");
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useRef<string | null>(null);
  const preview = scaleFood(food, unit === "grams" ? { grams: Number(qty) } : { servings: Number(qty) });

  function add() {
    if (!preview) { setErr(unit === "grams" ? "Enter grams above 0." : "Enter 0.1–100 servings."); return; }
    id.current ??= crypto.randomUUID();
    const fd = new FormData();
    fd.set("id", id.current);
    fd.set("food_id", food.id);
    fd.set("unit", unit);
    fd.set("qty", qty);
    fd.set("meal", meal);
    fd.set("log_date", logDate());
    start(async () => {
      const out = await submitOrQueue(userId, "food", fd, { name: food.name, kcal: preview.kcal, meal, log_date: String(fd.get("log_date")) });
      if (out.status !== "error") onDone();
      else setErr(out.result.message ?? Object.values(out.result.errors ?? {})[0] ?? "Couldn't log it.");
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="food-amount">
      <div>
        <p className="text-lg font-semibold">{food.name}</p>
        <p className="text-sm text-muted">{foodSummary(food)}</p>
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm text-muted">{unit === "grams" ? "Grams" : "Servings"}</span>
          <input className="input" inputMode="decimal" aria-label="Amount" value={qty} onChange={(e) => { setQty(e.target.value); setErr(null); }} />
        </label>
        {food.serving_g && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Unit</span>
            <select
              className="input"
              aria-label="Unit"
              value={unit}
              onChange={(e) => {
                const u = e.target.value as "servings" | "grams";
                setUnit(u);
                setQty(u === "grams" ? String(food.serving_g) : "1");
              }}
            >
              <option value="servings">servings</option>
              <option value="grams">grams</option>
            </select>
          </label>
        )}
      </div>
      <p className="text-sm tabular-nums" data-testid="amount-preview">
        {preview ? `${Math.round(preview.kcal)} kcal · ${preview.protein_g ?? 0}g protein` : "—"}
      </p>
      <MealSelect value={meal} onChange={setMeal} />
      {err && <p role="alert" className="text-sm text-warn">{err}</p>}
      <button type="button" className="btn" onClick={add} disabled={pending}>{pending ? "Adding…" : "Add"}</button>
    </div>
  );
}

function MealConfirm({ userId, meal, defaultMeal, logDate, onDone }: { userId: string; meal: Picker["meals"][number]; defaultMeal: Meal; logDate: () => string; onDone: () => void }) {
  const [slot, setSlot] = useState<Meal>(defaultMeal);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = useRef<string[] | null>(null);
  const rows = meal.items.map((i) => ({ ...i, scaled: scaleFood(i.food, { servings: i.servings })! }));
  const kcal = Math.round(rows.reduce((s, r) => s + r.scaled.kcal, 0));
  const protein = Math.round(rows.reduce((s, r) => s + (r.scaled.protein_g ?? 0), 0) * 10) / 10;

  function log() {
    ids.current ??= meal.items.map(() => crypto.randomUUID());
    const fd = new FormData();
    fd.set("meal_id", meal.id);
    fd.set("ids", ids.current.join(","));
    fd.set("meal", slot);
    fd.set("log_date", logDate());
    start(async () => {
      const out = await submitOrQueue(userId, "meal", fd, { name: meal.name, kcal, meal: slot, log_date: String(fd.get("log_date")) });
      if (out.status !== "error") onDone();
      else setErr(out.result.message ?? "Couldn't log the meal.");
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="meal-confirm">
      <p className="text-lg font-semibold">{meal.name}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between">
            <span>
              {r.food.name} × {r.servings}
              {r.food.archived_at && <span className="text-muted"> (archived)</span>}
            </span>
            <span className="tabular-nums text-muted">{Math.round(r.scaled.kcal)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm tabular-nums">Total {kcal} kcal · {protein}g protein</p>
      <MealSelect value={slot} onChange={setSlot} />
      {err && <p role="alert" className="text-sm text-warn">{err}</p>}
      <button type="button" className="btn" onClick={log} disabled={pending}>{pending ? "Logging…" : "Log meal"}</button>
    </div>
  );
}
