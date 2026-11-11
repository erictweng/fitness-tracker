import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig, siteUrl } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("getSupabaseConfig", () => {
  it("is null when either value is missing (fail closed)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabaseConfig()).toBeNull();
  });
  it("trims values and strips a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://x.supabase.co/ \n");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", " sb_publishable_abc ");
    expect(getSupabaseConfig()).toEqual({ url: "https://x.supabase.co", key: "sb_publishable_abc" });
  });
});

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ft.example.com/");
    expect(siteUrl("http://localhost:3000")).toBe("https://ft.example.com");
  });
  it("falls back to the request origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
