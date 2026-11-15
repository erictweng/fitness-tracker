import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "../domain/day";
import { cyclesToDays, workoutToImport } from "../domain/whoop";
import type { Profile } from "../profile";
import { todayFor } from "../profile";
import { listCycles, listWorkouts, refreshTokens, WhoopError, whoopConfig, type WhoopConfig } from "./client";
import { openToken, sealToken } from "./crypto";

export const FIRST_SYNC_DAYS = 30;
export const RESYNC_DAYS = 3;
/** Today screen syncs on open when the last sync is older than this. */
export const AUTO_SYNC_SECONDS = 600;

export type SyncResult = "synced" | "skipped" | "not_connected" | "reconnect" | "failed";

export type WhoopStatus = { connected: boolean; connectedAt: string | null; lastSyncAt: string | null; lastError: string | null };

export async function whoopStatus(supabase: SupabaseClient): Promise<WhoopStatus> {
  const { data } = await supabase.rpc("whoop_status");
  const row = Array.isArray(data) ? data[0] : null;
  return row
    ? { connected: true, connectedAt: row.connected_at, lastSyncAt: row.last_sync_at, lastError: row.last_error }
    : { connected: false, connectedAt: null, lastSyncAt: null, lastError: null };
}

/** Fresh access token: refresh if it expires within 2 minutes (WHOOP rotates the refresh token). */
async function usableToken(cfg: WhoopConfig, row: { access_token: string; refresh_token: string | null; expires_at: string }) {
  const access = openToken(row.access_token, cfg.clientSecret);
  if (Date.parse(row.expires_at) - Date.now() > 120_000) return { access, rotated: null };
  if (!row.refresh_token) throw new WhoopError("auth", "expired, no refresh token");
  const t = await refreshTokens(cfg, openToken(row.refresh_token, cfg.clientSecret));
  return { access: t.access_token, rotated: t };
}

/**
 * Pull recent cycles (day burn) and workouts from WHOOP and store them. One sync per user
 * at a time (DB lock). minAgeSeconds = 0 forces a sync (button); otherwise skips when fresh.
 */
export async function syncWhoop(supabase: SupabaseClient, profile: Profile, minAgeSeconds = AUTO_SYNC_SECONDS): Promise<SyncResult> {
  const cfg = whoopConfig();
  if (!cfg) return "not_connected";
  const { data, error } = await supabase.rpc("whoop_begin_sync", { p_min_age_seconds: minAgeSeconds });
  if (error) {
    console.error("whoop_begin_sync failed", error.code);
    return "failed";
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return (await whoopStatus(supabase)).connected ? "skipped" : "not_connected";

  const days = row.last_sync_at ? RESYNC_DAYS : FIRST_SYNC_DAYS;
  const today = todayFor(profile);
  const fromDate = addDays(today, -days);
  const start = new Date(Date.now() - (days + 2) * 86_400_000).toISOString();
  let rotated: Awaited<ReturnType<typeof usableToken>>["rotated"] = null;
  try {
    const tok = await usableToken(cfg, row);
    rotated = tok.rotated;
    const [cycles, workouts] = await Promise.all([listCycles(cfg, tok.access, start), listWorkouts(cfg, tok.access, start)]);
    const dayRows = cyclesToDays(cycles, profile, fromDate);
    const workoutRows = workouts.map((w) => workoutToImport(w, profile)).filter((w) => w.log_date >= fromDate);
    const fin = await supabase.rpc("whoop_finish_sync", {
      ...sealed(cfg, rotated),
      p_days: dayRows,
      p_workouts: workoutRows,
      p_error: null,
    });
    if (fin.error) throw new Error(`finish ${fin.error.code}`);
    return "synced";
  } catch (e) {
    const code = e instanceof WhoopError ? e.code : "failed";
    console.error("whoop sync failed", code, e instanceof Error ? e.message : "");
    await supabase.rpc("whoop_finish_sync", { ...sealed(cfg, rotated), p_days: [], p_workouts: [], p_error: code });
    return code === "auth" ? "reconnect" : "failed";
  }
}

function sealed(cfg: WhoopConfig, t: { access_token: string; refresh_token: string | null; expires_at: Date } | null) {
  return {
    p_access: t ? sealToken(t.access_token, cfg.clientSecret) : null,
    p_refresh: t?.refresh_token ? sealToken(t.refresh_token, cfg.clientSecret) : null,
    p_expires_at: t ? t.expires_at.toISOString() : null,
  };
}
