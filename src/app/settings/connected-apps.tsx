import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/supabase/config";
import { disconnectApp } from "./connected-actions";

/** Settings → Claude: how to connect, and which apps are connected (with Disconnect). */
export async function ConnectedApps({ supabase }: { supabase: SupabaseClient }) {
  const h = await headers();
  const mcpUrl = `${siteUrl({ headers: h })}/api/mcp`;
  const { data: grants, error } = await supabase.auth.oauth.listGrants();
  return (
    <section className="card flex flex-col gap-3" data-testid="connected-apps">
      <h2 className="font-semibold">Claude</h2>
      <p className="text-sm text-muted">
        Tell Claude what you ate and it logs it here. In Claude: Settings → Connectors → Add custom connector, paste this URL,
        then sign in and allow.
      </p>
      <code className="input flex items-center overflow-x-auto text-sm select-all" data-testid="mcp-url">{mcpUrl}</code>
      {error ? (
        <p className="text-sm text-muted">Connections aren&apos;t switched on for this app yet.</p>
      ) : (grants ?? []).length === 0 ? (
        <p className="text-sm text-muted" data-testid="no-connected-apps">Nothing connected yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(grants ?? []).map((g) => (
            <li key={g.client.id} className="flex items-center justify-between gap-2" data-testid="connected-app">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{g.client.name || "Connected app"}</span>
                <span className="text-xs text-muted">connected {new Date(g.granted_at).toLocaleDateString("en-US")}</span>
              </span>
              <form action={disconnectApp}>
                <input type="hidden" name="client_id" value={g.client.id} />
                <button className="btn btn-ghost text-danger" aria-label={`Disconnect ${g.client.name || "app"}`}>Disconnect</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
