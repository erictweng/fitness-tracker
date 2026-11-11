# Fitness Tracker: interview draft (SPEC.draft.md)

Supersedes nothing yet; `docs/SPEC.md` v0 is the starting point. This file tracks the interview.

## Ledger
✅ Locked
- Food entry: typed by hand in v0; barcode scanning later (v1). (Eric, 2026-11-03)
- Goals: support cut, maintain and bulk; **currently cutting**. (Eric)
- Platform goal: **Mac app** eventually; a **dashboard** is fine for now; iPhone app later. (Eric)
- New app, built from scratch. NOT the harness's earlier "fitness/nutrition tracking" app. (Eric)
- Activity source: WHOOP official v2 API. (Eric, round 0)

❓ Open
- Where food gets logged in the moment (phone vs Mac); hosting of the dashboard; target maths for the cut; 30-day success definition. (Round 1)
- Next areas: food data model and portions, the daily screen, weight, WHOOP edge cases, privacy and backups, milestones.

⚠️ Risks
- "Mac app" plus "logging by hand" conflict: most meals are eaten away from the Mac. If logging can only happen at the desk, it gets skipped. Round 1 Q1.
- WHOOP webhooks need a public HTTPS URL. A Mac-only/local setup means polling instead, which is fine for one user.

## Round 1: platform and the cut (posted 2026-11-03)
Q1 Where do you log food when you eat?
Q2 What "dashboard for now" means / where it runs
Q3 Where calorie and macro targets come from
Q4 Does the daily calorie target move with WHOOP burn?
Q5 What success looks like after 30 days
Answers: _pending_
