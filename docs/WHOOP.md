# WHOOP (M5)

Each person connects **their own** WHOOP in Settings. Read-only: we ask for `read:cycles`
(daily calories burned) and `read:workout`, plus `offline` so the connection keeps working
without signing in again. Nothing is ever written to WHOOP.

## What you see
- **Today:** a WHOOP card with calories burned (WHOOP's day total, "so far" while the day is
  still going) and **eaten − burned**. Context only: the calorie target never changes from it.
- **Workouts:** WHOOP workouts appear in the Workouts card marked "via WHOOP" with their strain.
  When WHOOP is connected, the day's burn is WHOOP's day total, which already includes every
  workout, so a run logged by hand or through Claude is never counted twice. Deleting a WHOOP
  workout keeps it deleted on later syncs.
- **Weekly suggestion:** once there are 7+ finished days in the last 14, suggestions use
  WHOOP's average daily burn instead of the formula estimate (still never below resting burn
  on a cut). Suggestions are never applied automatically.
- **Settings → WHOOP:** Connect, Sync now, Disconnect.

## How it works
- `/whoop/connect` → WHOOP's sign-in (state cookie against CSRF) → `/whoop/callback` exchanges
  the code, stores the tokens and imports the last 30 days.
- Today pulls fresh numbers when it opens if the last sync is more than 10 minutes old
  (last 3 days each time). WHOOP has no webhook for daily totals, so this is pull-based.
- WHOOP "days" are cycles (wake to next sleep). A cycle counts toward the app day its start
  falls on (your time zone and day-end hour). kcal = kilojoules ÷ 4.184.
- **Tokens** are encrypted (AES-256-GCM) by the server before they reach the database. The key
  is derived from `WHOOP_CLIENT_SECRET`, which only the server has, so a database dump or backup
  alone can't open anyone's WHOOP. Nobody can read the token table directly, not even its owner;
  only database functions can, and those refuse Claude's connection.
- Refresh tokens rotate: only one sync per person runs at a time, and the new token is saved
  even if the rest of the sync fails.
- Disconnect revokes access at WHOOP and deletes our copy of the tokens. Imported history stays
  until you delete your account (export includes it as `whoop_days.csv`).

## Setup (done once)
1. WHOOP Developer Dashboard app: redirect URL
   `https://fitness-tracker-vert-three.vercel.app/whoop/callback`, scopes `read:cycles` +
   `read:workout`, privacy policy `https://fitness-tracker-vert-three.vercel.app/privacy`.
2. Vercel env vars (Sensitive, Production + Preview): `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`.
3. Run `supabase/migrations/0007_m5_whoop.sql` in the Supabase SQL Editor.

Connecting only works on the address registered as the redirect URL (the production domain),
not on preview deployments. When the site moves to its own domain, add that callback URL in
the WHOOP dashboard too.

Rotating `WHOOP_CLIENT_SECRET` makes stored tokens unreadable; everyone just reconnects.

## To check after the first real week
The day's kilojoules are assumed to be the **total** daily burn (resting + activity). Compare a
few days with the Calories number in the WHOOP app before trusting the weekly suggestion.

## Tests
- `src/lib/domain/whoop.test.ts` (day rules, unknown ≠ 0, 14-day average), `src/lib/whoop/crypto.test.ts`.
- `supabase/tests/migration_checks.sql`: token table unreadable, plaintext refused, sync lock,
  no duplicate imports, deleted stays deleted, Claude blocked, other users see nothing.
- `e2e/m5.spec.ts` against a fake WHOOP (`e2e/fake-whoop.mjs`): connect, paging, encrypted
  storage, Today numbers, re-sync, token refresh + rotation, revoked access, bad state, denied
  sign-in, disconnect, privacy.
