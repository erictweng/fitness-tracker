"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";

/** Disconnect a connected app (e.g. Claude): its tokens stop working on the next call. */
export async function disconnectApp(form: FormData) {
  const clientId = String(form.get("client_id") ?? "");
  if (!clientId) return;
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) console.error("revoke grant failed", error.code, error.status);
  revalidatePath("/settings");
}
