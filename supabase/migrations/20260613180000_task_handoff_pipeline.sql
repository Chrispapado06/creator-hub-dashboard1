-- Task handoff pipeline.
--
-- A pipeline is an ordered chain of steps, each owned by one team member
-- (a chatters row). Exactly ONE step is active at a time. When the active
-- step's owner marks it done, the next step becomes active and that owner
-- is pinged in Discord (the handoff). "If it's not on their list, it's done."
--
-- All state transitions go through the plpgsql RPCs at the bottom so the
-- handoff is atomic (one transaction) and the caller is verified against
-- access_codes inside the DB rather than trusting the client. The Discord
-- ping is fired by the app AFTER the RPC commits (best-effort) so a failed
-- ping can never roll back the DB state.
--
-- Team table = public.chatters (the staff roster). assignee_id FKs to it.
-- completed_by / started_by store the access_codes.username string (matches
-- how src/lib/audit.ts records the actor).

-- ── Discord link on the team table ──────────────────────────────────────────
ALTER TABLE public.chatters
  ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS chatters_discord_user_id_unique_idx
  ON public.chatters (discord_user_id) WHERE discord_user_id IS NOT NULL;

-- ── Templates (reusable pipeline blueprints) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.task_templates;
CREATE POLICY "Public full access" ON public.task_templates FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_task_templates_updated ON public.task_templates;
CREATE TRIGGER trg_task_templates_updated BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_template_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL,
  step_name           TEXT NOT NULL,
  description         TEXT,
  default_assignee_id UUID REFERENCES public.chatters(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_task_template_steps_template ON public.task_template_steps(template_id, step_order);
ALTER TABLE public.task_template_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.task_template_steps;
CREATE POLICY "Public full access" ON public.task_template_steps FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_task_template_steps_updated ON public.task_template_steps;
CREATE TRIGGER trg_task_template_steps_updated BEFORE UPDATE ON public.task_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Live pipelines ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_pipelines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID REFERENCES public.task_templates(id) ON DELETE SET NULL, -- nullable: ad-hoc, and survives template deletion
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete', 'cancelled')),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_pipelines_status ON public.task_pipelines(status, created_at DESC);
ALTER TABLE public.task_pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.task_pipelines;
CREATE POLICY "Public full access" ON public.task_pipelines FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_task_pipelines_updated ON public.task_pipelines;
CREATE TRIGGER trg_task_pipelines_updated BEFORE UPDATE ON public.task_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_pipeline_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id  UUID NOT NULL REFERENCES public.task_pipelines(id) ON DELETE CASCADE,
  step_order   INTEGER NOT NULL,
  step_name    TEXT NOT NULL,
  description  TEXT,
  assignee_id  UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'done', 'skipped')),
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_task_pipeline_steps_pipeline ON public.task_pipeline_steps(pipeline_id, step_order);
-- "My tasks" query: fast lookup of a person's active/open items.
CREATE INDEX IF NOT EXISTS idx_task_pipeline_steps_assignee ON public.task_pipeline_steps(assignee_id, status);
-- The backbone: at most ONE active step per pipeline (partial unique, repo idiom).
CREATE UNIQUE INDEX IF NOT EXISTS task_pipeline_steps_one_active_idx
  ON public.task_pipeline_steps (pipeline_id) WHERE status = 'active';
