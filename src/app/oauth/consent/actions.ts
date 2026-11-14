"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Approve or deny a connected-app request; Supabase returns where to send the browser next. */
export async function decide(form: FormData) {
  const id = String(form.get("authorization_id") ?? "");
  const approve = form.get("decision") === "approve";
  const supabase = await createClient();
  if (!supabase || !id) redirect("/");
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`);
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    console.error("oauth decision failed", error?.code, error?.status);
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&failed=1`);
  }
  redirect(data.redirect_url);
}
