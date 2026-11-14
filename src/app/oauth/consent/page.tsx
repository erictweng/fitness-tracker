import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decide } from "./actions";
import { isAllowedRedirect } from "@/lib/oauth-redirects";

const CAN = [
  "Log food you tell it about (it estimates the numbers)",
  "Log your weight and workouts",
  "Read your day: totals, targets, entries",
  "Correct an entry",
];
const CANT = ["Delete anything", "Change your targets or settings", "See anyone else's data"];

function host(uri: string) {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  await connection();
  const sp = await searchParams;
  const id = Array.isArray(sp.authorization_id) ? sp.authorization_id[0] : sp.authorization_id;
  const shell = (body: React.ReactNode) => (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 p-6">{body}</main>
  );
  if (!id) return shell(<p className="card text-warn">This link is missing its request. Start again from Claude.</p>);

  const supabase = await createClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;
    return shell(
      <>
        <h1 className="text-2xl font-bold">Connect to Fitness Tracker</h1>
        <p className="text-muted">Sign in first, then you&apos;ll choose whether to allow access.</p>
        <a className="btn" href={`/auth/google?next=${encodeURIComponent(next)}`} data-testid="consent-sign-in">Sign in with Google</a>
      </>,
    );
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (sp.blocked === "1" && (error || !data || !("authorization_id" in data))) {
    // A blocked request is denied server-side, so it no longer has details to show.
    return shell(
      <>
        <h1 className="text-2xl font-bold" data-testid="consent-blocked">This app isn&apos;t allowed</h1>
        <p className="card text-sm">Only Claude can connect to Fitness Tracker. Nothing was shared.</p>
        <Link className="btn btn-ghost" href="/">Back to Fitness Tracker</Link>
      </>,
    );
  }
  if (error || !data) {
    return shell(
      <p className="card text-warn" data-testid="consent-error">
        This request has expired or was already used. Go back to Claude and connect again.
      </p>,
    );
  }
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  // Only Claude (or a tool on your own computer) may connect. Never offer Allow to anything else,
  // and never send the browser to an unknown address (not even to report the refusal).
  if (sp.blocked === "1" || !isAllowedRedirect(data.redirect_uri)) {
    return shell(
      <>
        <h1 className="text-2xl font-bold" data-testid="consent-blocked">This app isn&apos;t allowed</h1>
        <p className="card text-sm">
          &ldquo;{data.client.name || "An app"}&rdquo; wants to send you to <span className="font-semibold">{host(data.redirect_uri)}</span>,
          which isn&apos;t Claude. Only Claude can connect to Fitness Tracker. If you didn&apos;t start this from Claude,
          someone may be trying to get access to your log: close this page.
        </p>
        <Link className="btn btn-ghost" href="/">Back to Fitness Tracker</Link>
      </>,
    );
  }

  return shell(
    <>
      <h1 className="text-2xl font-bold" data-testid="consent-title">Allow {data.client.name || "this app"}?</h1>
      <p className="text-sm text-muted">
        It will act as <span className="text-text">{auth.user.email}</span> and send you back to {host(data.redirect_uri)}.
      </p>
      {sp.failed === "1" && <p role="alert" className="card text-warn">That didn&apos;t go through. Try again.</p>}
      <section className="card flex flex-col gap-2 text-sm">
        <p className="font-semibold">It can</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">{CAN.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="mt-2 font-semibold">It can&apos;t</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">{CANT.map((c) => <li key={c}>{c}</li>)}</ul>
        <p className="mt-2 text-muted">Everything it logs is marked &ldquo;via Claude&rdquo;. Disconnect any time in Settings.</p>
      </section>
      <form action={decide} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button className="btn btn-ghost" name="decision" value="deny">Deny</button>
        <button className="btn" name="decision" value="approve">Allow</button>
      </form>
    </>,
  );
}
