-- =====================================================================
-- OFM Workspace — Workspace Settings (branding + per-workspace access)
-- File: supabase/migrations/20260730120000_workspace_settings.sql
--
-- Adds, all additively (safe to re-run):
--  * workspaces.icon (emoji or "si:<brand>") and workspaces.logo_url (image)
--    -> owner-editable branding. UPDATE is already owner-gated by the
--       workspaces_update RLS policy; we widen the column GRANT to match.
--  * a PUBLIC "workspace-logos" storage bucket (logos aren't sensitive; public
--    read = no signed-URL churn in the switcher). Writes are owner-only, scoped
--    to the "<workspace_id>/" folder.
--  * owner-only RPCs to grant/revoke a user's access to a workspace. "Who can
--    see which workspace" == who has an active membership, and memberships have
--    NO client write policy, so this is the only client path (SECURITY DEFINER,
--    re-checks is_owner => no escalation vector). The last-owner constraint
--    trigger from the foundation still fires on the DELETE path.
-- =====================================================================

-- 1. Branding columns -------------------------------------------------
alter table public.workspaces add column if not exists icon     text;
alter table public.workspaces add column if not exists logo_url text;

-- widen the owner-only column grant (RLS still gates the row to is_owner)
grant update (name, icon, logo_url) on public.workspaces to authenticated;

-- 2. Public logos bucket ---------------------------------------------
insert into storage.buckets (id, name, public)
values ('workspace-logos', 'workspace-logos', true)
on conflict (id) do nothing;

-- public read (bucket is public, but a SELECT policy keeps the API consistent)
drop policy if exists workspace_logos_read on storage.objects;
create policy workspace_logos_read on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'workspace-logos' );

-- owners may write/replace/remove logos inside their own "<workspace_id>/" folder
drop policy if exists workspace_logos_insert on storage.objects;
create policy workspace_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-logos'
    and public.is_owner( ((storage.foldername(name))[1])::uuid )
  );

drop policy if exists workspace_logos_update on storage.objects;
create policy workspace_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workspace-logos'
    and public.is_owner( ((storage.foldername(name))[1])::uuid )
  )
  with check (
    bucket_id = 'workspace-logos'
    and public.is_owner( ((storage.foldername(name))[1])::uuid )
  );

drop policy if exists workspace_logos_delete on storage.objects;
create policy workspace_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-logos'
    and public.is_owner( ((storage.foldername(name))[1])::uuid )
  );

-- 3. Per-workspace access RPCs (owner-only) ---------------------------

-- Grant an EXISTING user (looked up by their confirmed profile email) access to
-- a workspace, or reactivate/re-role them if they were already a member.
create or replace function public.add_workspace_member_by_email(
  p_email text, p_workspace uuid, p_role public.app_role default 'chatter')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not public.is_owner(p_workspace) then
    raise exception 'Only an active owner can manage access' using errcode = '42501';
  end if;

  select p.id into v_uid
  from public.profiles p
  where p.email = trim(p_email)          -- profiles.email is citext (case-insensitive)
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

-- Revoke a user's access to a workspace (removes the membership row). The
-- foundation's last-owner constraint trigger blocks removing the final owner.
create or replace function public.remove_workspace_member(
  p_user uuid, p_workspace uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_workspace) then
    raise exception 'Only an active owner can manage access' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove your own access' using errcode = '42501';
  end if;
  delete from public.memberships
   where user_id = p_user and workspace_id = p_workspace;
end;
$$;

revoke execute on function
  public.add_workspace_member_by_email(text, uuid, public.app_role),
  public.remove_workspace_member(uuid, uuid)
from public;

grant execute on function
  public.add_workspace_member_by_email(text, uuid, public.app_role),
  public.remove_workspace_member(uuid, uuid)
to authenticated;

-- =====================================================================
-- END migration
-- =====================================================================
