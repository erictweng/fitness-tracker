# Fitness Tracker — TASKS

## M0 Skeleton + access
- [x] agent — Next.js 16 scaffold, dark design tokens in one stylesheet
- [x] agent — Supabase SSR auth: Google start route, callback, sign-out, session refresh proxy
- [x] agent — Migration: invites, profiles, all data tables, RLS, invite trigger, admin RPCs
- [x] agent — Migration checks (invite gate, isolation, admin can't read data) on Postgres 17
- [x] agent — Admin page: invite, revoke, pending invites, user list
- [x] agent — CI: lint/typecheck/test/build, migration checks, gitleaks; pre-commit hook
- [x] agent — Public GitHub repo + secret scanning push protection
- [ ] Eric — Supabase project + run migration + bootstrap admin (docs/SETUP.md §1)
- [ ] Eric — Google OAuth client → Supabase provider (§2)
- [ ] Eric — Vercel import + env vars (§3)
- [ ] Eric + agent — Live check: Eric signs in on phone; uninvited account blocked; invited friend gets in (§4)

## M1 Onboarding, settings, logging, Today
- [x] agent — Day rules (day-end hour, timezone, DST), meal auto-pick, Mifflin-St Jeor targets, BMR floor, entry validation (unit tests)
- [x] agent — Migration 0002: source columns (app/claude) + atomic `complete_onboarding` RPC
- [x] agent — Onboarding with live target preview; Settings (goal, deficit/surplus, protein rule, units, day end, required macros, body stats) + targets
- [x] agent — Today: totals vs target in effect, entries by meal, quick add, edit, delete via sheet or swipe with 5 s Undo, past-day picker, future blocked
- [x] agent — Local Supabase stack + Playwright e2e (two users, different settings, 1:30 AM rule, undo, isolation) + CI job
- [ ] Eric — run `supabase/migrations/0002_m1_onboarding.sql` in the hosted project once it exists
## M2 Saved foods & meals — not started
## M3 Weight + targets — not started
## M4 History, offline, export, delete, backup — not started
