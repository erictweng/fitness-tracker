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
## M2 Saved foods & meals
- [x] agent — Migration 0003: same-owner triggers (meal items / entries can't point at another user's food), indexes
- [x] agent — Add sheet: search, recents, meals, saved foods; servings or grams with live preview; 3-tap re-log
- [x] agent — Quick add "Save as food"; Foods & meals page: create/edit/archive/restore foods, build/edit/delete meals
- [x] agent — Entries snapshot nutrition; archived foods hidden from pickers but meals still log them
- [x] agent — e2e (3-tap re-log, grams, double-tap, history unchanged after edit, meals, archive, isolation) + phone screenshots
- [ ] Eric — run `supabase/migrations/0003_m2_foods.sql` in the hosted Supabase SQL Editor
## M3 Weight + targets
- [x] agent — Migration 0004: `save_weigh_in` (one per day, returns previous value for Undo), `suggestion_dismissed_week`
- [x] agent — Weight screen: log any past day, replace with Undo, delete with Undo, 7-day average (≥3 weigh-ins), trend chart, recent list
- [x] agent — Today weight line; weekly suggestion card (from Monday, once a week, Accept/Dismiss); targets use 7-day average weight
- [x] agent — Unit tests (average window, fallback, Monday maths, suggestion rules) + e2e (lb & kg users, accept, dismiss, BMR floor)
- [ ] Eric — run `supabase/migrations/0004_m3_weight.sql` in the hosted Supabase SQL Editor
## M4 History, offline, export, delete, backup
- [x] agent — Migration 0005: entry notes (≤ 280), `delete_my_account`, `admin_remove_user` (revokes invite; can't remove self; last admin can't self-delete)
- [x] agent — History screen: 7/30-day toggle, calories + protein vs target bars, weight + 7-day average; averages skip missed days and today
- [x] agent — Offline logging: new entries queue on the phone, sync on reconnect, no duplicates; edits/deletes refused offline with a message
- [x] agent — Export all (zip of CSVs, only your rows), Delete account (type `delete`), admin Remove user (type their email), privacy note
- [x] agent — Unknown fat/carbs ≠ 0 on Today; notes field on entries; PWA manifest + icon
- [x] agent — Daily encrypted backup workflow + restore check; CI round trip (backup → wrong key fails → restore → counts match)
- [ ] Eric — run `supabase/migrations/0005_m4_account.sql` in the hosted Supabase SQL Editor (after 0003, 0004)
- [ ] Eric — backup setup: age key, Cloudflare R2 bucket + token, GitHub `backup` environment secrets (docs/BACKUP.md), then run the workflow once
- [ ] Eric — protect `main` (require a PR review) now that a collaborator has write access
- [ ] Eric + agent — restore drill from the first real backup (scripts/restore-check.sh)

## M4.5 Claude connector + workouts (branch `m4.5-claude-workouts`)
- [x] agent — Migration 0006: `workouts` table; Claude-token provenance (`source = 'claude'` + client id, unforgeable both ways); Claude tokens can't delete, change settings/targets/saved foods, delete the account or act as admin
- [x] agent — `/api/mcp` remote MCP server (stateless Streamable HTTP) + protected-resource metadata; tools `get_day`, `log_food`, `edit_entry`, `log_weight`, `log_workout`, `list_recent_foods`
- [x] agent — Consent page `/oauth/consent` (sign-in returns to it), Settings → Claude (URL to paste, connected apps, Disconnect)
- [x] agent — Workouts card on Today (add / edit / delete + Undo); burned calories shown for context only; workouts in export + backups
- [x] agent — Tests: DB checks for Claude-token limits; e2e of the full OAuth flow, tools, isolation, retries, Disconnect, app workouts
- [ ] Eric — run `supabase/migrations/0006_m45_claude_workouts.sql` in the hosted SQL Editor
- [ ] Eric — Supabase → Authentication → OAuth Server: enable, path `/oauth/consent`, allow dynamic client registration (docs/CLAUDE-CONNECTOR.md)
- [ ] Eric — merge the M4.5 PR, then connect Claude and log a real meal

## Audit fixes (2026-11-14, branch `audit-fixes`)
- [x] agent — Export pages through Supabase's 1,000-row limit (was silently cut off at 1,000 rows per table)
- [x] agent — Security headers: no embedding by other sites (frame-ancestors 'none' + X-Frame-Options), nosniff, referrer and permissions policies
- [x] agent — Offline queue: a refused item no longer blocks the ones behind it; shown as failed after 10 tries; Retry button
- [x] agent — Offline queue cleared on sign-out (with a warning if anything is unsent) and after account deletion
- [ ] Eric — backups: save the private key, R2 + secrets (docs/BACKUP.md); invite check on live; Derek accepts the invite
- [ ] later — offline app shell (open from the home screen with no signal)

## M5 WHOOP (2026-11-14, branch `m5-whoop`)
- [x] agent — Public privacy policy page `/privacy` (needed by WHOOP)
- [x] agent — Migration 0007: `whoop_connections` (encrypted tokens, no direct access, Claude refused), `whoop_days`, one-import-per-WHOOP-workout index, sync lock + import functions
- [x] agent — OAuth connect/callback (state cookie), token encryption, refresh with rotation, paged cycle/workout fetch, sync on Today open + Sync now, Disconnect (revokes at WHOOP)
- [x] agent — Today WHOOP card (burned, eaten − burned), WHOOP workouts "via WHOOP", no double counting, 14-day burn in weekly suggestions, export `whoop_days.csv`
- [x] agent — Tests: unit (day rules, average burn, crypto), DB checks, e2e vs fake WHOOP; mutation-checked
- [ ] Eric — run `supabase/migrations/0007_m5_whoop.sql` in the hosted SQL Editor, merge the PR, connect WHOOP in Settings
- [ ] Eric + agent — after a week: compare the app's burned numbers with the WHOOP app's Calories