ALTER TABLE public.task_pipeline_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.task_pipeline_steps;
CREATE POLICY "Public full access" ON public.task_pipeline_steps FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_task_pipeline_steps_updated ON public.task_pipeline_steps;
CREATE TRIGGER trg_task_pipeline_steps_updated BEFORE UPDATE ON public.task_pipeline_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Standalone (one-off) tasks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.standalone_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  assignee_id  UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  due_date     DATE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_standalone_tasks_assignee ON public.standalone_tasks(assignee_id, status);
ALTER TABLE public.standalone_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.standalone_tasks;
CREATE POLICY "Public full access" ON public.standalone_tasks FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_standalone_tasks_updated ON public.standalone_tasks;
CREATE TRIGGER trg_standalone_tasks_updated BEFORE UPDATE ON public.standalone_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs — all state transitions. Atomic (one transaction) + caller verified
-- against access_codes. Each returns jsonb the app reads to fire the post-
-- commit Discord ping.
--
-- Caller model: p_caller_username is an access_codes.username. A caller is an
-- "admin" when its access_codes.account_type = 'admin'; it is the step's owner
-- when its access_codes.chatter_id = the step's assignee_id. NOTE: identity is
-- only as strong as the rest of the app (the anon key + client session are
-- client-controlled) — this verification is a consistency guard, not a
-- hardened boundary. See TASK_HANDOFF_README.md.
-- ════════════════════════════════════════════════════════════════════════════

