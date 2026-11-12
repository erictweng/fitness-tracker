import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../src/lib/domain/day";
import { suggestTargets } from "../src/lib/domain/targets";
import { ftInToCm, lbToKg } from "../src/lib/domain/units";
import { createClient } from "@supabase/supabase-js";
import { admin, instantAt, localDate, PASSWORD, resetUser, signIn } from "./helpers";
import { localSupabaseEnv } from "./local-env";

const A = "alice@e2e.test";
const B = "bob@e2e.test";
const LA = "America/Los_Angeles";
const NY = "America/New_York";

test.describe.configure({ mode: "serial" });

async function addFood(page: Page, f: { name?: string; kcal: string; protein?: string; fat?: string; carbs?: string }) {
  await page.getByTestId("add-food").click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  if (f.name) await sheet.getByLabel("Name (optional)").fill(f.name);
  await sheet.getByLabel("Calories").fill(f.kcal);
  if (f.protein) await sheet.getByLabel(/^Protein g/).fill(f.protein);
  if (f.fat) await sheet.getByLabel(/^Fat g/).fill(f.fat);
  if (f.carbs) await sheet.getByLabel(/^Carbs g/).fill(f.carbs);
  await sheet.getByRole("button", { name: "Save" }).click();
  return sheet;
}

test("uninvited accounts are rejected by the database", async () => {
  const r = await resetUser("stranger@e2e.test", { invite: false });
  expect(r.error).not.toBeNull();
  expect(r.data.user).toBeNull();
});

