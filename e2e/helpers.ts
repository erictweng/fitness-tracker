import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { localSupabaseEnv } from "./local-env";

export const PASSWORD = "e2e-local-only-pw-1!";
const sb = localSupabaseEnv();
export const admin = createClient(sb.API_URL, sb.SECRET_KEY, { auth: { persistSession: false } });

/** Fresh invited test user (fake .test domain, local stack only). */
export async function resetUser(email: string, opts: { invite: boolean }) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter((u) => u.email === email)) await admin.auth.admin.deleteUser(u.id);
  await admin.from("invites").delete().eq("email", email);
  if (opts.invite) {
    const { error } = await admin.from("invites").insert({ email });
    if (error) throw error;
  }
  return admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/auth/test-login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
}

/** YYYY-MM-DD for `at` in `tz`, with the given day-end hour. Mirrors src/lib/domain/day.ts. */
export function localDate(at: Date, tz: string): { date: string; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** The instant that is HH:MM local time on `isoDate` in `tz`. */
export function instantAt(isoDate: string, hh: number, mm: number, tz: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
  );
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asLocal - guess));
}

/** Fast onboarding through the real UI (male, 5'10", 180 lb, moderate, cut unless overridden). */
export async function onboard(page: Page, o: { goal?: "cut" | "maintain" | "bulk" } = {}) {
  await page.waitForURL(/\/onboarding$/);
  await page.getByLabel("Sex", { exact: true }).selectOption("male");
  await page.getByLabel("Birth date").fill("2000-01-15");
  await page.getByLabel("Height feet").fill("5");
  await page.getByLabel("Height inches").fill("10");
  await page.getByLabel("Weight", { exact: true }).fill("180");
  await page.getByLabel("Activity").selectOption("moderate");
  if (o.goal) await page.getByLabel("Goal").selectOption(o.goal);
  await page.getByRole("button", { name: "Start logging" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}
