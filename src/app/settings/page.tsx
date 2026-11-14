import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { targetFor, todayFor } from "@/lib/profile";
import { suggestionFor } from "@/lib/suggest";
import { SettingsForm, TargetsForm } from "./settings-forms";
import { DeleteAccountForm } from "../account/danger-forms";
import { ConnectedApps } from "./connected-apps";

export default async function SettingsPage() {
  await connection();
  const { supabase, profile } = await requireUser();
  if (!profile.onboarded_at) redirect("/onboarding");
  const today = todayFor(profile);
  const [target, sugg] = await Promise.all([targetFor(supabase, today), suggestionFor(supabase, profile, today)]);
  const suggestion = sugg?.suggestion ?? null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link className="btn btn-ghost" href="/">Done</Link>
      </header>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Targets</h2>
        <TargetsForm current={target} suggestion={suggestion} />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Goal & preferences</h2>
        <SettingsForm profile={profile} />
      </section>

      <ConnectedApps supabase={supabase} />

      <section className="card flex flex-col gap-3" data-testid="your-data">
        <h2 className="font-semibold">Your data</h2>
        <a className="btn btn-ghost w-full" href="/export" download data-testid="export-link">Export all (zip of CSVs)</a>
        <DeleteAccountForm />
        <details className="text-sm text-muted" data-testid="privacy-note">
          <summary className="cursor-pointer">Privacy: what&apos;s stored and who can see it</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>Stored: your email, settings, body stats, food log, saved foods and meals, weigh-ins and targets.</li>
            <li>Only you can read your log. Other users can&apos;t, and the admin page shows emails and dates only.</li>
            <li>Eric and Derek run this app. The servers it runs on could technically see data passing through; we don&apos;t look at your logs.</li>
            <li>No ads, analytics or trackers.</li>
            <li>An encrypted backup is made daily and each copy is deleted after 30 days. Deleting your account removes your data now; it leaves the backups as they age out.</li>
          </ul>
        </details>
      </section>

      <section className="card flex flex-col gap-3">
        <p className="text-sm text-muted">Signed in as {profile.email}</p>
        {profile.is_admin && <Link className="btn btn-ghost" href="/admin" data-testid="admin-link">Admin</Link>}
        <form action="/auth/signout" method="post">
          <button className="btn btn-ghost w-full" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
