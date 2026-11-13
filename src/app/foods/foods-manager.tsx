"use client";

import { useState, useTransition } from "react";
import { foodSummary, type Food } from "@/lib/domain/foods";
import type { Required } from "@/lib/domain/entries";
import { deleteMeal, saveFood, saveMeal, setFoodArchived } from "./actions";

type Meal = { id: string; name: string; items: { id: string; servings: number; food: Food }[] };

export function FoodsManager({ foods, meals, required }: { foods: Food[]; meals: Meal[]; required: Required }) {
  const [editingFood, setEditingFood] = useState<Food | "new" | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [, start] = useTransition();
  const active = foods.filter((f) => !f.archived_at);
  const archived = foods.filter((f) => f.archived_at);

  return (
    <>
      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Saved foods</h2>
          <button type="button" className="text-accent" onClick={() => setEditingFood("new")}>+ New food</button>
        </div>
        {active.length === 0 && <p className="text-sm text-muted">None yet.</p>}
        <ul className="flex flex-col divide-y divide-border" data-testid="manage-foods">
          {active.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <button type="button" className="flex flex-col text-left" onClick={() => setEditingFood(f)}>
                <span className="font-medium">{f.name}</span>
                <span className="text-xs text-muted">{foodSummary(f)}</span>
              </button>
              <button type="button" className="text-sm text-muted" onClick={() => start(async () => { await setFoodArchived(f.id, true); })}>
                Archive
              </button>
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <button type="button" className="text-left text-sm text-muted" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
        )}
        {showArchived && (
          <ul className="flex flex-col divide-y divide-border">
            {archived.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2 text-muted">
                <span>{f.name}</span>
                <button type="button" className="text-sm text-accent" onClick={() => start(async () => { await setFoodArchived(f.id, false); })}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Meals</h2>
          <button type="button" className="text-accent" onClick={() => setEditingMeal("new")} disabled={!active.length}>+ New meal</button>
        </div>
        {meals.length === 0 && <p className="text-sm text-muted">Save combos you eat often, like a usual breakfast, and log them in one tap.</p>}
        <ul className="flex flex-col divide-y divide-border" data-testid="manage-meals">
          {meals.map((m) => (
            <li key={m.id} className="py-2">
              <button type="button" className="flex w-full flex-col text-left" onClick={() => setEditingMeal(m)}>
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted">{m.items.map((i) => `${i.food.name} × ${i.servings}`).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {editingFood && <FoodForm food={editingFood === "new" ? null : editingFood} required={required} onClose={() => setEditingFood(null)} />}
      {editingMeal && <MealForm meal={editingMeal === "new" ? null : editingMeal} foods={active} onClose={() => setEditingMeal(null)} />}
    </>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-label={title} className="card m-0 flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-b-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="text-muted" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FoodForm({ food, required, onClose }: { food: Food | null; required: Required; onClose: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const v = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  const opt = (k: keyof Required) => (required[k] ? "" : " (optional)");

  return (
    <Sheet title={food ? "Edit food" : "New food"} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (food) fd.set("id", food.id);
          start(async () => {
            const r = await saveFood(fd);
            if (r.ok) onClose();
            else { setErrors(r.errors ?? {}); setMsg(r.message ?? null); }
          });
        }}
      >
        <F name="name" label="Name" def={food?.name ?? ""} err={errors.name} text />
        <div className="grid grid-cols-2 gap-2">
          <F name="serving_label" label="Serving (e.g. 1 cup)" def={food?.serving_label ?? "1 serving"} err={errors.serving_label} text />
          <F name="serving_g" label="Serving weight g (optional)" def={v(food?.serving_g)} err={errors.serving_g} />
        </div>
        <p className="text-xs text-muted">Numbers below are per serving. Add a serving weight to log by grams.</p>
        <div className="grid grid-cols-2 gap-2">
          <F name="kcal" label="Calories" def={v(food?.kcal)} err={errors.kcal} />
          <F name="protein_g" label={`Protein g${opt("protein")}`} def={v(food?.protein_g)} err={errors.protein_g} />
          <F name="fat_g" label={`Fat g${opt("fat")}`} def={v(food?.fat_g)} err={errors.fat_g} />
          <F name="carbs_g" label={`Carbs g${opt("carbs")}`} def={v(food?.carbs_g)} err={errors.carbs_g} />
        </div>
        {food && <p className="text-xs text-muted">Changes apply to future logs only. Past entries keep their numbers.</p>}
        {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
        <button className="btn" type="submit" disabled={pending}>Save food</button>
      </form>
    </Sheet>
  );
}

function F({ name, label, def, err, text }: { name: string; label: string; def: string; err?: string; text?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <input name={name} className="input" defaultValue={def} inputMode={text ? "text" : "decimal"} autoComplete="off" aria-invalid={!!err} />
      {err && <span className="text-sm text-warn">{err}</span>}
    </label>
  );
}

function MealForm({ meal, foods, onClose }: { meal: Meal | null; foods: Food[]; onClose: () => void }) {
  const [name, setName] = useState(meal?.name ?? "");
  const [items, setItems] = useState<{ food_id: string; servings: string }[]>(
    meal?.items.map((i) => ({ food_id: i.food.id, servings: String(i.servings) })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const known = new Map([...foods, ...(meal?.items.map((i) => i.food) ?? [])].map((f) => [f.id, f]));

  return (
    <Sheet title={meal ? "Edit meal" : "New meal"} onClose={onClose}>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Meal name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Meal name" />
        {errors.name && <span className="text-sm text-warn">{errors.name}</span>}
      </label>
      <ul className="flex flex-col gap-2" data-testid="meal-items">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <span className="flex-1 truncate">
              {known.get(it.food_id)?.name ?? "?"}
              {known.get(it.food_id)?.archived_at && <span className="text-muted"> (archived)</span>}
            </span>
            <input
              className="input w-20"
              inputMode="decimal"
              aria-label={`Servings of ${known.get(it.food_id)?.name}`}
              value={it.servings}
              onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, servings: e.target.value } : x)))}
            />
            <button type="button" className="text-danger" aria-label="Remove" onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
          </li>
        ))}
      </ul>
      <select
        className="input"
        aria-label="Add a food to this meal"
        value=""
        onChange={(e) => { if (e.target.value) setItems([...items, { food_id: e.target.value, servings: "1" }]); }}
      >
        <option value="">+ Add a food…</option>
        {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      {errors.items && <p className="text-sm text-warn">{errors.items}</p>}
      {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
      <div className="flex gap-2">
        {meal && (
          <button type="button" className="btn btn-ghost text-danger" onClick={() => start(async () => { await deleteMeal(meal.id); onClose(); })}>
            Delete meal
          </button>
        )}
        <button
          type="button"
          className="btn flex-1"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            if (meal) fd.set("id", meal.id);
            fd.set("name", name);
            fd.set("items", JSON.stringify(items.map((i) => ({ food_id: i.food_id, servings: Number(i.servings) }))));
            start(async () => {
              const r = await saveMeal(fd);
              if (r.ok) onClose();
              else { setErrors(r.errors ?? {}); setMsg(r.message ?? null); }
            });
          }}
        >
          Save meal
        </button>
      </div>
    </Sheet>
  );
}
