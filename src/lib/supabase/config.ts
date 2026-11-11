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

export function siteUrl(requestOrigin: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestOrigin).replace(/\/+$/, "");
}
