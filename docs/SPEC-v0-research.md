# Fitness Tracker: Spec v0 (draft)

Status: **spec draft, not built.** Created 2026-11-03 from Eric's Discord request.
Thread: Project — Fitness Tracker (`1570194632719990966`). Workspace: `~/projects/fitness-tracker/`.

## 1. Goal
A personal app where Eric logs what he eats by hand and sees, for each day:
- **Intake:** calories, protein, fat, carbs against targets.
- **Activity:** pulled automatically from his **WHOOP** band (calories burned, strain, workouts, recovery, sleep).
- **The balance:** eaten − burned, and whether he's on track for his goal (cut / maintain / bulk).

Single user (Eric) for v0. No social features.

## 2. What WHOOP gives us (official developer API, read 2026-11-03)
- **Access:** OAuth 2.0. Eric registers an app in the WHOOP Developer Dashboard to get a client ID and secret, then signs in once to grant access.
  - Auth URL: `https://api.prod.whoop.com/oauth/oauth2/auth`
  - Token URL: `https://api.prod.whoop.com/oauth/oauth2/token`
- **Scopes (read-only):** `read:cycles`, `read:workout`, `read:recovery`, `read:sleep`, `read:profile`, `read:body_measurement`.
- **Data we use:**
  - `GET /v2/cycle`: day **strain**, **kilojoule** (energy burned), average/max heart rate.
  - `GET /v2/activity/workout`: each workout's sport, strain, kilojoule, heart-rate zones, distance.
  - `GET /v2/recovery`: recovery %, resting heart rate, HRV.
  - `GET /v2/activity/sleep`: sleep performance, stage totals.
  - `GET /v2/user/measurement/body`: height, weight, max heart rate.
- **Webhooks:** `workout.updated/deleted`, `sleep.updated/deleted`, `recovery.updated/deleted`. Each payload carries an ID only, so the app fetches the record afterwards. Note there is **no cycle webhook**, so day calories must be polled.
- **Rate limits:** WHOOP returns 429 but doesn't publish a threshold. Sync carefully and back off.
- **Use only the official OAuth API.** The unofficial internal endpoints people reverse-engineered need your WHOOP password and can break at any time.

