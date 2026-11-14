/** Only same-site paths survive a sign-in round trip (no open redirects). */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return null;
  if (raw.length > 500) return null;
  try {
    const u = new URL(raw, "http://x");
    if (u.origin !== "http://x") return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}
