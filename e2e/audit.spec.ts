import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { admin, onboard, resetUser, signIn, userId } from "./helpers";

// Fixes from the 2026-11-14 audit.
const U = "audit@e2e.test";
const LA = "America/Los_Angeles";
test.describe.configure({ mode: "serial" });

test("security headers: no page can be embedded by another site", async ({ request }) => {
  for (const path of ["/", "/oauth/consent?authorization_id=x", "/settings"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"], path).toBe("nosniff");
  }
});

test("export includes every row past Supabase's 1,000-row page", async ({ browser }) => {
  expect((await resetUser(U, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA, acceptDownloads: true });
  const page = await ctx.newPage();
  await signIn(page, U);
  await onboard(page);
  const uid = await userId(U);
  const rows = Array.from({ length: 2345 }, (_, i) => ({
    id: crypto.randomUUID(), user_id: uid, log_date: "2026-10-01", meal: "lunch", name: `bulk ${i}`, kcal: 1, protein_g: 1, source: "app",
  }));
  for (let i = 0; i < rows.length; i += 500) expect((await admin.from("entries").insert(rows.slice(i, i + 500))).error).toBeNull();
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-link").click()]);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const lines = strFromU8(files["entries.csv"]).trim().split("\r\n");
  expect(lines.length - 1).toBe(2345);
  expect(new Set(lines.slice(1).map((l) => l.split(",")[0])).size).toBe(2345); // no row twice
  await ctx.close();
});

test("offline queue: a stuck item doesn't block the rest; Retry/Discard; cleared on sign-out", async ({ browser }) => {
  const uid = await userId(U);
  await admin.from("entries").delete().eq("user_id", uid);
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, U);
  const today = await page.evaluate(() => document.querySelector<HTMLInputElement>("input[name=date]")!.value);
  const item = (name: string, kcal: number) => {
    const id = crypto.randomUUID();
    return {
      key: id, kind: "entry", queuedAt: new Date().toISOString(),
      fields: { id, name, kcal: String(kcal), protein_g: "10", fat_g: "", carbs_g: "", notes: "", meal: "lunch", log_date: today, logged_at: new Date().toISOString() },
      preview: { name, kcal, meal: "lunch", log_date: today },
    };
  };
  // First item: 6,000 kcal without the confirm flag, which the server refuses. It used to stall the queue forever.
  await page.evaluate(([k, q]) => localStorage.setItem(k, q), [`ft-queue-v1:${uid}`, JSON.stringify([item("Huge thing", 6000), item("Apple", 95)])]);
  await page.reload();
  await expect(page.getByTestId("entry")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("entry")).toContainText("Apple");
  await expect(page.getByTestId("pending-failed")).toContainText("Huge thing");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("pending-failed")).toContainText("Huge thing"); // tried right away, still refused, still visible
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByTestId("pending-banner")).toHaveCount(0);

  // Sign-out with something unsent: warns; cancel keeps it, accept clears it from the phone.
  // (Settings doesn't sync the queue, so a seeded item stays unsent there.)
  await page.goto("/settings");
  await page.evaluate(([k, q]) => localStorage.setItem(k, q), [`ft-queue-v1:${uid}`, JSON.stringify([item("Unsent", 100)])]);
  page.once("dialog", (d) => { expect(d.message()).toContain("1 entry hasn't synced yet"); void d.dismiss(); });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  expect(await page.evaluate((k) => localStorage.getItem(k), `ft-queue-v1:${uid}`)).not.toBeNull();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), `ft-queue-v1:${uid}`)).toBeNull();
  await ctx.close();
});

test("deleting the account clears every queue on the phone", async ({ browser }) => {
  const uid = await userId(U);
  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, U);
  await page.goto("/settings");
  await page.evaluate((k) => { localStorage.setItem(k, "[]"); localStorage.setItem("ft-queue-v1:someone-else", "[]"); localStorage.setItem("unrelated", "keep"); }, `ft-queue-v1:${uid}`);
  await page.getByRole("button", { name: "Delete account…" }).click();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByTestId("account-deleted")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ft-queue-v1:")).length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe("keep");
  await ctx.close();
});

test("privacy policy is public (signed out) and linked from sign-in", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto("/privacy");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  for (const h of ["What we store", "Who can see it", "Connected apps", "Your choices"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.getByText(/read-only access to daily calories burned and workouts/)).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await ctx.close();
});
