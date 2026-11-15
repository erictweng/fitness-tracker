import { randomBytes, timingSafeEqual } from "node:crypto";

/** CSRF state for the WHOOP sign-in: random, kept in a short-lived httpOnly cookie. */
export const STATE_COOKIE = "whoop_oauth_state";
export const newState = () => randomBytes(24).toString("base64url");

export function stateMatches(cookie: string | undefined, param: string | null): boolean {
  if (!cookie || !param || cookie.length !== param.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(param));
}
