# Fitness Tracker: design doc (plain-language)

_Last updated: 2026-11-14._ This is the "what we built and why" in simple terms.
The full spec is in [SPEC.md](../SPEC.md); the day-to-day state is in [STATUS.md](../STATUS.md).

## What it is
A phone-first website for a small invite-only group of friends. You log what you
eat in a few taps and see calories and protein against your own daily target. Your log is private:
nobody else can see it, not even the admin.

- **Live:** https://fitness-tracker-vert-three.vercel.app
- **Launch:** Friday, Nov 20, 2026

## How it's put together
Think of it as three pieces:

1. **The website** (Next.js, hosted on Vercel). The screens and the logic that runs them.
2. **The database and sign-in** (Supabase). Stores everyone's logs and handles "Sign in with Google".
   The database itself enforces privacy: every query only ever returns *your* rows, so even a bug in
   the website can't show you someone else's data.
3. **GitHub.** Holds the code and runs automatic checks on every change.

Changes to the database are plain SQL files (`supabase/migrations/0001` … `0006`). Each new one is run
by hand in the Supabase SQL Editor; they're all safe to run twice.

## What's been built, step by step

### M0: the foundation
- Sign in with Google. **Invite-only:** if your email isn't on the invite list, you can't get in.
- The admin can invite and remove people, and sees only emails and dates, never anyone's food or weight.
- Automatic checks on every change: code quality, the database privacy rules, and a scan that blocks
  passwords or keys from ever being committed.

### M1: logging the basics
- A quick setup when you first sign in (height, weight, activity, goal). The app works out your
  daily calorie and protein targets from that.
- **Today** screen: calories and protein left / eaten / target, your entries grouped by meal.
- Quick add (just calories and protein if that's all you know), edit, delete with Undo.
- Your "day" ends at 3 AM by default, so a late-night snack counts toward the right day.

### M2: saved foods and meals
- Save foods you eat often and re-log them in about three taps, by serving or by grams.
- Save whole meals (e.g. "usual breakfast") and log them in one go.
- Changing a saved food never rewrites past days.

### M3: weight
- One weigh-in per day (a second one replaces it, with Undo).
- 7-day average weight and a trend chart.
- Once a week the app may suggest a new target based on how your weight is moving. It never changes
  anything on its own; you accept or dismiss it.

### M4: history, offline, your data, backups
- **History:** 7- or 30-day charts of calories and protein vs your target, and weight with its average.
  Averages skip days you didn't log, instead of counting them as zero.
- **No signal?** New entries are kept on your phone and sent when you're back online, never twice.
  (The app has to already be open; opening it fresh with no signal doesn't work yet.)
- **Export:** download everything you've logged as spreadsheet files (a zip).
- **Delete account:** removes your login and everything you logged, immediately.
- **Unknown isn't zero:** if you didn't enter fat or carbs, it shows "unknown", not 0.
- **Notes** on any entry (up to 280 characters).
- **Daily encrypted backup** of the database to Cloudflare R2, keeping the last 30 days. Only the
  private backup key can open a backup. _(Built and tested, but not switched on yet; see "Still to do".)_

### M4.5: Claude and workouts
- **Workouts:** type, minutes, calories burned, notes. Shown on Today for context; burned calories
  never raise your food target.
- **Claude connector:** add the app to your own Claude (Settings → Connectors) and just say
  "I had 2 eggs and toast". Claude estimates the numbers and logs it, marked **"via Claude"**.
  - Claude **can:** log food, weight and workouts, read your day, see your saved foods, fix an entry.
  - Claude **can't:** delete anything, change your targets or settings, delete your account, act as
    admin, or see anyone else's data. The database enforces this, not just the app.
  - **Disconnect** in Settings cuts Claude off on its very next request.
  - How to connect: [docs/CLAUDE-CONNECTOR.md](CLAUDE-CONNECTOR.md).

### Security hardening (after M4.5)
- **Only real Claude can connect.** Anyone can register an app *named* "Claude", so the sign-in
  approval page checks where the app would send you afterwards. Only Claude's own address (or your own
  computer, for Claude Code) gets an Allow button; anything else sees "This app isn't allowed".
- **Code changes go through review.** The main branch is protected: every change needs a pull request
  passing checks and a review before it goes live.
- **Backup secrets are locked down:** they can only be used by code that's already been approved.

### Audit fixes (pull request #5)
A full review of the project found four code problems, all now fixed and tested:
- **Export was cutting off at 1,000 rows** per table without saying so; it now includes everything.
- **Other websites could embed our pages** (a setup for tricking someone into a click); now blocked.
- **One stuck offline entry could hold up all the others;** now it's skipped, marked as failed after
  10 tries, and has Retry / Discard buttons.
- **Unsent offline entries stayed on the phone after signing out;** sign-out now warns, then clears them,
  and deleting your account clears them too.

### Privacy policy page
A public page at `/privacy` in plain words: what's stored, who can see it, connected apps, backups,
export and delete. Linked from the sign-in page and Settings. WHOOP requires one for its app.

### WHOOP (M5)
- **Connect your own WHOOP** in Settings. The app only asks to *read* daily calories burned and
  workouts; it never writes anything to WHOOP.
- **Today** shows what you've burned (WHOOP's day total, "so far" until the day ends) and
  **eaten − burned**. It's for context only: your calorie target never changes because of it.
