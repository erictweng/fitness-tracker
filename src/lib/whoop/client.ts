import "server-only";
import type { WhoopCycle, WhoopWorkout } from "../domain/whoop";

/**
 * Official WHOOP v2 API (OAuth 2.0). Read-only scopes: cycles + workouts.
 * `offline` is what makes WHOOP return a refresh token.
 * WHOOP_OAUTH_BASE / WHOOP_API_BASE exist only so tests can point at a fake WHOOP.
 */
export const WHOOP_SCOPES = "offline read:cycles read:workout";

export function whoopConfig() {
  const clientId = process.env.WHOOP_CLIENT_ID?.trim();
  const clientSecret = process.env.WHOOP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    oauthBase: (process.env.WHOOP_OAUTH_BASE?.trim() || "https://api.prod.whoop.com/oauth/oauth2").replace(/\/+$/, ""),
    apiBase: (process.env.WHOOP_API_BASE?.trim() || "https://api.prod.whoop.com/developer").replace(/\/+$/, ""),
  };
}
export type WhoopConfig = NonNullable<ReturnType<typeof whoopConfig>>;

export class WhoopError extends Error {
  constructor(public code: "auth" | "rate_limited" | "unavailable" | "bad_response", message?: string) {
    super(message ?? code);
  }
}

export function authorizeUrl(cfg: WhoopConfig, redirectUri: string, state: string): string {
  const u = new URL(`${cfg.oauthBase}/auth`);
  u.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: "code", scope: WHOOP_SCOPES, state }).toString();
  return u.toString();
}

export type TokenSet = { access_token: string; refresh_token: string | null; expires_at: Date; scope: string | null };

async function tokenRequest(cfg: WhoopConfig, body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${cfg.oauthBase}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...body, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401) throw new WhoopError("auth", `token ${res.status}`);
  if (!res.ok) throw new WhoopError(res.status === 429 ? "rate_limited" : "unavailable", `token ${res.status}`);
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!j.access_token) throw new WhoopError("bad_response", "no access_token");
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? null,
    expires_at: new Date(Date.now() + Math.max(60, Number(j.expires_in) || 3600) * 1000),
    scope: j.scope ?? null,
  };
}

export const exchangeCode = (cfg: WhoopConfig, code: string, redirectUri: string) =>
  tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri });

export const refreshTokens = (cfg: WhoopConfig, refreshToken: string) =>
  tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken, scope: "offline" });

async function getPage<T>(cfg: WhoopConfig, token: string, path: string, params: Record<string, string>): Promise<{ records: T[]; next_token?: string | null }> {
  const u = new URL(`${cfg.apiBase}${path}`);
  u.search = new URLSearchParams(params).toString();
  const res = await fetch(u, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new WhoopError("auth", `${path} ${res.status}`);
  if (res.status === 429) throw new WhoopError("rate_limited");
  if (!res.ok) throw new WhoopError("unavailable", `${path} ${res.status}`);
  const j = (await res.json()) as { records?: T[]; next_token?: string | null };
  if (!Array.isArray(j.records)) throw new WhoopError("bad_response", path);
  return { records: j.records, next_token: j.next_token };
}

/** All records since `start` (ISO), following next_token. Capped so a bad loop can't run forever. */
async function getAll<T>(cfg: WhoopConfig, token: string, path: string, start: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined;
  for (let i = 0; i < 20; i++) {
    const p: Record<string, string> = { start, limit: "25" };
    if (next) p.nextToken = next;
    const page = await getPage<T>(cfg, token, path, p);
    out.push(...page.records);
    if (!page.next_token) break;
    next = page.next_token;
  }
  return out;
}

export const listCycles = (cfg: WhoopConfig, token: string, start: string) => getAll<WhoopCycle>(cfg, token, "/v2/cycle", start);
export const listWorkouts = (cfg: WhoopConfig, token: string, start: string) => getAll<WhoopWorkout>(cfg, token, "/v2/activity/workout", start);

/** Tell WHOOP to revoke our access (best effort; we delete our copy regardless). */
export async function revokeAccess(cfg: WhoopConfig, token: string): Promise<void> {
  await fetch(`${cfg.apiBase}/v2/user/access`, { method: "DELETE", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
}
