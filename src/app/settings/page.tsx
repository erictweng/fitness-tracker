import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { targetFor, todayFor } from "@/lib/profile";
import { suggestionFor } from "@/lib/suggest";
import { SettingsForm, TargetsForm } from "./settings-forms";

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
