# Fitness Tracker

Phone-first web app for a small invited group: log food in seconds, see calories and
protein against your own targets (cut / maintain / bulk). Every log is private.

- **Live:** https://fitness-tracker-vert-three.vercel.app (invite-only, Google sign-in)
- **Spec:** [SPEC.md](SPEC.md) · **Status:** [STATUS.md](STATUS.md) · **Tasks:** [TASKS.md](TASKS.md)
- **Setup:** [docs/SETUP.md](docs/SETUP.md) · **Backups:** [docs/BACKUP.md](docs/BACKUP.md) · **Claude:** [docs/CLAUDE-CONNECTOR.md](docs/CLAUDE-CONNECTOR.md)
- **Stack:** Next.js 16 (App Router) · Supabase (Postgres + Google auth + row-level security) · Vercel
- **Launch:** Fri 2026-11-20

## What it does
- **Today:** calories and protein left / eaten / target, fat and carbs (blank values show as
  "unknown", never 0), entries grouped by meal, edit and delete with Undo. Day ends at 3 AM by default.
- **Logging:** quick add, saved foods (by serving or grams), saved meals, optional notes (≤ 280 chars).
  Past entries keep their numbers even if the saved food changes later.
- **No signal:** new entries are kept on the phone under "Waiting to sync" and upload once when
  back online (client-generated ids, so retries never duplicate). Edits and deletes need a connection.
- **Weight:** one weigh-in per day, 7-day average, trend chart, weekly target suggestion you accept or dismiss.
- **History:** 7 / 30-day calories and protein vs target, weight with 7-day average.
  Averages skip days you didn't log and today.
- **Your data:** export everything as a zip of CSVs; delete your account (removes every row now).
- **Admin:** invite / revoke by email, see the user list, remove a user. No access to anyone's logs.
- **Workouts:** type, minutes, calories burned, notes; shown on Today for context, never added to the target.
- **Claude connector:** connect your own Claude and tell it what you ate; it logs, reads and corrects
  entries (marked "via Claude"), but can't delete or change settings. Disconnect in Settings.
- **Backups:** daily encrypted (age) dump to Cloudflare R2, newest 30 kept, restore checked in CI.

## Privacy model
- Invite-only sign-up, enforced by a database trigger on `auth.users`.
- Row-level security on every data table: a user reads and writes only their own rows.
- The admin manages invites and sees the user list, **not** anyone's food or weight.
  `supabase/tests/migration_checks.sql` proves this in CI on every push.
- Account deletion cascades through every table; backups age out within 30 days.
- The app only uses the public (publishable) Supabase key. Admin keys, the database URL and
  the backup private key never go in this repo.

## Repo layout
```
src/app/             screens + server actions (today, history, weight, foods, settings, admin, export, account)
src/lib/domain/      pure logic with unit tests (targets, day boundary, entries, foods, weight, history, csv)
src/lib/             data loading, session, offline queue, export
src/lib/mcp/         Claude connector: token check, MCP server, tools (served at /api/mcp)
supabase/migrations/ 0001 → 0006, idempotent; run in order
supabase/tests/      migration + RLS assertions
e2e/                 Playwright tests against local Supabase (+ opt-in phone screenshots)
scripts/             db-check, backup, restore-check, backup-roundtrip
.github/workflows/   ci.yml (every push), backup.yml (daily)
```

## Commands
```bash
npm run dev        # local dev server
npm run check      # lint + typecheck + unit tests + production build
npm run db:check   # apply migrations twice + RLS/invite assertions on local Postgres
npm run e2e        # Playwright against local Supabase (run `npx supabase start` first)
SCREENSHOTS_DIR=/abs/path npx playwright test e2e/screens.spec.ts   # phone screenshots
scripts/backup-roundtrip.sh   # backup → wrong key fails → restore → row counts match
```

## Deploying a database change
Migrations aren't applied to the hosted database automatically. After merging one, run the new
`supabase/migrations/000N_*.sql` in the Supabase SQL Editor, in order. Each is safe to run twice.

## Roadmap
- **M0–M4** — done: sign-in, logging, saved foods & meals, weight & weekly targets, history,
  offline, export, delete account, backups.
- **M4.5** (~Nov 21–24) — Claude connector (log, read and edit entries by chat; no settings
  changes or deletes) and a simple workout log.
- **M5** — WHOOP, only if the group logs on ≥ 12 of 14 days (Nov 20 → Dec 4).
- **v2 with Derek** — meal planning, complete days, fuller workouts, sleep, trackers, shared space.
  See [SPEC.md](SPEC.md).

## Contributing
Work on a branch and open a pull request into `main`; CI (lint, types, unit tests, migration/RLS
checks, backup round trip, secret scan, browser tests) must pass. Never commit keys or `.env`
files: gitleaks runs in a pre-commit hook and in CI.
