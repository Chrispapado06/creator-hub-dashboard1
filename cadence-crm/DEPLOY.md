# Cadence CRM — deployment handoff

For whoever is setting this up. Written to be acted on directly.

## Status (read first)

- **Not deployed yet.** There is no Vercel project and no live URL for Cadence.
- The **frontend is a static Vite/React SPA** and deploys to Vercel as-is.
- It currently runs on **built-in demo data** — deploying it gives a working demo
  of the whole UI (dashboard, pipeline drag-drop, command palette, tables), but
  **no real accounts, no persistence, no auth yet**. Turning it into a live CRM
  needs the database step below plus the data-layer wiring (a later build phase).
- The **database schema is built and tested** (`db/`): multi-tenant, row-level
  security, 19 isolation tests passing on real Postgres.

---

## 1. Deploy the frontend to Vercel

The app lives in **`cadence-crm/app/`**. Settings:

| Field | Value |
|---|---|
| Framework preset | **Vite** |
| Root directory | `cadence-crm/app` |
| Build command | `npm run build` |
| Output directory | `dist` |
| SPA routing | already handled by `app/vercel.json` (rewrite to `/index.html`) |

**Option A — Vercel CLI** (from `cadence-crm/app/`):

```bash
cd cadence-crm/app && npx vercel --prod
```

**Option B — Vercel dashboard:** New Project → import the repo → set Root
Directory to `cadence-crm/app` → Deploy. Framework autodetects as Vite.

That's the whole frontend deploy. It will build and serve the demo immediately.

---

## 2. Set up the database (to make it a real CRM)

The schema is standard Postgres — use **Supabase** (matches how it's designed:
auth + Postgres + row-level security in one).

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Apply the migrations in **`cadence-crm/db/migrations/`** (in order:
   `0001_foundation.sql`, then `0002_sales_core.sql`) — via `supabase db push`
   with the project linked, or paste them into the SQL editor.
3. Verify tenant isolation holds (no Docker needed — runs on PGlite):

   ```bash
   cd cadence-crm/db && npm install && npm test
   ```

   Expect **19/19 passed**. This proves accounts cannot see each other's data,
   enforced by the database, not the frontend.

**Isolation model in one line:** every row has a `tenant_id`; row-level security
is forced on every table; a row is only reachable through a `memberships` row
proving you belong to that account. `anon` is granted nothing.

---

## 3. Environment variables

Not needed for the demo deploy. When the Supabase data layer is wired (next
phase), the app will read:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<the publishable / anon key>
```

Set these in Vercel → Project → Settings → Environment Variables.

- Use the **publishable (anon)** key — it is safe in the browser; row-level
  security is what protects the data.
- **Never** put the `service_role` key in the frontend or in Vercel env for the
  client app — it bypasses every security policy.

---

## 4. What works today vs. what's pending

**Works (Phases 1–5):** the full sales UI on demo data — dashboard with real
computed KPIs, the deals pipeline with drag-drop and stale-deal detection,
leads, contacts, organizations, activities, products, command palette (⌘K),
collapsible nav. Database schema + isolation tests for all of it.

**Pending:** live data wiring, auth/sign-in, and Phases 6–18 (email sync,
automations, sequences, reporting, forecasting, documents, projects, AI,
billing, admin). Several of those need external credentials (Gmail/Microsoft
OAuth, an AI key behind a server, Stripe) — they can't be switched on from the
frontend alone.

---

## Other apps in this repo (context)

The same repo holds the ICEFALL apps, each a separate Vite SPA deployed the same
way (own `vercel.json`, root = the app folder):

- `icefall-app/` — **already live at https://icefall-app.vercel.app**
- `icefall-guide/`, `icefall-admin/`, `icefall-web/` — not yet deployed
- `icefall-supabase/`, `cadence-crm/db/` — database packages (migrations + tests),
  not deployed; applied to Supabase projects

Note: ICEFALL apps use `.vercelignore` to keep demo/mockup image assets out of the
build — check that file before deploying any of them.
