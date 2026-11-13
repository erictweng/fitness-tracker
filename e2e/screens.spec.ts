import { test } from "@playwright/test";
import { onboard, resetUser, signIn } from "./helpers";

// Phone screenshots for review. Opt-in: SCREENSHOTS_DIR=/abs/path npx playwright test e2e/screens.spec.ts
const dir = process.env.SCREENSHOTS_DIR;
test.skip(!dir, "set SCREENSHOTS_DIR to capture screenshots");

test("phone screenshots", async ({ browser }) => {
  await resetUser("erin@e2e.test", { invite: true });
  const ctx = await browser.newContext({ timezoneId: "America/Los_Angeles", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await signIn(page, "erin@e2e.test");
  await page.screenshot({ path: `${dir}/1-onboarding.png` });
  await onboard(page);
  await page.goto("/foods");
  for (const [name, serving, grams, kcal, p] of [["Greek yogurt", "1 cup", "", "150", "15"], ["Rice", "100 g", "100", "130", "2.7"], ["Chicken breast", "100 g", "100", "165", "31"]]) {
    await page.getByRole("button", { name: "+ New food" }).click();
    const d = page.getByRole("dialog", { name: "New food" });
    await d.getByLabel("Name").fill(name);
    await d.getByLabel("Serving (e.g. 1 cup)").fill(serving);
    if (grams) await d.getByLabel(/Serving weight g/).fill(grams);
    await d.getByLabel("Calories").fill(kcal);
    await d.getByLabel(/^Protein g/).fill(p);
    await d.getByRole("button", { name: "Save food" }).click();
    await d.waitFor({ state: "hidden" });
  }
  await page.getByRole("button", { name: "+ New meal" }).click();
  const m = page.getByRole("dialog", { name: "New meal" });
  await m.getByLabel("Meal name").fill("Chicken & rice");
  await m.getByLabel("Add a food to this meal").selectOption({ label: "Chicken breast" });
  await m.getByLabel("Add a food to this meal").selectOption({ label: "Rice" });
  await m.getByLabel("Servings of Chicken breast").fill("2");
  await m.getByLabel("Servings of Rice").fill("2");
  await m.getByRole("button", { name: "Save meal" }).click();
  await m.waitFor({ state: "hidden" });
  await page.screenshot({ path: `${dir}/5-foods.png`, fullPage: true });
  await page.goto("/");
  await page.getByTestId("add-food").click();
  await page.getByTestId("meals").getByRole("button", { name: /Chicken & rice/ }).click();
  await page.getByRole("button", { name: "Log meal" }).click();
  await page.getByTestId("add-food").click();
  await page.getByTestId("food-option").filter({ hasText: "Greek yogurt" }).first().click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("add-food").click();
  await page.screenshot({ path: `${dir}/3-add-sheet.png` });
  await page.getByTestId("food-option").filter({ hasText: "Rice" }).first().click();
  await page.getByLabel("Unit").selectOption("grams");
  await page.getByLabel("Amount").fill("180");
  await page.screenshot({ path: `${dir}/4-amount.png` });
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({ path: `${dir}/2-today.png` });
  await page.goto("/weight");
  for (let i = 9; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    await page.getByLabel("Day", { exact: true }).fill(d);
    const v = (180 + 0.4 * i + (i % 3) * 0.3).toFixed(1);
    await page.getByLabel("Weight", { exact: true }).fill(v);
    await page.getByRole("button", { name: "Save weigh-in" }).click();
    await page.getByTestId("undo-toast").filter({ hasText: `Saved ${v}` }).waitFor();
  }
  await page.reload();
  await page.screenshot({ path: `${dir}/7-weight.png`, fullPage: true });
  await page.goto("/settings");
  await page.screenshot({ path: `${dir}/6-settings.png`, fullPage: true });
  await ctx.close();
});