-- Resolve a caller to (is_admin, chatter_id). Raises if unknown/inactive.
CREATE OR REPLACE FUNCTION public.task_resolve_caller(
  p_caller_username TEXT,
  OUT is_admin BOOLEAN,
  OUT chatter_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT (ac.account_type = 'admin'), ac.chatter_id
    INTO is_admin, chatter_id
  FROM public.access_codes ac
  WHERE ac.username = p_caller_username AND ac.active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive user: %', p_caller_username;
  END IF;
END;
$$;

-- Complete the active step → activate the next, or complete the pipeline.
CREATE OR REPLACE FUNCTION public.complete_active_step(
  p_pipeline_id TEXT,
  p_caller_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_pid        UUID := p_pipeline_id::uuid;
  v_is_admin   BOOLEAN;
  v_caller_ch  UUID;
  v_active     public.task_pipeline_steps%ROWTYPE;
  v_next       public.task_pipeline_steps%ROWTYPE;
  v_total      INTEGER;
  v_result     JSONB;
BEGIN
  SELECT r.is_admin, r.chatter_id INTO v_is_admin, v_caller_ch
  FROM public.task_resolve_caller(p_caller_username) r;

  -- Lock the active step so concurrent completions serialize.
  SELECT * INTO v_active FROM public.task_pipeline_steps
  WHERE pipeline_id = v_pid AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active step for this pipeline';
  END IF;

  IF NOT (v_is_admin OR v_active.assignee_id = v_caller_ch) THEN
    RAISE EXCEPTION 'Not authorized: only the step owner or an admin can complete this step';
  END IF;

  UPDATE public.task_pipeline_steps
  SET status = 'done', completed_at = now(), completed_by = p_caller_username
  WHERE id = v_active.id;

  SELECT count(*) INTO v_total FROM public.task_pipeline_steps WHERE pipeline_id = v_pid;

  SELECT * INTO v_next FROM public.task_pipeline_steps
  WHERE pipeline_id = v_pid AND step_order > v_active.step_order AND status = 'waiting'
  ORDER BY step_order ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.task_pipeline_steps SET status = 'active' WHERE id = v_next.id;
    SELECT jsonb_build_object(
      'pipeline_completed', false,
      'pipeline_id', v_pid,
      'completed_step_name', v_active.step_name,
      'next_step_id', v_next.id,
      'next_step_name', v_next.step_name,
      'next_step_order', v_next.step_order,
      'total_steps', v_total,
      'next_assignee_id', v_next.assignee_id,
      'next_assignee_name', c.name,
      'next_assignee_discord_user_id', c.discord_user_id
    ) INTO v_result
    FROM public.chatters c WHERE c.id = v_next.assignee_id;
  ELSE
    UPDATE public.task_pipelines SET status = 'complete', completed_at = now() WHERE id = v_pid;
    v_result := jsonb_build_object(
      'pipeline_completed', true,
      'pipeline_id', v_pid,
      'completed_step_name', v_active.step_name,
      'total_steps', v_total
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Skip the active step (admin or owner) → same advance logic as complete.
CREATE OR REPLACE FUNCTION public.skip_step(
  p_pipeline_id TEXT,
  p_caller_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_pid        UUID := p_pipeline_id::uuid;
  v_is_admin   BOOLEAN;
  v_caller_ch  UUID;
  v_active     public.task_pipeline_steps%ROWTYPE;
  v_next       public.task_pipeline_steps%ROWTYPE;
  v_total      INTEGER;
  v_result     JSONB;
BEGIN
  SELECT r.is_admin, r.chatter_id INTO v_is_admin, v_caller_ch
  FROM public.task_resolve_caller(p_caller_username) r;

  SELECT * INTO v_active FROM public.task_pipeline_steps
  WHERE pipeline_id = v_pid AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active step for this pipeline';
  END IF;

  IF NOT (v_is_admin OR v_active.assignee_id = v_caller_ch) THEN
    RAISE EXCEPTION 'Not authorized: only the step owner or an admin can skip this step';
  END IF;

  UPDATE public.task_pipeline_steps
  SET status = 'skipped', completed_at = now(), completed_by = p_caller_username
  WHERE id = v_active.id;

  SELECT count(*) INTO v_total FROM public.task_pipeline_steps WHERE pipeline_id = v_pid;

  SELECT * INTO v_next FROM public.task_pipeline_steps
  WHERE pipeline_id = v_pid AND step_order > v_active.step_order AND status = 'waiting'
  ORDER BY step_order ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.task_pipeline_steps SET status = 'active' WHERE id = v_next.id;
    SELECT jsonb_build_object(
      'pipeline_completed', false,
      'pipeline_id', v_pid,
      'next_step_id', v_next.id,
      'next_step_name', v_next.step_name,
      'next_step_order', v_next.step_order,
      'total_steps', v_total,
      'next_assignee_id', v_next.assignee_id,
      'next_assignee_name', c.name,
      'next_assignee_discord_user_id', c.discord_user_id
    ) INTO v_result
    FROM public.chatters c WHERE c.id = v_next.assignee_id;
  ELSE
    UPDATE public.task_pipelines SET status = 'complete', completed_at = now() WHERE id = v_pid;
    v_result := jsonb_build_object('pipeline_completed', true, 'pipeline_id', v_pid, 'total_steps', v_total);
  END IF;

  RETURN v_result;
END;
$$;

-- Start a pipeline from resolved steps. p_steps is an ordered JSON array of
-- { step_name, description, assignee_id }. First step becomes active.
CREATE OR REPLACE FUNCTION public.start_pipeline(
  p_template_id TEXT,
  p_title TEXT,
  p_caller_username TEXT,
  p_steps JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin   BOOLEAN;
  v_caller_ch  UUID;
  v_pipeline   UUID;
  v_step       JSONB;
  v_pos        INTEGER := 1;
  v_total      INTEGER;
  v_result     JSONB;
BEGIN
  SELECT r.is_admin, r.chatter_id INTO v_is_admin, v_caller_ch
  FROM public.task_resolve_caller(p_caller_username) r;

  IF p_steps IS NULL OR jsonb_array_length(p_steps) = 0 THEN
    RAISE EXCEPTION 'A pipeline needs at least one step';
  END IF;

  INSERT INTO public.task_pipelines (template_id, title, status, created_by)
  VALUES (NULLIF(p_template_id, '')::uuid, p_title, 'active', p_caller_username)
  RETURNING id INTO v_pipeline;

  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    IF (v_step->>'assignee_id') IS NULL THEN
      RAISE EXCEPTION 'Step % has no assignee', v_pos;
    END IF;
    INSERT INTO public.task_pipeline_steps (pipeline_id, step_order, step_name, description, assignee_id, status)
    VALUES (
      v_pipeline, v_pos,
      COALESCE(v_step->>'step_name', 'Step ' || v_pos),
      v_step->>'description',
      (v_step->>'assignee_id')::uuid,
      CASE WHEN v_pos = 1 THEN 'active' ELSE 'waiting' END
    );
    v_pos := v_pos + 1;
  END LOOP;

  v_total := v_pos - 1;

  SELECT jsonb_build_object(
    'pipeline_id', v_pipeline,
    'title', p_title,
    'total_steps', v_total,
    'first_step_name', s.step_name,
    'first_step_order', s.step_order,
    'assignee_id', s.assignee_id,
    'assignee_name', c.name,
    'assignee_discord_user_id', c.discord_user_id
  ) INTO v_result
  FROM public.task_pipeline_steps s
  JOIN public.chatters c ON c.id = s.assignee_id
  WHERE s.pipeline_id = v_pipeline AND s.step_order = 1;

  RETURN v_result;
END;
$$;

-- Reassign a step's owner (admin only). Returns whether the step is active +
-- the new owner's discord id so the app can ping on an active handoff.
CREATE OR REPLACE FUNCTION public.reassign_step(
  p_step_id TEXT,
  p_new_assignee_id TEXT,
  p_caller_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_step     public.task_pipeline_steps%ROWTYPE;
  v_result   JSONB;
BEGIN
  SELECT r.is_admin INTO v_is_admin FROM public.task_resolve_caller(p_caller_username) r;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized: only an admin can reassign steps';
  END IF;

  UPDATE public.task_pipeline_steps
  SET assignee_id = p_new_assignee_id::uuid
  WHERE id = p_step_id::uuid
  RETURNING * INTO v_step;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found';
  END IF;

  SELECT jsonb_build_object(
    'step_id', v_step.id,
    'pipeline_id', v_step.pipeline_id,
    'is_active', (v_step.status = 'active'),
    'step_name', v_step.step_name,
    'assignee_id', v_step.assignee_id,
    'assignee_name', c.name,
    'assignee_discord_user_id', c.discord_user_id
  ) INTO v_result
  FROM public.chatters c WHERE c.id = v_step.assignee_id;

  RETURN v_result;
END;
$$;

-- Cancel a pipeline (creator or admin). Marks pipeline cancelled and all
-- non-done steps skipped.
CREATE OR REPLACE FUNCTION public.cancel_pipeline(
  p_pipeline_id TEXT,
  p_caller_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_pid       UUID := p_pipeline_id::uuid;
  v_is_admin  BOOLEAN;
  v_pipeline  public.task_pipelines%ROWTYPE;
BEGIN
  SELECT r.is_admin INTO v_is_admin FROM public.task_resolve_caller(p_caller_username) r;

  SELECT * INTO v_pipeline FROM public.task_pipelines WHERE id = v_pid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pipeline not found';
  END IF;

  IF NOT (v_is_admin OR v_pipeline.created_by = p_caller_username) THEN
    RAISE EXCEPTION 'Not authorized: only the creator or an admin can cancel this pipeline';
  END IF;

  UPDATE public.task_pipeline_steps
  SET status = 'skipped'
  WHERE pipeline_id = v_pid AND status IN ('waiting', 'active');

  UPDATE public.task_pipelines
  SET status = 'cancelled', completed_at = now()
  WHERE id = v_pid;

  RETURN jsonb_build_object('pipeline_id', v_pid, 'status', 'cancelled');
END;
$$;

-- ── Seed two starter templates (default assignees left null; set in the UI) ──
DO $seed$
DECLARE
  v_script UUID;
  v_content UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.task_templates WHERE name = 'Script') THEN
    INSERT INTO public.task_templates (name, description) VALUES ('Script', 'Write → Upload → Verify') RETURNING id INTO v_script;
    INSERT INTO public.task_template_steps (template_id, step_order, step_name) VALUES
      (v_script, 1, 'Write script'),
      (v_script, 2, 'Upload'),
      (v_script, 3, 'Verify');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.task_templates WHERE name = 'Content Request') THEN
    INSERT INTO public.task_templates (name, description) VALUES ('Content Request', 'Request → Receive & organize → Quality check') RETURNING id INTO v_content;
    INSERT INTO public.task_template_steps (template_id, step_order, step_name) VALUES
      (v_content, 1, 'Request from model'),
      (v_content, 2, 'Receive & organize'),
      (v_content, 3, 'Quality check');
  END IF;
END;
$seed$;
