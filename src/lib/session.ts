import "server-only";
import { createClient } from "./supabase/server";

export type Me = {
  id: string;
  email: string;
  isAdmin: boolean;
  onboarded: boolean;
};

/**
 * Data Access Layer: the one place pages ask "who is this?".
 * Uses auth.getUser() (verified with Supabase), never the raw cookie session.
 */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, is_admin, onboarded_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profile) return null;
  return {
    id: data.user.id,
    email: profile.email,
    isAdmin: profile.is_admin,
    onboarded: profile.onboarded_at !== null,
  };
}