- **WHOOP workouts show up by themselves**, marked "via WHOOP". Nothing is counted twice: the burn
  comes from WHOOP's day total, which already includes every workout, even ones you also typed in.
- **Weekly target suggestions get smarter:** after 7 full days, they use your real average burn
  from WHOOP instead of a formula guess (still never below your resting burn, never automatic).
- **Your WHOOP sign-in is locked up:** it's encrypted before it's stored, nobody can read it
  directly, and Claude can't touch it. Disconnect deletes it and tells WHOOP to cut access.
- Details: [WHOOP.md](WHOOP.md).

## Big decisions (and why)
| Decision | Why |
|---|---|
| Web app, not a native phone app | Works on every phone now; native can come later. |
| Supabase instead of running our own database | Gives us Google sign-in, per-user privacy in the database, and no server to babysit, free at our size. The data is standard Postgres, so we can move later. |
| Invite-only, Google sign-in | Small trusted group, no passwords to manage. |
| One fixed daily target | Simple and predictable; workouts don't raise it. |
| Entries copy the food's numbers | Editing a saved food never changes past days. |
| Claude instead of a chat box inside the app | Costs us nothing (people use their own Claude) and works from the phone. |
| Claude's limits enforced in the database | Claude's sign-in could be used outside our app, so the rules have to live where the data is. |
| Daily encrypted backups we control | Supabase's free plan has no downloadable backups. |
| Hosting: Vercel now; our own server (Terra) later as the main site, with Vercel as automatic fallback | Launch fast and free; the data stays in one Supabase project either way. |

## How we know it works
Every change runs, automatically:
- **117 small tests** of the logic (targets, day boundaries, unknown macros, offline queue rules, export
  format, safe redirects, WHOOP day rules and token encryption…).
- **Database privacy checks** on a real Postgres: one user can't see another's data, the admin can't read
  logs, Claude's limits hold, uninvited people are blocked, WHOOP sign-ins can't be read or reached
  by Claude.
- **31 browser tests** that click through the real app against a local copy of Supabase: onboarding,
  logging, saved foods, weight, history, offline sync, export, account deletion, the full Claude sign-in
  and every Claude tool, the "only real Claude" lock-down, the privacy page, and the whole WHOOP flow
  against a stand-in WHOOP (connect, sync, token refresh, disconnect).
- **A backup round trip:** make a backup, check a wrong key can't open it, restore it, compare row counts.
- **A secret scan** that blocks any committed password or key.

## Still to do before launch (Nov 20)
**Setup:**
1. Run `0007_m5_whoop.sql` in the Supabase SQL Editor, then connect your WHOOP in Settings.
2. Save the backup private key (`~/fitness-backup-key.txt` on the Mac mini) into a password manager,
   then delete the file.
3. Turn on backups: Cloudflare R2 bucket + access token, then add 5 secrets in GitHub
   ([docs/BACKUP.md](BACKUP.md)). Run the backup once, then do a practice restore.
4. Check that an uninvited Google account gets "invite-only" on the live site.
5. Connect your own Claude and log a real meal (the first test with the real Claude app).

**Decisions:** whether the domain's DNS is on Cloudflare; whether the Claude connector covers the
"in-app AI" idea; and the order for the v2 list below.

## After launch
- **Usage check (Nov 20 → Dec 4):** still worth watching: are people logging at least 12 of 14 days?
- **v2** (order to agree): meal planning, optional weight tracking, complete/partial days,
  fuller workouts (exercises, sets, reps), start/stop workout buttons, sleep, trackers (Oura next),
  and later characters and a shared space.
- **Hosting move:** our own server (Terra) becomes the main site, with Vercel as the automatic fallback.
- **Nice to have:** open the app from the home screen with no signal.

## Risks to keep in mind
- **No backups exist until step 3 above is done.** Until then, if the database is lost, the data is gone.
- **Free plans:** Vercel's free plan doesn't allow commercial use; Supabase pauses a project after a
  week with no use (daily logging prevents it); GitHub stops scheduled jobs (like backups) after 60
  days with no code changes.
- **Only one admin account.** If it loses access, nobody can invite people. Add a second admin.
