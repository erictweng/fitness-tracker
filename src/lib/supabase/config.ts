export type SupabaseConfig = { url: string; key: string };

/**
 * Hosted mode needs both public values. Anything partial counts as "not
 * configured" so the app fails closed instead of half-working.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

type HeaderSource = { headers: { get(name: string): string | null }; nextUrl?: { origin: string } };

/**
 * The origin the browser actually used for this request. OAuth must come back
 * to this exact origin: the PKCE code-verifier cookie was set there, so a
 * redirect to any other domain (e.g. a stale NEXT_PUBLIC_SITE_URL) breaks
 * sign-in. NEXT_PUBLIC_SITE_URL is only a fallback when no Host header exists.
 */
export function siteUrl(req: HeaderSource): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0].trim();
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim()
      ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || req.nextUrl?.origin || "").replace(/\/+$/, "");
}
