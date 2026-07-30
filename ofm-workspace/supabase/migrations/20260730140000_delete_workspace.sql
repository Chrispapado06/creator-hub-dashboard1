-- =====================================================================
-- OFM Workspace — creator-only "Delete workspace"
-- File: supabase/migrations/20260730140000_delete_workspace.sql
--
-- Only the user who CREATED a workspace (workspaces.created_by = auth.uid()) may
-- delete it. Deleting the workspace row cascades to all its pages, databases,
-- memberships, and invites (every FK to workspaces is ON DELETE CASCADE).
--
-- The last-owner constraint trigger would otherwise abort that cascade — removing
-- every membership leaves 0 active owners — so it now skips when the workspace
-- row itself no longer exists (i.e. the whole workspace is being deleted).
-- =====================================================================

create or replace function public.enforce_last_owner()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := coalesce(old.workspace_id, new.workspace_id);
  v_active_owners int;
begin
  -- Workspace gone => it's being deleted; the "keep an owner" rule doesn't apply.
  if not exists (select 1 from public.workspaces w where w.id = v_ws) then
    return null;
  end if;

  select count(*) into v_active_owners
  from public.memberships m
  where m.workspace_id = v_ws
    and m.role = 'owner'::public.app_role
    and m.status = 'active';

  if v_active_owners = 0 then
    raise exception 'Workspace % must retain at least one active owner', v_ws
      using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Creator-only delete. `is distinct from` is NULL-safe: a seeded workspace whose
-- created_by is NULL has no creator, so nobody can delete it through this path.
create or replace function public.delete_workspace(p_workspace uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_creator uuid;
begin
  select created_by into v_creator from public.workspaces where id = p_workspace;
  if v_creator is null or v_creator is distinct from auth.uid() then
    raise exception 'Only the workspace creator can delete this workspace'
      using errcode = '42501';
  end if;
  delete from public.workspaces where id = p_workspace; -- cascades to all children
end;
$$;

revoke execute on function public.delete_workspace(uuid) from anon, public;
grant execute on function public.delete_workspace(uuid) to authenticated;

-- =====================================================================
-- END migration
-- =====================================================================
