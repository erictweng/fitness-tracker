"use client";

import { useActionState, useState } from "react";
import { saveSettings, saveTargets, type SettingsState } from "./actions";
import type { Suggestion } from "@/lib/domain/targets";
import { cmToFtIn } from "@/lib/domain/units";

type ProfileView = {
  goal: string; goal_adjust_kcal: number; protein_rule: string; protein_value: number;
  weight_unit: string; height_unit: string; day_end_hour: number;
  require_protein: boolean; require_fat: boolean; require_carbs: boolean;
  activity_level: string | null; sex: string | null; birth_date: string | null; height_cm: number | null;
};

export function TargetsForm({ current, suggestion }: { current: { kcal: number; protein_g: number } | null; suggestion: Suggestion | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveTargets, null);
  const [kcal, setKcal] = useState(String(current?.kcal ?? suggestion?.kcal ?? ""));
  const [protein, setProtein] = useState(String(current?.protein_g ?? suggestion?.proteinG ?? ""));
  return (
    <form action={action} className="flex flex-col gap-3">
      {suggestion && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted" data-testid="suggested">
            Suggested: {suggestion.kcal} kcal · {suggestion.proteinG} g protein
            {suggestion.flooredAtBmr && " (raised to your resting burn)"}
          </span>
          <button type="button" className="text-accent" onClick={() => { setKcal(String(suggestion.kcal)); setProtein(String(suggestion.proteinG)); }}>
            Use
          </button>
        </div>
      )}
      <input type="hidden" name="suggested_kcal" value={suggestion?.kcal ?? ""} />
      <input type="hidden" name="suggested_protein" value={suggestion?.proteinG ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">Calories
          <input name="kcal" className="input" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          {state?.errors?.kcal && <span className="text-warn">{state.errors.kcal}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">Protein (g)
          <input name="protein_g" className="input" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
          {state?.errors?.protein_g && <span className="text-warn">{state.errors.protein_g}</span>}
        </label>
      </div>
      {state?.message && <p role="status" className={state.ok ? "text-accent text-sm" : "text-warn text-sm"}>{state.message}</p>}
      <button className="btn" type="submit" disabled={pending}>Save targets</button>
    </form>
  );
}

export function SettingsForm({ profile }: { profile: ProfileView }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, null);
  const [goal, setGoal] = useState(profile.goal);
  const [heightUnit, setHeightUnit] = useState(profile.height_unit);
  const [rule, setRule] = useState(profile.protein_rule);
  const ftin = profile.height_cm ? cmToFtIn(profile.height_cm) : { ft: "", in: "" };
  const e = state?.errors ?? {};
  const err = (k: string) => e[k] && <span className="text-sm text-warn">{e[k]}</span>;

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">Goal
        <select name="goal" className="input" value={goal} onChange={(ev) => setGoal(ev.target.value)}>
          <option value="cut">Cut</option><option value="maintain">Maintain</option><option value="bulk">Bulk</option>
        </select>
      </label>
      {goal !== "maintain" && (
        <label className="flex flex-col gap-1 text-sm">{goal === "cut" ? "Daily deficit (kcal)" : "Daily surplus (kcal)"}
          <input
            name="goal_adjust_kcal" className="input" inputMode="numeric"
            defaultValue={goal === profile.goal ? profile.goal_adjust_kcal : goal === "cut" ? -500 : 250}
            key={goal}
          />
          <span className="text-xs text-muted">{goal === "cut" ? "Negative number, e.g. −250, −500, −750" : "e.g. 250 or 500"}</span>
          {err("goal_adjust_kcal")}
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">Protein rule
          <select name="protein_rule" className="input" value={rule} onChange={(ev) => setRule(ev.target.value)}>
            <option value="per_lb">g per lb</option><option value="per_kg">g per kg</option><option value="fixed">fixed grams</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{rule === "fixed" ? "Grams / day" : "Amount"}
          <input name="protein_value" className="input" inputMode="decimal" defaultValue={profile.protein_value} key={rule} />
          {err("protein_value")}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">Weight unit
          <select name="weight_unit" className="input" defaultValue={profile.weight_unit}>
            <option value="lb">lb</option><option value="kg">kg</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Day ends at
          <select name="day_end_hour" className="input" defaultValue={profile.day_end_hour}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? "Midnight" : `${h} AM`}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-muted">Required when logging (calories always are)</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="require_protein" defaultChecked={profile.require_protein} /> Protein</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="require_fat" defaultChecked={profile.require_fat} /> Fat</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="require_carbs" defaultChecked={profile.require_carbs} /> Carbs</label>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">Activity
        <select name="activity_level" className="input" defaultValue={profile.activity_level ?? "light"}>
          <option value="sedentary">Sedentary</option><option value="light">Light</option>
          <option value="moderate">Moderate</option><option value="very_active">Very active</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">Sex
          <select name="sex" className="input" defaultValue={profile.sex ?? ""}>
            <option value="male">Male</option><option value="female">Female</option>
          </select>
          {err("sex")}
        </label>
        <label className="flex flex-col gap-1 text-sm">Birth date
          <input type="date" name="birth_date" className="input" defaultValue={profile.birth_date ?? ""} />
          {err("birth_date")}
        </label>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span>Height</span>
        <div className="flex gap-2">
          {heightUnit === "ftin" ? (
            <>
              <input name="height_ft" className="input" inputMode="numeric" aria-label="Height feet" defaultValue={ftin.ft} />
              <input name="height_in" className="input" inputMode="numeric" aria-label="Height inches" defaultValue={ftin.in} />
            </>
          ) : (
            <input name="height_cm" className="input" inputMode="decimal" aria-label="Height cm" defaultValue={profile.height_cm ?? ""} />
          )}
          <select name="height_unit" className="input max-w-24" aria-label="Height unit" value={heightUnit} onChange={(ev) => setHeightUnit(ev.target.value)}>
            <option value="ftin">ft/in</option><option value="cm">cm</option>
          </select>
        </div>
        {err("height")}
      </div>
      {state?.message && <p role="status" className={state.ok ? "text-accent text-sm" : "text-warn text-sm"}>{state.message}</p>}
      <button className="btn" type="submit" disabled={pending}>Save settings</button>
    </form>
  );
}
