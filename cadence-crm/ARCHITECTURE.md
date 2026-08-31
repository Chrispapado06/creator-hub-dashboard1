# Cadence CRM — Technical Architecture

Working name **Cadence** (rename freely). A multi-tenant SaaS sales CRM in the
spirit of the 50-section brief: leads, deals, pipelines, activities, email,
automations, sequences, reporting, forecasting, AI, billing, admin.

This document is the design the brief asks to start with. The database core
(Phase 1) is built and tested; everything else is planned against it.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Database | **Postgres** (via Supabase) | Relational, normalized (§38); indexes, JSONB for custom fields, LISTEN/NOTIFY for realtime. |
| Tenant isolation | **Row-level security** | The brief demands isolation "at the backend/database level, not the frontend" (§29, §39). RLS *is* that — enforced by the engine on every query regardless of how the client is written. |
| Auth | Supabase Auth | Email/password, OAuth, 2FA, session management (§29) without hand-rolling crypto. |
| API | PostgREST + Edge Functions | REST over the schema for free (§31); Functions for AI, email, webhooks, billing. |
| Frontend | React + TypeScript + Tailwind | Same as the rest of this repo; a dense, professional data UI (§36), responsive to mobile (§35). |
| Files | Supabase Storage | Per-tenant buckets with policy-based access (§24). |
| Background work | Edge Functions + `pg_cron` / a queue | Sequences, automations, email sync, webhook delivery (§37). |

Repo layout mirrors the sibling apps:

```
cadence-crm/
  db/            ← schema, RLS, tests (built)
  app/           ← the CRM web app          (Phase 2+)
  admin/         ← super-admin panel        (Phase 15)
  functions/     ← AI, email, webhooks, billing (later phases)
```

---

## 2. Multi-tenancy — the spine

A **user is not a tenant.** Three tables carry the whole model:

- `tenants` — a customer account (name, slug, plan).
- `profiles` — one row per auth user, tenant-independent.
- `memberships` — the user×tenant join, carrying the role.

Every business row has a `tenant_id`. RLS is **on and FORCED** on every table,
default-deny; a row is reachable only through a `memberships` row proving the
caller belongs to that tenant. The check is a `SECURITY DEFINER` function
(`is_member`) so policies don't recurse, and it `coalesce`s to `false` so a
missing membership is a closed door, never a NULL that slips through.

This is why a user can belong to several accounts (a consultant, an agency)
without any risk of crossing them — the isolation is structural, not a `WHERE`
clause the frontend has to remember.

**Proven, not asserted.** `db/tests/tenancy.test.mjs` runs the real migration on
real Postgres (PGlite/WASM — no Docker) and attacks it: cross-tenant read,
insert-into, move-into, self-promotion, outsider edits, audit tampering. 15/15
refused. Run it after any schema change:

```bash
cd cadence-crm/db && npm install && npm test
```

---

## 3. Entities (the normalized model, §38)

Built in Phase 1: `tenants`, `profiles`, `memberships`, `teams`,
`team_members`, `contacts` (seam), `audit_log`.

Planned, each `tenant_id`-scoped and RLS-isolated the same way:

- **People & orgs** — `companies`, `contacts` (full), `contact_field_values`, `custom_fields`, `labels`.
- **Sales core** — `leads`, `pipelines`, `pipeline_stages`, `deals`, `deal_products`, `deal_stage_history`.
- **Work** — `activities`, `activity_participants`, `calendar_accounts`, `projects`, `tasks`, `milestones`.
- **Comms** — `email_accounts`, `email_threads`, `emails`, `email_templates`, `sequences`, `sequence_steps`, `sequence_enrollments`.
- **Catalog & docs** — `products`, `documents`, `document_templates`, `files`.
- **Engine** — `automations`, `automation_steps`, `automation_runs`, `webhooks`, `webhook_deliveries`, `integrations`.
- **Analytics** — `reports`, `dashboards`, `dashboard_widgets`, `forecasts`.
- **Platform** — `notifications`, `comments`, `mentions`, `roles`, `permissions`, `plans`, `plan_limits`, `subscriptions`, `usage`.

Custom fields (§4, §5, §8, §9) use a `custom_fields` definition table plus a
JSONB `custom` column per business row — flexible without a migration per field,
indexable with expression indexes.

---

## 4. Roadmap (the brief's own phasing, §49)

| Phase | Scope | State |
|---|---|---|
| **1** | Auth, multi-tenancy, DB core, audit | **Built + tested** |
| 2 | Contacts + organizations | next |
| 3 | Leads (scoring, conversion, dedupe) | |
| 4 | Deals + customizable pipelines (drag-drop, rotting) | |
| 5 | Activities + calendar | |
| 6 | Email (sync, templates, tracking) | ⚑ external |
| 7 | Products + line items | |
| 8 | Automations (trigger→condition→action) | |
| 9 | Sequences | ⚑ external |
| 10 | Reporting + forecasting | |
| 11 | Documents + projects | |
| 12 | AI assistant | ⚑ external |
| 13 | Public API + webhooks + integrations | ⚑ external |
| 14 | Billing + plan limits | ⚑ external |
| 15 | Super-admin panel | |
| 16 | Mobile optimization | |
| 17 | Security + performance hardening | |
| 18 | Testing + deploy | |

Each phase ships its schema (with RLS + tests), its API surface, and its UI
before the next begins — not all faked at once.

---

## 5. The external-service boundary

Marked ⚑ above. These features are real in *model and interface* now; their
**live wiring needs credentials and a server** I can't stand up without you:

- **Email sync** (Gmail/Microsoft) — OAuth apps + user consent + a sync worker.
- **AI** — an API key behind a server proxy, never a client-side key.
- **Billing** — a Stripe account; plan *limits* are enforced in-DB regardless.
- **Webhooks** — a delivery worker + retry queue.
- **OAuth / 2FA / push** — provider configuration.

For each, Cadence builds the schema, the app surface, and an honest "not
connected" state — the same discipline used across this repo — so the day the
credentials arrive, the feature lights up without a rewrite.

---

## 6. Security posture (§29)

- Tenant isolation: RLS, forced, default-deny, tested.
- RBAC floor: `owner / admin / manager / member`; granular per-object
  permissions (§28) layer on in a later phase.
- Audit log: append-only — **no update or delete policy for anyone**.
- `anon` is granted nothing; every table requires a session.
- Secrets, rate limiting, CSRF/XSS/SQLi: handled at the Supabase/PostgREST and
  app layers; parameterized queries throughout; no raw SQL from user input.