test("user A (LA, lb, cut, 3 AM): onboard, log, 1:30 AM rule, delete + undo", async ({ browser }) => {
  expect((await resetUser(A, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await signIn(page, A);
  await expect(page).toHaveURL(/\/onboarding$/);

  // Onboarding: male, born 2000-01-15, 5'10", 180 lb, moderate, cut
  await page.getByLabel("Sex", { exact: true }).selectOption("male");
  await page.getByLabel("Birth date").fill("2000-01-15");
  await page.getByLabel("Height feet").fill("5");
  await page.getByLabel("Height inches").fill("10");
  await page.getByLabel("Weight", { exact: true }).fill("180");
  await page.getByLabel("Activity").selectOption("moderate");
  const today = localDate(new Date(), LA);
  const serverToday = today.hour < 3 ? addDays(today.date, -1) : today.date;
  const age = Number(serverToday.slice(0, 4)) - 2000 - (serverToday.slice(5) < "01-15" ? 1 : 0);
  const expected = suggestTargets({
    sex: "male", weightKg: lbToKg(180), heightCm: ftInToCm(5, 10), ageYears: age,
    activity: "moderate", goal: "cut", adjustKcal: -500, proteinRule: "per_lb", proteinValue: 1,
  });
  await expect(page.getByLabel("Calories")).toHaveValue(String(expected.kcal));
  await expect(page.getByLabel("Protein (g)")).toHaveValue("180");
  await page.getByRole("button", { name: "Start logging" }).click();
  await expect(page.getByTestId("day-title")).toHaveText("Today");
  await expect(page.getByTestId("empty-day")).toBeVisible();
  await expect(page.getByTestId("kcal-left")).toHaveText(String(expected.kcal));

  // Required-field check (protein required by default)
  let sheet = await addFood(page, { kcal: "100" });
  await expect(sheet.getByText("Required.")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  await addFood(page, { name: "Chicken bowl", kcal: "650", protein: "48" });
  await expect(page.getByTestId("entry")).toHaveCount(1);
  await addFood(page, { name: "Protein shake", kcal: "300", protein: "40" });
  await expect(page.getByTestId("entry")).toHaveCount(2);
  await expect(page.getByTestId("kcal-eaten")).toHaveText(`950 eaten / ${expected.kcal}`);
  await expect(page.getByTestId("kcal-left")).toHaveText(String(expected.kcal - 950));
  await expect(page.getByTestId("protein-left")).toHaveText("92g");

  // Macro mismatch warns but doesn't block: second Save keeps it.
  sheet = await addFood(page, { name: "Typo", kcal: "100", protein: "30", fat: "10", carbs: "30" });
  await expect(sheet.getByText(/Macros add up to about 330 kcal/)).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("entry")).toHaveCount(3);

  // Delete via edit sheet, then Undo restores it.
  await page.getByTestId("entry").filter({ hasText: "Chicken bowl" }).click();
  await page.getByRole("dialog", { name: "Edit" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("undo-toast")).toBeVisible();
  await expect(page.getByTestId("entry").filter({ hasText: "Chicken bowl" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("entry").filter({ hasText: "Chicken bowl" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("entry").filter({ hasText: "Chicken bowl" })).toHaveCount(1);

  // Delete "Typo" with a touch swipe; after the toast expires it stays gone.
  const typo = page.getByTestId("entry").filter({ hasText: "Typo" });
  const box = (await typo.boundingBox())!;
  const li = typo.locator("xpath=..");
  const y = box.y + box.height / 2;
  await li.dispatchEvent("pointerdown", { pointerType: "touch", clientX: box.x + box.width - 10, clientY: y, isPrimary: true });
  await li.dispatchEvent("pointermove", { pointerType: "touch", clientX: box.x + box.width - 160, clientY: y, isPrimary: true });
  await li.dispatchEvent("pointerup", { pointerType: "touch", clientX: box.x + box.width - 160, clientY: y, isPrimary: true });
  await expect(page.getByTestId("undo-toast")).toContainText("Typo");
  await expect(page.getByTestId("undo-toast")).toBeHidden({ timeout: 7000 });
  await page.reload();
  await expect(page.getByTestId("entry").filter({ hasText: "Typo" })).toHaveCount(0);
  await expect(page.getByTestId("kcal-eaten")).toHaveText(`950 eaten / ${expected.kcal}`);

  // 1:30 AM local on the phone → counts toward the previous day.
  const lateNight = instantAt(serverToday, 1, 30, LA);
  await page.clock.setFixedTime(lateNight);
  await page.reload();
  await addFood(page, { name: "Late snack", kcal: "200", protein: "10" });
  await expect(page.getByTestId("entry").filter({ hasText: "Late snack" })).toHaveCount(0); // not on today
  await page.goto(`/?date=${addDays(serverToday, -1)}`);
  await expect(page.getByTestId("day-title")).toHaveText("Yesterday");
  await expect(page.getByTestId("meal-snack").getByTestId("entry")).toHaveText(/Late snack/);
  await expect(page.getByTestId("kcal-eaten")).toHaveText("200 eaten");

  // Future days are not reachable.
  await page.goto(`/?date=${addDays(serverToday, 3)}`);
  await expect(page.getByTestId("day-title")).toHaveText("Today");

  // Not an admin.
  expect((await page.goto("/admin"))?.status()).toBe(404);
  await ctx.close();
});

test("user B (NY, kg, bulk → midnight, carbs required) sees only their own data", async ({ browser }) => {
  expect((await resetUser(B, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: NY });
  const page = await ctx.newPage();
  await signIn(page, B);
  await page.getByLabel("Sex", { exact: true }).selectOption("female");
  await page.getByLabel("Birth date").fill("1995-06-01");
  await page.getByLabel("Height unit").selectOption("cm");
  await page.getByLabel("Height cm").fill("165");
  await page.getByLabel("Weight unit").selectOption("kg");
  await page.getByLabel("Weight", { exact: true }).fill("60");
  await page.getByLabel("Activity").selectOption("light");
  await page.getByLabel("Goal").selectOption("bulk");
  await page.getByRole("button", { name: "Start logging" }).click();
  await expect(page.getByTestId("empty-day")).toBeVisible();

  // Settings: midnight day end, carbs required, protein 2 g/kg
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Day ends at").selectOption("0");
  await page.getByLabel("Carbs").check();
  await page.getByLabel("Protein rule").selectOption("per_kg");
  await page.getByLabel("Amount").fill("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByTestId("suggested")).toContainText("120 g protein");
  await page.getByRole("link", { name: "Done" }).click();

  const sheet = await addFood(page, { name: "Oats", kcal: "300", protein: "10" });
  await expect(sheet.getByText("Required.")).toBeVisible(); // carbs now required
  await sheet.getByLabel(/^Carbs g/).fill("54");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("entry")).toHaveCount(1);

  // B never sees A's entries, on any day.
  const nyToday = localDate(new Date(), NY).date;
  for (const d of [nyToday, addDays(nyToday, -1), addDays(nyToday, -2)]) {
    await page.goto(`/?date=${d}`);
    await expect(page.getByText(/Chicken bowl|Protein shake|Late snack/)).toHaveCount(0);
  }
  await ctx.close();

  // And at the API level: B's own token reads only B's rows, even though A's exist.
  const { data: all } = await admin.from("entries").select("user_id");
  expect(new Set((all ?? []).map((r) => r.user_id)).size).toBeGreaterThanOrEqual(2);
  const sb = localSupabaseEnv();
  const asB = createClient(sb.API_URL, sb.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: login } = await asB.auth.signInWithPassword({ email: B, password: PASSWORD });
  const { data: mine } = await asB.from("entries").select("user_id, name");
  expect(mine?.length).toBe(1);
  expect(mine?.every((r) => r.user_id === login.user?.id)).toBe(true);
  const { data: invites } = await asB.from("invites").select("*");
  expect(invites ?? []).toEqual([]);
});
