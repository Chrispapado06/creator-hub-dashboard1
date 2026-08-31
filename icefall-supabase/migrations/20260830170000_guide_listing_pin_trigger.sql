-- Fix a recursion bug I introduced in 20260830150000, and pin `listed` properly.
--
-- WHAT I GOT WRONG. To stop a guide listing themselves, I pinned `listed` in the
-- UPDATE policy's WITH CHECK by re-reading the stored value:
--
--     listed is not distinct from
--       (select g.listed from public.guide_profiles g where g.id = (select auth.uid()))
--
-- That subquery reads `guide_profiles` from inside a policy ON `guide_profiles`,
-- so evaluating it re-enters the policy: **infinite recursion detected in policy
-- for relation "guide_profiles"**.
--
-- The effect was not a smaller hole. It was a bigger one pointed the other way:
-- EVERY update to a guide's own profile failed, so a guide could not edit their
-- headline, bio, rate or availability at all. Caught by testing the fix rather
-- than by reading it — the probe tried to set `listed` and got a recursion error
-- instead of a policy refusal, which is a different failure wearing the same
-- "refused" costume.
--
-- I copied the shape from `profiles_update_self`, which pins `role` and
-- `username` the same way and works. It works there because that policy's
-- subquery is on a table whose SELECT policy is `using (true)` — a fact about
-- the neighbour, not about the technique. §6f in miniature: the pattern's
-- correctness was not observable from the file it was copied from.
--
-- THE FIX: A TRIGGER, not a policy. Session 03's argument for auditing companies
-- applies unchanged — a trigger fires for every path including definer functions
-- and the service role, cannot recurse through RLS, and cannot be forgotten by
-- the next person writing a policy. The policy keeps deciding WHO may update;
-- the trigger decides WHAT they may change.

begin;

/* The policy stops pinning `listed`; it goes back to deciding access only. */
drop policy if exists guide_profiles_update on public.guide_profiles;
create policy guide_profiles_update on public.guide_profiles
  for update to authenticated
  using ((id = (select auth.uid())) or public.is_admin())
  with check ((id = (select auth.uid())) or public.is_admin());

/**
 * `listed` moves only through `set_guide_listed`, which demands a staff role and
 * a reason and writes the audit event.
 *
 * The function sets a transaction-local flag so this trigger can tell a
 * sanctioned change from anybody else's. `current_setting(..., true)` returns
 * null rather than raising when the flag was never set, which is the whole
 * reason the second argument is there.
 */
create or replace function public.guide_profiles_pin_listed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.listed is distinct from old.listed
     and coalesce(current_setting('icefall.listing_change', true), '') <> 'sanctioned'
  then
    raise exception
      'listed is set by ICEFALL, not by the guide — use set_guide_listed(id, value, reason)';
  end if;
  return new;
end;
$$;

drop trigger if exists guide_profiles_pin_listed on public.guide_profiles;
create trigger guide_profiles_pin_listed
  before update on public.guide_profiles
  for each row execute function public.guide_profiles_pin_listed();

/* The sanctioned path raises the flag for the length of its own transaction. */
create or replace function public.set_guide_listed(
  p_guide_id uuid,
  p_value boolean,
  p_reason text
)
returns void
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_old boolean;
begin
  if not public.has_staff_role(array['support','operations','sales']) then
    raise exception 'only ICEFALL staff may list or unlist a guide';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'listing a guide requires a stated reason';
  end if;

  select listed into v_old from public.guide_profiles where id = p_guide_id for update;
  if not found then raise exception 'no such guide profile'; end if;
  if v_old = p_value then return; end if;

  perform set_config('icefall.listing_change', 'sanctioned', true);  -- true = this transaction only
  update public.guide_profiles set listed = p_value where id = p_guide_id;
  perform set_config('icefall.listing_change', '', true);

  perform public.record_audit_event(
    'guide.listed_set', 'guide', p_guide_id::text,
    jsonb_build_object('listed', v_old),
    jsonb_build_object('listed', p_value),
    p_reason, null);
end;
$$;

revoke all on function public.set_guide_listed(uuid, boolean, text) from public, anon;
grant execute on function public.set_guide_listed(uuid, boolean, text) to authenticated;

commit;
