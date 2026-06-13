-- WhatsApp pings for tasks.
--
-- Adds a phone number to each team member and teaches the recurring-task
-- generator to return the assignee's contact details so the app can fan a
-- ping out to WhatsApp (alongside Discord). Delivery itself happens in
-- api/whatsapp-notify.js via the Meta WhatsApp Cloud API.

ALTER TABLE public.chatters
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;

-- Re-create the generator so each produced rule reports the assignee's id +
-- Discord id + WhatsApp phone (the client uses these to ping every channel).
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
    WHILE r.next_run <= current_date AND v_guard < 60 LOOP
      INSERT INTO public.standalone_tasks (title, description, assignee_id, status, due_date, created_by)
      VALUES (r.title, r.description, r.assignee_id, 'open', r.next_run, COALESCE(r.created_by, 'recurring'));
      r.next_run := r.next_run + r.interval_days;
      v_guard := v_guard + 1;
      v_any := true;
    END LOOP;

    UPDATE public.recurring_tasks SET next_run = r.next_run WHERE id = r.id;

    IF v_any THEN
      v_made := v_made || jsonb_build_object(
        'title', r.title,
        'assignee_id', r.assignee_id,
        'assignee_discord_user_id', (SELECT discord_user_id FROM public.chatters WHERE id = r.assignee_id),
        'assignee_whatsapp_phone',  (SELECT whatsapp_phone  FROM public.chatters WHERE id = r.assignee_id)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_made);
END;
$$;
