-- Who handles whom on the support desk (CR-14).
--
-- The owner: "when we add staff to handle support we give them support for xyz
-- people so either for guides, app users etc." So a staff member carries the
-- REQUESTER KINDS they handle. Empty means unscoped — the desk shows everyone,
-- which is what a super admin or a one-person desk wants — and a scope is an
-- ASSIGNMENT, not a wall: the select policies are untouched, so a scoped person
-- can still open any ticket when covering for a colleague. The scope decides
-- what their desk shows by default, not what they are permitted to see.
--
-- Only a super admin writes staff_members (existing policy), so only they hand
-- out scopes — same authority that appoints staff at all.

begin;

alter table public.staff_members
  add column if not exists support_scopes text[] not null default '{}';

alter table public.staff_members drop constraint if exists staff_support_scopes_known;
alter table public.staff_members add constraint staff_support_scopes_known check (
  support_scopes <@ array['athlete', 'guide', 'company', 'visitor', 'staff']::text[]
);

-- NO DIRECT WRITE — and my first draft of this file granted one, reopening a
-- hole crm_fixes deliberately closed: staff_members changes go through audited
-- definer functions so the audit call is never a courtesy somebody can skip.
-- Scopes get the same shape as set_staff_role.
create or replace function public.set_support_scopes(
  p_profile_id uuid,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before text[];
begin
  if public.has_staff_role(array['super_admin']) is not true then
    raise exception 'only a super admin decides who handles whom on the support desk';
  end if;
  select support_scopes into v_before from public.staff_members where profile_id = p_profile_id for update;
  if not found then raise exception 'no such staff member'; end if;

  update public.staff_members set support_scopes = p_scopes where profile_id = p_profile_id;

  perform public.record_audit_event(
    'staff.support_scopes_set', 'staff', p_profile_id::text,
    jsonb_build_object('support_scopes', v_before),
    jsonb_build_object('support_scopes', p_scopes),
    null);
end;
$$;

revoke all on function public.set_support_scopes(uuid, text[]) from public, anon;
grant execute on function public.set_support_scopes(uuid, text[]) to authenticated;

comment on column public.staff_members.support_scopes is
  'Requester kinds this person handles on the support desk. Empty = unscoped (sees all). An assignment for the default view, never a read barrier — RLS is untouched.';

commit;
