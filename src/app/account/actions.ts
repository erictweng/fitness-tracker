"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

export type DangerState = { ok?: boolean; message?: string } | null;

/** F10: delete my login and every row I own, then sign out. */
export async function deleteAccount(_: DangerState, form: FormData): Promise<DangerState> {
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { message: "Type delete to confirm." };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    if (error.message?.includes("last_admin")) return { message: "You're the only admin. Make someone else admin first." };
    console.error("delete_my_account failed", error.code);
    return { message: "Couldn't delete your account. Nothing was removed; try again." };
  }
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

/** F11: admin removes a user (their data is deleted and their invite revoked). */
export async function removeUser(_: DangerState, form: FormData): Promise<DangerState> {
  const me = await getMe();
  if (!me?.isAdmin) return { message: "Admins only." };
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const typed = normalizeEmail(String(form.get("confirm") ?? ""));
  if (!email || typed !== email) return { message: "Type their email exactly to confirm." };
  const supabase = (await createClient())!;
  const { error } = await supabase.rpc("admin_remove_user", { p_email: email });
  if (error) {
    if (error.message?.includes("cannot_remove_self")) return { message: "You can't remove yourself here." };
    console.error("admin_remove_user failed", error.code);
    return { message: "Couldn't remove them." };
  }
  revalidatePath("/admin");
  return { ok: true, message: `Removed ${email}.` };
}
