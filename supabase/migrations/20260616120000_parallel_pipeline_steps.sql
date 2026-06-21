-- Parallel pipeline steps — "send all steps at once" mode.
--
-- Adds task_pipelines.mode ('sequential'|'parallel'). In PARALLEL mode every step
-- goes ACTIVE at start (everyone is pinged immediately) and the pipeline completes
-- when ALL steps are done — nobody waits for a handoff. SEQUENTIAL mode is unchanged
-- (one active step, advance on completion).
--
-- Drops the one-active-step index so a parallel pipeline can hold many active steps.
-- The single-active invariant for SEQUENTIAL pipelines is upheld by the RPCs (start
-- activates only step 1; resolve_step activates only the next waiting step).

alter table public.task_pipelines
  add column if not exists mode text not null default 'sequential'
    check (mode in ('sequential', 'parallel'));

drop index if exists public.task_pipeline_steps_one_active_idx;

-- ── start_pipeline — now takes p_parallel; returns ALL first-wave owners ──────
drop function if exists public.start_pipeline(text, text, text, jsonb);
create or replace function public.start_pipeline(
  p_template_id text,
  p_title text,
  p_caller_username text,
  p_steps jsonb,
  p_parallel boolean default false
)
returns jsonb language plpgsql as $$
declare
  v_is_admin  boolean;
  v_caller_ch uuid;
  v_pipeline  uuid;
  v_step      jsonb;
  v_pos       integer := 1;
  v_total     integer;
  v_result    jsonb;
begin
  select r.is_admin, r.chatter_id into v_is_admin, v_caller_ch
  from public.task_resolve_caller(p_caller_username) r;

  if p_steps is null or jsonb_array_length(p_steps) = 0 then
    raise exception 'A pipeline needs at least one step';
  end if;

  insert into public.task_pipelines (template_id, title, status, mode, created_by)
  values (
    nullif(p_template_id, '')::uuid, p_title, 'active',
    case when p_parallel then 'parallel' else 'sequential' end, p_caller_username
  )
  returning id into v_pipeline;

  for v_step in select * from jsonb_array_elements(p_steps) loop
    if (v_step->>'assignee_id') is null then
      raise exception 'Step % has no assignee', v_pos;
    end if;
    insert into public.task_pipeline_steps (pipeline_id, step_order, step_name, description, assignee_id, status)
    values (
      v_pipeline, v_pos,                                  -- step_order stays distinct (satisfies UNIQUE)
      coalesce(v_step->>'step_name', 'Step ' || v_pos),
      v_step->>'description',
      (v_step->>'assignee_id')::uuid,
      case when p_parallel or v_pos = 1 then 'active' else 'waiting' end
    );
    v_pos := v_pos + 1;
  end loop;
  v_total := v_pos - 1;

  -- Every active step is a "first wave" owner the client should ping now.
  select jsonb_build_object(
    'pipeline_id', v_pipeline,
    'title', p_title,
    'total_steps', v_total,
    'parallel', p_parallel,
    'assignees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignee_id', s.assignee_id,
        'step_name', s.step_name,
        'step_order', s.step_order,
        'assignee_name', c.name,
        'assignee_discord_user_id', c.discord_user_id
      ) order by s.step_order)
      from public.task_pipeline_steps s
      join public.chatters c on c.id = s.assignee_id
      where s.pipeline_id = v_pipeline and s.status = 'active'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;

-- ── resolve_step — complete OR skip ONE step by id, mode-aware ───────────────
-- Replaces the per-pipeline complete_active_step/skip_step for the UI: a parallel
-- pipeline has many active steps, so the caller must say WHICH one.
create or replace function public.resolve_step(
  p_step_id text,
  p_caller_username text,
  p_new_status text default 'done'
)
returns jsonb language plpgsql as $$
declare
  v_sid       uuid := p_step_id::uuid;
  v_is_admin  boolean;
  v_caller_ch uuid;
  v_step      public.task_pipeline_steps%rowtype;
  v_mode      text;
  v_title     text;
  v_total     integer;
  v_remaining integer;
  v_next      public.task_pipeline_steps%rowtype;
  v_result    jsonb;
begin
  if p_new_status not in ('done', 'skipped') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select r.is_admin, r.chatter_id into v_is_admin, v_caller_ch
  from public.task_resolve_caller(p_caller_username) r;

  select * into v_step from public.task_pipeline_steps where id = v_sid for update;
  if not found then raise exception 'Step not found'; end if;
  if v_step.status <> 'active' then raise exception 'Step is not active'; end if;
  if not (v_is_admin or v_step.assignee_id = v_caller_ch) then
    raise exception 'Not authorized: only the step owner or an admin can resolve this step';
  end if;

  update public.task_pipeline_steps
  set status = p_new_status, completed_at = now(), completed_by = p_caller_username
  where id = v_sid;

  select mode, title into v_mode, v_title from public.task_pipelines where id = v_step.pipeline_id;
  select count(*) into v_total from public.task_pipeline_steps where pipeline_id = v_step.pipeline_id;

  if v_mode = 'parallel' then
    select count(*) into v_remaining from public.task_pipeline_steps
    where pipeline_id = v_step.pipeline_id and status in ('active', 'waiting');
    if v_remaining = 0 then
      update public.task_pipelines set status = 'complete', completed_at = now() where id = v_step.pipeline_id;
      v_result := jsonb_build_object('pipeline_completed', true, 'pipeline_id', v_step.pipeline_id,
        'pipeline_title', v_title, 'completed_step_name', v_step.step_name, 'total_steps', v_total);
    else
      v_result := jsonb_build_object('pipeline_completed', false, 'wave_incomplete', true,
        'pipeline_id', v_step.pipeline_id, 'pipeline_title', v_title,
        'completed_step_name', v_step.step_name, 'remaining', v_remaining, 'total_steps', v_total);
    end if;
  else
    select * into v_next from public.task_pipeline_steps
    where pipeline_id = v_step.pipeline_id and step_order > v_step.step_order and status = 'waiting'
    order by step_order asc limit 1;
    if found then
      update public.task_pipeline_steps set status = 'active' where id = v_next.id;
      select jsonb_build_object(
        'pipeline_completed', false, 'pipeline_id', v_step.pipeline_id, 'pipeline_title', v_title,
        'completed_step_name', v_step.step_name, 'total_steps', v_total,
        'next_step_id', v_next.id, 'next_step_name', v_next.step_name, 'next_step_order', v_next.step_order,
        'next_assignee_id', v_next.assignee_id, 'next_assignee_name', c.name, 'next_assignee_discord_user_id', c.discord_user_id
      ) into v_result from public.chatters c where c.id = v_next.assignee_id;
    else
      update public.task_pipelines set status = 'complete', completed_at = now() where id = v_step.pipeline_id;
      v_result := jsonb_build_object('pipeline_completed', true, 'pipeline_id', v_step.pipeline_id,
        'pipeline_title', v_title, 'completed_step_name', v_step.step_name, 'total_steps', v_total);
    end if;
  end if;

  return v_result;
end; $$;
