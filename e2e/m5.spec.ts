import { expect, test, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { addDays } from "../src/lib/domain/day";
import { admin, instantAt, localDate, onboard, resetUser, signIn, userId } from "./helpers";

// M5: WHOOP, against the fake WHOOP in e2e/fake-whoop.mjs (started by playwright.config.ts).
const W = "wanda@e2e.test";
const LA = "America/Los_Angeles";
const FAKE = "http://127.0.0.1:3199";

test.describe.configure({ mode: "serial" });
test.use({ timezoneId: LA });

function serverToday() {
  const now = localDate(new Date(), LA);
  return now.hour < 3 ? addDays(now.date, -1) : now.date;
}
const fake = (path: string, body?: unknown) =>
  fetch(`${FAKE}${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());

/** Yesterday finished (2,500 kcal), today in progress (1,000 so far); one scored + one unscored workout today. */
function whoopData(today: string) {
  const y = addDays(today, -1);
  const iso = (d: string, h: number, m = 0) => instantAt(d, h, m, LA).toISOString();
  return {
    cycles: [
      { id: 1, start: iso(y, 7), end: iso(today, 6, 30), score_state: "SCORED", score: { kilojoule: 10460 } },
      { id: 2, start: iso(today, 6, 30), end: null, score_state: "SCORED", score: { kilojoule: 4184 } },
    ],
    workouts: [
      { id: "wk-run", start: iso(today, 8), end: iso(today, 8, 30), sport_name: "running", score_state: "SCORED", score: { kilojoule: 1255.2, strain: 8.04 } },
      { id: "wk-lift", start: iso(today, 9), end: iso(today, 9, 50), sport_name: "weightlifting", score_state: "PENDING_SCORE" },
    ],
  };
}

async function connect(page: Page) {
  await page.goto("/settings");
  await page.getByTestId("whoop-connect").click();
  await page.waitForURL(/\/settings\?whoop=/);
}

test("connect WHOOP: tokens stored encrypted, last days imported, Today shows burned and eaten − burned", async ({ page }) => {
  await fake("/__reset");
  const today = serverToday();
  await fake("/__config", { ...whoopData(today), pageSize: 1 }); // pageSize 1: exercises next_token paging
  expect((await resetUser(W, { invite: true })).error).toBeNull();
  await signIn(page, W);
  await onboard(page);

  await connect(page);
  await expect(page.getByTestId("whoop-result")).toHaveText("WHOOP connected. Your last 30 days were imported.");
  await expect(page.getByTestId("whoop-connected")).toContainText("Connected · last synced just now");

  // Only read-only scopes (+ offline for refresh) were asked for, with our callback.
  const st = await fake("/__state");
  expect(st.authorize[0].scope).toBe("offline read:cycles read:workout");
  expect(st.authorize[0].redirect_uri).toBe("http://127.0.0.1:3100/whoop/callback");
  expect(st.authorize[0].state.length).toBeGreaterThanOrEqual(8);

  // Tokens at rest are ciphertext, not the WHOOP tokens.
  const uid = await userId(W);
  const { data: conn } = await admin.from("whoop_connections").select("access_token, refresh_token").eq("user_id", uid).single();
  expect(conn!.access_token.startsWith("v1:")).toBe(true);
  expect(conn!.access_token).not.toContain("fake-access");
  expect(conn!.refresh_token).not.toContain("fake-refresh");

  // Today: WHOOP burn so far and eaten − burned (nothing eaten yet → −1000). Target unchanged.
  await page.goto("/");
  await expect(page.getByTestId("whoop-burned")).toHaveText("Burned 1,000 kcal so far");
  await expect(page.getByTestId("net-kcal")).toHaveText("-1000");
  await expect(page.getByTestId("workout")).toHaveCount(2);
  await expect(page.getByTestId("workout").filter({ hasText: "Running" })).toContainText("30 min · via WHOOP · Strain 8.0");
  await expect(page.getByTestId("workout").filter({ hasText: "Running" })).toContainText("300 kcal");
  await expect(page.getByTestId("workout").filter({ hasText: "Weightlifting" })).toContainText("—"); // unscored = unknown
  await expect(page.getByTestId("burned")).toContainText("Burn comes from WHOOP");

  // Yesterday: finished day.
  await page.goto(`/?date=${addDays(today, -1)}`);
  await expect(page.getByTestId("whoop-burned")).toHaveText("Burned 2,500 kcal");
});

test("re-sync fills in newly scored numbers without duplicating; deleted WHOOP workouts stay deleted", async ({ page }) => {
  const today = serverToday();
  const d = whoopData(today);
  d.workouts[1] = { ...d.workouts[1], score_state: "SCORED", score: { kilojoule: 2092, strain: 11.2 } } as (typeof d.workouts)[number];
  d.cycles[1] = { ...d.cycles[1], score: { kilojoule: 6276 } };
  await fake("/__config", d);
  await signIn(page, W);
  await page.goto("/settings");
  await page.getByTestId("whoop-sync").click();
  await expect(page.getByTestId("whoop-sync-msg")).toHaveText("Synced.");
  await page.goto("/");
  await expect(page.getByTestId("whoop-burned")).toHaveText("Burned 1,500 kcal so far");
  await expect(page.getByTestId("workout")).toHaveCount(2);
  await expect(page.getByTestId("workout").filter({ hasText: "Weightlifting" })).toContainText("500 kcal");

  // Delete the run, sync again: it doesn't come back.
  await page.getByTestId("workout").filter({ hasText: "Running" }).click();
  await page.getByRole("dialog", { name: "Edit workout" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("workout")).toHaveCount(1);
  await page.waitForTimeout(500);
  await page.goto("/settings");
  await page.getByTestId("whoop-sync").click();
  await expect(page.getByTestId("whoop-sync-msg")).toHaveText("Synced.");
  await page.goto("/");
  await expect(page.getByTestId("workout")).toHaveCount(1);
  const { count } = await admin.from("workouts").select("*", { count: "exact", head: true }).eq("user_id", await userId(W)).eq("source", "whoop");
  expect(count).toBe(2);
});

test("expired access token is refreshed, and the rotated refresh token is the one kept", async ({ page }) => {
  await fake("/__config", { expiresIn: 60 }); // < 2 min left → every sync refreshes
  await signIn(page, W);
  // Reconnect so the stored token expires in 60 s.
  await page.goto("/settings");
  await page.getByTestId("whoop-disconnect").click();
  await expect(page.getByTestId("whoop-connect")).toBeVisible();
  await connect(page);
  await expect(page.getByTestId("whoop-result")).toHaveText(/WHOOP connected/);
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("whoop-sync").click();
    await expect(page.getByTestId("whoop-sync-msg")).toHaveText("Synced.");
    await page.reload();
  }
  const st = await fake("/__state");
  const grants = st.token.map((t: { grant_type: string }) => t.grant_type);
  // connect (code) + its first sync (refresh) + two syncs (refresh each) — the second refresh only
  // succeeds if the first rotation was saved.
  expect(grants.filter((g: string) => g === "refresh_token").length).toBeGreaterThanOrEqual(3);
  expect(st.token.filter((t: { grant_type: string }) => t.grant_type === "refresh_token").every((t: { scope: string }) => t.scope === "offline")).toBe(true);
  await expect(page.getByTestId("whoop-reconnect")).toHaveCount(0);
});

test("a revoked WHOOP shows a reconnect message instead of failing silently", async ({ page }) => {
  await fake("/__config", { access: null, refresh: null, expiresIn: 3600 }); // WHOOP side forgot us
  await signIn(page, W);
  await page.goto("/settings");
  await page.getByTestId("whoop-sync").click();
  await expect(page.getByTestId("whoop-sync-msg")).toHaveText("WHOOP access stopped working. Reconnect.");
  await page.reload();
  await expect(page.getByTestId("whoop-reconnect")).toBeVisible();
});

test("callback rejects a bad state and a denied sign-in", async ({ page }) => {
  await signIn(page, W);
  await page.goto("/whoop/callback?code=fake-code&state=not-the-right-state");
  await expect(page.getByTestId("whoop-result")).toHaveText("That WHOOP sign-in expired. Try Connect again.");
  await fake("/__config", { deny: true });
  await page.getByTestId("whoop-disconnect").click();
  await expect(page.getByTestId("whoop-connect")).toBeVisible();
  await connect(page);
  await expect(page.getByTestId("whoop-result")).toHaveText("WHOOP wasn't connected (access not allowed).");
  await expect(page.getByTestId("whoop-connect")).toBeVisible();
  await fake("/__config", { deny: false });
});

test("disconnect revokes at WHOOP and deletes the stored tokens; history stays", async ({ page }) => {
  await signIn(page, W);
  await connect(page);
  const before = (await fake("/__state")).revoked;
  await page.getByTestId("whoop-disconnect").click();
  await expect(page.getByTestId("whoop-connect")).toBeVisible();
  expect((await fake("/__state")).revoked).toBe(before + 1);
  const uid = await userId(W);
  const { count } = await admin.from("whoop_connections").select("*", { count: "exact", head: true }).eq("user_id", uid);
  expect(count).toBe(0);
  await page.goto(`/?date=${addDays(serverToday(), -1)}`);
  await expect(page.getByTestId("whoop-burned")).toHaveText("Burned 2,500 kcal");
  // Export includes the WHOOP days and workouts, never tokens.
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-link").click()]);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const days = strFromU8(files["whoop_days.csv"]);
  expect(days.split("\r\n")[0]).toBe("log_date,kcal,in_progress,updated_at");
  expect(days).toContain(`${addDays(serverToday(), -1)},2500,false`);
  expect(strFromU8(files["workouts.csv"])).toContain("wk-lift");
  expect(Object.values(files).map((f) => strFromU8(f)).join("")).not.toMatch(/fake-(access|refresh)|v1:/);
});

test("WHOOP data is private: another user sees none of it", async ({ page }) => {
  const O = "otto@e2e.test";
  expect((await resetUser(O, { invite: true })).error).toBeNull();
  await signIn(page, O);
  await onboard(page);
  await expect(page.getByTestId("energy")).toHaveCount(0);
  await page.goto(`/?date=${addDays(serverToday(), -1)}`);
  await expect(page.getByTestId("energy")).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByTestId("whoop-connect")).toBeVisible();
});
