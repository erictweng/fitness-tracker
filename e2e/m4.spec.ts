import { expect, test, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { addDays } from "../src/lib/domain/day";
import { admin, localDate, onboard, resetUser, signIn, userId } from "./helpers";

const H = "hana@e2e.test";
const I = "ivan@e2e.test";
const BOSS = "boss@e2e.test";
const LA = "America/Los_Angeles";

test.describe.configure({ mode: "serial" });

function serverToday() {
  const now = localDate(new Date(), LA);
  return now.hour < 3 ? addDays(now.date, -1) : now.date;
}

async function quickAdd(page: Page, f: { name: string; kcal: string; protein: string; fat?: string; notes?: string }) {
  await page.getByTestId("add-food").click();
  await page.getByTestId("quick-add").click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet.getByLabel("Name (optional)").fill(f.name);
  await sheet.getByLabel("Calories").fill(f.kcal);
  await sheet.getByLabel(/^Protein g/).fill(f.protein);
  if (f.fat) await sheet.getByLabel(/^Fat g/).fill(f.fat);
  if (f.notes) await sheet.getByLabel("Notes (optional)").fill(f.notes);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
}

async function rows(table: string, uid: string) {
  const q = admin.from(table).select("*", { count: "exact", head: true }).eq("user_id", uid);
  const { count, error } = table === "entries" ? await q.is("deleted_at", null) : await q;
  if (error) throw error;
  return count ?? 0;
}

test("offline: two entries wait on the phone, then sync exactly once", async ({ browser }) => {
  expect((await resetUser(H, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, H);
  await onboard(page);
  const uid = await userId(H);

  await ctx.setOffline(true);
  await quickAdd(page, { name: "Gym bar", kcal: "210", protein: "20" });
  await quickAdd(page, { name: "Shake", kcal: "160", protein: "30" });
  await expect(page.getByTestId("pending-banner")).toContainText("2 waiting for signal");
  await expect(page.getByTestId("pending-entry")).toHaveCount(2);
  expect(await rows("entries", uid)).toBe(0);
  await ctx.setOffline(false); // fires "online" → sync
  await expect(page.getByTestId("pending-banner")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("entry")).toHaveCount(2);
  await expect(page.getByTestId("kcal-eaten")).toContainText("370 eaten");
  expect(await rows("entries", uid)).toBe(2);

  // A second "online" (retry storm) doesn't duplicate anything.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.reload();
  await expect(page.getByTestId("entry")).toHaveCount(2);
  expect(await rows("entries", uid)).toBe(2);

  // Offline delete is refused with a message, and the entry stays.
  await ctx.setOffline(true);
  await page.getByTestId("entry").first().click();
  await page.getByRole("dialog", { name: "Edit" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("offline-notice")).toBeVisible();
  await ctx.setOffline(false);
  expect(await rows("entries", uid)).toBe(2);
  await ctx.close();
});

test("unknown fat is not zero; notes are saved and shown", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, H);
  await quickAdd(page, { name: "Steak", kcal: "500", protein: "45", fat: "30", notes: "8 oz, restaurant guess" });
  // The two offline entries above had no fat → 2 unknown; steak adds 30 g known.
  await expect(page.getByTestId("fat-carbs")).toHaveText("Fat 30g + 2 unknown · Carbs not entered");
  await expect(page.getByTestId("entry-notes")).toHaveText("8 oz, restaurant guess");
  const { data } = await admin.from("entries").select("notes, fat_g, carbs_g").eq("name", "Steak").eq("user_id", await userId(H)).single();
  expect(data).toEqual({ notes: "8 oz, restaurant guess", fat_g: 30, carbs_g: null });
  await ctx.close();
});

test("history: 7/30-day averages skip missed days and today; bars and target line", async ({ browser }) => {
  const uid = await userId(H);
  const today = serverToday();
  // Hand-computed fixture on past days (today's entries from the tests above are excluded from averages):
  //   day -1: 1800 kcal / 150 g; day -2: missed; day -3: 2400 kcal / 170 g; day -10: 2000 kcal / 100 g (30-day only)
  const mk = (d: number, kcal: number, protein_g: number) => ({
    id: crypto.randomUUID(), user_id: uid, log_date: addDays(today, d), meal: "lunch", name: `fixture ${d}`, kcal, protein_g, source: "app",
  });
  const { error } = await admin.from("entries").insert([mk(-1, 1000, 100), mk(-1, 800, 50), mk(-3, 2400, 170), mk(-10, 2000, 100)]);
  expect(error).toBeNull();
  // Targets set at onboarding (today); give the past a known target too.
  await admin.from("targets").insert({ user_id: uid, effective_from: addDays(today, -30), kcal: 2000, protein_g: 160, source: "manual" });

  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, H);
  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  // 7 days: logged past days = -1 (1800/150) and -3 (2400/170) → avg 2100 kcal, 160 g; vs target 2000 → +100
  await expect(page.getByTestId("avg-kcal")).toHaveText("2100");
  await expect(page.getByTestId("avg-protein")).toHaveText("160g");
  await expect(page.getByTestId("avg-vs-target")).toHaveText("+100 vs target");
  await expect(page.getByTestId("days-logged")).toContainText("2 of the last 6 days logged");
  // Bars: day -3, -1 and today (3 bars); missed days have none.
  await expect(page.getByTestId("history-kcal-bar")).toHaveCount(3);

  await page.getByRole("link", { name: "30 days" }).click();
  // 30 days adds day -10 (2000/100): avg (1800+2400+2000)/3 = 2066.67 → 2067; protein (150+170+100)/3 = 140
  await expect(page.getByTestId("avg-kcal")).toHaveText("2067");
  await expect(page.getByTestId("avg-protein")).toHaveText("140g");
  await expect(page.getByTestId("history-kcal-bar")).toHaveCount(4);
  // Only the onboarding weigh-in exists → no trend yet, shown as a message rather than an empty chart.
  await expect(page.getByTestId("history-weight-empty")).toBeVisible();
  await ctx.close();
});

test("export: zip of only my own CSVs", async ({ browser }) => {
  // A second user with data that must NOT appear in H's export.
  expect((await resetUser(I, { invite: true })).error).toBeNull();
  const iid = await userId(I);
  await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("user_id", iid);
  await admin.from("entries").insert({ id: crypto.randomUUID(), user_id: iid, log_date: serverToday(), meal: "lunch", name: "IVAN SECRET", kcal: 1, protein_g: 1, source: "app" });

  const ctx = await browser.newContext({ timezoneId: LA, acceptDownloads: true });
  const page = await ctx.newPage();
  await signIn(page, H);
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-link").click()]);
  expect(download.suggestedFilename()).toMatch(/^fitness-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(Object.keys(files).sort()).toEqual(
    ["README.txt", "entries.csv", "foods.csv", "meal_items.csv", "meals.csv", "settings.csv", "targets.csv", "weigh_ins.csv", "workouts.csv"],
  );
  const entries = strFromU8(files["entries.csv"]);
  const lines = entries.trim().split("\r\n");
  expect(lines[0]).toBe("id,log_date,logged_at,meal,name,food_id,servings,grams,kcal,protein_g,fat_g,carbs_g,notes,source,updated_at");
  expect(lines.length - 1).toBe(await rows("entries", await userId(H)));
  expect(entries).toContain("8 oz, restaurant guess");
  expect(entries).not.toContain("IVAN SECRET");
  expect(strFromU8(files["settings.csv"])).toContain(H);
  expect(strFromU8(files["settings.csv"])).not.toContain("is_admin");
  // Not reachable signed out.
  const anon = await browser.newContext();
  const res = await anon.request.get("/export", { maxRedirects: 0 });
  expect(res.status()).not.toBe(200);
  await anon.close();
  await ctx.close();
});

test("delete account: typed confirmation, everything gone, signed out", async ({ browser }) => {
  const uid = await userId(H);
  expect(await rows("entries", uid)).toBeGreaterThan(0);
  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, H);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account…" }).click();
  const form = page.getByTestId("delete-account");
  await form.getByLabel("Type delete to confirm").fill("nope");
  await form.getByRole("button", { name: "Delete forever" }).click();
  await expect(form.getByRole("alert")).toHaveText("Type delete to confirm.");
  expect(await rows("entries", uid)).toBeGreaterThan(0);

  await form.getByLabel("Type delete to confirm").fill("delete");
  await form.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByTestId("account-deleted")).toBeVisible();
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  for (const t of ["entries", "foods", "meals", "meal_items", "weigh_ins", "targets", "workouts"]) expect(await rows(t, uid), t).toBe(0);
  const { count } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("user_id", uid);
  expect(count).toBe(0);
  const { data } = await admin.auth.admin.getUserById(uid);
  expect(data.user).toBeNull();
  // Ivan is untouched.
  expect(await rows("entries", await userId(I))).toBe(1);
  await ctx.close();
});

