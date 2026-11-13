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

const req = (h: Record<string, string>, origin = "http://localhost:3000") => ({
  headers: { get: (k: string) => h[k.toLowerCase()] ?? null },
  nextUrl: { origin },
});

describe("siteUrl", () => {
  it("uses the host the browser used, even if NEXT_PUBLIC_SITE_URL points elsewhere", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://fitness-tracker.vercel.app");
    expect(siteUrl(req({ host: "fitness-tracker-vert-three.vercel.app", "x-forwarded-proto": "https" })))
      .toBe("https://fitness-tracker-vert-three.vercel.app");
  });
  it("prefers x-forwarded-host (Vercel) over host", () => {
    expect(siteUrl(req({ host: "internal:3000", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" })))
      .toBe("https://app.example.com");
  });
  it("defaults to http for loopback and https otherwise", () => {
    expect(siteUrl(req({ host: "127.0.0.1:3100" }))).toBe("http://127.0.0.1:3100");
    expect(siteUrl(req({ host: "ft.example.com" }))).toBe("https://ft.example.com");
  });
  it("falls back to NEXT_PUBLIC_SITE_URL, then the request origin, without a Host header", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ft.example.com/");
    expect(siteUrl(req({}))).toBe("https://ft.example.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl(req({}))).toBe("http://localhost:3000");
  });
});
