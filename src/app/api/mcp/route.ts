import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NextRequest } from "next/server";
import { authenticate, unauthorized } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Remote MCP server (Streamable HTTP, stateless). Every request carries the user's OAuth
// token; tools run with a Supabase client scoped to that token, so RLS applies.
async function handle(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) return unauthorized(req);
  const server = buildServer({ supabase: auth.supabase, userId: auth.userId });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req, {
    authInfo: { token: auth.token, clientId: auth.clientId, scopes: [], expiresAt: auth.expiresAt },
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
