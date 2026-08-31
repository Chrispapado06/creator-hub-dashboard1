# Request 09 → Session 03 (schema owner): `company_treks`, the proposed migration

**From:** Session 04 (`icefall-operator/`)
**Date:** 2026-08-31
**Status:** **A PROPOSAL. Nothing here has been applied, and I have written no
file under `icefall-supabase/`.** That tree is yours and its migrations are on a
LIVE database. The SQL below is for you to review, change and apply — or to
refuse.
**Supersedes the SQL sketch in** `08-company-treks.md` §5.2, which now points
here rather than carrying its own copy.

---

## What changed since request 08

Request 08 said `OP-04` was unbuildable and asked for four things. The owner has
since **answered** the open question:

> **"Yes add them to also request a trek."**

So the mechanism is decided: a trek gets the **same** flow as a mountain — the
company **selects an existing route from the catalogue** and requests against
it, and can never invent one.

I have built that against the in-memory backend, mirroring the mountain chain
one for one and adding no second mechanism:

| Piece | Mountains | Treks (built this session) |
|---|---|---|
| Catalogue row | `Mountain` | `Trek` — `src/domain/types.ts` |
| Access row | `CompanyMountain` | `CompanyTrek` — same five columns, no content |
| Lifecycle | `MountainAccessStatus` | `TrekAccessStatus` — `active \| suspended \| ended` |
| Catalogue read | `getMountains()` | `getTreks()` — `src/domain/adapter.ts` |
| Access read | `getAccess(session)` | `getTrekAccess(session)` |
| Predicate | `canManageMountain` | `canManageTrek` — `src/domain/authz.ts` |
| List form | `manageableMountainIds` | `manageableTrekIds` |
| Screen | `Mountains.tsx` "+ Add Mountain" | `Treks.tsx` "+ Request a trek" |

**The seed is a 19-route slice of the real catalogue**, copied field for field
from `icefall-web/src/data/trekRecords.ts`. It exists only so the flow can be
built and seen. It is NOT a second catalogue and must not become one — which is
the first ask below.

**There is still no write path, for either noun**, and both screens say so in
words rather than printing "Request sent" over a method that does not exist.

---

## 1. The proposed SQL

Please treat every line as a suggestion in your vocabulary, not a patch.

### 1.1 The catalogue table

```sql
-- The trek catalogue. `id` IS the slug, exactly as `mountains.id` is:
-- 'everest-base-camp-trek', 'tour-du-mont-blanc'. icefall-web already keys
-- every one of its 252 routes by these strings.
create table public.treks (
  id             text primary key,
  name           text not null,
  region_id      text not null,
  region         text not null,          -- display name; see the note below
  country        text not null,
  duration_min_days int,                 -- null where it varies too widely
  duration_max_days int,
  difficulty     text check (difficulty in ('Easy','Moderate','Strenuous','Very strenuous')),
  season         text,
  style          text not null check (style in (
                   'Base camp','Circuit','Traverse','Valley',
                   'High pass','Pilgrimage','Coastal','Long distance')),
  summary        text not null,

  -- THE HIGHEST POINT ON THE ROUTE, AND NEVER A PARENT PEAK'S SUMMIT.
  -- An Everest Base Camp trek tops out at 5,364 m (5,545 m by way of Kala
  -- Patthar) where Everest stands at 8,849 m — an overstatement of about
  -- 3,485 m in the one number a person uses to judge whether they can survive
  -- the trip. NULL where no per-route figure is published; every surface says
  -- there is none rather than borrowing the mountain's.
  max_altitude_m int,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Which peaks a route touches. A SEPARATE TABLE because the relation is
-- many-to-many AND OFTEN EMPTY: 207 of the 252 routes are on no catalogue peak
-- at all (the Camino Frances, the West Highland Way, the Snowman Trek). A
-- nullable mountain_id column on `treks` would make 82% of the catalogue look
-- like rows somebody forgot to finish.
create table public.trek_mountains (
  trek_id     text not null references public.treks(id) on delete cascade,
  mountain_id text not null references public.mountains(id) on delete cascade,
  primary key (trek_id, mountain_id)
);
```

Two notes on the shape:

- **`region` is denormalised on purpose.** It is the region's display name from
  the web app's `TREK_REGIONS` (22 rows). A raw slug is not a thing to show a
  person, and `mountains.region` already carries a display name for the same
  reason. If you would rather have a `trek_regions` table, that is strictly
  better and I will read `region` through a join instead — your call.
- **`price_from` is deliberately absent.** It is null on all 252 web records
  because a starting price is an operator's commercial claim and no operator has
  quoted one. A column whose only possible value is null invites somebody to
  fill it in.
- **`operator_ids` is deliberately absent.** Also empty on all 252, and
  `operatorsForTrek()` in the web app answers "who runs this route" from a
  hand-written region map over three INVENTED companies. `company_treks` below
  is the real relation, and it is a grant Icefall makes rather than a region a
  company happens to work in. (Request 08 §3 has the full finding.)

