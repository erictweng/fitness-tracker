import Link from "next/link";
import { connection } from "next/server";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { AUTH_ERROR_COPY, isAuthErrorCode } from "@/lib/auth-errors";

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const sp = await searchParams;
  const rawError = Array.isArray(sp.auth_error) ? sp.auth_error[0] : sp.auth_error;
  const authError = isAuthErrorCode(rawError) ? AUTH_ERROR_COPY[rawError] : null;
  const configured = getSupabaseConfig() !== null;
  const me = configured ? await getMe() : null;

  if (!me) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
        <h1 className="text-3xl font-bold">Fitness Tracker</h1>
        <p className="text-muted">Log food fast. Hit your calorie and protein targets.</p>
        {authError && (
          <p role="alert" className="card text-warn" data-testid="auth-error">
            {authError}
          </p>
        )}
        {configured ? (
          <a className="btn" href="/auth/google" data-testid="google-sign-in">
            Sign in with Google
          </a>
        ) : (
          <p className="card text-muted" data-testid="not-configured">
            Sign-in isn&apos;t set up on this deployment yet. See docs/SETUP.md.
          </p>
        )}
        <p className="text-sm text-muted">Invite-only. Your log is private to you.</p>
      </main>
    );
  }

  const supabase = await createClient();
  await supabase?.rpc("touch_last_active");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Today</h1>
        <form action="/auth/signout" method="post">
          <button className="btn btn-ghost" type="submit">Sign out</button>
        </form>
      </header>
      <section className="card">
        <p className="text-muted">Signed in as</p>
        <p className="text-lg font-semibold" data-testid="me-email">{me.email}</p>
      </section>
      <section className="card text-muted">
        Logging arrives in M1. This build proves sign-in, invites and privacy.
      </section>
      {me.isAdmin && (
        <Link className="btn btn-ghost" href="/admin" data-testid="admin-link">
          Admin
        </Link>
      )}
    </main>
  );
}
