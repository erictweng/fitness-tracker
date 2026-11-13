import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { addDays } from "../src/lib/domain/day";
import { localDate, onboard, PASSWORD, resetUser, signIn } from "./helpers";
import { localSupabaseEnv } from "./local-env";

const C = "carol@e2e.test";
const D = "dave@e2e.test";
const LA = "America/Los_Angeles";

test.describe.configure({ mode: "serial" });

const eaten = (page: Page) => page.getByTestId("kcal-eaten");
const entries = (page: Page) => page.getByTestId("entry");

async function newFood(page: Page, f: { name: string; serving?: string; grams?: string; kcal: string; protein: string; carbs?: string }) {
  await page.goto("/foods");
  await page.getByRole("button", { name: "+ New food" }).click();
  const d = page.getByRole("dialog", { name: "New food" });
  await d.getByLabel("Name").fill(f.name);
  if (f.serving) await d.getByLabel("Serving (e.g. 1 cup)").fill(f.serving);
  if (f.grams) await d.getByLabel(/Serving weight g/).fill(f.grams);
  await d.getByLabel("Calories").fill(f.kcal);
  await d.getByLabel(/^Protein g/).fill(f.protein);
  if (f.carbs) await d.getByLabel(/^Carbs g/).fill(f.carbs);
  await d.getByRole("button", { name: "Save food" }).click();
  await expect(d).toBeHidden();
}

test("saved foods & meals: 3-tap re-log, grams, history snapshot, meals, archive", async ({ browser }) => {
  expect((await resetUser(C, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, C);
  await onboard(page);
  const now = localDate(new Date(), LA);
  const today = now.hour < 3 ? addDays(now.date, -1) : now.date;
  const yesterday = addDays(today, -1);

  // Quick add + "Save as food"
  await page.getByTestId("add-food").click();
  await page.getByTestId("quick-add").click();
  let sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet.getByLabel("Name (optional)").fill("Greek yogurt");
  await sheet.getByLabel("Calories").fill("150");
  await sheet.getByLabel(/^Protein g/).fill("15");
  await sheet.getByLabel(/Save as food/).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(entries(page)).toHaveCount(1);

  await newFood(page, { name: "Rice", serving: "100 g", grams: "100", kcal: "130", protein: "2.7", carbs: "28" });
  await expect(page.getByTestId("manage-foods")).toContainText("Greek yogurt");
  await expect(page.getByTestId("manage-foods")).toContainText("Rice");
  await page.goto("/");

  // Re-log a saved food in exactly 3 taps: + → food → Add
  await page.getByTestId("add-food").click(); // 1
  await expect(page.getByTestId("recents").getByTestId("food-option").first()).toContainText("Greek yogurt");
  await page.getByTestId("recents").getByTestId("food-option").filter({ hasText: "Greek yogurt" }).click(); // 2
  await page.getByRole("button", { name: "Add", exact: true }).click(); // 3
  await expect(entries(page)).toHaveCount(2);
  await expect(eaten(page)).toContainText("300 eaten");

  // By grams: 180 g of rice at 130 kcal / 100 g = 234 kcal
  await page.getByTestId("add-food").click();
  await page.getByLabel("Search your foods").fill("ric");
  await page.getByTestId("saved-foods").getByTestId("food-option").filter({ hasText: "Rice" }).click();
  await page.getByLabel("Unit").selectOption("grams");
  await page.getByLabel("Amount").fill("180");
  await expect(page.getByTestId("amount-preview")).toHaveText("234 kcal · 4.9g protein");
  await page.getByRole("button", { name: "Add", exact: true }).dblclick(); // double tap still logs once
  await expect(entries(page)).toHaveCount(3);
  await expect(eaten(page)).toContainText("534 eaten");

  // Yesterday: one serving of rice
  await page.goto(`/?date=${yesterday}`);
  await page.getByTestId("add-food").click();
  await page.getByTestId("food-option").filter({ hasText: "Rice" }).first().click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(eaten(page)).toHaveText("130 eaten");

  // Editing the saved food never rewrites history
  await page.goto("/foods");
  await page.getByTestId("manage-foods").getByRole("button", { name: /Rice/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit food" });
  await edit.getByLabel("Calories").fill("200");
  await edit.getByRole("button", { name: "Save food" }).click();
  await expect(page.getByTestId("manage-foods")).toContainText("100 g · 200 kcal");
  await page.goto(`/?date=${yesterday}`);
  await expect(eaten(page)).toHaveText("130 eaten");
  await page.goto("/");
  await expect(eaten(page)).toContainText("534 eaten");

  // Meal: yogurt × 1 + rice × 1.5 (now 200 kcal/serving) = 150 + 300 = 450
  await page.goto("/foods");
  await page.getByRole("button", { name: "+ New meal" }).click();
  const m = page.getByRole("dialog", { name: "New meal" });
  await m.getByLabel("Meal name").fill("Usual breakfast");
  await m.getByLabel("Add a food to this meal").selectOption({ label: "Greek yogurt" });
  await m.getByLabel("Add a food to this meal").selectOption({ label: "Rice" });
  await m.getByLabel("Servings of Rice").fill("1.5");
  await m.getByRole("button", { name: "Save meal" }).click();
  await expect(page.getByTestId("manage-meals")).toContainText("Greek yogurt × 1, Rice × 1.5");
  await page.goto("/");
  await page.getByTestId("add-food").click();
  await page.getByTestId("meals").getByRole("button", { name: /Usual breakfast/ }).click();
  await expect(page.getByTestId("meal-confirm")).toContainText("Total 450 kcal");
  await page.getByRole("button", { name: "Log meal" }).click();
  await expect(entries(page)).toHaveCount(5);
  await expect(eaten(page)).toContainText("984 eaten");

  // Archive rice: gone from pickers, but the meal still logs and says (archived)
  await page.goto("/foods");
  await page.getByTestId("manage-foods").locator("li").filter({ hasText: "Rice" }).getByRole("button", { name: "Archive" }).click();
  await expect(page.getByTestId("manage-foods")).not.toContainText("Rice");
  await page.goto("/");
  await page.getByTestId("add-food").click();
  await expect(page.getByTestId("saved-foods")).not.toContainText("Rice");
  await expect(page.getByTestId("recents")).not.toContainText("Rice");
  await page.getByTestId("meals").getByRole("button", { name: /Usual breakfast/ }).click();
  await expect(page.getByTestId("meal-confirm")).toContainText("(archived)");
  await page.getByRole("button", { name: "Log meal" }).click();
  await expect(entries(page)).toHaveCount(7);

  // Quick add with "Save as food" but no name is refused with a clear message
  await page.getByTestId("add-food").click();
  await page.getByTestId("quick-add").click();
  sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet.getByLabel("Calories").fill("50");
  await sheet.getByLabel(/^Protein g/).fill("1");
  await sheet.getByLabel(/Save as food/).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Name it to save it as a food.")).toBeVisible();
  await ctx.close();
});

test("another user can't see or use carol's foods and meals", async () => {
  expect((await resetUser(D, { invite: true })).error).toBeNull();
  const sb = localSupabaseEnv();
  const asD = createClient(sb.API_URL, sb.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await asD.auth.signInWithPassword({ email: D, password: PASSWORD });
  const [{ data: foods }, { data: meals }, { data: items }] = await Promise.all([
    asD.from("foods").select("id"),
    asD.from("meals").select("id"),
    asD.from("meal_items").select("id"),
  ]);
  expect(foods).toEqual([]);
  expect(meals).toEqual([]);
  expect(items).toEqual([]);
});
