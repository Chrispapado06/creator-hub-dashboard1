-- =====================================================================
-- OFM Workspace — SECURITY FIX: privileged-function guards + EXECUTE grants
-- File: supabase/migrations/20260730130000_fix_privileged_fn_grants.sql
--
-- TWO independent holes, both closed here:
--
-- (A) NULL owner-gate bypass. `is_owner(ws)` returns NULL (not false) for a
--     NON-member, because membership_role() is NULL and `NULL = 'owner'` is NULL.
--     The guards were written `if not is_owner(ws) then raise` — and `not NULL`
--     is NULL, so the THEN branch never fired: a non-member (or anon) sailed
--     straight past. (RLS `using(is_owner(id))` was always safe: there NULL =
--     DENY. Only these imperative SECURITY DEFINER guards were affected.)
--     Fix: `is_owner(ws) is not true` — true for BOTH false and NULL.
--
-- (B) anon could EXECUTE privileged functions. Supabase default privileges
--     auto-GRANT EXECUTE to anon+authenticated on every new public function.
--     The foundation only did `revoke ... from public`, which does NOT remove
--     those explicit role grants — so anon kept EXECUTE on set_member_role
--     (=> role escalation) and revoke_user_sessions (=> force-logout anyone).
--     Fix: hard-revoke EXECUTE from anon + public on every privileged function,
--     then re-grant only the intended role.
-- =====================================================================

-- (A) NULL-safe owner guards ----------------------------------------
create or replace function public.set_member_role(
  p_user uuid, p_workspace uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_owner(p_workspace) is not true then
    raise exception 'Only an active owner can change roles' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  update public.memberships
     set role = p_role, updated_at = now()
   where user_id = p_user and workspace_id = p_workspace;
  if not found then raise exception 'Membership not found'; end if;
end;
$$;

create or replace function public.add_workspace_member_by_email(
  p_email text, p_workspace uuid, p_role public.app_role default 'chatter')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if public.is_owner(p_workspace) is not true then
    raise exception 'Only an active owner can manage access' using errcode = '42501';
  end if;
  select p.id into v_uid
  from public.profiles p
  where p.email = trim(p_email)
  limit 1;
  if v_uid is null then
    raise exception 'No user with that email. Invite them from Team first.'
      using errcode = 'P0002';
  end if;
  insert into public.memberships (workspace_id, user_id, role, status, invited_by)
    values (p_workspace, v_uid, p_role, 'active', auth.uid())
  on conflict (workspace_id, user_id) do update
    set status = 'active', role = excluded.role, updated_at = now();
  return v_uid;
end;
$$;

create or replace function public.remove_workspace_member(
  p_user uuid, p_workspace uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_owner(p_workspace) is not true then
    raise exception 'Only an active owner can manage access' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove your own access' using errcode = '42501';
  end if;
  delete from public.memberships
   where user_id = p_user and workspace_id = p_workspace;
end;
$$;

-- (B) Hard-revoke EXECUTE from anon + public, re-grant intended roles -

-- Owner/self-service RPCs: authenticated only (their bodies enforce authZ).
revoke execute on function
  public.set_member_role(uuid, uuid, public.app_role),
  public.add_workspace_member_by_email(text, uuid, public.app_role),
  public.remove_workspace_member(uuid, uuid),
  public.create_workspace(text),
  public.accept_my_invites()
from anon, public;

grant execute on function
  public.set_member_role(uuid, uuid, public.app_role),
  public.add_workspace_member_by_email(text, uuid, public.app_role),
  public.remove_workspace_member(uuid, uuid),
  public.create_workspace(text),
  public.accept_my_invites()
to authenticated;

-- Session revocation is a service_role-only privileged op (used by the
-- deactivate Edge Function). No client role may call it.
revoke execute on function public.revoke_user_sessions(uuid)
  from anon, authenticated, public;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- =====================================================================
-- END migration
-- =====================================================================
