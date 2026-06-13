# Task Handoff Pipeline

An ordered chain of steps, each owned by one team member. **Only one step is
active at a time.** When the active owner marks it done, the next step becomes
active and the next owner is **pinged in Discord** (the handoff). Anyone can
view any member's open items — *if it's not on their list, it's done.*

Example pipeline: **Write script (Luca) → Upload (Ja) → Verify (Liz)**.

Lives at **`/tasks`** (Operations → Tasks in the sidebar).

---

## How it fits this app (important)

This is a **Vite + TanStack Router SPA** with custom localStorage auth and
"Public full access" RLS — *not* Next.js / Supabase Auth. So:

- **Atomicity + caller checks** live in **Postgres plpgsql RPCs**
  (`complete_active_step`, `start_pipeline`, `skip_step`, `reassign_step`,
  `cancel_pipeline`) — one DB transaction each, so a handoff can never half-apply.
  A partial unique index (`task_pipeline_steps_one_active_idx`) structurally
  guarantees at most one active step per pipeline.
- **The Discord ping fires *after* the RPC commits**, via the server-side
  `api/discord-notify.js` Vercel function. A failed ping is logged and ignored —
  it can never roll back the handoff (that's the required "best-effort" behavior).
- **`chatters`** (the staff roster) is the team table; it gained a nullable
  `discord_user_id`. Step `assignee_id` FKs to `chatters(id)`.

### ⚠️ Security caveat (read this)
The app identifies users via a **client-controlled localStorage session** and
ships the Supabase anon key — there is no `auth.uid()`. The RPCs verify the
caller (`username` → `access_codes` → admin, or `chatter_id` == the step's
assignee) as a **consistency guard**, but because anyone with the anon key
could call an RPC with any username, this is *not* a hardened security boundary.
The task feature is exactly as trusted as the rest of the app. Real hardening
needs app-wide authentication and is out of scope.

---

## Setup

### 1. Apply the migration
```bash
# from the repo root, with the Supabase CLI linked to the project:
supabase db push
# — or paste supabase/migrations/20260613180000_task_handoff_pipeline.sql
#   into the Supabase dashboard SQL editor and run it.
```
This creates `task_templates`, `task_template_steps`, `task_pipelines`,
`task_pipeline_steps`, `standalone_tasks`, the RPCs, adds `chatters.discord_user_id`,
and seeds two templates (**Script**, **Content Request**) with no default owners.

### 2. Create the Discord incoming webhook
1. In Discord, open the **channel** you want pings in.
2. **Edit Channel → Integrations → Webhooks → New Webhook**.
3. Name it (e.g. "Task Handoffs"), **Copy Webhook URL**.

### 3. Set the env var
Add to **Vercel → Project → Settings → Environment Variables** (and to a local
`.env` if you run `vercel dev`):
```
DISCORD_TASK_WEBHOOK_URL=https://discord.com/api/webhooks/XXXX/YYYY
# optional:
DISCORD_TASK_NOTIFY_SECRET=some-random-string
```
Redeploy so the `/api/discord-notify` function picks it up. Health check:
`GET /api/discord-notify` → `{ "ok": true, "configured": true }`.

### 4. Set each member's Discord user ID
A member is only @-mentioned if their Discord user ID is set.
1. Discord → **Settings → Advanced → Developer Mode → ON**.
2. **Right-click the user → Copy ID** (a long number like `283845710942…`).
3. In the app: **Tasks → Templates → Team Discord IDs**, paste each ID, Save.

---

## Manual test path

1. **Templates → Team Discord IDs** — set a real Discord ID for two members you
   can watch (e.g. yourself + a teammate).
2. **Start pipeline** — pick the **Script** template, title it "Test run",
   confirm owners for Write/Upload/Verify (set step 1 to yourself), **Start**.
   → The first owner should get a Discord ping:
   `🔁 Test run — Step 1/3: Write script`.
3. **My tasks** (as the step-1 owner) — you should see "Write script" with a
   **Done** button. Click it.
   → Step 2's owner gets pinged: `🔁 Test run — Step 2/3: Upload — (handed off by you)`.
   → Your list no longer shows it (it's not on your list → it's done).
4. **By member** — pick the step-2 owner; confirm "Upload" is the only thing on
   their list.
5. Have step 2 and step 3 owners click **Done** in turn. After the final step:
   → channel posts `✅ Test run complete.` and the pipeline leaves the Board.
6. **Standalone task** — Start tab → "Quick one-off task" → assign someone with a
   Discord ID → they get `📋 New task: …` and see it under My tasks.

### If pings don't arrive
- `GET /api/discord-notify` returns `configured: false` → env var not set / not redeployed.
- Message posts but doesn't notify the person → their `discord_user_id` is wrong or unset.
- Nothing posts → check the webhook URL is for the right channel and not revoked.
- The DB handoff still works even when pings fail (by design) — check the Board to confirm the step advanced.

---

## What's intentionally NOT in v1
Recurring tasks, priorities/labels, analytics, due dates on *pipeline* steps
(standalone tasks have due dates), file attachments, email notifications, and a
two-way `/done`-from-Discord bot. (A separate unused `taskflow-bot/` exists in
the repo; it is **not** wired to this feature.)
