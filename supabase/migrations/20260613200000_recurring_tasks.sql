-- Recurring tasks.
--
-- A recurrence rule spawns a standalone_task every `interval_days` (1 = daily,
-- 7 = weekly, …) for one assignee. There is no always-on backend, so
-- occurrences are MATERIALISED by generate_due_recurring_tasks() — called
-- whenever anyone opens the Tasks page (and safe to also wire to a cron later).
-- The function is atomic + idempotent (FOR UPDATE SKIP LOCKED advances
-- next_run inside the same transaction), so concurrent page loads can never
-- double-create.

CREATE TABLE IF NOT EXISTS public.recurring_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  assignee_id   UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  interval_days INTEGER NOT NULL CHECK (interval_days >= 1),
  next_run      DATE NOT NULL,            -- next occurrence date to generate
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_due ON public.recurring_tasks(active, next_run);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_assignee ON public.recurring_tasks(assignee_id);
ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.recurring_tasks;
CREATE POLICY "Public full access" ON public.recurring_tasks FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_recurring_tasks_updated ON public.recurring_tasks;
CREATE TRIGGER trg_recurring_tasks_updated BEFORE UPDATE ON public.recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Materialise every occurrence due on/before today, advancing each rule.
-- Returns the rules that produced at least one task (with the assignee's
-- Discord id) so the app can fire best-effort pings after commit.
CREATE OR REPLACE FUNCTION public.generate_due_recurring_tasks()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  r        public.recurring_tasks%ROWTYPE;
  v_guard  INTEGER;
  v_any    BOOLEAN;
  v_made   JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT * FROM public.recurring_tasks
    WHERE active = true AND next_run <= current_date
    FOR UPDATE SKIP LOCKED
  LOOP
    v_guard := 0;
    v_any := false;
    -- Catch up any missed occurrences, capped so a long-dormant rule can't
    -- flood the list.
    WHILE r.next_run <= current_date AND v_guard < 60 LOOP
      INSERT INTO public.standalone_tasks (title, description, assignee_id, status, due_date, created_by)
      VALUES (r.title, r.description, r.assignee_id, 'open', r.next_run, COALESCE(r.created_by, 'recurring'));
      r.next_run := r.next_run + r.interval_days;  -- date + int = date (adds N days)
      v_guard := v_guard + 1;
      v_any := true;
    END LOOP;

    UPDATE public.recurring_tasks SET next_run = r.next_run WHERE id = r.id;

    IF v_any THEN
      v_made := v_made || jsonb_build_object(
        'title', r.title,
        'assignee_discord_user_id', (SELECT discord_user_id FROM public.chatters WHERE id = r.assignee_id)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_made);
END;
$$;
