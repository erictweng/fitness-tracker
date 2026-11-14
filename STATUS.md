# Fitness Tracker — STATUS

Updated 2026-11-13. **M4 built** (launch Fri 2026-11-20). Live at https://fitness-tracker-vert-three.vercel.app

- M0–M3: done (sign-in, logging, saved foods & meals, weigh-ins + weekly targets).
- M4: history charts, offline logging, export, delete account, admin remove, notes, unknown fat/carbs, daily encrypted backup job.
- Hosted DB needs migrations 0003, 0004, 0005 (in order). Backups need Eric's one-time setup (docs/BACKUP.md).
- Verified: 90 unit tests, migration checks on Postgres 17, backup → restore round trip, Playwright e2e 13/13 (+ screenshots) on local Supabase, CI.
- Next: M4.5 Claude connector + workouts (incl. `edit_entry`). v2 with Derek after launch (SPEC.md).
