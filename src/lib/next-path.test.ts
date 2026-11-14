import { describe, expect, it } from "vitest";
import { safeNext } from "./next-path";

describe("safeNext", () => {
  it("keeps same-site paths with query", () => {
    expect(safeNext("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "evil", "", null, "/x\nLocation: y", "/" + "a".repeat(600)]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
