import { describe, expect, it } from "vitest";
import { isAuthErrorCode, mapCallbackError } from "./auth-errors";

describe("mapCallbackError", () => {
  it("maps the invite trigger rejection to not_invited", () => {
    expect(mapCallbackError("server_error", "Database error saving new user")).toBe("not_invited");
  });
  it("maps a cancelled Google consent to cancelled", () => {
    expect(mapCallbackError("access_denied", "The user denied access")).toBe("cancelled");
  });
  it("falls back to sign_in_failed", () => {
    expect(mapCallbackError(null, null)).toBe("sign_in_failed");
    expect(mapCallbackError("server_error", "something else")).toBe("sign_in_failed");
  });
});

describe("isAuthErrorCode", () => {
  it("only accepts known codes", () => {
    expect(isAuthErrorCode("not_invited")).toBe(true);
    expect(isAuthErrorCode("<script>")).toBe(false);
    expect(isAuthErrorCode(undefined)).toBe(false);
  });
});
