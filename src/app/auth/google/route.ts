import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const origin = siteUrl(request.nextUrl.origin);
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?auth_error=not_configured`, 303);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error("google sign-in start failed", error?.code, error?.status);
    return NextResponse.redirect(`${origin}/?auth_error=sign_in_failed`, 303);
  }
  return NextResponse.redirect(data.url, 303);
}
