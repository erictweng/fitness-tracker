import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/config";
import { authorizeUrl, whoopConfig } from "@/lib/whoop/client";
import { newState, STATE_COOKIE } from "../state";

/** Settings → Connect WHOOP: send the user to WHOOP's own sign-in page. */
export async function GET(request: NextRequest) {
  await requireUser();
  const origin = siteUrl(request);
  const cfg = whoopConfig();
  if (!cfg) return NextResponse.redirect(`${origin}/settings?whoop=not_configured`, 303);
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(cfg, `${origin}/whoop/callback`, state), 303);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/whoop",
    maxAge: 600,
  });
  return res;
}
