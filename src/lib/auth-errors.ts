export type AuthErrorCode =
  | "not_invited"
  | "cancelled"
  | "not_configured"
  | "sign_in_failed";

export const AUTH_ERROR_COPY: Record<AuthErrorCode, string> = {
  not_invited: "This app is invite-only. Ask Eric for an invite.",
  cancelled: "Sign-in was cancelled.",
  not_configured: "Sign-in isn't set up yet on this deployment.",
  sign_in_failed: "Sign-in failed. Please try again.",
};

/**
 * Map what Supabase/Google send back to the callback into one of our codes.
 * The invite check is a database trigger on auth.users; when it rejects a
 * sign-up, Supabase reports it as "Database error saving new user".
 */
export function mapCallbackError(
  error: string | null,
  description: string | null,
): AuthErrorCode {
  const d = (description ?? "").toLowerCase();
  if (error === "access_denied" && !d.includes("database")) return "cancelled";
  if (d.includes("database error saving new user") || d.includes("not_invited")) {
    return "not_invited";
  }
  return "sign_in_failed";
}

export function isAuthErrorCode(v: string | null | undefined): v is AuthErrorCode {
  return !!v && v in AUTH_ERROR_COPY;
}
