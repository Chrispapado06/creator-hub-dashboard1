-- ICEFALL — how the phone app knows whether what it is showing is still true.
--
-- Owner decision 20, step 5: a scheduled refresh with a visible "last updated".
--
-- ── WHY THE TIMESTAMP CANNOT COME FROM THE DEVICE ──────────────────────────
--
-- The obvious implementation is for the app to stamp `Date.now()` when a fetch
-- returns and show that. It is wrong in a way that is invisible in testing:
--
--   * A device clock can be wrong by hours, and a wrong clock reads as truth.
--   * A cached or replayed response would be stamped "just now" forever.
--   * A failed refresh that silently falls back to cache keeps advancing the
--     time, so the screen claims freshness precisely when it has none.
--
-- So the server states the time, the app stores what the server said, and the
-- app displays only that. If it has never synced it shows no time at all —
-- never "just now", never a zero. Absence of a sync is not a fresh sync.
--
-- ── WHY A REVISION COUNTER IS NOT ENOUGH ───────────────────────────────────
--
-- A placement occupies a slot BETWEEN TWO DATES. When its term ends, what the
-- public sees changes and NO ROW IS WRITTEN — the change is the passage of
-- time, which no trigger can observe. A client that refreshes only when the
-- feed moves would keep showing an operator on a mountain they no longer hold.
--
-- Hence `catalogue_head()` returns TWO things: what has changed, and when the
-- next change is due with nobody touching anything. The second is what makes
-- the refresh schedule correct rather than merely regular.

create table if not exists public.catalogue_changes (
  revision bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  change text not null check (change in ('created', 'updated', 'removed')),
  changed_at timestamptz not null default now()
);

create index if not exists catalogue_changes_at_idx on public.catalogue_changes (changed_at);

comment on table public.catalogue_changes is
  'Append-only feed of changes to PUBLIC catalogue content. Private drafts never enter it, so polling cannot enumerate unpublished work.';

/**
 * Record a change, but only where the row is publicly visible on one side of it.
 *
 * A draft product being edited is nobody's business but its operator's, and the
 * feed is readable by anyone — so an entity enters only when it IS public now or
 * WAS public a moment ago. The second half matters: withdrawing a listing is
 * exactly the change a stale client most needs to hear about.
 */
create or replace function public.catalogue_note()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when TG_OP <> 'DELETE' then to_jsonb(new) else null end;
  v_old jsonb := case when TG_OP <> 'INSERT' then to_jsonb(old) else null end;
  v_type text := TG_ARGV[0];
  v_key  text := TG_ARGV[1];
  v_public_new boolean := false;
  v_public_old boolean := false;
  v_change text;
  v_id text;
begin
  -- What "public" means differs per table, and saying so here keeps the rule in
  -- one place rather than repeated across six triggers.
  --
  -- EVERY TEST BELOW IS WRAPPED IN `coalesce(..., false)`, AND MUST BE. On an
  -- INSERT there is no OLD row, so `v_old ->> 'status' = 'live'` is NULL rather
  -- than false; `not (false or null)` is NULL, the guard below does not fire,
  -- and a private draft is written into a world-readable feed as 'removed'.
  -- That is not hypothetical — it is what this function did until a test asked
  -- whether a draft ever appears.
  if v_type = 'product' then
    v_public_new := coalesce(v_new ->> 'status' = 'live', false);
    v_public_old := coalesce(v_old ->> 'status' = 'live', false);
  elsif v_type = 'placement' then
    v_public_new := coalesce(v_new ->> 'status' = 'active', false);
    v_public_old := coalesce(v_old ->> 'status' = 'active', false);
  elsif v_type = 'company' then
    v_public_new := coalesce(v_new ->> 'status' = 'active', false);
    v_public_old := coalesce(v_old ->> 'status' = 'active', false);
  elsif v_type = 'company_destination' then
    v_public_new := coalesce(v_new ->> 'status' = 'active', false);
    v_public_old := coalesce(v_old ->> 'status' = 'active', false);
  else
    -- destinations and departures are public whenever they exist.
    v_public_new := v_new is not null;  -- already boolean
    v_public_old := v_old is not null;  -- already boolean
  end if;

  if not (v_public_new or v_public_old) then
    return coalesce(new, old);
  end if;

  v_change := case
    when not v_public_old then 'created'
    when not v_public_new then 'removed'
    else 'updated'
  end;

  v_id := coalesce(v_new ->> v_key, v_old ->> v_key);

  insert into public.catalogue_changes (entity_type, entity_id, change)
  values (v_type, v_id, v_change);

  return coalesce(new, old);
