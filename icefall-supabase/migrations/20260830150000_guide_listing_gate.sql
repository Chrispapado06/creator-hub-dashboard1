-- A person may claim to be a guide. Only ICEFALL may LIST one.
--
-- THE HOLE. `guide_profiles_write` was `for all` with
-- `using (id = auth.uid() or is_admin())` and the same WITH CHECK. `listed`
-- defaulted to false and was pinned by nothing. `guide_profiles_select` is
-- `using (listed or id = auth.uid() or is_admin())`.
--
-- So: any signed-in athlete could insert `guide_profiles (id) values
-- (auth.uid())`, set `listed = true`, and become publicly readable as a guide.
--
-- Found by the guide-app session while wiring sign-in. Blast radius verified
-- separately from the defect (§6f) and it is currently narrow — the only live
-- reader of `guide_profiles` anywhere is that app's own sign-in gate. Which is
-- exactly what makes it worth fixing now: the thing it defeats is the door whose
-- entire job is to say ICEFALL decides who is a guide.
--
-- THE FINDING UNDERNEATH IT IS THE MORE USEFUL HALF. The constitution states an
-- invariant: "signup always creates an athlete, never a higher role". That is
-- TRUE — of `public.profiles.role`, which `profiles_insert_self` pins. But
-- `guide_profiles` is a different table and nothing pinned membership of it.
-- Two statements, each accurate about its own table, and the guarantee everybody
-- reads off them was held by neither. §6l one level up: not a predicate whose
-- inputs changed, but two correct facts that do not compose.
--
-- THE DESIGN THIS KEEPS. Creating the row stays self-serve, deliberately — a
-- guide claims their own trade, and that claim is free. What ICEFALL controls is
-- what the claim is WORTH: `credentials_verified` was already pinned false, and
-- `listed` now joins it. The honesty doctrine's own shape — anybody may say
-- something; only a check makes it an assertion ICEFALL is making.

begin;

/* ========================================================================== */
/* Claiming is self-serve. Listing is not.                                    */
/* ========================================================================== */

drop policy if exists guide_profiles_write on public.guide_profiles;

-- INSERT: your own row only, and it arrives unlisted. Staff may create one for
-- somebody — the branch exists because ICEFALL onboarding a guide by hand is a
-- real path, not a workaround.
drop policy if exists guide_profiles_insert on public.guide_profiles;
create policy guide_profiles_insert on public.guide_profiles
  for insert to authenticated
  with check (
    (id = (select auth.uid()) and listed = false)
    or public.is_admin()
  );

-- UPDATE: edit your own profile freely EXCEPT `listed`, which must match what is
-- already stored. Pinned by re-reading rather than by a constant, the same way
-- `profiles_update_self` pins `role` and `username` — so the rule survives a
-- default changing.
drop policy if exists guide_profiles_update on public.guide_profiles;
create policy guide_profiles_update on public.guide_profiles
  for update to authenticated
  using ((id = (select auth.uid())) or public.is_admin())
  with check (
    (
      id = (select auth.uid())
      and listed is not distinct from
          (select g.listed from public.guide_profiles g where g.id = (select auth.uid()))
    )
    or public.is_admin()
  );

-- DELETE: withdrawing your own profile is yours to do.
drop policy if exists guide_profiles_delete on public.guide_profiles;
create policy guide_profiles_delete on public.guide_profiles
  for delete to authenticated
  using ((id = (select auth.uid())) or public.is_admin());

/* ========================================================================== */
/* Listing a guide is a deliberate act with a stated reason                   */
/* ========================================================================== */

/**
 * The only sanctioned path for `listed`, mirroring `set_company_real_business`.
 *
 * A listed guide is one ICEFALL is putting in front of climbers choosing who to
 * follow onto a mountain. That is an assertion, and an assertion needs somebody
 * who made it and a reason they can be asked about later.
 */
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
  if v_old = p_value then return; end if;  -- nothing changed, nothing to claim

  update public.guide_profiles set listed = p_value where id = p_guide_id;

  perform public.record_audit_event(
    'guide.listed_set', 'guide', p_guide_id::text,
    jsonb_build_object('listed', v_old),
    jsonb_build_object('listed', p_value),
    p_reason, null);
end;
$$;

revoke all on function public.set_guide_listed(uuid, boolean, text) from public, anon;
grant execute on function public.set_guide_listed(uuid, boolean, text) to authenticated;

comment on column public.guide_profiles.listed is
  'Whether ICEFALL shows this guide to climbers. NOT self-settable — pinned by guide_profiles_update and moved only by set_guide_listed(), which demands a staff role and a reason. Creating the profile is free; being listed is not.';

commit;
