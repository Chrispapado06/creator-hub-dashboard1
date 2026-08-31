-- ICEFALL — every write to `companies` leaves a trace, by construction.
--
-- WHY: on 30 Aug 2026 a real operator's name was created in and deleted from
-- the live database, and NOBODY COULD SAY BY WHOM. audit_events held zero rows.
-- The write layer's own comment says placements route through functions "which
-- is what makes the audit log complete rather than merely usually-complete" —
-- and the person who wrote that comment added direct company writes the same
-- afternoon without an audit call. That is not carelessness to be trained
-- away; it is what the remember-to-call shape does to everyone eventually.
--
-- ── WHY A TRIGGER, NOT A FUNCTION PAIR ─────────────────────────────────────
--
-- A create_company/update_company definer pair audits only itself. It is
-- complete only if direct grants are revoked — which would break
-- approve_content_version's live patches and still miss tomorrow's service-role
-- script. The question this answers is "who touched this company", and the only
-- shape that answers it for paths nobody has written yet is a trigger ON THE
-- TABLE. It fires for staff, for definer functions, for the service role, for
-- code that does not exist yet. The semantic, reason-carrying events
-- (content.approved, real_business_set below) still exist; the trigger rows are
-- the ground truth underneath them, so a semantic event beside a trigger row is
-- expected, not duplication.
--
-- Inserts directly rather than via record_audit_event, which requires a staff
-- actor — same precedent as accept_invitations: the row must be writable by
-- whoever legitimately wrote the table, including a service actor with no uid.

-- ── THE FK THE APPEND-ONLY GUARD CAUGHT ────────────────────────────────────
--
-- `audit_events.company_id` carried `references companies on delete set null`.
-- Deleting a company therefore UPDATES that company's audit rows — nulling
-- their company_id — which the append-only trigger on audit_events refuses, so
-- the delete itself failed. Found by the test for "the deletion trail survives
-- the deletion": the guard was blocking the FK doing exactly what append-only
-- forbids, a rewrite of recorded history.
--
-- The guard is right and the FK is wrong. An audit log's references must
-- OUTLIVE their referents — a dangling id in a trail is not an integrity
-- violation, it is the trail doing its job after the entity is gone. The
-- column and its index stay; only the rewrite-on-delete goes.

alter table public.audit_events
  drop constraint if exists audit_events_company_id_fkey;

create or replace function public.companies_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev jsonb;
  v_next jsonb;
  k text;
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_events
      (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
    values
      (auth.uid(), coalesce(public.my_role()::text, 'service'), 'company.created',
       'company', new.id::text, null, to_jsonb(new) - 'updated_at' - 'created_at', new.id);
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    -- Only the fields that changed: an audit row restating the whole record
    -- buries the one field that mattered.
    v_prev := '{}'::jsonb;
    v_next := '{}'::jsonb;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k in ('updated_at', 'created_at') then continue; end if;
      if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k then
        v_prev := v_prev || jsonb_build_object(k, to_jsonb(old) -> k);
        v_next := v_next || jsonb_build_object(k, to_jsonb(new) -> k);
      end if;
    end loop;
    if v_next = '{}'::jsonb then return new; end if; -- a no-op write is not an event
    insert into public.audit_events
      (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
    values
      (auth.uid(), coalesce(public.my_role()::text, 'service'), 'company.updated',
       'company', new.id::text, v_prev, v_next, new.id);
    return new;
  end if;

  -- DELETE. company_id stays NULL on purpose: the FK points at a row this same
  -- statement removed. The identity lives in entity_id (text, no FK), so the
  -- trail survives the deletion it records — which is the entire point.
  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'company.deleted',
     'company', old.id::text, to_jsonb(old) - 'updated_at' - 'created_at', null, null);
  return old;
end;
$$;

drop trigger if exists companies_audit on public.companies;
create trigger companies_audit
  after insert or update or delete on public.companies
  for each row execute function public.companies_audit();

/* ========================================================================== */
/* The disclosure flag is flipped by a deliberate act with a stated reason    */
/* ========================================================================== */

/**
 * The ONLY sanctioned path for `real_business`. The trigger above records any
 * change to the flag regardless of path; this function is the act itself —
 * it demands a reason and writes the semantic event carrying it, so the answer
 * to "why is this company marked real?" is a sentence, not an inference.
 */
create or replace function public.set_company_real_business(
  p_company_id uuid,
  p_value boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old boolean;
begin
  if not public.has_staff_role(array['sales', 'operations']) then
    raise exception 'only ICEFALL sales or operations staff may change the real-business flag';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'changing a public disclosure requires a stated reason';
  end if;

  select real_business into v_old from public.companies where id = p_company_id for update;
  if not found then raise exception 'no such company'; end if;
  if v_old = p_value then return; end if; -- nothing to do, nothing to claim

  update public.companies set real_business = p_value where id = p_company_id;

  perform public.record_audit_event(
    'company.real_business_set', 'company', p_company_id::text,
    jsonb_build_object('real_business', v_old),
    jsonb_build_object('real_business', p_value),
    p_reason, p_company_id);
end;
$$;

revoke all on function public.companies_audit() from public, anon, authenticated;
revoke all on function public.set_company_real_business(uuid, boolean, text) from public, anon;
grant execute on function public.set_company_real_business(uuid, boolean, text) to authenticated;