end;
$$;

drop trigger if exists destinations_catalogue_note on public.destinations;
create trigger destinations_catalogue_note
  after insert or update or delete on public.destinations
  for each row execute function public.catalogue_note('destination', 'id');

drop trigger if exists products_catalogue_note on public.products;
create trigger products_catalogue_note
  after insert or update or delete on public.products
  for each row execute function public.catalogue_note('product', 'id');

drop trigger if exists placements_catalogue_note on public.placements;
create trigger placements_catalogue_note
  after insert or update or delete on public.placements
  for each row execute function public.catalogue_note('placement', 'id');

drop trigger if exists companies_catalogue_note on public.companies;
create trigger companies_catalogue_note
  after insert or update or delete on public.companies
  for each row execute function public.catalogue_note('company', 'id');

drop trigger if exists departures_catalogue_note on public.product_departures;
create trigger departures_catalogue_note
  after insert or update or delete on public.product_departures
  for each row execute function public.catalogue_note('departure', 'id');

/* ========================================================================== */
/* What a client asks                                                         */
/* ========================================================================== */

/**
 * The cheap poll. Everything a client needs to decide whether to refetch, and
 * what to put on the screen under "Updated".
 *
 * `server_time` is the ONLY value a client may display as its last-updated
 * time, and only after a fetch that actually succeeded.
 *
 * `latest_revision` is a change token, deliberately NOT a row count. A count
 * goes DOWN if the feed is ever trimmed, which would tell a client it had
 * already seen more than exists and stop it refetching. A max never goes down.
 * It is also O(1) off the primary key rather than a scan on a poll endpoint.
 *
 * `next_scheduled_change` is the date on which the visible catalogue changes
 * with nobody editing anything — the next placement term boundary. A client
 * that reaches it must refetch even if `last_change_at` has not moved. It is
 * null when no boundary is pending, which means "nothing is scheduled", not
 * "nothing will ever change".
 */
create or replace function public.catalogue_head()
returns table (
  server_time timestamptz,
  last_change_at timestamptz,
  latest_revision bigint,
  next_scheduled_change date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    now(),
    (select max(changed_at) from public.catalogue_changes),
    (select max(revision) from public.catalogue_changes),
    (select min(d) from (
       select starts_on as d from public.placements
        where status in ('reserved', 'active') and starts_on > current_date
       union all
       select ends_on + 1 from public.placements
        where status = 'active' and ends_on >= current_date
     ) boundaries);
$$;

/**
 * What changed since the client last heard. Returns the server's own clock
 * alongside, so a client never has to consult its own.
 *
 * CAVEAT, STATED BECAUSE IT IS EASY TO GET WRONG: rows are stamped when they
 * are written, but become visible when their transaction COMMITS. A long
 * transaction can therefore publish a change stamped earlier than one a client
 * has already seen. Callers pass `p_since` a little behind their last known
 * time — the default overlap below is applied for them — and treat results as
 * idempotent upserts keyed by (entity_type, entity_id). Duplicates are free;
 * a missed withdrawal is not.
 */
create or replace function public.catalogue_since(p_since timestamptz)
returns table (
  entity_type text,
  entity_id text,
  change text,
  changed_at timestamptz,
  server_time timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.entity_type, c.entity_id, c.change, c.changed_at, now()
    from public.catalogue_changes c
   where c.changed_at > coalesce(p_since, '-infinity'::timestamptz) - interval '2 minutes'
   order by c.revision;
$$;

alter table public.catalogue_changes enable row level security;
alter table public.catalogue_changes force row level security;

-- No policy grants direct SELECT. The feed is read through the two functions
-- above, which is what keeps the shape of the answer under our control.
grant execute on function public.catalogue_head()             to anon, authenticated;
grant execute on function public.catalogue_since(timestamptz) to anon, authenticated;
revoke all on public.catalogue_changes from anon, authenticated;
