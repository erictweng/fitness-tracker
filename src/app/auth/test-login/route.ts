import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testLoginAllowed } from "@/lib/test-login";
import { siteUrl } from "@/lib/supabase/config";

// Local automated tests only. See lib/test-login.ts for the guard.
export async function POST(request: NextRequest) {
  if (!testLoginAllowed()) return new NextResponse("Not found", { status: 404 });
  const form = await request.formData();
  const supabase = await createClient();
  if (!supabase) return new NextResponse("Not configured", { status: 503 });
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) return new NextResponse("Bad login", { status: 401 });
  return NextResponse.redirect(`${siteUrl(request)}/`, 303);
}

export async function GET() {
  if (!testLoginAllowed()) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(
    `<form method="post"><input name="email"><input name="password" type="password"><button>Sign in</button></form>`,
    { headers: { "content-type": "text/html" } },
  );
}
