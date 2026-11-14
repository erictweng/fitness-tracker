# Claude connector (M4.5)

Each user can connect their own Claude (claude.ai, the Claude phone/desktop apps, Claude Code) and
log food, weight and workouts by talking to it.

## How it works
- `/api/mcp` is a remote MCP server (Streamable HTTP, stateless) in this app.
- Sign-in is Supabase Auth's OAuth 2.1 server. Claude finds it through
  `/.well-known/oauth-protected-resource` (returned in the 401 `WWW-Authenticate` header), registers
  itself (dynamic client registration), and sends the user to our consent page `/oauth/consent`.
- Claude's access token is a normal token for that user, plus a `client_id` claim. Every tool call runs
  with a Supabase client scoped to that token, so the usual row-level security applies.
- The database uses the `client_id` claim (migration `0006`) to:
  - stamp everything Claude writes as `source = 'claude'` (shown as "via Claude"),
  - block deletes, settings/targets/saved-food changes, account deletion and admin powers for Claude
    tokens, even if someone calls Supabase directly with the token.
- `/api/mcp` checks each token with Supabase Auth on every call, so **Disconnect** in Settings works
  on the next call (not after the token expires).

## Tools
| Tool | What it does |
|------|--------------|
| `get_day` | totals, target, what's left, entries (with ids), workouts, latest weight |
| `log_food` | one item: name, kcal, protein/fat/carbs, meal, date, notes, `entry_id` |
| `edit_entry` | change fields of an existing entry (no deletes) |
| `log_weight` | one weigh-in per day (a second replaces it) |
| `log_workout` | type, minutes, kcal burned, notes; never changes the calorie target |
| `list_recent_foods` | saved foods (recent first) and saved meals |

Retries: Claude is told to send a fresh UUID per item (`entry_id` / `workout_id` / `weigh_in_id`) and
reuse it only when retrying, so a retried call never logs twice.

## One-time setup on the hosted Supabase project (Eric)
1. **SQL Editor:** run `supabase/migrations/0006_m45_claude_workouts.sql`.
2. **Authentication → OAuth Server:**
   - turn on **Enable OAuth server**,
   - **Authorization path:** `/oauth/consent`,
   - turn on **Allow dynamic client registration**.
3. **Authentication → URL Configuration:** Site URL must be the live app domain
   (`https://fitness-tracker-vert-three.vercel.app`, or the new domain once it moves). The consent
   link is Site URL + `/oauth/consent`.
4. Merge the M4.5 pull request so production has `/api/mcp`.

No new keys or Vercel variables are needed.

## Connecting (each user)
1. Claude → **Settings → Connectors → Add custom connector**.
2. Name: `Fitness Tracker`. URL: `https://<live domain>/api/mcp` (also shown in the app under Settings → Claude).
3. Claude opens our site: sign in with Google, check the list, tap **Allow**.
4. Try: "I had 2 eggs and toast for breakfast." Then check Today: it shows "via Claude".

Claude Code: `claude mcp add --transport http fitness https://<live domain>/api/mcp`, then `/mcp` to sign in.

## Troubleshooting
- **Claude says it can't connect / discovery failed:** check step 2 is on, and that
  `https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1` returns JSON.
- **Consent page says "expired or already used":** start the connection again from Claude (requests last ~10 minutes).
- **Uninvited people** can't get past Google sign-in, same as the app.
- **Disconnect:** app → Settings → Claude → Disconnect.

## Tests
- `supabase/tests/migration_checks.sql`: Claude-token limits and source stamping (Postgres 17, CI).
- `e2e/m45.spec.ts`: the full OAuth flow against local Supabase (registration → consent → code + PKCE
  → token), every tool, Today matching `get_day`, no duplicate on retry, a second user isolated,
  Disconnect stopping the next call, and app workouts.
