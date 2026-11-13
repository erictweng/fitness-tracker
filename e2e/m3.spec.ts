import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../src/lib/domain/day";
import { suggestTargets } from "../src/lib/domain/targets";
import { ftInToCm, kgToLb, lbToKg } from "../src/lib/domain/units";
import { admin, localDate, onboard, resetUser, signIn } from "./helpers";

const F = "frank@e2e.test";
const G = "gina@e2e.test";
const LA = "America/Los_Angeles";

test.describe.configure({ mode: "serial" });

async function weighIn(page: Page, date: string, value: string) {
  await page.getByLabel("Day", { exact: true }).fill(date);
  await page.getByLabel("Weight", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save weigh-in" }).click();
  await expect(page.getByTestId("undo-toast")).toContainText(new RegExp(`(Saved ${value}|Replaced)`));
}

async function backdateTargets(email: string, days: number, today: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const id = data.users.find((u) => u.email === email)!.id;
  const { error } = await admin.from("targets").update({ effective_from: addDays(today, -days) }).eq("user_id", id);
  if (error) throw error;
}

test("lb user: weigh-ins, 7-day average, replace + undo, weekly suggestion accept", async ({ browser }) => {
  expect((await resetUser(F, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, F);
  await onboard(page); // 180 lb today, 1 g/lb → 180 g protein
  const now = localDate(new Date(), LA);
  const today = now.hour < 3 ? addDays(now.date, -1) : now.date;
  await expect(page.getByTestId("weight-line")).toContainText("180.0 lb");
  await expect(page.getByTestId("suggestion")).toHaveCount(0); // targets were set this week

  await page.getByTestId("weight-line").click();
  await expect(page).toHaveURL(/\/weight$/);
  await expect(page.getByTestId("avg-weight")).toHaveText("—");

  // 9 earlier days, falling 0.5 lb/day: day -9 = 184.5 … day -1 = 180.5; today = 180 (onboarding)
  for (let i = 9; i >= 1; i--) await weighIn(page, addDays(today, -i), (180 + 0.5 * i).toFixed(1));
  await page.reload();
  await expect(page.getByTestId("weigh-ins").locator("li")).toHaveCount(10);
  // window today-6..today: 183, 182.5, …, 180 → average 181.5
  await expect(page.getByTestId("avg-weight")).toHaveText("181.5");
  await expect(page.getByTestId("weight-chart")).toBeVisible();

  // Same day again replaces the value; Undo puts the old one back.
  await weighIn(page, today, "179.0");
  await expect(page.getByTestId("undo-toast")).toContainText("Replaced 180.0 lb");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.reload();
  await expect(page.getByTestId("latest-weight")).toHaveText("180.0");
  await expect(page.getByTestId("weigh-ins").locator("li")).toHaveCount(10);

  // Delete one day, Undo restores it.
  await page.getByRole("button", { name: `Delete ${addDays(today, -1)}` }).click();
  await expect(page.getByTestId("undo-toast")).toContainText("Deleted 180.5 lb");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.reload();
  await expect(page.getByTestId("weigh-ins").locator("li")).toHaveCount(10);

  // Future weigh-ins are refused.
  await page.getByLabel("Day", { exact: true }).evaluate((el: HTMLInputElement) => el.removeAttribute("max"));
  await page.getByLabel("Day", { exact: true }).fill(addDays(today, 3));
  await page.getByLabel("Weight", { exact: true }).fill("170");
  await page.getByRole("button", { name: "Save weigh-in" }).click();
  await expect(page.getByText("Can't weigh in on a future day.")).toBeVisible();

  // Weekly suggestion: pretend targets were set two weeks ago.
  await backdateTargets(F, 14, today);
  const age = Number(today.slice(0, 4)) - 2000 - (today.slice(5) < "01-15" ? 1 : 0);
  const expected = suggestTargets({
    sex: "male", weightKg: lbToKg(181.5), heightCm: ftInToCm(5, 10), ageYears: age,
    activity: "moderate", goal: "cut", adjustKcal: -500, proteinRule: "per_lb", proteinValue: 1,
  });
  expect(expected.proteinG).toBe(182);
  await page.goto("/");
  const card = page.getByTestId("suggestion");
  await expect(card).toContainText(`${expected.kcal} kcal · 182 g protein`);
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("kcal-left")).toHaveText(String(expected.kcal));
  await expect(page.getByTestId("protein-left")).toHaveText("182g");
  // Yesterday keeps the old target.
  await page.goto(`/?date=${addDays(today, -1)}`);
  await expect(page.getByTestId("protein-left")).toHaveText("180g");
  await ctx.close();
});

test("kg user: averages in kg, g/kg protein, dismiss lasts the week, BMR floor", async ({ browser }) => {
  expect((await resetUser(G, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, G);
  await onboard(page);
  const now = localDate(new Date(), LA);
  const today = now.hour < 3 ? addDays(now.date, -1) : now.date;

  await page.goto("/settings");
  await page.getByLabel("Weight unit").selectOption("kg");
  await page.getByLabel("Protein rule").selectOption("per_kg");
  await page.getByLabel("Amount").fill("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/weight");
  for (const [d, v] of [[-2, "80.0"], [-1, "79.0"], [0, "78.0"]] as const) await weighIn(page, addDays(today, d), v);
  await page.reload();
  await expect(page.getByTestId("avg-weight")).toHaveText("79.0");
  await expect(page.getByTestId("latest-weight")).toHaveText("78.0");
  await page.goto("/settings");
  await expect(page.getByTestId("suggested")).toContainText("158 g protein"); // 2 × 79.0

  await backdateTargets(G, 10, today);
  await page.goto("/");
  await expect(page.getByTestId("weight-line")).toContainText("78.0 kg · 7-day avg 79.0");
  await page.getByTestId("suggestion").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("suggestion")).toHaveCount(0);

  // An aggressive cut is capped at resting burn.
  await page.goto("/settings");
  await page.getByLabel("Activity").selectOption("sedentary");
  await page.getByLabel(/Daily deficit/).fill("-1500");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByTestId("suggested")).toContainText("raised to your resting burn");
  expect(kgToLb(79)).toBeGreaterThan(0);
  await ctx.close();
});
