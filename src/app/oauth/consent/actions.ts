"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedRedirect } from "@/lib/oauth-redirects";

/** Approve or deny a connected-app request; Supabase returns where to send the browser next. */
export async function decide(form: FormData) {
  const id = String(form.get("authorization_id") ?? "");
  const approve = form.get("decision") === "approve";
  const supabase = await createClient();
  if (!supabase || !id) redirect("/");
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`);
  // Re-check on the server: the page hides Allow for unknown apps, but a form post could be forged.
  const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (!details || !("authorization_id" in details) || !isAllowedRedirect(details.redirect_uri)) {
    if (details && "authorization_id" in details) await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&blocked=1`);
  }
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    console.error("oauth decision failed", error?.code, error?.status);
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&failed=1`);
  }
  redirect(data.redirect_url);
}
