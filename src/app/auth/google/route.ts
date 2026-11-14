import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";
import { safeNext } from "@/lib/next-path";

export async function GET(request: NextRequest) {
  const origin = siteUrl(request);
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?auth_error=not_configured`, 303);
  }
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const callback = `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error("google sign-in start failed", error?.code, error?.status);
    return NextResponse.redirect(`${origin}/?auth_error=sign_in_failed`, 303);
  }
  return NextResponse.redirect(data.url, 303);
}