### WHOOP gotchas that shape the design
1. **WHOOP "days" are cycles, from waking to the next sleep, not midnight to midnight.** Rule: a cycle counts toward the calendar day (Eric's local time zone) its `start` falls on. The current cycle has no `end` yet and its numbers keep growing.
2. **Calories:** kcal = kilojoule ÷ 4.184. Assumption to verify in M1: the cycle kilojoule is *total* daily burn (resting + activity). Check one week against the calories figure in the WHOOP app before trusting the energy balance.
3. **Score states:** records can be `PENDING_SCORE` or `UNSCORABLE`. Show "waiting on WHOOP" instead of zero.

## 3. Food logging (manual, made fast)
Typing everything by hand gets abandoned within a week unless it's quick. v0 includes:
- **Quick add:** calories plus P/F/C in grams, with an optional name.
- **My foods:** save any food once (per serving: kcal, P, F, C) and re-add it in 2 taps.
- **Meals:** save combos ("usual breakfast") and add them with one tap.
- **Recents and favourites** at the top of the add screen.
- **Servings:** multiply by quantity (e.g. 1.5 servings, 200 g).
- **Check:** warn when kcal ≠ 4P + 4C + 9F by more than about 15% (likely a typo).
- **Optional food lookup:** search the USDA FoodData Central API (free, needs a key) or scan barcodes with Open Food Facts (free). Results become editable "my foods". Off by default; see the open questions.
- **Stretch:** a text box ("2 eggs, toast with butter, black coffee") that an LLM turns into editable entries. Runs through Hermes's existing login at no cost; every entry needs Eric's approval before saving.

## 4. Screens (v0)
1. **Today:**
   - Rings or bars for kcal, protein, fat and carbs vs targets.
   - WHOOP card: calories burned so far, strain, recovery %, sleep %.
   - Balance line: eaten − burned.
   - Food log grouped by meal.
2. **Add food:** search my foods and recents, quick add, meals.
3. **History:**
   - 7- and 30-day charts: intake vs burn, protein hit rate, weight trend.
   - Strain vs recovery overlay.
4. **Targets and settings:**
   - Goal (cut / maintain / bulk) and calorie and macro targets. Protein can be set in g/kg.
   - WHOOP connect / disconnect, time zone, units.
5. **Weight:** manual weigh-ins plus WHOOP's body weight, with a 7-day moving average.

## 5. Out of scope for v0
Multiple users and accounts, social features, native iOS app, Apple Health / Google Fit, micronutrients, a workout program builder, AI coaching.

## 6. Architecture (boring on purpose)
- **App:** Next.js (React + TypeScript) as a **PWA**, so it installs on the phone home screen; logging happens on the phone.
- **Database:** Supabase Postgres with Google login and a one-email allowlist (Eric has used this setup before).
  - Tables: `foods`, `meals`, `meal_items`, `food_log`, `targets`, `weigh_ins`, `whoop_tokens` (encrypted, server-only), `whoop_cycles`, `whoop_workouts`, `whoop_recovery`, `whoop_sleep`, `sync_runs`.
- **WHOOP sync:**
  - A server route handles the OAuth callback and stores and refreshes tokens.
  - **Sync job:** on app open, plus a Vercel Cron every ~30 minutes. Pulls the last 3 days of cycles, workouts, recovery and sleep, and **upserts by WHOOP ID**, so re-running is safe.
  - **Webhook endpoint** for workout, sleep and recovery: verify the signature, fetch the record, upsert.
- **Day view:** a single SQL view joins the food totals with the WHOOP cycle assigned to each calendar day.
- **Deploy:** Vercel, with a preview for each branch.

## 7. Milestones (each with a smoke test)
- **M0 WHOOP connect + raw sync:** OAuth flow, token refresh, and a pull of 14 days into Postgres. *Smoke:* row counts per table; the same sync run twice changes nothing; kcal from one cycle checked against the WHOOP app.
- **M1 Food logging:** quick add, my foods, meals, recents. *Smoke:* scripted browser test logs 3 foods and 1 meal, and the day totals match hand-computed sums.
- **M2 Today screen:** rings, WHOOP card, balance, cycle-to-day mapping. *Smoke:* a fixture day with a known cycle and a known log renders the expected numbers; the current open cycle shows as "so far".
- **M3 History + weight:** charts and moving average. *Smoke:* a fixture of 30 days gives the expected averages.
- **M4 Webhooks + PWA polish:** webhook endpoint, home-screen install, offline-tolerant logging queue. *Smoke:* logging a past activity in the WHOOP app makes a `workout.updated` arrive and the new row appear.
- **Go/no-go after 2 weeks of real use:** did Eric log at least 80% of days? If not, fix logging friction before adding anything else.

## 8. Resume angle (honest)
- The WHOOP integration is a small version of exactly the forward-deployed engineer work from the `box-office-lab` spec: third-party OAuth, token refresh, webhooks, safe-to-repeat upsert sync, and reconciling records whose "day" isn't a calendar day.
- Example bullet once it's real: "Built a nutrition + recovery tracker syncing WHOOP via OAuth and webhooks with retry-safe upserts; logged N days of real use."
- **Note:** the AI Workflow Harness resume entry already mentions a shipped "fitness/nutrition tracking" app. Keep the two clearly separate, or decide this replaces it.

## 9. Open questions (answer before M0)
1. **Food data:** pure manual entry, or also USDA search / barcode scan? Recommended: manual + my foods in v0, barcode in v1.
2. **Goal and targets:** cut, maintain or bulk? Do you have calorie and macro targets already, or should the app suggest some from WHOOP burn + weight?
3. **Phone:** is a PWA on the home screen OK, or do you want a native iOS app? A native app costs much more time and needs an Apple developer account.
4. **Weight:** track weigh-ins (manual or a smart scale)?
5. **AI text logging:** want the "type what you ate" stretch goal in v1?
6. **Repo:** private `erictweng/fitness-tracker` now? Is this the same app as the harness's "fitness/nutrition tracking" app, and if so, where is that code?

## 10. Eric's setup actions (only after the spec is approved)
1. Create an app in the WHOOP Developer Dashboard (https://developer-dashboard.whoop.com/), set the redirect URL we give you, and enter the client ID and secret through the secure prompt (never in chat).
2. Sign in once through the app's "Connect WHOOP" button.

## Sources (read 2026-11-03)
- https://developer.whoop.com/api (OAuth URLs, scopes, schemas)
- https://developer.whoop.com/docs/developing/webhooks (webhook events and payloads)
- https://developer.whoop.com/docs/developing/v1-v2-migration (v2 is the only supported version)
