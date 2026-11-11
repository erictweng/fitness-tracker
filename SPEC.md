# Fitness Tracker — Spec

Status: **spec v2 (multi-user), awaiting Eric's go.** Written 2026-11-11 from a 7-round interview (thread `1570194632719990966`).
`docs/SPEC-v0-research.md` is the earlier single-user draft, kept for the WHOOP API research used in M5.

## Pitch & problem
A phone-first web app where a small invited group logs what they eat in seconds and sees, every day, whether they hit their calorie and protein targets for their own goal (cut, maintain or bulk). Eric is the first user (currently cutting) and the admin. Today none of them has a reliable record of intake; the goal is honest daily numbers people keep logging. WHOOP activity data comes later, per user, once the logging habit is proven.

## Goals / Non-goals
**Goals (MVP)**
- Fast phone logging: typed entries, saved foods and saved meals.
- Today screen: calories and protein (plus fat/carbs) vs the user's targets.
- Targets suggested by the app from body stats and goal, editable; per-user settings.
- Weigh-ins with a 7-day average trend; weekly target suggestions.
- 7- and 30-day history charts.
- Works with no signal; never loses an entry.
- Invite-only access with an admin page for Eric; every user's data private.
- Self-serve export and account deletion; weekly encrypted off-site backup.

**Non-goals for the MVP** (confirmed by Eric 2026-11-11)
- Barcode scanning (next), WHOOP (M5, after the usage gate), native Mac/iPhone apps, AI plain-text logging, micronutrients, social features (post-MVP backlog), public sign-up.

## Users & permissions
- **Users:** a small invited group (target < 20). Eric is a user and the only **admin**.
- **Sign-in:** Google only. Signing in with an email that has no invite → "This app is invite-only. Ask Eric for an invite." and no account is created.
- **Admin (Eric) can:** invite an email, revoke an unused invite, remove a user, and see the user list (email, joined date, last active). **Admin cannot see anyone's food, weight, targets or settings** — not in the UI, and not through the API (row-level security).
- **Each user can:** read and write only their own rows; change their own settings; export their data; delete their account.
- Enforced in Postgres with row-level security on every data table (`user_id = auth.uid()`); the admin role only reaches `invites` and the user-list view.

## Per-user settings (defaults = Eric's picks)
- **Goal:** cut / maintain / bulk. Adjustment: cut −250 / **−500** / −750 / custom kcal; maintain 0; bulk +250 / +500 / custom.
- **Protein rule:** **1 g per lb** of 7-day average weight / g per kg / fixed grams. Value editable (e.g. 0.8 g/lb).
- **Units:** **lb** or kg for weight; ft-in or cm for height.
- **Day ends at:** **3 AM** (choices midnight–6 AM).
- **Required macros:** kcal always required; **protein required** by default; fat and carbs optional by default and can each be made required.
- **Activity level** and body stats (sex, birth date, height) for the burn estimate.

## Core flows
**F0 Invite (admin)**
1. Eric opens Admin → "Invite" → enters an email → invite saved (no email is sent [agent]; Eric shares the app link himself).
2. Friend opens the link → Sign in with Google using that email → onboarding.

**F1 Onboarding (each new user)**
1. Enter sex, birth date, height, current weight, activity level (sedentary / light / moderate / very active), goal.
2. App shows suggested targets: calories = Mifflin-St Jeor BMR × activity factor + goal adjustment; protein from the protein rule. User accepts or edits. Other settings start at the defaults, changeable later.
3. Lands on an empty Today screen with an "Add food" prompt.

