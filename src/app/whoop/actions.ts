"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { revokeAccess, whoopConfig } from "@/lib/whoop/client";
import { openToken } from "@/lib/whoop/crypto";
import { syncWhoop, type SyncResult } from "@/lib/whoop/sync";

/** Today calls this when it opens; it only talks to WHOOP if the last sync is >10 min old. */
export async function autoSyncWhoop(): Promise<SyncResult> {
  const { supabase, profile } = await requireUser();
  const r = await syncWhoop(supabase, profile);
  if (r === "synced") revalidatePath("/");
  return r;
}

export async function syncWhoopNow(): Promise<SyncResult> {
  const { supabase, profile } = await requireUser();
  const r = await syncWhoop(supabase, profile, 0);
  revalidatePath("/");
  revalidatePath("/settings");
  return r;
}

/** Revoke at WHOOP (best effort) and delete our stored tokens. Imported history stays. */
export async function disconnectWhoop() {
  const { supabase } = await requireUser();
  const cfg = whoopConfig();
  const { data } = await supabase.rpc("whoop_tokens");
  const row = Array.isArray(data) ? data[0] : null;
  if (cfg && row) {
    try {
      await revokeAccess(cfg, openToken(row.access_token, cfg.clientSecret));
    } catch {
      // Token may already be expired/revoked; deleting our copy is what matters.
    }
  }
  const { error } = await supabase.rpc("whoop_disconnect");
  if (error) console.error("whoop disconnect failed", error.code);
  revalidatePath("/settings");
  revalidatePath("/");
}
