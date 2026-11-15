// A tiny fake WHOOP (OAuth + v2 API) for the browser tests. Local only, port 3199.
// The app talks to it because playwright.config.ts sets WHOOP_OAUTH_BASE / WHOOP_API_BASE.
import http from "node:http";

const PORT = Number(process.env.FAKE_WHOOP_PORT || 3199);
const CLIENT_ID = "e2e-whoop-client";
const CLIENT_SECRET = "e2e-whoop-secret";

let s;
function reset() {
  s = {
    deny: false,
    expiresIn: 3600,
    pageSize: 25,
    cycles: [],
    workouts: [],
    n: 0,
    access: null,
    refresh: null,
    log: { authorize: [], token: [], api: [], revoked: 0 },
  };
}
reset();

function issue() {
  s.n += 1;
  s.access = `fake-access-${s.n}`;
  s.refresh = `fake-refresh-${s.n}`;
  return { access_token: s.access, refresh_token: s.refresh, expires_in: s.expiresIn, scope: "offline read:cycles read:workout", token_type: "bearer" };
}

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const body = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

function page(records, url) {
  const start = Number(url.searchParams.get("nextToken") || 0);
  const from = url.searchParams.get("start");
  const list = records.filter((r) => !from || r.start >= from);
  const slice = list.slice(start, start + s.pageSize);
  const next = start + s.pageSize < list.length ? String(start + s.pageSize) : null;
  return { records: slice, next_token: next };
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    // ---- test controls
    if (p === "/__reset") { reset(); return json(res, 200, { ok: true }); }
    if (p === "/__config" && req.method === "POST") { Object.assign(s, JSON.parse(await body(req))); return json(res, 200, { ok: true }); }
    if (p === "/__state") return json(res, 200, { ...s.log, access: s.access, refresh: s.refresh });

    // ---- OAuth
    if (p === "/oauth/oauth2/auth") {
      const q = Object.fromEntries(url.searchParams);
      s.log.authorize.push(q);
      const back = new URL(q.redirect_uri);
      back.searchParams.set("state", q.state ?? "");
      if (q.client_id !== CLIENT_ID || s.deny) back.searchParams.set("error", "access_denied");
      else back.searchParams.set("code", "fake-code");
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (p === "/oauth/oauth2/token" && req.method === "POST") {
      const f = Object.fromEntries(new URLSearchParams(await body(req)));
      s.log.token.push({ grant_type: f.grant_type, scope: f.scope ?? null, redirect_uri: f.redirect_uri ?? null });
      if (f.client_id !== CLIENT_ID || f.client_secret !== CLIENT_SECRET) return json(res, 401, { error: "invalid_client" });
      if (f.grant_type === "authorization_code" && f.code === "fake-code") return json(res, 200, issue());
      // Refresh tokens rotate: only the latest one works.
      if (f.grant_type === "refresh_token" && f.refresh_token && f.refresh_token === s.refresh) return json(res, 200, issue());
      return json(res, 400, { error: "invalid_grant" });
    }

    // ---- API
    if (p.startsWith("/developer/")) {
      const auth = req.headers.authorization ?? "";
      s.log.api.push({ method: req.method, path: p, token: auth.replace(/^Bearer /, "") });
      if (!s.access || auth !== `Bearer ${s.access}`) return json(res, 401, { error: "unauthorized" });
      if (p === "/developer/v2/cycle") return json(res, 200, page(s.cycles, url));
      if (p === "/developer/v2/activity/workout") return json(res, 200, page(s.workouts, url));
      if (p === "/developer/v2/user/access" && req.method === "DELETE") {
        s.log.revoked += 1;
        s.access = s.refresh = null;
        res.writeHead(204);
        return res.end();
      }
    }
    json(res, 404, { error: "not_found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake WHOOP on ${PORT}`));
