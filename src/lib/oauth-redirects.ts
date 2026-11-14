/**
 * Which connected apps the consent page will approve, by where they send the user back.
 * Dynamic client registration lets anyone register an app named "Claude"; only the return
 * address can't be faked, so that's what we check (on the page AND in the approve action).
 *   - Claude (web, desktop, phone): https://claude.ai or https://claude.com /api/mcp/auth_callback
 *   - Claude Code and other local tools: http loopback on the user's own computer (any port)
 */
const CLAUDE_CALLBACKS = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedRedirect(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password || u.hash) return false;
  if (u.protocol === "https:") return CLAUDE_CALLBACKS.has(`${u.origin}${u.pathname}`) && !u.search;
  if (u.protocol === "http:") return LOOPBACK.has(u.hostname);
  return false;
}
