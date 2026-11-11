/** Invite emails are stored trimmed + lowercase; compare the same way everywhere. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Loose shape check only; Google is the real verifier of the address. */
export function isPlausibleEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
