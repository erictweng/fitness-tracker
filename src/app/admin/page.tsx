import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { revokeAction } from "./actions";

type UserRow = { email: string; is_admin: boolean; joined_at: string; last_active_at: string | null };
type InviteRow = { email: string; invited_at: string };

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

export default async function AdminPage() {
  await connection(); // always per-request: never prerender an admin decision
  const me = await getMe();
  if (!me?.isAdmin) notFound();
  const supabase = (await createClient())!;
  await supabase.rpc("touch_last_active");
  const [{ data: users }, { data: invites }] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.rpc("admin_list_pending_invites"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link className="btn btn-ghost" href="/">Back</Link>
      </header>
      <p className="text-sm text-muted">
        You can manage who gets in. You can&apos;t see anyone&apos;s food or weight.
      </p>
      <section className="card"><InviteForm /></section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Pending invites</h2>
        {(invites as InviteRow[] | null)?.length ? (
          <ul className="flex flex-col gap-2" data-testid="pending-invites">
            {(invites as InviteRow[]).map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-2">
                <span className="truncate">{i.email}</span>
                <form action={revokeAction}>
                  <input type="hidden" name="email" value={i.email} />
                  <button className="text-sm text-danger" type="submit">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No pending invites.</p>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Users</h2>
        <ul className="flex flex-col gap-2" data-testid="users">
          {((users as UserRow[] | null) ?? []).map((u) => (
            <li key={u.email} className="flex flex-col">
              <span className="truncate">
                {u.email} {u.is_admin && <span className="text-xs text-accent">admin</span>}
              </span>
              <span className="text-xs text-muted">
                joined {fmt(u.joined_at)} · last active {fmt(u.last_active_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
