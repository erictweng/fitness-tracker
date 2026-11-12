import { describe, expect, it } from "vitest";
import { testLoginAllowed } from "./test-login";

const local = { E2E_TEST_LOGIN: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NODE_ENV: "development" };

describe("testLoginAllowed", () => {
  it("allows only when switched on against local Supabase", () => {
    expect(testLoginAllowed(local)).toBe(true);
  });
  it("is off by default", () => {
    expect(testLoginAllowed({ ...local, E2E_TEST_LOGIN: undefined })).toBe(false);
  });
  it("never against a hosted Supabase", () => {
    expect(testLoginAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe(false);
  });
  it("never on Vercel", () => {
    expect(testLoginAllowed({ ...local, VERCEL: "1" })).toBe(false);
  });
  it("production builds need a second explicit switch", () => {
    expect(testLoginAllowed({ ...local, NODE_ENV: "production" })).toBe(false);
    expect(testLoginAllowed({ ...local, NODE_ENV: "production", E2E_ALLOW_PROD_BUILD: "1" })).toBe(true);
  });
});
