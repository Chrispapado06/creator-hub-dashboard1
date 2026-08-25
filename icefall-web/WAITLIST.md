# The ICEFALL waitlist

Everything behind the signup form on the launch page.

| Piece | Where |
|---|---|
| The behaviour — validation, rate limit, store | `api/_waitlist.mjs` |
| Production transport (Vercel function) | `api/waitlist.js` |
| Development transport | `server/index.mjs` → `POST /api/waitlist` |
| The form | `src/screens/Waitlist.tsx` → `SignupForm` |
| The client | `src/lib/waitlist.ts` |
| The table | `../icefall-supabase/migrations/20260825120000_waitlist.sql` |

Both transports call the same `handleWaitlist()`. A bug found in development is
the bug that was in production.

---

## It works right now, locally

`npm run dev:all` runs Vite and the API server together. With no Supabase
configured, signups append to `server/.data/waitlist.jsonl` (gitignored) so the
form is genuinely end-to-end testable before any cloud account exists:

```bash
npm run dev:all --prefix icefall-web
```

```bash
curl -s -X POST http://localhost:5194/api/waitlist -H 'Content-Type: application/json' -d '{"name":"Ada","email":"ada@example.com","source":"hero"}'
```

`GET /api/health` reports `"waitlist": "live"` or `"not_connected"`.

---

## Going live

ICEFALL has no Supabase project yet. Create one, apply the migration, then give
Vercel two variables.

### 1. Create the project and link it

At [supabase.com/dashboard](https://supabase.com/dashboard), then:

```bash
cd icefall-supabase && supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Apply the schema

```bash
cd icefall-supabase && supabase db push
```

That creates `public.waitlist` **insert-only to the public** — anyone may add
themselves; nobody reachable from a browser can read, change or delete a row.
Reading the list is a service-role operation. See the migration's header for why
both RLS *and* the table grants are locked down, not just one.

### 3. Set the two variables on the Vercel project

Settings → Environment Variables:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | the project's **publishable (anon)** key |

**Use the publishable key, not the service-role key.** This table is a list of
customers' email addresses. With the anon key and no SELECT policy, the worst an
attacker who obtains this environment can do is *add* rows. The service-role key
would hand them every address in the database and buys nothing here.

Redeploy after adding them. Until they are set the endpoint answers `503` and
the form says the waitlist isn't connected — it never pretends to have saved an
address it dropped.

---

## Reading the list

SQL editor in the Supabase dashboard (service role, so RLS does not apply):

```sql
select created_at, email, name, source from public.waitlist order by created_at desc;
```

```sql
select source, count(*) from public.waitlist group by source order by 2 desc;
```

---

## Changing the launch date

One constant, in `src/lib/waitlist.ts`:

```ts
export const LAUNCH_AT = new Date("2026-10-15T09:00:00Z");
```

The badge ("COMING OCTOBER 15TH"), the countdown, the band ("Launching October
15th") and the confirmation email line all derive from it, so they cannot drift
apart. It is a fixed UTC instant on purpose — the clock has to tick toward the
same moment for a visitor in Nicosia and one in Denver.

When it passes, the countdown hides itself and the band reads "ICEFALL is open."

---

## What is deliberately not here

- **No double opt-in.** An address goes straight onto the list. If you want a
  confirmation email before it counts, that is a real feature, not a setting.
- **No emailing.** Nothing sends anything yet. The page promises "we'll email
  you" — keeping that promise is a separate job.
- **No serious rate limiting.** The per-IP limiter in `_waitlist.mjs` is
  per-instance and honest about it in its own comment. The unique index on
  `email` is what actually stops the list filling with duplicates.
