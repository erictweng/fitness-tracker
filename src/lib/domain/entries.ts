export type Macros = { kcal: number; protein_g: number | null; fat_g: number | null; carbs_g: number | null };
export type EntryLike = Macros & { deleted_at?: string | null };

/** Fat/carbs sum only the entries that have a value; `missingFat`/`missingCarbs` count the rest (unknown ≠ 0). */
export type Totals = { kcal: number; protein: number; fat: number; carbs: number; count: number; missingFat: number; missingCarbs: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function totals(entries: EntryLike[]): Totals {
  const t = { kcal: 0, protein: 0, fat: 0, carbs: 0, count: 0, missingFat: 0, missingCarbs: 0 };
  for (const e of entries) {
    if (e.deleted_at) continue;
    t.kcal += Number(e.kcal);
    t.protein += Number(e.protein_g ?? 0);
    if (e.fat_g === null || e.fat_g === undefined) t.missingFat += 1;
    else t.fat += Number(e.fat_g);
    if (e.carbs_g === null || e.carbs_g === undefined) t.missingCarbs += 1;
    else t.carbs += Number(e.carbs_g);
    t.count += 1;
  }
  return { ...t, kcal: Math.round(t.kcal), protein: r1(t.protein), fat: r1(t.fat), carbs: r1(t.carbs) };
}

export type Required = { protein: boolean; fat: boolean; carbs: boolean };

export type EntryInput = {
  name: string;
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  notes: string | null;
};

export const NOTES_MAX = 280;

export type Parsed =
  | { ok: true; value: EntryInput; warnings: string[]; needsConfirm: boolean }
  | { ok: false; errors: Record<string, string> };

function num(raw: FormDataEntryValue | null | undefined): number | null | "bad" {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return "bad";
  return n;
}

const LIMITS = { kcal: 9999, protein_g: 999, fat_g: 999, carbs_g: 999 } as const;

/** Validates a quick-add/edit form against the user's required-macro settings. */
export function parseEntry(form: { get(k: string): FormDataEntryValue | null }, req: Required): Parsed {
  const errors: Record<string, string> = {};
  const name = String(form.get("name") ?? "").trim();
  if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  const notes = String(form.get("notes") ?? "").trim();
  if (notes.length > NOTES_MAX) errors.notes = `Keep notes under ${NOTES_MAX} characters.`;

  const fields = { kcal: num(form.get("kcal")), protein_g: num(form.get("protein_g")), fat_g: num(form.get("fat_g")), carbs_g: num(form.get("carbs_g")) };
  const required: Record<keyof typeof fields, boolean> = { kcal: true, protein_g: req.protein, fat_g: req.fat, carbs_g: req.carbs };
  for (const k of Object.keys(fields) as (keyof typeof fields)[]) {
    const v = fields[k];
    if (v === "bad") errors[k] = "Enter a number.";
    else if (v === null && required[k]) errors[k] = "Required.";
    else if (v !== null && v < 0) errors[k] = "Can't be negative.";
    else if (v !== null && v > LIMITS[k]) errors[k] = "That's too big.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const value: EntryInput = {
    name,
    kcal: fields.kcal as number,
    protein_g: fields.protein_g as number | null,
    fat_g: fields.fat_g as number | null,
    carbs_g: fields.carbs_g as number | null,
    notes: notes || null,
  };
  const warnings: string[] = [];
  if (value.protein_g !== null && value.fat_g !== null && value.carbs_g !== null) {
    const est = 4 * value.protein_g + 4 * value.carbs_g + 9 * value.fat_g;
    if (est > 0 && Math.abs(value.kcal - est) / est > 0.15) {
      warnings.push(`Macros add up to about ${Math.round(est)} kcal, not ${value.kcal}. Typo?`);
    }
  }
  return { ok: true, value, warnings, needsConfirm: value.kcal > 5000 };
}
