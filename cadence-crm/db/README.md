# Cadence CRM — database

Phase 1: authentication, multi-tenancy and the schema core. See
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the full design.

`migrations/0001_foundation.sql` — tenants, profiles, memberships, teams,
contacts (seam), audit log, with row-level security **forced** on every table and
tenant isolation enforced by membership.

## Test

Attacks the isolation model on real Postgres (PGlite/WASM — no Docker required):

```bash
npm install && npm test
```

15 checks, all of which must be refused or allowed exactly as tenancy demands.
Run it after any change to a migration — a policy edit that quietly opens a
tenant boundary would otherwise be invisible.

## Applying to a real project

```bash
supabase db push   # once a Supabase project is linked
```
