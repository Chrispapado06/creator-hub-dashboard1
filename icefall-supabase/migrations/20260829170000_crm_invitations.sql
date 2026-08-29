-- ICEFALL — how a person gets an account they did not sign up for.
--
-- Owner decision 20: "I add a company via the CRM, we give the users logins."
-- That sentence needs a mechanism the schema did not have.
--
-- ── THE GAP, WHICH WAS ALREADY VISIBLE AND UNNOTICED ───────────────────────
--
-- `company_users.status` and `staff_members.status` both permit 'invited'. Both
-- tables key on `profile_id NOT NULL`, which references a profile, which
-- references an auth user. So the invited state was UNREACHABLE: you cannot
-- record that somebody has been invited until they already have an account, at
-- which point they have not been invited, they have arrived.
--
-- Same class as the task kinds that nothing could raise and the guide commission
-- rule that nothing could resolve. A state the schema permits and no code path
-- can produce is a state that reads as supported and is not.
--
-- ── AN INVITATION IS KEYED BY EMAIL, NOT BY PERSON ─────────────────────────
--
-- That is the whole point: the person does not exist yet. The invitation names
-- an address, and whoever proves control of that address by signing up with it
-- consumes it. Nothing here sends mail — that is the application's job — and
-- nothing here creates an auth user, which only the service role can do.
--
-- ── THE INVARIANT THIS MUST NOT BREAK ──────────────────────────────────────
--
-- `handle_new_user` gives every new account `role = 'athlete'`, always. Staff and
-- providers are promoted deliberately, never by registering. That still holds:
-- signing up with an invited address still creates an athlete. Accepting is a
-- SECOND, explicit act, and for staff it is the only path that may set
-- `role = 'admin'` — which is why accepting is a definer function that audits
-- rather than a policy that permits.
--
-- Note what accepting does NOT do for an operator: nothing to `profiles.role`.
-- A company user's access comes from `company_users`, not from their role, so
-- there is no elevation to perform and none is performed.
--
-- ── THE PRECONDITION THIS MECHANISM RESTS ON ───────────────────────────────
--
-- An invitation is consumed by whoever signs in with the address it names. That
-- is only a proof of identity if the address was VERIFIED. If Supabase Auth is
-- configured with email confirmation disabled, then registering with an address
-- proves nothing, and anybody who guesses an invited address becomes staff.
--
--   Authentication → Providers → Email → "Confirm email" MUST be ON.
--
-- The database cannot enforce this — it can only be honest that the guarantee
-- lives one layer up. It is on the handover list for that reason.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),

  -- Lowercased and trimmed, so `unique` means one person rather than one
  -- spelling — the same rule the waitlist learned.
  email text not null,
  kind text not null check (kind in ('company_user', 'staff')),

  company_id uuid references public.companies (id) on delete cascade,
  company_role text check (company_role is null or company_role in ('admin', 'sales')),
  staff_role public.icefall_staff_role,

  invited_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- An invitation that never expires is a standing key to somebody's business.
  expires_at timestamptz not null default (now() + interval '14 days'),

  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,

  constraint invitations_email_normalised check (email = lower(btrim(email))),
  constraint invitations_email_shape check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),

  -- The kind and its fields must agree, or a "company invitation" with no
  -- company silently becomes something else.
  constraint invitations_kind_coherent check (
    (kind = 'company_user' and company_id is not null and company_role is not null and staff_role is null)
    or (kind = 'staff' and staff_role is not null and company_id is null and company_role is null)
  ),
  constraint invitations_accepted_coherent check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint invitations_revoked_has_reason check (
    revoked_at is null or (revoked_reason is not null and length(trim(revoked_reason)) > 0)
  )
);

