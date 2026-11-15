import { defineConfig } from "@playwright/test";
import { localSupabaseEnv } from "./e2e/local-env";

// E2E runs against a production build + the LOCAL Supabase stack (npx supabase start).
const sb = localSupabaseEnv();
const PORT = 3100;
const env = {
  NEXT_PUBLIC_SUPABASE_URL: sb.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb.PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  E2E_TEST_LOGIN: "1",
  E2E_ALLOW_PROD_BUILD: "1",
  // Fake WHOOP (e2e/fake-whoop.mjs). Test-only values, not real credentials.
  WHOOP_CLIENT_ID: "e2e-whoop-client",
  WHOOP_CLIENT_SECRET: "e2e-whoop-secret",
  WHOOP_OAUTH_BASE: "http://127.0.0.1:3199/oauth/oauth2",
  WHOOP_API_BASE: "http://127.0.0.1:3199/developer",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: `npx next build && npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      timeout: 240_000,
      reuseExistingServer: false,
      env,
    },
    {
      command: "node e2e/fake-whoop.mjs",
      url: "http://127.0.0.1:3199/__state",
      timeout: 20_000,
      reuseExistingServer: false,
    },
  ],
});
