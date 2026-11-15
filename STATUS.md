# Fitness Tracker — STATUS

Updated 2026-11-14. Launch Fri 2026-11-20. Live at https://fitness-tracker-vert-three.vercel.app

- M0–M4, M4.5 (Claude connector + workouts), consent lock-down, audit fixes, privacy page: done and live.
- **M5 WHOOP built** on branch `m5-whoop` (PR). Needs migration `0007_m5_whoop.sql` in the hosted DB; WHOOP app + Vercel env vars already set up (docs/WHOOP.md).
- Verified: 117 unit tests, migration/RLS checks (incl. WHOOP token lock-down), 31 Playwright e2e on local Supabase + a fake WHOOP, mutation-checked (refresh-token rotation, CSRF state).
- Still open before launch: backups (R2 + 5 GitHub secrets, key into password manager), practice restore.
- Next: launch Nov 20; first real-WHOOP week: compare burn with the WHOOP app; then v2 (order with Derek).
