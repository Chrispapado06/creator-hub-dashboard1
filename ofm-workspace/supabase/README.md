# OFM Workspace — Supabase

The database schema, Row-Level Security (RLS) policies, and Edge Functions that back the app.

## What's here

```
supabase/
├─ migrations/
│  └─ 20260729120000_auth_rbac_foundation.sql   # tables + RLS + helpers + triggers
├─ functions/
│  ├─ invite-user/index.ts        # owner-only invite-by-email (service_role)
│  └─ deactivate-user/index.ts    # owner-only deactivate/reactivate (service_role)
└─ config.toml                    # local dev config (signup off, deep-link redirect, short JWT)
```

## Security model (foundation)

- **`profiles`** — 1:1 with `auth.users`, holds identity/PII only. Never authorization.
- **`memberships`** — the single source of truth for authZ: `unique(workspace_id, user_id)` carrying `role` (`owner`/`manager`/`chatter`) and `status` (`active`/`deactivated`).
- **`invites`** — audit record that an email invite was sent.
- Membership/role are **minted only by the service_role Edge Functions or the one-time bootstrap SQL** — never by an email-matching trigger. No self-registration can grant a role.
- Every role check inside a policy routes through a `SECURITY DEFINER` helper (`is_owner()`, `is_manager_or_owner()`, …) owned by `postgres`, so policies never re-trigger RLS on their own table → **no Postgres 42P17 recursion**. **Do not** `FORCE` RLS on these tables.
- **Deactivation is instant and complete**: the Edge Function flips `status`, deletes the user's sessions, and bans the auth user. Helpers read live status, so the next query is denied even with an unexpired token.
- A user can never change their own role/status (trigger), and the workspace can never lose its last active owner (constraint trigger).

## Apply to a project

Run from `ofm-workspace/`.

### 1. Link and push the schema

```bash
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push
```

### 2. Deploy the Edge Functions

```bash
npx supabase functions deploy invite-user
npx supabase functions deploy deactivate-user
```

### 3. Set function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. Set the rest:

```bash
npx supabase secrets set INVITE_REDIRECT_URL="ofm://auth/callback"
npx supabase secrets set ALLOWED_ORIGIN="ofm://localhost"
npx supabase secrets set DEFAULT_WORKSPACE_ID="00000000-0000-0000-0000-000000000001"
```

### 4. Lock down Auth (hosted dashboard — `config.toml` only affects local dev)

- Authentication → Providers → Email → **"Allow new users to sign up" = OFF**
- Keep **"Confirm email" ON**
- Shorten **Access Token (JWT) expiry** to ~600–900s
- Add `ofm://auth/callback` under **URL Configuration → Redirect URLs**
- _(Optional)_ Authentication → Hooks → **Custom Access Token** = `public.custom_access_token_hook` (display-only; never a security gate)

### 5. Bootstrap the first Owner

The first Owner can't be invited (no owner exists yet to send it). One-time, explicit, service-role act:

1. **Dashboard → Authentication → Users → "Add user"** — enter the founder's email (send invite or set a temp password). The `on_auth_user_created` trigger auto-creates their profile; they still have **no membership**.
2. **Dashboard → SQL Editor**, run once (substitute the founder email):

   ```sql
   insert into public.memberships (workspace_id, user_id, role, status, invited_by)
   select '00000000-0000-0000-0000-000000000001', u.id, 'owner', 'active', u.id
   from auth.users u
   where u.email = 'founder@your-agency.com'
   on conflict (workspace_id, user_id) do update
     set role = 'owner', status = 'active', updated_at = now();
   ```

From then on, the founder (an active owner) invites everyone else in-app via the **Team** screen (→ `invite-user`). Invitees set their own password on the emailed link; the client calls `supabase.rpc('accept_my_invites')` once on first login.

## Regenerate TypeScript types after schema changes

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

## Known follow-ups (documented in the design, deferred past the foundation)

- **Per-creator scoping**: current role helpers are workspace-wide. Before building creator/content data, add `creator_assignments` + an `is_assigned_to_creator()` helper and scope those tables as `(is_owner OR is_assigned_to_creator)` — don't rely on the coarse role helpers alone.
- `profiles_select` currently lets any co-worker read every member's email/name; tighten if too broad.
- Membership is created `active` at invite time (dormant until first login, since an unconfirmed user has no session). Add an `invited` status if you want an explicit "not yet joined" state.
