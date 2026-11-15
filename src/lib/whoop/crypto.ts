import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * WHOOP tokens are encrypted before they reach the database (AES-256-GCM).
 * The key is derived from WHOOP_CLIENT_SECRET, which only the server has, so a
 * database dump or a backup alone can't be used to read anyone's WHOOP.
 * Rotating the client secret makes stored tokens unreadable: users reconnect.
 */
function key(secret: string): Buffer {
  if (!secret) throw new Error("WHOOP_CLIENT_SECRET missing");
  return Buffer.from(hkdfSync("sha256", secret, "fitness-tracker", "whoop-token-v1", 32));
}

export function sealToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, body, c.getAuthTag()]).toString("base64url")}`;
}

export function openToken(sealed: string, secret: string): string {
  if (!sealed.startsWith("v1:")) throw new Error("unknown token format");
  const raw = Buffer.from(sealed.slice(3), "base64url");
  if (raw.length < 29) throw new Error("token too short");
  const d = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
}
