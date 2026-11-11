# Fitness Tracker — STATUS

Updated 2026-11-11. **M0 code done; live check waiting on Eric's provider setup** (docs/SETUP.md).

- Spec v2 (multi-user) approved; MVP target Fri 2026-11-20.
- M0 verified locally: lint, typecheck, 16 unit tests, production build, migration applied twice + RLS/invite assertions on Postgres 17, route smoke (fail-closed without config; Google start redirects to Supabase with PKCE when configured).
- [~] M0 live acceptance (real Google sign-in, uninvited account blocked) — pending Supabase/Google/Vercel setup.
