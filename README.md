# Fitness Tracker

Phone-first web app for a small invited group: log food in seconds, see calories and
protein against your own targets (cut / maintain / bulk). Every log is private.

- **Spec:** [SPEC.md](SPEC.md) · **Setup:** [docs/SETUP.md](docs/SETUP.md) · **Status:** [STATUS.md](STATUS.md)
- **Stack:** Next.js 16 (App Router) · Supabase (Postgres + Google auth + row-level security) · Vercel

## Privacy model
- Invite-only sign-up, enforced by a database trigger on `auth.users`.
- Row-level security on every data table: a user reads and writes only their own rows.
- The admin manages invites and sees the user list, **not** anyone's food or weight.
  `supabase/tests/migration_checks.sql` proves this in CI on every push.

## Commands
```bash
npm run dev        # local dev server
npm run check      # lint + typecheck + unit tests + production build
npm run db:check   # apply the migration twice + RLS/invite assertions on local Postgres
```