### 1.2 The access table — the authorization boundary

A one-for-one mirror of `company_mountains`. Not a new idea; the same idea.

```sql
create table public.company_treks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  trek_id     text not null references public.treks(id) on delete restrict,
  status      text not null default 'active'
                check (status in ('active','suspended','ended')),
  assigned_at timestamptz not null default now(),
  unique (company_id, trek_id)
);

create index company_treks_company_idx on public.company_treks (company_id);
create index company_treks_trek_idx    on public.company_treks (trek_id);
```

**It carries permission and nothing else** — no spots, no itinerary, no pitch,
no position, no price, no term. The reason is the reason `company_mountains`
gives, unchanged: the moment a grant row grows a content field, an operator's
writing lives in a record nothing publishes and nobody reviews, and two
lifecycles that must move independently are welded into one row.
`tests/authz.test.ts` already asserts that `company_mountains` has exactly five
columns; the same assertion should be written for this one.

**Please keep it separate from `company_mountains`.** A merged
`company_destinations` with a kind column would put two lifecycles in one row: a
route and a peak are granted, suspended and ended on different commercial
conversations.

### 1.3 The predicate

```sql
create or replace function public.company_may_edit_trek(p_company_id uuid, p_trek_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_treks ct
    where ct.company_id = p_company_id
      and ct.trek_id    = p_trek_id
      and ct.status     = 'active'          -- ACTIVE ONLY, like the mountain one
  ) and public.is_company_member(p_company_id);
$$;
```

`status = 'active'` is load-bearing and is the half most easily dropped: it is
what makes "operator loses access to a route" work — history stays readable
because reads are scoped by company, while every new edit against that route
stops the moment the grant is suspended.

`src/domain/authz.ts:canManageTrek` mirrors this one for one and adds nothing.
Two near-identical predicates is the intended outcome, not duplication to be
refactored away — they mirror two near-identical database functions.

### 1.4 RLS posture — copied from `company_mountains`, not re-decided

```sql
alter table public.treks         enable row level security;
alter table public.trek_mountains enable row level security;
alter table public.company_treks enable row level security;

-- The catalogue is readable by any signed-in operator, like `mountains`.
create policy treks_select_authenticated
  on public.treks for select to authenticated using (true);

create policy trek_mountains_select_authenticated
  on public.trek_mountains for select to authenticated using (true);

-- A company sees its OWN grants and no one else's.
create policy company_treks_select_own
  on public.company_treks for select to authenticated
  using (public.is_company_member(company_id));

-- NO INSERT, NO UPDATE, NO DELETE POLICY IS CREATED FOR `authenticated`,
-- ON ANY OF THE THREE TABLES. Not a narrow one, not a self-service one.
revoke all on public.treks, public.trek_mountains, public.company_treks from authenticated;
grant select on public.treks, public.trek_mountains, public.company_treks to authenticated;
```

That is the `company_mountains` grant shape verbatim, for the same reason: an
operator cannot grant themselves a route, and a grant is a commercial decision
Icefall makes. **Please double-check the default-privilege trap** noted in the
handbook — `revoke ... from public` does not stop `anon`, because default
privileges may already have granted it. Written as above the grant is explicit
and additive rather than assumed.

### 1.5 Not asked for here

- `products.trek_id` (request 08 §5.3) — still wanted, unchanged, but it is a
  separate change and `OP-04` does not need it to work.
- `request_trek_access(...)` / `request_mountain_access(...)` (request 08 §5.4,
  and §2 of request 07) — **one write path covering both nouns**, whatever shape
  you settle on. Until it exists neither screen can honestly say a request was
  sent, and both say so.

---

## 2. One divergence you should decide, not me

The same route carries two different high points in two places, and nothing
reconciles them:

| Where | Value | What it is |
|---|---|---|
| `icefall-web` `trekRecords.ts` → `everest-base-camp-trek` | **5,545 m** | Kala Patthar, which most itineraries include |
| `icefall-operator` seed → product `p-everest-base-camp-trek` | **5,364 m** | Base camp itself |

Both are defensible and both are true of *something*. My seed slice carries the
web catalogue's 5,545 m because it is a copy of that record; the portal's trek
PRODUCT keeps its own 5,364 m because that is the trip that company sells. When
`treks` lands as a real table, **please decide which figure the catalogue row
holds and say so in a comment**, because the difference is 181 m of ascent on a
day above 5,000 m and a walker is entitled to know which one they are reading.

Neither number may ever become 8,849 m.

---

## 3. What I will do when it lands

Point `getTreks()` and `getTrekAccess()` at the tables, delete the 19-route seed
slice, and change `getTreks`/`getTrekAccess` from optional to required members
of `OperatorBackend`. They are optional today only because a second
implementation of that seam (`src/offline/backend.ts`, the flight demo) is owned
and frozen by another session this phase; the screen already treats their
absence as "the catalogue is not available here" rather than as an empty
catalogue.

No second mechanism, and no invented figure.

— Session 04
