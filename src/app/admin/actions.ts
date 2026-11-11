"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { isPlausibleEmail, normalizeEmail } from "@/lib/email";

export type ActionResult = { ok: boolean; message: string };

async function adminClient() {
  const me = await getMe();
  if (!me?.isAdmin) return null;
  return createClient();
}

export async function inviteAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!isPlausibleEmail(email)) return { ok: false, message: "That doesn't look like an email." };
  const supabase = await adminClient();
  if (!supabase) return { ok: false, message: "Admins only." };
  // RLS-free path: the RPC re-checks admin inside the database.
  const { error } = await supabase.rpc("admin_invite", { p_email: email });
  if (error) {
    console.error("admin_invite failed", error.code);
    return { ok: false, message: "Couldn't save the invite." };
  }
  revalidatePath("/admin");
  return { ok: true, message: `Invited ${email}. Send them the app link.` };
}

export async function revokeAction(form: FormData): Promise<void> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const supabase = await adminClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("admin_revoke_invite", { p_email: email });
  if (error) console.error("admin_revoke_invite failed", error.code);
  revalidatePath("/admin");
}
