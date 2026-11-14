import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { localSupabaseEnv } from "./local-env";
import { admin, onboard, resetUser, signIn, userId } from "./helpers";

// The Claude connector end to end against the real local Supabase OAuth 2.1 server:
// dynamic client registration → consent page → code + PKCE → token → MCP tools → revoke.
const sb = localSupabaseEnv();
const APP = "http://127.0.0.1:3100";
const MCP = `${APP}/api/mcp`;
const CALLBACK = "http://127.0.0.1:3999/callback"; // stands in for https://claude.ai/api/mcp/auth_callback
const J = "jules@e2e.test";
const K = "kai@e2e.test";
const LA = "America/Los_Angeles";

test.describe.configure({ mode: "serial" });

const b64url = (b: Buffer) => b.toString("base64url");

async function registerClient(name: string, redirect = CALLBACK) {
  const res = await fetch(`${sb.API_URL}/auth/v1/oauth/clients/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(res.status, await res.clone().text()).toBeLessThan(300);
  return (await res.json()) as { client_id: string };
}

/** Runs the browser half of the OAuth flow as a signed-in user and returns an access token. */
async function connect(page: Page, clientId: string, opts: { approve: boolean } = { approve: true }) {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(8));
  let callback: URL | null = null;
  await page.route("http://127.0.0.1:3999/**", async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, body: "back in Claude" });
  });
  const authorize = new URL(`${sb.API_URL}/auth/v1/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code", client_id: clientId, redirect_uri: CALLBACK, code_challenge: challenge,
    code_challenge_method: "S256", state, scope: "email", resource: MCP,
  })) authorize.searchParams.set(k, v);
  await page.goto(authorize.toString());
  await expect(page).toHaveURL(/\/oauth\/consent\?authorization_id=/);
  await expect(page.getByTestId("consent-title")).toContainText("Allow");
  await page.getByRole("button", { name: opts.approve ? "Allow" : "Deny" }).click();
  await expect.poll(() => callback !== null, { timeout: 15_000 }).toBe(true);
  const cb = callback as unknown as URL;
  expect(cb.searchParams.get("state")).toBe(state);
  if (!opts.approve) return { denied: cb.searchParams.get("error") };
  const code = cb.searchParams.get("code");
  expect(code).toBeTruthy();
  const tok = await fetch(`${sb.API_URL}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: code!, redirect_uri: CALLBACK, client_id: clientId, code_verifier: verifier }),
  });
  const body = await tok.json();
  expect(tok.status, JSON.stringify(body)).toBe(200);
  return { token: body.access_token as string };
}

async function mcp(token: string) {
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { error: r.isError ? r.content[0].text : null, data: r.isError ? null : JSON.parse(r.content[0].text) };
}

async function setup(browser: Browser, email: string) {
  expect((await resetUser(email, { invite: true })).error).toBeNull();
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, email);
  await onboard(page);
  return { ctx, page };
}

test("discovery: /api/mcp asks for sign-in and points at Supabase Auth", async ({ request }) => {
  const res = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(res.status()).toBe(401);
  const www = res.headers()["www-authenticate"];
  expect(www).toContain(`resource_metadata="${APP}/.well-known/oauth-protected-resource/api/mcp"`);
  const meta = await (await request.get("/.well-known/oauth-protected-resource/api/mcp")).json();
  expect(meta).toMatchObject({ resource: MCP, authorization_servers: [`${sb.API_URL}/auth/v1`] });
  const root = await (await request.get("/.well-known/oauth-protected-resource")).json();
  expect(root.resource).toBe(MCP);
  // A normal app session token (no OAuth client) is refused.
  const anonClient = createClient(sb.API_URL, sb.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await resetUser("plain@e2e.test", { invite: true });
  const { data } = await anonClient.auth.signInWithPassword({ email: "plain@e2e.test", password: "e2e-local-only-pw-1!" });
  const res2 = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    headers: { Authorization: `Bearer ${data.session!.access_token}`, Accept: "application/json, text/event-stream" },
  });
  expect(res2.status()).toBe(401);
});

test("Claude connects, logs food/weight/workout, edits; Today matches; no duplicates; limits hold", async ({ browser }) => {
  const { ctx, page } = await setup(browser, J);
  const uid = await userId(J);
  const { client_id } = await registerClient("Claude");
  const denied = await connect(page, client_id, { approve: false });
  expect(denied).toEqual({ denied: "access_denied" });
  await page.unrouteAll();
  const { token } = (await connect(page, client_id)) as { token: string };
  const claude = await mcp(token);

  const tools = (await claude.listTools()).tools.map((t) => t.name).sort();
  expect(tools).toEqual(["edit_entry", "get_day", "list_recent_foods", "log_food", "log_weight", "log_workout"]);

  await page.goto("/");
  const leftBefore = await page.getByTestId("kcal-left").innerText();

  // "I had 2 eggs and toast" → one entry via Claude; retrying the same call adds nothing.
  const entryId = crypto.randomUUID();
  const eggs = { name: "2 eggs and toast", kcal: 290, protein_g: 17, meal: "breakfast", entry_id: entryId, notes: "large eggs, 1 slice" };
  const first = await call(claude, "log_food", eggs);
  expect(first.error).toBeNull();
  expect(first.data.saved).toMatchObject({ name: "2 eggs and toast", kcal: 290, via: "claude", fat_g: null });
  expect((await call(claude, "log_food", eggs)).error).toBeNull();
  const { count } = await admin.from("entries").select("*", { count: "exact", head: true }).eq("user_id", uid);
  expect(count).toBe(1);
  const { data: row } = await admin.from("entries").select("source, oauth_client_id").eq("id", entryId).single();
  expect(row).toEqual({ source: "claude", oauth_client_id: client_id });

  // Required-macro rules apply (protein is required by default).
  expect((await call(claude, "log_food", { name: "mystery", kcal: 100 })).error).toMatch(/protein_g/);

  // Fix it with edit_entry.
  const edited = await call(claude, "edit_entry", { entry_id: entryId, kcal: 310 });
  expect(edited.data.updated.kcal).toBe(310);

  // Weight + workout.
  expect((await call(claude, "log_weight", { weight: 179.4 })).data.saved).toMatchObject({ value: 179.4, unit: "lb" });
  const wk = await call(claude, "log_workout", { type: "Push day", minutes: 45, kcal: 250, workout_id: crypto.randomUUID() });
  expect(wk.data.saved).toMatchObject({ type: "Push day", minutes: 45, kcal: 250 });

  // get_day matches the Today screen; the workout doesn't move the target.
  const day = (await call(claude, "get_day")).data;
  expect(day.eaten.kcal).toBe(310);
  expect(day.entries).toHaveLength(1);
  expect(day.workouts).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("kcal-eaten")).toContainText("310 eaten");
  await expect(page.getByTestId("kcal-left")).toHaveText(String(day.left.kcal));
  expect(Number(leftBefore.replace(/[^\d-]/g, "")) - 310).toBe(day.left.kcal);
  await expect(page.getByTestId("entry")).toContainText("via Claude");
  await expect(page.getByTestId("workout")).toContainText("Push day");
  await expect(page.getByTestId("workout")).toContainText("via Claude");
  await expect(page.getByTestId("burned")).toContainText("Burned 250 kcal · not added to your calorie target");
  await expect(page.getByTestId("weight-line")).toContainText("179.4 lb");

  // Saved foods are readable.
  expect(Array.isArray((await call(claude, "list_recent_foods")).data.foods)).toBe(true);

  // Even talking to Supabase directly with Claude's token: no deletes, no settings changes.
  const direct = createClient(sb.API_URL, sb.PUBLISHABLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  await direct.from("entries").delete().eq("id", entryId);
  await direct.from("profiles").update({ goal: "bulk" }).eq("user_id", uid);
  const soft = await direct.from("entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId);
  expect(soft.error).not.toBeNull();
  const { error: delAcct } = await direct.rpc("delete_my_account");
  expect(delAcct?.message).toContain("not_from_connected_app");
  const { data: still } = await admin.from("entries").select("deleted_at").eq("id", entryId).single();
  expect(still?.deleted_at).toBeNull();
  const { data: prof } = await admin.from("profiles").select("goal").eq("user_id", uid).single();
  expect(prof?.goal).toBe("cut");
  await claude.close();
  await ctx.close();
});

test("a second user's Claude sees none of the first user's data", async ({ browser }) => {
  const { ctx, page } = await setup(browser, K);
  const { client_id } = await registerClient("Claude");
  const { token } = (await connect(page, client_id)) as { token: string };
  const claude = await mcp(token);
  const day = (await call(claude, "get_day")).data;
  expect(day.entries).toHaveLength(0);
  expect(day.workouts).toHaveLength(0);
  const { data: jEntry } = await admin.from("entries").select("id").eq("user_id", await userId(J)).single();
  const r = await call(claude, "edit_entry", { entry_id: jEntry!.id, kcal: 1 });
  expect(r.error).toMatch(/No entry with that id/);
  await claude.close();
  await ctx.close();
});

test("disconnecting in Settings stops Claude on the next call", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, J);
  const { client_id } = await registerClient("Claude");
  const { token } = (await connect(page, client_id)) as { token: string };
  const claude = await mcp(token);
  expect((await call(claude, "get_day")).error).toBeNull();

  await page.goto("/settings");
  await expect(page.getByTestId("mcp-url")).toHaveText(MCP);
  await expect(page.getByTestId("connected-app").first()).toContainText("Claude");
  for (let i = await page.getByTestId("connected-app").count(); i > 0; i--) {
    await page.getByRole("button", { name: "Disconnect Claude" }).first().click();
    await expect(page.getByTestId("connected-app")).toHaveCount(i - 1);
  }
  await expect(page.getByTestId("no-connected-apps")).toBeVisible();
  await expect(call(claude, "get_day")).rejects.toThrow();
  const res = await fetch(MCP, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
  });
  expect(res.status).toBe(401);
  await ctx.close();
});

test("workouts in the app: add, edit, delete + undo; target unchanged", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: LA, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, K);
  const left = await page.getByTestId("kcal-left").innerText();
  await page.getByTestId("add-workout").click();
  const sheet = page.getByRole("dialog", { name: "Add workout" });
  await sheet.getByLabel("Type").fill("5k run");
  await sheet.getByLabel("Minutes").fill("0");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Minutes must be 1–600.")).toBeVisible();
  await sheet.getByLabel("Minutes").fill("28");
  await sheet.getByLabel("Calories burned (optional)").fill("320");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("workout")).toContainText("5k run");
  await expect(page.getByTestId("kcal-left")).toHaveText(left);

  await page.getByTestId("workout").click();
  const edit = page.getByRole("dialog", { name: "Edit workout" });
  await edit.getByLabel("Minutes").fill("30");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("workout")).toContainText("30 min");

  await page.getByTestId("workout").click();
  await page.getByRole("dialog", { name: "Edit workout" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("workout")).toHaveCount(0);
  await page.getByTestId("workout-undo").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("workout")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("workout")).toContainText("30 min");
  const { data } = await admin.from("workouts").select("source, minutes, kcal").eq("user_id", await userId(K)).is("deleted_at", null);
  expect(data).toEqual([{ source: "app", minutes: 30, kcal: 320 }]);
  await ctx.close();
});

test("lock-down: an app named Claude that returns anywhere else gets no Allow button and no token", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: LA });
  const page = await ctx.newPage();
  await signIn(page, J);
  let leaked = false;
  await page.route("https://evil.test/**", async (route) => { leaked = true; await route.fulfill({ status: 200, body: "phished" }); });
  const evil = await registerClient("Claude", "https://evil.test/api/mcp/auth_callback");
  const authorizeUrl = (clientId: string, redirect: string) => {
    const u = new URL(`${sb.API_URL}/auth/v1/oauth/authorize`);
    u.search = new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: redirect,
      code_challenge: b64url(createHash("sha256").update("v".repeat(43)).digest()), code_challenge_method: "S256", state: "s",
    }).toString();
    return u.toString();
  };
  await page.goto(authorizeUrl(evil.client_id, "https://evil.test/api/mcp/auth_callback"));
  await expect(page.getByTestId("consent-blocked")).toHaveText("This app isn't allowed");
  await expect(page.getByText("evil.test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
  const evilAuthId = new URL(page.url()).searchParams.get("authorization_id")!;

  // Forged post: open a legit request, swap in the evil request's id, press Allow.
  const good = await registerClient("Claude");
  await page.goto(authorizeUrl(good.client_id, CALLBACK));
  await expect(page.getByTestId("consent-title")).toBeVisible();
  await page.locator("input[name=authorization_id]").evaluate((el, v) => ((el as HTMLInputElement).value = v), evilAuthId);
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByTestId("consent-blocked")).toBeVisible();
  expect(leaked).toBe(false);
  expect(page.url()).not.toContain("evil.test");
  await ctx.close();
});
