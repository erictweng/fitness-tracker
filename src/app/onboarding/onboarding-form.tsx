"use client";

import { useActionState, useMemo, useState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { DEFAULT_ADJUST, suggestTargets, type Activity, type Goal, type ProteinRule, type Sex } from "@/lib/domain/targets";
import { ageOn } from "@/lib/domain/day";
import { ftInToCm, fromDisplayWeight } from "@/lib/domain/units";

const todayIso = () => new Date().toISOString().slice(0, 10);

export function OnboardingForm({ proteinRule, proteinValue }: { proteinRule: ProteinRule; proteinValue: number }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, null);
  const [f, setF] = useState({
    sex: "", birth_date: "", height_unit: "ftin", height_ft: "", height_in: "", height_cm: "",
    weight_unit: "lb", weight: "", activity: "", goal: "cut",
  });
  const [kcalEdit, setKcalEdit] = useState<string | null>(null);
  const [proteinEdit, setProteinEdit] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const suggestion = useMemo(() => {
    const heightCm = f.height_unit === "cm" ? Number(f.height_cm) : ftInToCm(Number(f.height_ft), Number(f.height_in) || 0);
    const weightKg = fromDisplayWeight(Number(f.weight), f.weight_unit as "lb" | "kg");
    if (!f.sex || !f.activity || !f.birth_date || !(heightCm > 0) || !(weightKg > 0)) return null;
    return suggestTargets({
      sex: f.sex as Sex, weightKg, heightCm, ageYears: ageOn(f.birth_date, todayIso()),
      activity: f.activity as Activity, goal: f.goal as Goal, adjustKcal: DEFAULT_ADJUST[f.goal as Goal],
      proteinRule, proteinValue,
    });
  }, [f, proteinRule, proteinValue]);

  const err = state?.errors ?? {};
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="timezone" value={tz} />
      <Field label="Sex (for the burn estimate)" error={err.sex}>
        <select name="sex" aria-label="Sex" className="input" value={f.sex} onChange={set("sex")} required>
          <option value="" disabled>Choose…</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Field>
      <Field label="Birth date" error={err.birth_date}>
        <input name="birth_date" aria-label="Birth date" type="date" className="input" value={f.birth_date} onChange={set("birth_date")} required />
      </Field>
      <Field label="Height" error={err.height}>
        <div className="flex gap-2">
          {f.height_unit === "ftin" ? (
            <>
              <input name="height_ft" inputMode="numeric" className="input" placeholder="ft" aria-label="Height feet" value={f.height_ft} onChange={set("height_ft")} />
              <input name="height_in" inputMode="numeric" className="input" placeholder="in" aria-label="Height inches" value={f.height_in} onChange={set("height_in")} />
            </>
          ) : (
            <input name="height_cm" inputMode="decimal" className="input" placeholder="cm" aria-label="Height cm" value={f.height_cm} onChange={set("height_cm")} />
          )}
          <select name="height_unit" className="input max-w-24" aria-label="Height unit" value={f.height_unit} onChange={set("height_unit")}>
            <option value="ftin">ft/in</option>
            <option value="cm">cm</option>
          </select>
        </div>
      </Field>
      <Field label="Current weight" error={err.weight}>
        <div className="flex gap-2">
          <input name="weight" inputMode="decimal" className="input" aria-label="Weight" value={f.weight} onChange={set("weight")} required />
          <select name="weight_unit" className="input max-w-24" aria-label="Weight unit" value={f.weight_unit} onChange={set("weight_unit")}>
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </Field>
      <Field label="How active are you?" error={err.activity}>
        <select name="activity" aria-label="Activity" className="input" value={f.activity} onChange={set("activity")} required>
          <option value="" disabled>Choose…</option>
          <option value="sedentary">Sedentary (desk job, little exercise)</option>
          <option value="light">Light (1–3 workouts a week)</option>
          <option value="moderate">Moderate (3–5 workouts a week)</option>
          <option value="very_active">Very active (6–7 hard workouts a week)</option>
        </select>
      </Field>
      <Field label="Goal" error={err.goal}>
        <select name="goal" aria-label="Goal" className="input" value={f.goal} onChange={set("goal")}>
          <option value="cut">Cut (lose fat)</option>
          <option value="maintain">Maintain</option>
          <option value="bulk">Bulk (gain)</option>
        </select>
      </Field>

      <section className="card flex flex-col gap-3" aria-live="polite">
        <h2 className="font-semibold">Your daily targets</h2>
        {suggestion ? (
          <>
            <p className="text-sm text-muted">
              Estimated burn {suggestion.burn} kcal/day
              {f.goal !== "maintain" && ` ${DEFAULT_ADJUST[f.goal as Goal] > 0 ? "+" : "−"} ${Math.abs(DEFAULT_ADJUST[f.goal as Goal])}`}.
              {suggestion.flooredAtBmr && " Raised to your resting burn so it isn't too low."}
            </p>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Calories
                <input name="kcal_target" inputMode="numeric" className="input" value={kcalEdit ?? String(suggestion.kcal)} onChange={(e) => setKcalEdit(e.target.value)} />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Protein (g)
                <input name="protein_target" inputMode="numeric" className="input" value={proteinEdit ?? String(suggestion.proteinG)} onChange={(e) => setProteinEdit(e.target.value)} />
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Fill in the fields above to see your suggested targets.</p>
        )}
      </section>

      {state?.message && <p role="alert" className="text-warn">{state.message}</p>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Start logging"}</button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {error && <span className="text-sm text-warn">{error}</span>}
    </div>
  );
}