test("admin removes a user: data deleted, invite revoked", async ({ browser }) => {
  expect((await resetUser(BOSS, { invite: true, admin: true })).error).toBeNull();
  const bossId = await userId(BOSS);
  await admin.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("user_id", bossId);
  const iid = await userId(I);

  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, BOSS);
  await page.goto("/admin");
  // No remove button for yourself.
  await expect(page.getByRole("button", { name: `Remove ${BOSS}` })).toHaveCount(0);
  await page.getByRole("button", { name: `Remove ${I}` }).click();
  const form = page.getByTestId("remove-user");
  await form.getByLabel("Type their email to confirm").fill("wrong@e2e.test");
  await form.getByRole("button", { name: "Remove" }).click();
  await expect(form.getByRole("alert")).toHaveText("Type their email exactly to confirm.");
  await form.getByLabel("Type their email to confirm").fill(I);
  await form.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("users")).not.toContainText(I);
  expect(await rows("entries", iid)).toBe(0);
  const { data: inv } = await admin.from("invites").select("revoked_at").eq("email", I).single();
  expect(inv?.revoked_at).not.toBeNull();
  // They can't come back without a new invite.
  const again = await admin.auth.admin.createUser({ email: I, password: "x-e2e-pw-123!", email_confirm: true });
  expect(again.error).not.toBeNull();
  await ctx.close();
});
