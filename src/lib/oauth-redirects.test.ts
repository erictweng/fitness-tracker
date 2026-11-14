import { describe, expect, it } from "vitest";
import { isAllowedRedirect } from "./oauth-redirects";

describe("isAllowedRedirect", () => {
  it("allows Claude's callbacks and loopback (Claude Code)", () => {
    for (const ok of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "http://localhost:53682/callback",
      "http://127.0.0.1:3999/callback",
      "http://[::1]:8080/cb",
    ]) expect(isAllowedRedirect(ok), ok).toBe(true);
  });
  it("refuses everything else, including look-alikes", () => {
    for (const bad of [
      "https://evil.test/api/mcp/auth_callback",
      "https://claude.ai.evil.test/api/mcp/auth_callback",
      "https://evil.test/?x=https://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/other/path",
      "https://claude.ai/api/mcp/auth_callback?next=https://evil.test",
      "http://claude.ai/api/mcp/auth_callback",
      "https://user@claude.ai/api/mcp/auth_callback",
      "http://localhost.evil.test/cb",
      "http://127.0.0.1.evil.test/cb",
      "https://localhost/cb",
      "javascript:alert(1)",
      "claude://callback",
      "",
      null,
    ]) expect(isAllowedRedirect(bad), String(bad)).toBe(false);
  });
});
