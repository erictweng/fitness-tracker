import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(`${siteUrl(request.nextUrl.origin)}/`, 303);
}
