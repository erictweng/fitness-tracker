import { execSync } from "node:child_process";

export type LocalSupabase = { API_URL: string; PUBLISHABLE_KEY: string; SECRET_KEY: string; DB_URL: string };

/** Reads the running local stack's URLs/keys. These are the local-dev defaults, never production. */
export function localSupabaseEnv(): LocalSupabase {
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const j = JSON.parse(out.slice(out.indexOf("{")));
  const url = new URL(j.API_URL);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("E2E must use a local Supabase");
  return { API_URL: j.API_URL, PUBLISHABLE_KEY: j.PUBLISHABLE_KEY, SECRET_KEY: j.SECRET_KEY, DB_URL: j.DB_URL };
}