-- One LIVE invitation per address per company. A superseded or revoked one may
-- sit alongside it — the history is worth keeping — but two open invitations to
-- the same person is how somebody ends up with two memberships.
create unique index if not exists invitations_one_open_per_email
  on public.invitations (email, kind, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where accepted_at is null and revoked_at is null;

create index if not exists invitations_email_idx on public.invitations (email);
create index if not exists invitations_company_idx on public.invitations (company_id);

comment on table public.invitations is
  'Keyed by EMAIL because the person does not exist yet. Accepting is a second explicit act — signing up still creates an athlete.';

/* ========================================================================== */
/* Issuing                                                                    */
/* ========================================================================== */

create or replace function public.invite_company_user(
  p_company_id uuid,
  p_email text,
  p_company_role text default 'sales'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  -- ICEFALL staff, or an admin at that company inviting a colleague. A sales
  -- employee cannot bring people in — same boundary as the catalogue.
  if not (public.has_staff_role(array['sales', 'operations']) or public.is_company_admin(p_company_id)) then
    raise exception 'only ICEFALL staff or a company admin may invite a company user';
  end if;
  if p_company_role not in ('admin', 'sales') then
    raise exception 'a company user is an admin or a sales employee';
  end if;

  insert into public.invitations (email, kind, company_id, company_role, invited_by)
  values (v_email, 'company_user', p_company_id, p_company_role, auth.uid())
  returning id into v_id;

  perform public.record_audit_event(
    'invitation.issued', 'company', p_company_id::text, null,
    jsonb_build_object('email', v_email, 'company_role', p_company_role), null, p_company_id);

  return v_id;
end;
$$;

create or replace function public.invite_staff(
  p_email text,
  p_staff_role public.icefall_staff_role
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  -- Only a super admin. Inviting staff is inviting somebody who can invite
  -- staff, and that is the most consequential grant in the system.
  if public.has_staff_role(array['super_admin']) is not true then
    raise exception 'only a super admin may invite ICEFALL staff';
  end if;

  insert into public.invitations (email, kind, staff_role, invited_by)
  values (v_email, 'staff', p_staff_role, auth.uid())
  returning id into v_id;

  perform public.record_audit_event(
    'invitation.issued', 'staff', v_email, null,
    jsonb_build_object('staff_role', p_staff_role), null, null);

  return v_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.invitations%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'revoking an invitation requires a reason';
  end if;

  select * into v from public.invitations where id = p_invitation_id for update;
  if not found then raise exception 'no such invitation'; end if;
  if v.accepted_at is not null then
    raise exception 'that invitation has already been accepted; remove the membership instead';
  end if;

  if v.kind = 'staff' then
    if public.has_staff_role(array['super_admin']) is not true then
      raise exception 'only a super admin may revoke a staff invitation';
    end if;
  elsif not (public.has_staff_role(array['sales', 'operations']) or public.is_company_admin(v.company_id)) then
    raise exception 'only ICEFALL staff or that company''s admin may revoke this invitation';
  end if;

  update public.invitations
     set revoked_at = now(), revoked_reason = btrim(p_reason)
   where id = p_invitation_id;

  perform public.record_audit_event(
    'invitation.revoked', coalesce(v.kind, 'invitation'), p_invitation_id::text,
    jsonb_build_object('email', v.email), null, p_reason, v.company_id);
end;
$$;

/* ========================================================================== */
/* Accepting — the only path that may make somebody staff                     */
/* ========================================================================== */

/**
 * Consume every open invitation addressed to the signed-in user's own email.
 *
 * Called by the application straight after sign-in. It reads the caller's
 * address from `auth.users` rather than taking it as an argument — an accept
 * function that trusts a caller-supplied email is a function that grants
 * anybody any invitation they can name.
 *
 * Returns how many were accepted, so a caller can tell "nothing was waiting"
 * from "something went wrong" rather than guessing from silence.
 */
create or replace function public.accept_invitations()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_count int := 0;
  inv public.invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then
    raise exception 'this account has no email address to match an invitation against';
  end if;

  for inv in
    select * from public.invitations
    where email = v_email
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    for update
  loop
    if inv.kind = 'company_user' then
      -- No change to `profiles.role`. A company user's access comes from
      -- `company_users`, so there is no elevation to perform here.
      insert into public.company_users (company_id, profile_id, company_role, status)
      values (inv.company_id, auth.uid(), inv.company_role, 'active')
      on conflict (company_id, profile_id) do update
        set company_role = excluded.company_role, status = 'active';

    else
      -- THE ONE PATH THAT MAY SET role = 'admin'. It requires an unexpired,
      -- unrevoked invitation issued by a super admin to this exact address.
      update public.profiles set role = 'admin' where id = auth.uid();

      insert into public.staff_members (profile_id, staff_role, status, active)
      values (auth.uid(), inv.staff_role, 'active', true)
      on conflict (profile_id) do update
        set staff_role = excluded.staff_role, status = 'active', active = true;
    end if;

    update public.invitations
       set accepted_at = now(), accepted_by = auth.uid()
     where id = inv.id;

    -- Recorded directly rather than through `record_audit_event`, which requires
    -- the actor to already be staff — and at this instant they have just become
    -- staff, or are an operator who never will be.
    --
    -- This insert clears `audit_events_insert` (which demands `is_staff()`)
    -- because a definer function runs as its owner, and the owner bypasses RLS.
    -- Spelled out because it is invisible: the operator branch writes this row
    -- as somebody who is not staff and never will be, so anyone tightening the
    -- audit policy or re-owning this function to a non-bypassing role would
    -- silently break company onboarding while staff onboarding kept working.
    insert into public.audit_events
      (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
    values
      (auth.uid(), inv.kind, 'invitation.accepted', inv.kind, inv.id::text, null,
       jsonb_build_object('email', v_email, 'company_role', inv.company_role,
                          'staff_role', inv.staff_role),
       inv.company_id);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

-- An invitation names an email address and a commercial relationship. Staff see
-- them; a company admin sees their own company's; nobody else sees any — NOT
-- even the invitee, who has no account yet by definition.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_staff() or (company_id is not null and public.is_company_admin(company_id)));

-- No INSERT, UPDATE or DELETE policy at all. Every write goes through the four
-- functions above, each of which checks who is asking and writes an audit event.
-- A hand-inserted invitation is a grant with nobody behind it.

grant select on public.invitations to authenticated;
revoke all on public.invitations from anon;

revoke all on function public.invite_company_user(uuid, text, text)                    from public, anon;
revoke all on function public.invite_staff(text, public.icefall_staff_role)            from public, anon;
revoke all on function public.revoke_invitation(uuid, text)                            from public, anon;
revoke all on function public.accept_invitations()                                     from public, anon;
grant execute on function public.invite_company_user(uuid, text, text)                 to authenticated;
grant execute on function public.invite_staff(text, public.icefall_staff_role)         to authenticated;
grant execute on function public.revoke_invitation(uuid, text)                         to authenticated;
grant execute on function public.accept_invitations()                                  to authenticated;
