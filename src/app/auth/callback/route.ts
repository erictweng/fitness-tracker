import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";
import { mapCallbackError } from "@/lib/auth-errors";

export async function GET(request: NextRequest) {
  const origin = siteUrl(request.nextUrl.origin);
  const params = request.nextUrl.searchParams;
  const code = params.get("code");

  if (!code) {
    const reason = mapCallbackError(params.get("error"), params.get("error_description"));
    return NextResponse.redirect(`${origin}/?auth_error=${reason}`, 303);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?auth_error=not_configured`, 303);
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("code exchange failed", error.code, error.status);
    return NextResponse.redirect(`${origin}/?auth_error=sign_in_failed`, 303);
  }
  return NextResponse.redirect(`${origin}/`, 303);
}
