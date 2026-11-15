import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/config";
import { exchangeCode, whoopConfig } from "@/lib/whoop/client";
import { sealToken } from "@/lib/whoop/crypto";
import { syncWhoop } from "@/lib/whoop/sync";
import { STATE_COOKIE, stateMatches } from "../state";

/** WHOOP sends the user back here after they allow (or deny) access. */
export async function GET(request: NextRequest) {
  const { supabase, profile } = await requireUser();
  const origin = siteUrl(request);
  const params = request.nextUrl.searchParams;
  const done = (result: string) => {
    const res = NextResponse.redirect(`${origin}/settings?whoop=${result}#whoop`, 303);
    res.cookies.delete({ name: STATE_COOKIE, path: "/whoop" });
    return res;
  };

  if (!stateMatches(request.cookies.get(STATE_COOKIE)?.value, params.get("state"))) return done("expired");
  if (params.get("error")) return done("denied");
  const code = params.get("code");
  const cfg = whoopConfig();
  if (!code || !cfg) return done("failed");

  try {
    const t = await exchangeCode(cfg, code, `${origin}/whoop/callback`);
    const { error } = await supabase.rpc("whoop_save_connection", {
      p_whoop_user_id: null,
      p_access: sealToken(t.access_token, cfg.clientSecret),
      p_refresh: t.refresh_token ? sealToken(t.refresh_token, cfg.clientSecret) : null,
      p_expires_at: t.expires_at.toISOString(),
      p_scope: t.scope,
    });
    if (error) throw new Error(`save ${error.code}`);
  } catch (e) {
    console.error("whoop connect failed", e instanceof Error ? e.message : "");
    return done("failed");
  }
  // First import (last 30 days). If it fails, Today retries on its own.
  await syncWhoop(supabase, profile, 0);
  return done("connected");
}
