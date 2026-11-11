# Fitness Tracker — PROJECT

- **Owner:** Eric Weng · **Repo:** https://github.com/erictweng/fitness-tracker (public)
- **Local:** `~/projects/fitness-tracker/`
- **Discord thread:** Project — Fitness Tracker (`1570194632719990966`)
- **Spec:** `SPEC.md` (v2, multi-user). Old single-user draft + WHOOP research: `docs/SPEC-v0-research.md`.
- **Stack:** Next.js 16 App Router (`src/proxy.ts` replaces middleware), `@supabase/ssr`, Supabase Postgres + Google OAuth, Vercel, Vitest, GitHub Actions.
- **Key files:** `supabase/migrations/0001_init.sql` (schema, RLS, invite trigger, admin RPCs) · `supabase/tests/migration_checks.sql` (acceptance assertions) · `src/lib/session.ts` (who is signed in) · `docs/SETUP.md` (Eric's provider steps).
- **Conventions:** commits as `Eric Weng <122854008+erictweng@users.noreply.github.com>` (repo-local config); `git config core.hooksPath .githooks` for the gitleaks pre-commit hook; no real user data in tests, fixtures or logs.
