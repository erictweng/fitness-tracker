# Fitness Tracker — Spec

Status: **spec v1, awaiting Eric's go.** Written 2026-11-11 from a 5-round interview (thread `1570194632719990966`).
Supersedes `docs/SPEC-v0-research.md` (kept for the WHOOP API research used in milestone M5).

## Pitch & problem
A phone-first web app where Eric logs what he eats in seconds and sees, every day, whether he hit his calorie and protein targets for his cut. Today he has no reliable record of intake; the goal is honest daily numbers he actually keeps logging. WHOOP activity data joins later, once the logging habit is proven.

## Goals / Non-goals
**Goals (MVP)**
- Log food fast from the phone: typed entries, saved foods and saved meals.
- Today screen: calories and protein (fat/carbs if entered) vs targets.
- Targets suggested by the app (estimated burn − 500 kcal; protein 1 g/lb), editable.
- Weigh-ins with a 7-day average trend.
- 7- and 30-day history charts.
- Works with no signal; never loses an entry.

**Non-goals for the MVP** (pending Eric's `ok`)
- Barcode scanning (v1), WHOOP (M5, after the usage gate), native Mac or iPhone apps (dropped / parked), AI plain-text logging, micronutrients, social features, more than one user.

## Users & permissions
- One user: Eric. Google sign-in; only Eric's Google email is allowed. Any other account gets "This app is private" and no data.
- Enforced twice: an email allowlist in the app's auth check, and Postgres row-level security keyed to Eric's user ID.

## Core flows
**F1 First run (onboarding)**
1. Sign in with Google.
2. Enter sex, age, height, current weight (lb), activity level (sedentary / light / moderate / very active).
3. App shows suggested targets: calories = Mifflin-St Jeor BMR × activity factor − 500; protein = 1 g × current weight (lb). Eric accepts or edits.
4. Lands on an empty Today screen with an "Add food" prompt.

**F2 Log a food (main loop, target ≤ 10 s for a saved food)**
1. Tap "+" on Today. The add sheet shows recents and saved foods/meals, plus a search box over them.
2. Pick a saved food → choose servings (default 1) or grams (if the food has a serving weight) → Save. Or "Quick add": name (optional), kcal (required), protein (required), fat/carbs (optional), with a "Save as food" toggle.
3. Meal is auto-set from the time (see Data rules), editable before saving.
4. Entry appears instantly on Today; totals update.

**F3 Log a saved meal:** pick a meal → all its items are logged as separate entries in one tap.

**F4 Fix a mistake:** tap an entry → edit amount/values/meal/day → Save. Swipe left → deleted, with an Undo toast for 5 s.

**F5 Log a past day:** date picker on Today → switch to that day → log/edit as normal. Days in the future are blocked.

**F6 Weigh in:** "Weight" button → enter lb (defaults to today's day) → trend updates. One weigh-in per day; a second one on the same day replaces the first (with Undo).

**F7 Targets update:** once a week (Monday), if the 7-day average weight changed, Today shows "New suggested targets" (recomputed calories and protein). Eric taps Accept or Dismiss. Targets never change silently.

**F8 History:** 7/30-day toggle; charts for calories vs target, protein vs target, weight (daily points + 7-day average line).

**F9 Export:** Settings → "Export all" downloads a zip of CSVs (foods, meals, entries, weigh-ins, targets).

## Data model (Postgres, all rows owned by Eric's user ID)
- `profile`: sex, birth_date, height_cm, activity_level, timezone, day_start_hour (=3).
- `foods`: id, name, kcal, protein_g, fat_g?, carbs_g?, serving_label (e.g. "1 cup"), serving_g?, archived_at?, created_at.
- `meals`: id, name. `meal_items`: meal_id, food_id, servings.
- `entries`: id (**client-generated UUID**), log_date (local day), logged_at (UTC), meal (breakfast/lunch/dinner/snack), food_id?, name, servings?, grams?, **kcal, protein_g, fat_g?, carbs_g? (snapshot at log time)**, deleted_at?, updated_at.
- `weigh_ins`: id (client UUID), log_date (unique), weight_lb, deleted_at?.
- `targets`: id, effective_from (date), kcal, protein_g, source (suggested/manual).
- Rules: entries copy the food's numbers when logged, so editing or archiving a saved food never rewrites history. Deleting a saved food archives it (hidden from pickers, old entries kept). Deletes are soft (`deleted_at`); Undo clears it.
- History uses the target row in effect on each day, not today's target.

**Data rules**
- **Day:** a day runs 3:00 AM → 2:59 AM local. `log_date` is computed on the phone at entry time and stored explicitly, so timezone changes don't move old entries.
- **Meal auto-pick** [agent]: 3–10:59 breakfast, 11–15:59 lunch, 16–20:59 dinner, 21–2:59 snack.
- **Grams:** allowed only when the food has `serving_g`; amount = grams ÷ serving_g servings.
- **Sanity check:** warn (not block) when kcal differs from 4P + 4C + 9F by > 15% (only when all three macros entered).
- **7-day average weight:** mean of weigh-ins within the last 7 days; shown only with ≥ 3 weigh-ins in the window; otherwise "Need 3 weigh-ins this week".
- **Protein target:** 1 g × 7-day average weight (falls back to latest weigh-in until the average exists).
- **Calorie floor** [agent]: the suggested target never goes below BMR; if it would, cap it and show why.

## Screens & states
1. **Sign-in** — Google button; "This app is private" for other accounts.
2. **Onboarding** — 5 fields + suggested targets; validation on ranges (age 13–100, height 120–230 cm / ft-in input, weight 70–500 lb).
3. **Today** — date header with picker; big numbers: kcal left / eaten / target, protein left / eaten / target, small fat/carbs line; entries grouped by meal; "+" button bottom-right (one-thumb reach); pending-sync badge when offline.
   - Empty: "Nothing logged yet — tap + to add your first food."
   - Over target: number turns amber (kcal) — no red, no shaming.
4. **Add food sheet** — recents, saved foods, saved meals, search, Quick add.
   - Empty (first use): only Quick add, with a hint that saved foods appear here.
5. **Saved foods & meals** — list, edit, archive; build a meal from foods.
6. **Weight** — log + mini chart.
7. **History** — 7/30-day charts. Days with no entries show as gaps (not zeros) and are counted as "not logged".
8. **Settings** — targets (manual edit), profile, export, sign out.
- **Look:** dark, minimal, large numerals, one-handed. Installable to the home screen (PWA).
- **Loading:** skeletons ≤ 300 ms target; **errors:** inline banner with Retry; never a blank screen.

## Edge cases & handling
- **No signal while logging** → entry saved to on-phone storage (IndexedDB), shown with a "pending" dot, synced automatically when online. Upsert by client UUID, so retries and double-taps never duplicate.
- **Double-tap Save** → same UUID → one entry.
- **Edited offline on two devices** (phone + laptop) → last write wins by `updated_at` [agent]; acceptable for one user.
- **Session expired while offline** → queue kept; after sign-in it syncs.
- **Delete then app closed before Undo expires** → stays deleted (soft); recoverable only by DB, acceptable.
- **Snack at 1:30 AM** → counts to the previous day (3 AM rule).
- **Travel to another timezone** → new entries use the phone's current timezone; old entries keep their stored `log_date`.
- **Logging for a future date** → blocked.
- **Huge or silly numbers** (kcal > 5,000 in one entry, negative values) → negatives blocked; > 5,000 asks "Sure?".
- **Unicode / long names** → names up to 80 chars; emoji allowed.
- **Saved food edited after use** → old entries unchanged (snapshot).
- **Saved food deleted** → archived; meals containing it show "(archived)" and still log.
- **No weigh-ins** → protein target uses onboarding weight; trend hidden.
- **Two weigh-ins same day** → second replaces first, with Undo.
- **Missed days** → shown as gaps in history and excluded from averages.
- **Free Supabase project paused after ~7 days idle** → daily use prevents it; if paused, the app shows "Database asleep — open Supabase to resume" and the offline queue holds new entries.
- **Someone else signs in** → "This app is private"; RLS returns no rows even if the UI check were bypassed.

## Integrations & limits
- **Supabase (free):** Postgres + Google auth. No downloadable backups on the free plan → our own weekly backup (below). Free projects pause after ~1 week of inactivity.
- **Vercel (Hobby):** hosting, preview deploy per branch.
- **Google OAuth:** set up inside Supabase (Eric creates the OAuth client in Google Cloud console).
- **Backups:** weekly job on the Mac mini (Sunday 3 AM PT) exports all tables to `~/Backups/fitness-tracker/YYYY-MM-DD/` as CSV; keeps the last 12. Uses a server key stored on the Mac mini only.
- **WHOOP (M5, later):** official v2 OAuth API; details in `docs/SPEC-v0-research.md`.

## Non-functional requirements
- Saved-food log in ≤ 10 s, ≤ 3 taps from Today.
- Today screen interactive < 1.5 s on phone over LTE after first load.
- Monthly cost: $0.
- Privacy: health data for one person; RLS on every table; service key never in the browser or the repo.
- **Public repo from day 1** (Eric's call): `.env*` gitignored, gitleaks pre-commit hook + GitHub push protection on, only the Supabase anon key in client code (safe with RLS). No personal data in seed files or tests.
- Errors: logged to the Vercel console; no third-party analytics.

## MVP scope / v2 backlog
**MVP:** F1–F9, offline queue, backups.
**Backlog (in order):** M5 WHOOP burn + eaten − burned → switch calorie suggestion to 14-day WHOOP average; barcode scanning (Open Food Facts); AI plain-text logging; native iPhone app.

## Milestones & acceptance criteria (soft deadline: MVP on Eric's phone by **Wed 2026-11-18**)
- **M0 Skeleton (day 1):** Next.js + Supabase + Google sign-in deployed on Vercel; repo public with gitleaks hook. *Accept:* Eric signs in on his phone; a second Google account sees "This app is private" and zero rows (checked via API too).
- **M1 Log + Today (days 2–3):** onboarding, quick add, edit, swipe-delete with Undo, past-day picker, 3 AM rule. *Accept:* Playwright test logs 3 entries incl. one at 1:30 AM; totals match hand-computed sums; the 1:30 AM entry lands on the previous day; Undo restores a deleted entry.
- **M2 Saved foods & meals (day 4):** save, re-log by servings/grams, meals, recents, archive. *Accept:* log a saved food in ≤ 3 taps (scripted); editing the food leaves yesterday's entry unchanged.
- **M3 Weight + targets (day 5):** weigh-ins, 7-day average, weekly suggestion with Accept/Dismiss, BMR floor. *Accept:* fixture of 10 weigh-ins gives the expected average and protein target; suggestion math matches a hand-computed Mifflin-St Jeor example.
- **M4 History, offline, export, backup (days 6–7):** charts, IndexedDB queue, CSV export, weekly Mac mini backup. *Accept:* airplane-mode test logs 2 entries, reconnects, exactly 2 rows appear; export zip opens with all 5 CSVs; first backup folder exists on the Mac mini.
- **Usage gate (2026-11-18 → 12-02):** Eric logs ≥ 80% of days (≥ 12 of 14). Pass → start M5 WHOOP. Fail → fix logging friction first.

## Decisions log
- Typed entry now; barcodes later — Eric
- Supports cut/maintain/bulk; currently cutting — Eric
- No Mac app; phone-first web app; native iPhone parked — Eric
- New app from scratch (not the harness's earlier fitness app) — Eric
- Log on phone, in the browser — Eric
- Vercel + Supabase hosting — Eric
- MVP = logging + Today, saved foods/meals, history charts; WHOOP is milestone 2 (M5) — Eric
- kcal + protein required; fat/carbs optional — Eric
- Targets: estimate from body stats now, WHOOP 14-day burn later — Eric
- Fixed daily calorie target — Eric
- Deficit 500 kcal/day — Eric
- Protein 1 g/lb of 7-day average weight — Eric
- Google sign-in, Eric only — Eric
- Day ends 3 AM — Eric
- Auto meal groups, editable — Eric
- Servings + grams — Eric
- Tap to edit; swipe delete + 5 s Undo — Eric
- Any past day loggable — Eric
- Clean minimal dark look — Eric
- Offline queue — Eric
- CSV export + weekly Mac mini backup — Eric
- MVP in 1 week, 2-week usage gate before WHOOP — Eric
- Public repo from day 1 — Eric (guardrails: gitleaks, push protection — agent)
- Pounds as the weight unit; ft/in or cm for height — Decided by agent (US user)
- Meal time windows — Decided by agent (common defaults, editable per entry)
- Entries snapshot nutrition values — Decided by agent (history must not change when a food is edited)
- Calorie floor at BMR — Decided by agent (safety on an aggressive suggestion)
- Last write wins for edit conflicts — Decided by agent (single user)
- Weekly target suggestions, never silent — Decided by agent (stable targets for a cut)

## Open questions / parked
- Non-goals list awaiting Eric's `ok`.
- Native iPhone app — parked.
- Whether this replaces the "fitness/nutrition tracking" line on the AI Workflow Harness resume entry — parked.

## Risks
1. **Logging friction** — the whole app fails if Eric stops logging; mitigated by saved foods, recents, offline queue and the usage gate.
2. **Public repo with health data** — a leaked service key exposes everything; mitigated by gitleaks, push protection, RLS, and keeping the key off the client and out of the repo.
3. **Free-tier limits** — Supabase pauses idle projects and offers no downloadable backups; mitigated by daily use, the offline queue and our own weekly backup.
4. **Estimated burn is a guess** (Mifflin-St Jeor is ±10–15% for individuals) — weekly weight trend is the real check until WHOOP arrives.
