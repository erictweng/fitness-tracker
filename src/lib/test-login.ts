/**
 * Password sign-in exists ONLY for automated browser tests against the local
 * Supabase stack. It is refused unless explicitly switched on AND the
 * Supabase URL is a loopback address, so it can never work in production.
 */
export function testLoginAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.E2E_TEST_LOGIN !== "1") return false;
  if (env.VERCEL || (env.NODE_ENV === "production" && env.E2E_ALLOW_PROD_BUILD !== "1")) return false;
  try {
    const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}