**F2 Log a food (target ≤ 10 s, ≤ 3 taps for a saved food)**
1. Tap "+" on Today. The add sheet shows recents, saved foods and meals, and a search over them.
2. Saved food → servings (default 1) or grams (if the food has a serving weight) → Save. Or **Quick add**: name (optional), kcal, protein, fat, carbs (required per the user's settings), with a "Save as food" toggle.
3. Meal auto-set from the time of day, editable before saving.
4. Entry appears instantly; totals update.

**F3 Log a saved meal:** one tap logs all its items as separate entries.

**F4 Fix a mistake:** tap an entry → edit → Save. Swipe left → deleted, with Undo for 5 s.

**F5 Past days:** date picker on Today → log/edit that day. Future days blocked.

**F6 Weigh in:** enter weight (in the user's unit) → trend updates. One per day; a second one the same day replaces the first (with Undo).

**F7 Weekly targets:** every Monday, if the user's 7-day average weight changed, Today shows "New suggested targets" → Accept or Dismiss. Targets never change silently.

**F8 History:** 7/30-day toggle; calories vs target, protein vs target, weight (daily points + 7-day average line).

**F9 Export:** Settings → "Export all" downloads a zip of the user's own CSVs (foods, meals, entries, weigh-ins, targets, settings).

**F10 Delete account:** Settings → "Delete account" → type `delete` → all the user's rows and their login are deleted immediately; they're signed out. Their data leaves the off-site backups as those age out (≤ 12 weeks); the privacy note says so.

**F11 Remove a user (admin):** Admin → user → "Remove" → type their email to confirm → same deletion as F10, and their invite is revoked [agent].

## Data model (Postgres / Supabase)
- `invites`: email (unique, lowercase), invited_at, accepted_at?, revoked_at?.
- `profiles`: user_id, email, is_admin, sex, birth_date, height_cm, activity_level, goal, goal_adjust_kcal, protein_rule (per_lb/per_kg/fixed), protein_value, weight_unit, height_unit, day_end_hour, require_protein, require_fat, require_carbs, timezone, created_at, last_active_at.
- `foods`: id, user_id, name, kcal, protein_g?, fat_g?, carbs_g?, serving_label, serving_g?, archived_at?.
- `meals`: id, user_id, name. `meal_items`: meal_id, food_id, servings.
- `entries`: id (**client-generated UUID**), user_id, log_date, logged_at (UTC), meal, food_id?, name, servings?, grams?, **kcal, protein_g?, fat_g?, carbs_g? (snapshot at log time)**, deleted_at?, updated_at.
- `weigh_ins`: id (client UUID), user_id, log_date (unique per user), weight_kg, deleted_at?.
- `targets`: id, user_id, effective_from, kcal, protein_g, source (suggested/manual).
- Stored metric internally (kg, cm); converted for display.
- Entries copy the food's numbers when logged, so editing or archiving a saved food never rewrites history. Deleting a saved food archives it.
- Soft delete (`deleted_at`) for entries and weigh-ins so Undo works; account deletion is a hard delete.
- History uses the target in effect on each day.

**Data rules**
- **Day:** runs from the user's day-end hour to the next. `log_date` is computed on the phone at entry time and stored, so timezone changes don't move old entries.
- **Meal auto-pick** [agent]: day-end hour–10:59 breakfast, 11–15:59 lunch, 16–20:59 dinner, 21–day-end snack.
- **Grams** only when the food has `serving_g`.
- **Sanity check:** warn (not block) when kcal differs from 4P + 4C + 9F by > 15% (only when all three are entered).
- **7-day average weight:** mean of weigh-ins in the last 7 days; shown with ≥ 3 weigh-ins, else "Need 3 weigh-ins this week". Protein uses the latest weigh-in until the average exists.
- **Calorie floor** [agent]: a suggested cut target never goes below BMR; if it would, it's capped and the reason shown.

## Screens & states
1. **Sign-in** — Google button; invite-only message for others.
2. **Onboarding** — body stats + goal + suggested targets. Validation: age 13–100, height 120–230 cm, weight 30–230 kg (or the lb/ft-in equivalent).
3. **Today** — date + picker; big numbers (kcal left / eaten / target, protein left / eaten / target), fat/carbs line; entries by meal; "+" bottom-right; pending-sync dot when offline.
   - Empty: "Nothing logged yet — tap + to add your first food." Over target: amber, no red.
4. **Add food sheet** — recents, saved foods, meals, search, Quick add. First use: Quick add only, with a hint.
5. **Saved foods & meals** — list, edit, archive, build meals.
6. **Weight** — log + mini chart.
7. **History** — 7/30-day charts; days with nothing logged are gaps, not zeros.
8. **Settings** — goal, targets, protein rule, units, day end, required macros, body stats, export, delete account, sign out, privacy note.
9. **Admin** (Eric only) — invites (add/revoke), users (email, joined, last active, remove).
- **Look:** dark, minimal, large numerals, one-handed; installable to the home screen (PWA).
- **Loading:** skeletons; **errors:** inline banner with Retry; never a blank screen.

## Edge cases & handling
- **No signal** → entry saved on the phone (IndexedDB) with a pending dot; syncs when back online; upsert by client UUID, so retries never duplicate.
- **Double-tap Save** → same UUID → one entry.
- **Same entry edited on two devices** → last write wins by `updated_at` [agent].
- **Session expires while offline** → queue kept; syncs after sign-in.
- **Removed/deleted user still has the app open** → next request fails auth → signed out with "Your account was removed"; their offline queue is discarded.
- **Invited email ≠ Google account email** → invite-only message; Eric re-invites the right email.
- **Invite email typed with capitals/spaces** → normalised (trim + lowercase).
- **Someone signs in without an invite** → no account created; RLS returns nothing even if the UI were bypassed.
- **Admin tries to read another user's data via the API** → RLS returns zero rows (tested).
- **Eric removes himself** → blocked: the last admin can't be removed.
- **Snack after midnight but before the user's day end** → counts to the previous day.
- **Travel** → new entries use the phone's current timezone; old entries keep their stored `log_date`.
- **Future date** → blocked. **Negative numbers** → blocked. **> 5,000 kcal in one entry** → "Sure?".
- **Long names / emoji** → names up to 80 chars, emoji allowed.
- **User switches lb ↔ kg** → stored values unchanged; display converts; protein rule keeps its meaning.
- **User changes day-end hour** → applies to new entries only; old `log_date`s stay put.
- **User changes goal (cut → maintain)** → new target row from today; history keeps old targets.
- **Saved food edited/archived after use** → old entries unchanged.
- **No weigh-ins** → protein uses onboarding weight; trend hidden.
- **Missed days** → gaps in history, excluded from averages.
- **Supabase free project paused after ~7 days idle** → daily use prevents it; if paused, the app shows "Database asleep" and the offline queue holds entries.
- **Backup job fails** → GitHub emails Eric (workflow failure notification); next week retries.

## Integrations & limits
- **Supabase (free):** Postgres + Google auth + RLS. Free-plan limits (500 MB database, 50k monthly active users) are far above < 20 users. No downloadable backups on free → our own backup below. Pauses after ~1 week idle.
- **Vercel (Hobby):** hosting, preview deploy per branch.
- **Google OAuth:** client created by Eric in Google Cloud console, configured in Supabase.
- **Backups:** GitHub Actions, every Sunday 3 AM PT: `pg_dump` → encrypted with `age` (public key in the repo; private key only with Eric, in his password manager) → uploaded to a private **Cloudflare R2** bucket (free tier 10 GB); keep the last 12. DB URL and R2 keys are GitHub Actions secrets. The workflow prints only file size and row counts (the repo is public, so its logs are public).
- **WHOOP (M5, later):** each user connects their own WHOOP via the official v2 OAuth API; details in `docs/SPEC-v0-research.md`.

## Non-functional requirements
- Saved-food log in ≤ 10 s, ≤ 3 taps.
- Today interactive < 1.5 s on phone over LTE after first load.
- Monthly cost: $0 (Supabase free, Vercel Hobby, R2 free tier, GitHub Actions free for public repos).
- Privacy: several people's health data. RLS on every table; admin can't read logs; no analytics or third-party trackers; short privacy note in Settings (what's stored, who can see it, how to delete, backups age out in 12 weeks).
- **Public repo** (Eric's call): `.env*` gitignored; gitleaks pre-commit hook; GitHub push protection on; only the Supabase anon key in client code; no real user data in seeds, tests, fixtures or Action logs.
- Errors: Vercel logs only.

## MVP scope / backlog
**MVP:** F0–F11, per-user settings, offline queue, export, account deletion, admin page, weekly encrypted backup.
**Backlog (in order):** M5 WHOOP per user (burn, eaten − burned, 14-day burn for targets); barcode scanning (Open Food Facts); social features (opt-in sharing, streaks); AI plain-text logging; native iPhone app.

## Milestones & acceptance criteria (soft deadline: MVP live **Fri 2026-11-20**)
- **M0 Skeleton + access (days 1–2):** Next.js + Supabase + Google sign-in on Vercel; invites, admin page, RLS on all tables; public repo with gitleaks + push protection. *Accept:* invited test account gets in; uninvited account gets the invite-only message and no `profiles` row; an API call as admin for another user's `entries` returns 0 rows (automated test).
- **M1 Onboarding, settings, logging, Today (days 3–4):** *Accept:* Playwright test creates two users with different settings (lb / 3 AM / cut vs kg / midnight / bulk); logs entries incl. one at 1:30 AM; each sees only their own data; totals and day assignment match hand-computed values; Undo restores a deleted entry.
- **M2 Saved foods & meals (day 5):** *Accept:* re-log a saved food in ≤ 3 taps (scripted); editing the food leaves yesterday's entry unchanged; a meal logs all its items.
- **M3 Weight + targets (day 6):** *Accept:* 10-weigh-in fixture gives the expected 7-day average and protein target in both lb and kg; suggestion matches a hand-computed Mifflin-St Jeor example; BMR floor caps an aggressive cut.
- **M4 History, offline, export, delete, backup (days 7–8):** *Accept:* airplane-mode test logs 2 entries, reconnects, exactly 2 rows; export zip has all CSVs and only that user's rows; account deletion leaves 0 rows for that user; the first backup lands in R2 and **restores** into a scratch Postgres with matching row counts; the Action log shows no data.
- **Launch Fri 11-20:** Eric invites his group.
- **Usage gate (11-20 → 12-04):** Eric logs ≥ 12 of 14 days (also note how many invited users log ≥ 7 days). Pass → M5 WHOOP. Fail → fix logging friction first.

## Decisions log
- Typed entry now; barcodes later — Eric
- Goals: cut / maintain / bulk; Eric currently cutting — Eric
- No Mac app; phone-first web app; native iPhone parked — Eric
- New app from scratch — Eric
- Log on phone in the browser — Eric
- Vercel + Supabase — Eric
- MVP = logging + Today, saved foods/meals, history; WHOOP after the gate — Eric
- kcal + protein required, fat/carbs optional (default; per-user setting) — Eric
- Targets from body stats now, WHOOP burn later — Eric
- Fixed daily calorie target — Eric
- Default deficit 500 kcal/day — Eric
- Default protein 1 g/lb of 7-day average weight — Eric
- Google sign-in — Eric
- Default day end 3 AM — Eric
- Auto meal groups, editable — Eric
- Servings + grams — Eric
- Tap to edit; swipe delete + 5 s Undo — Eric
- Any past day loggable — Eric
- Clean minimal dark look — Eric
- Offline queue — Eric
- Public repo from day 1 — Eric (guardrails — agent)
- Multiple users: small invited group — Eric
- Invite-only; Eric adds emails in an admin page — Eric
- Per-user goal, protein rule, units, day end, required macros — Eric
- Saved foods private per user — Eric
- Logs fully private; social after MVP — Eric
- No data on the Mac mini — Eric
- Weekly encrypted backup via GitHub Actions to Cloudflare R2 — Eric
- Users delete their own account — Eric
- Admin sees invites and user list only — Eric
- MVP by Fri 2026-11-20 — Eric
- Non-goals list confirmed — Eric
- Data stored metric, shown in the user's unit — Decided by agent (one source of truth, clean unit switching)
- No invite emails sent; Eric shares the link — Decided by agent (no email provider needed for < 20 people)
- Removing a user deletes their data immediately — Decided by agent (same path as self-delete)
- Meal time windows — Decided by agent
- Entries snapshot nutrition values — Decided by agent
- Calorie floor at BMR — Decided by agent
- Last write wins — Decided by agent
- Weekly suggestions, never silent — Decided by agent

## Open questions / parked
- Native iPhone app — parked.
- Whether this replaces the "fitness/nutrition tracking" line on the AI Workflow Harness resume entry — parked.

## Risks
1. **Logging friction** — the app fails if people stop logging; mitigated by saved foods, recents, offline queue and the usage gate.
2. **Other people's health data in a public-repo project** — a leaked key exposes everyone. Mitigated by gitleaks, push protection, RLS with an admin-cannot-read test, server keys only in Vercel/GitHub secrets, and no data in Action logs.
3. **Backup depends on GitHub scheduled workflows** — GitHub disables scheduled workflows in public repos after 60 days without repo activity. Mitigation: failure emails go to Eric; the M4 restore test proves the backup works.
4. **Lost `age` private key = unreadable backups** — kept in Eric's password manager; M4 restore test confirms it before launch.
5. **Estimated burn is ±10–15% per person** — weekly weight trend is the real check until WHOOP.
6. **Scope growth from "flexible for users"** — per-user settings are fixed to the five listed; new requests go to the backlog.
