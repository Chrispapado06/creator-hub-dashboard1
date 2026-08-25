# ICEFALL — database

Schema, row-level security policies and security tests for ICEFALL. **Shared by
two applications**, which is why it lives here rather than inside either one:

| App | Role | Reads this database as |
|---|---|---|
| `icefall-app/` | the athlete-facing product | `athlete`, `guide`, `operator` |
| `icefall-admin/` | internal staff CRM | `admin` |

## What exists so far

`20260817120000_icefall_foundation.sql` — identity, roles and the messaging
spine:

- `profiles` — one row per auth user, carrying the role
- `guide_profiles` / `operator_profiles` — provider detail, hidden until `listed`
- `threads`, `thread_participants`, `messages` — private correspondence

## The rule this schema exists to enforce

A thread between an athlete and a guide holds that person's plans, their dates
and their own assessment of their ability. Access is granted **only** through
membership of a thread. There is no "any authenticated user can read messages"
policy anywhere in the migration, and none may be added.

Messages have **no UPDATE and no DELETE policy for anyone, including admin**. A
message is a record of what was said; letting either side rewrite it after the
fact would matter most to the athlete, who is the party with less power in a
commercial conversation.

`20260825120000_waitlist.sql` — the pre-launch signup list written by
`icefall-web`. **Insert-only to the public:** anyone may add themselves, and
nobody reachable from a browser can read, change or delete a row. Both the RLS
policies and the table grants are locked down, because Supabase's default
privileges hand `anon` full access to every new table in `public` and leaving
either one out publishes the list. Reading it is a service-role operation.

`guide_profiles.credentials_verified` carries a `CHECK (= false)`. ICEFALL
verifies nothing today, and a tick beside "IFMGA" is the whole of what stops a
client asking to see the carnet. Dropping that constraint is the deliberate act
that turns verification on.

## Tests

The policies are tested by attacking them — an outsider trying to read a private
thread, a participant trying to forge a message in someone else's name, a user
trying to promote themselves to admin. They run on PGlite (real Postgres,
compiled to WASM), so no Docker and no local Postgres are needed:

```bash
cd icefall-supabase && npm install && npm test
```

15 attacks, all of which must be refused. Run it after any change to the
migration — a policy edit that quietly opens the message store would otherwise
be invisible.

## Applying it

You need a Supabase project. Create one at
[supabase.com/dashboard](https://supabase.com/dashboard), then from the repo
root:

```bash
cd icefall-supabase && supabase link --project-ref YOUR_PROJECT_REF
```

```bash
cd icefall-supabase && supabase db push
```

Then put the project's URL and publishable (anon) key into **both** apps:

```bash
printf 'VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY\n' > icefall-app/.env.local
```

The variable is `VITE_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY` — the wrong
name fails silently rather than erroring.

## Promoting a user

Signing up always creates an `athlete`. Staff and providers are promoted
deliberately, never by registering — run this in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
```
