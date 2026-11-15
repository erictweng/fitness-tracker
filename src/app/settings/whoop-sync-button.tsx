"use client";

import { useState, useTransition } from "react";
import { syncWhoopNow } from "../whoop/actions";

const COPY: Record<string, string> = {
  synced: "Synced.",
  skipped: "A sync is already running.",
  reconnect: "WHOOP access stopped working. Reconnect.",
  failed: "WHOOP didn't answer. Try again soon.",
  not_connected: "Not connected.",
};

export function WhoopSyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        className="btn btn-ghost w-full"
        disabled={pending}
        data-testid="whoop-sync"
        onClick={() => start(async () => setMsg(COPY[await syncWhoopNow()] ?? null))}
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {msg && <span role="status" className="text-xs text-muted" data-testid="whoop-sync-msg">{msg}</span>}
    </div>
  );
}
