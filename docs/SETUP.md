# Setup (Eric's one-time steps)

Order matters. Never paste keys or secrets into chat; paste them straight into the
provider dashboards / Vercel. Values in `<angle brackets>` are placeholders.

## 1. Supabase project (free)
1. https://supabase.com → New project → name `fitness-tracker`, region **West US**; save the DB password in your password manager.
2. **SQL Editor** → run every file in `supabase/migrations/` in order (`0001_init.sql`, then `0002_m1_onboarding.sql`, …). Each is safe to re-run. When a new migration lands later, run just that file.
3. **SQL Editor** → paste `supabase/bootstrap_admin.sql.example`, replace `<your-google-email>` with your Google address → Run. (Makes you the first admin. Don't commit that edit.)
4. **Project Settings → Data API**: copy the Project URL. **Project Settings → API Keys**: copy the publishable key (`sb_publishable_…`).

## 2. Google sign-in
1. https://console.cloud.google.com → new project `fitness-tracker`.
2. **APIs & Services → OAuth consent screen** → External → app name, support email, developer email. Publish it (or, while in Testing, add each friend as a test user).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: your Vercel URL (e.g. `https://<app>.vercel.app`).
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Paste the Client ID + Client secret into **Supabase → Authentication → Sign In / Providers → Google** → Enable.
5. **Supabase → Authentication → URL Configuration**: Site URL = your Vercel production URL; add `http://localhost:3000/**` to redirect URLs for local dev.

## 3. Vercel
1. https://vercel.com/new → import `erictweng/fitness-tracker` (Next.js is auto-detected).
2. Environment variables (tick Production, Preview, Development):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL (no `/rest/v1`)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key (public by design; RLS protects the data)
   - `NEXT_PUBLIC_SITE_URL` = the stable production URL (not a per-deploy URL). Only a fallback: sign-in always returns to the address the browser used.
3. Deploy (redeploy after any env change). Open the site on your phone → **Sign in with Google** → you land on "Today" with an **Admin** button.

## 4. Check it works (M0 acceptance)
- Sign in with a second Google account that is **not** invited → "This app is invite-only".
- Admin → invite that account → sign in again → it gets in and sees no Admin button.
- The database proof (admin can't read another user's rows) runs in CI on every push: `scripts/db-check.sh`.

## Sign-in troubleshooting
- Google succeeds but you land back on the sign-in page or on another site: in **Supabase → Authentication → URL Configuration**, the Site URL and Redirect URLs must be your *actual* Vercel address (Settings → Domains), e.g. `https://<name>.vercel.app/**`. If `redirect_to` isn't allow-listed, Supabase silently sends you to the Site URL instead.
- `redirect_uri_mismatch` from Google: the redirect URI must be the Supabase `…/auth/v1/callback`.

## Local dev
```bash
cp .env.example .env.local            # fill in values
git config core.hooksPath .githooks   # secret scan before every commit (brew install gitleaks)
npm install && npm run dev
npm run check      # lint + typecheck + unit tests + build
npm run db:check   # needs local Postgres (brew services start postgresql@17)
```

## Browser tests (local Supabase)
Needs Docker (`brew install colima docker && colima start`). The Supabase CLI comes with `npm install`.
```bash
npx supabase start   # local stack on 127.0.0.1:54321, applies supabase/migrations
npm run e2e          # builds the app, signs in test users with a local-only password route, runs e2e/*.spec.ts
```
The password route (`/auth/test-login`) only works when `E2E_TEST_LOGIN=1` **and** Supabase is on localhost; it returns 404 everywhere else (unit-tested in `src/lib/test-login.test.ts`).
