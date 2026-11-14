import type { NextRequest } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp/auth";

// RFC 9728: where Claude learns which authorization server (our Supabase Auth) to use.
export function GET(req: NextRequest) {
  return Response.json(protectedResourceMetadata(req), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
