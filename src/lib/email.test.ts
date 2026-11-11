import { describe, expect, it } from "vitest";
import { isPlausibleEmail, normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Friend@Gmail.COM ")).toBe("friend@gmail.com");
  });
});

describe("isPlausibleEmail", () => {
  it.each(["a@b.co", " Eric@Example.com "])("accepts %s", (e) => {
    expect(isPlausibleEmail(e)).toBe(true);
  });
  it.each(["", "nope", "a@b", "a b@c.com", "@c.com"])("rejects %j", (e) => {
    expect(isPlausibleEmail(e)).toBe(false);
  });
});
