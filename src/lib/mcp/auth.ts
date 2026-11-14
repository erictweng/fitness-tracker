import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig, siteUrl } from "@/lib/supabase/config";

export type McpAuth = { supabase: SupabaseClient; userId: string; clientId: string; token: string; expiresAt?: number };

function payload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Accepts only access tokens issued by our Supabase OAuth server to a connected app
 * (they carry `client_id`). getUser() checks the token with Supabase Auth on every call,
 * so a grant revoked in Settings stops working on the next request.
 */
export async function authenticate(req: Request): Promise<McpAuth | null> {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(req.headers.get("authorization") ?? "");
  const cfg = getSupabaseConfig();
  if (!m || !cfg) return null;
  const token = m[1];
  const claims = payload(token);
  const clientId = typeof claims?.client_id === "string" ? claims.client_id : "";
  if (!clientId) return null;
  const supabase = createClient(cfg.url, cfg.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, userId: data.user.id, clientId, token, expiresAt: typeof claims?.exp === "number" ? claims.exp : undefined };
}

export function resourceUrl(req: Request & { nextUrl?: URL }): string {
  return `${siteUrl(req)}/api/mcp`;
}

export function metadataUrl(req: Request & { nextUrl?: URL }): string {
  return `${siteUrl(req)}/.well-known/oauth-protected-resource/api/mcp`;
}

/** RFC 9728 protected-resource metadata: tells Claude where to sign in. */
export function protectedResourceMetadata(req: Request & { nextUrl?: URL }) {
  const cfg = getSupabaseConfig();
  return {
    resource: resourceUrl(req),
    authorization_servers: cfg ? [`${cfg.url.replace(/\/+$/, "")}/auth/v1`] : [],
    bearer_methods_supported: ["header"],
    resource_name: "Fitness Tracker",
  };
}

export function unauthorized(req: Request & { nextUrl?: URL }): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Sign in to Fitness Tracker to connect." }, id: null },
    {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl(req)}"`, "Cache-Control": "no-store" },
    },
  );
}
