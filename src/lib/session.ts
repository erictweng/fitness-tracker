import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getProfile } from "./profile";

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

/** Return the verified user and their profile together for this request. */
export async function getUserContext() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const profile = await getProfile(supabase, data.user.id);
  if (!profile) return null;
  return { supabase, user: data.user, profile };
}

/** For pages and actions that require a signed-in user with a profile. */
export async function requireUser() {
  const context = await getUserContext();
  if (!context) redirect("/");
  return context;
}
