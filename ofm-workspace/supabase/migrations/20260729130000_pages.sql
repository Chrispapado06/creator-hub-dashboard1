-- =====================================================================
-- OFM Workspace — Step 2: Pages (nested docs) + favorites + asset storage
-- Reuses the auth foundation's SECURITY DEFINER helpers (is_active_member,
-- is_manager_or_owner, is_active_member_any) so page policies never touch their
-- own table => no 42P17 recursion.
-- =====================================================================

-- 1. pages: nested documents. `content` is a TipTap/ProseMirror JSON doc.
create table if not exists public.pages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id    uuid references public.pages(id) on delete cascade,
  title        text not null default '',
  icon         text,                                   -- emoji
  content      jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  position     double precision not null default 0,     -- order among siblings
  created_by   uuid references auth.users(id) on delete set null,
  archived_at  timestamptz,                             -- soft delete (trash)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pages_ws_parent_pos_idx on public.pages (workspace_id, parent_id, position);
create index if not exists pages_ws_archived_idx    on public.pages (workspace_id, archived_at);
create index if not exists pages_created_by_idx      on public.pages (created_by);

drop trigger if exists trg_pages_updated on public.pages;
create trigger trg_pages_updated before update on public.pages
  for each row execute function public.set_updated_at();

-- 2. per-user favorites
create table if not exists public.page_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  page_id    uuid not null references public.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

-- 3. RLS
alter table public.pages          enable row level security;
alter table public.page_favorites enable row level security;

-- pages: any active member reads; you create your own; owner/manager OR the
-- page's creator can edit/delete (chatters get "limited edit rights elsewhere").
drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages for select to authenticated
  using ( public.is_active_member(workspace_id) );

drop policy if exists pages_insert on public.pages;
create policy pages_insert on public.pages for insert to authenticated
  with check ( public.is_active_member(workspace_id) and created_by = auth.uid() );

drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages for update to authenticated
  using (
    public.is_active_member(workspace_id)
    and (public.is_manager_or_owner(workspace_id) or created_by = auth.uid())
  )
  with check (
    public.is_active_member(workspace_id)
    and (public.is_manager_or_owner(workspace_id) or created_by = auth.uid())
  );

drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages for delete to authenticated
  using (
    public.is_active_member(workspace_id)
    and (public.is_manager_or_owner(workspace_id) or created_by = auth.uid())
  );

-- favorites: manage your own only
drop policy if exists page_favorites_select on public.page_favorites;
create policy page_favorites_select on public.page_favorites for select to authenticated
  using ( user_id = auth.uid() );

drop policy if exists page_favorites_insert on public.page_favorites;
create policy page_favorites_insert on public.page_favorites for insert to authenticated
  with check ( user_id = auth.uid() and public.is_active_member_any() );

drop policy if exists page_favorites_delete on public.page_favorites;
create policy page_favorites_delete on public.page_favorites for delete to authenticated
  using ( user_id = auth.uid() );

-- 4. grants (RLS still applies on top)
revoke all on public.pages, public.page_favorites from anon, authenticated;
grant select, insert, update, delete on public.pages          to authenticated;
grant select, insert, delete         on public.page_favorites to authenticated;
grant all on public.pages, public.page_favorites to service_role;

-- 5. storage bucket for page images/attachments (private; served via signed URLs)
insert into storage.buckets (id, name, public)
values ('page-assets', 'page-assets', false)
on conflict (id) do nothing;

drop policy if exists "page_assets_read" on storage.objects;
create policy "page_assets_read" on storage.objects for select to authenticated
  using ( bucket_id = 'page-assets' and public.is_active_member_any() );

drop policy if exists "page_assets_insert" on storage.objects;
create policy "page_assets_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'page-assets' and public.is_active_member_any() );

drop policy if exists "page_assets_update" on storage.objects;
create policy "page_assets_update" on storage.objects for update to authenticated
  using ( bucket_id = 'page-assets' and public.is_active_member_any() );

drop policy if exists "page_assets_delete" on storage.objects;
create policy "page_assets_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'page-assets' and public.is_active_member_any() );
