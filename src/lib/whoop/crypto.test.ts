import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "./crypto";

describe("WHOOP token sealing", () => {
  it("round-trips and never contains the plaintext", () => {
    const s = sealToken("access-123", "secret-a");
    expect(s.startsWith("v1:")).toBe(true);
    expect(s).not.toContain("access-123");
    expect(openToken(s, "secret-a")).toBe("access-123");
  });
  it("uses a fresh IV each time", () => {
    expect(sealToken("same", "k")).not.toBe(sealToken("same", "k"));
  });
  it("fails with the wrong secret or a tampered value", () => {
    const s = sealToken("access-123", "secret-a");
    expect(() => openToken(s, "secret-b")).toThrow();
    const t = s.slice(0, -2) + (s.endsWith("A") ? "BB" : "AA");
    expect(() => openToken(t, "secret-a")).toThrow();
    expect(() => openToken("plain", "secret-a")).toThrow();
  });
});
