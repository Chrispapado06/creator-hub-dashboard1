-- =====================================================================
-- OFM Workspace — self-service workspace creation
-- A signed-in user can create a new workspace and becomes its owner. This is
-- the only client path that writes workspaces/memberships (both have no client
-- write policies), so it runs SECURITY DEFINER and only ever grants the CALLER
-- ownership of the workspace THEY just created — no escalation vector.
-- =====================================================================

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_name text := coalesce(nullif(trim(p_name), ''), 'New workspace');
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- unique, url-ish slug: <name-slug>-<6 hex>
  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.workspaces (name, slug, created_by)
    values (v_name, v_slug, v_uid)
    returning id into v_id;

  insert into public.memberships (workspace_id, user_id, role, status, invited_by)
    values (v_id, v_uid, 'owner', 'active', v_uid);

  return v_id;
end;
$$;

revoke execute on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated;
