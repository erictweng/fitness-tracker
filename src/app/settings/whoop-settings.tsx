import type { SupabaseClient } from "@supabase/supabase-js";
import { whoopConfig } from "@/lib/whoop/client";
import { whoopStatus } from "@/lib/whoop/sync";
import { disconnectWhoop } from "../whoop/actions";
import { WhoopSyncButton } from "./whoop-sync-button";

const RESULT: Record<string, string> = {
  connected: "WHOOP connected. Your last 30 days were imported.",
  denied: "WHOOP wasn't connected (access not allowed).",
  expired: "That WHOOP sign-in expired. Try Connect again.",
  failed: "Couldn't connect to WHOOP. Try again in a minute.",
  not_configured: "WHOOP isn't set up on this app yet.",
};

function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** Settings → WHOOP: connect, sync now, disconnect. Read-only access to cycles + workouts. */
export async function WhoopSettings({ supabase, result }: { supabase: SupabaseClient; result: string | null }) {
  const configured = whoopConfig() !== null;
  const s = await whoopStatus(supabase);
  const message = result ? RESULT[result] : null;
  return (
    <section id="whoop" className="card flex flex-col gap-3" data-testid="whoop-settings">
      <h2 className="font-semibold">WHOOP</h2>
      {message && (
        <p role="status" className={`text-sm ${result === "connected" ? "" : "text-warn"}`} data-testid="whoop-result">{message}</p>
      )}
      {s.connected ? (
        <>
          <p className="text-sm" data-testid="whoop-connected">
            Connected · last synced {ago(s.lastSyncAt)}
          </p>
          {s.lastError === "auth" && (
            <p className="text-sm text-warn" data-testid="whoop-reconnect">WHOOP access stopped working. Disconnect, then connect again.</p>
          )}
          {s.lastError && s.lastError !== "auth" && (
            <p className="text-sm text-muted">Last sync didn&apos;t finish; it retries automatically.</p>
          )}
          <p className="text-xs text-muted">
            Daily calories burned and workouts come in automatically. Your calorie target never goes up from this;
            weekly suggestions use your 14-day average burn once there are 7 full days.
          </p>
          <div className="flex gap-2">
            <WhoopSyncButton />
            <form action={disconnectWhoop} className="flex-1">
              <button className="btn btn-ghost w-full text-danger" data-testid="whoop-disconnect">Disconnect</button>
            </form>
          </div>
        </>
      ) : configured ? (
        <>
          <p className="text-sm text-muted">
            Bring in calories burned and workouts from your own WHOOP (read-only; nothing is ever written to WHOOP).
          </p>
          <a className="btn" href="/whoop/connect" data-testid="whoop-connect">Connect WHOOP</a>
        </>
      ) : (
        <p className="text-sm text-muted">WHOOP isn&apos;t set up on this app yet.</p>
      )}
    </section>
  );
}
