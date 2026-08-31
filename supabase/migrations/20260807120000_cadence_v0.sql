-- Cadence v0 — the Morning Card.
--
-- One Discord message a day, capped at a handful of lines, that never
-- accumulates. Three changes to the existing task tables make that possible:
--
--   1. recurring_tasks learns WEEKDAYS ("every Monday" without drift), HARD_GATE
--      (the two things that must never silently expire) and EXPIRES_HOURS.
--   2. standalone_tasks learns which rule spawned it, when it dies, and how it
--      left (done_manual | auto_closed | expired).
--   3. generate_due_recurring_tasks() stops back-filling a rule's missed
--      occurrences into a pile. One live instance per rule, ever.
--
-- The expiry trick: an expired occurrence is written status='done' with
-- resolution='expired'. That keeps it out of every existing query in
-- src/lib/tasks.ts, src/routes/tasks.tsx and api/discord-digest.js without
-- widening the CHECK constraint or touching a single line of them. An
-- unactioned day simply leaves no residue — the card is the same length on
-- day 28 as on day 1, and "overdue" is a number this system cannot produce.
--
-- Safe to re-run.

-- ── 1. Schema ───────────────────────────────────────────────────────────────

ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS weekdays      SMALLINT[],            -- ISO 1=Mon..7=Sun; NULL = interval_days behaviour (unchanged)
  ADD COLUMN IF NOT EXISTS hard_gate     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_hours INTEGER NOT NULL DEFAULT 24 CHECK (expires_hours >= 1);

COMMENT ON COLUMN public.recurring_tasks.weekdays IS
  'ISO weekdays this rule may fire on (1=Mon..7=Sun). NULL = fire on every interval_days step.';
COMMENT ON COLUMN public.recurring_tasks.hard_gate IS
  'true = occurrences never expire and escalate when overdue. Reserve for work that blocks other people.';

ALTER TABLE public.standalone_tasks
  ADD COLUMN IF NOT EXISTS recurring_task_id UUID REFERENCES public.recurring_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution        TEXT CHECK (resolution IN ('done_manual','auto_closed','expired')),
  ADD COLUMN IF NOT EXISTS source_key        TEXT;

-- One live occurrence per rule. Partial, so completed history is untouched.
CREATE INDEX IF NOT EXISTS idx_tasks_open_rule
  ON public.standalone_tasks (recurring_task_id) WHERE status = 'open';

-- Lets a future data-triggered detector raise "queue dry on Antonella" once
-- rather than every poll: same source_key while one is open = one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_srckey
  ON public.standalone_tasks (source_key)
  WHERE status = 'open' AND source_key IS NOT NULL;

-- ── 2. Generation ───────────────────────────────────────────────────────────
-- Same name, signature and JSONB return shape, so api/discord-digest.js:317 and
-- src/lib/tasks.ts keep working untouched. Three changes inside the loop:
--   • weekday skip   — advance next_run without inserting on a non-matching day,
--                      which also fixes weekly rules drifting off their weekday
--                      whenever generation was missed.
--   • dedupe         — never insert while an open occurrence of this rule exists.
--   • stamp          — record the parent rule and when the occurrence dies.
CREATE OR REPLACE FUNCTION public.generate_due_recurring_tasks()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  r        public.recurring_tasks%ROWTYPE;
  v_guard  INTEGER;
  v_any    BOOLEAN;
  v_made   JSONB := '[]'::jsonb;
  v_open   BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM public.recurring_tasks
    WHERE active = true AND next_run <= current_date
    FOR UPDATE SKIP LOCKED
  LOOP
    v_guard := 0;
    v_any := false;

    -- Is an occurrence of this rule still live? If so we advance the schedule
    -- but create nothing — the open one IS this rule's presence on the list.
    SELECT EXISTS (
      SELECT 1 FROM public.standalone_tasks
      WHERE recurring_task_id = r.id AND status = 'open'
    ) INTO v_open;

    WHILE r.next_run <= current_date AND v_guard < 60 LOOP
      IF NOT v_open
         AND (r.weekdays IS NULL
              OR EXTRACT(isodow FROM r.next_run)::smallint = ANY (r.weekdays))
      THEN
        INSERT INTO public.standalone_tasks
          (title, description, assignee_id, status, due_date, created_by,
           recurring_task_id, expires_at)
        VALUES
          (r.title, r.description, r.assignee_id, 'open', r.next_run,
           COALESCE(r.created_by, 'recurring'),
           r.id, now() + make_interval(hours => r.expires_hours));
        v_any := true;
        v_open := true;   -- at most one per run, and none until this one closes
      END IF;

      r.next_run := r.next_run + r.interval_days;
      v_guard := v_guard + 1;
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

-- ── 3. Expiry ───────────────────────────────────────────────────────────────
-- Called at the top of every card. Hard gates are exempt: they wait, and the
-- card escalates them instead.
CREATE OR REPLACE FUNCTION public.expire_stale_tasks()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  WITH expired AS (
    UPDATE public.standalone_tasks t
       SET status       = 'done',
           resolution   = 'expired',
           completed_at = now()
      FROM public.recurring_tasks r
     WHERE t.recurring_task_id = r.id
       AND t.status = 'open'
       AND t.expires_at IS NOT NULL
       AND t.expires_at < now()
       AND r.hard_gate = false
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM expired;

  RETURN jsonb_build_object('expired', v_n);
END;
$$;

-- Anything ticked off by a human from here on is distinguishable from anything
-- that merely timed out. Backfill history as manual — it predates expiry.
UPDATE public.standalone_tasks
   SET resolution = 'done_manual'
 WHERE status = 'done' AND resolution IS NULL;

-- ── 4. Seed: six rules, not seventeen ───────────────────────────────────────
-- Assignee is pinned to Christofis by UUID, deliberately.
--
-- An earlier draft resolved it with `lower(name) LIKE '%chris%'`, which is
-- wrong here: this database holds TWO matching rows — 'Christofis' (the real
-- one) and a placeholder 'Chris' whose discord_user_id is the string '0'. Any
-- alphabetical tie-break picks 'Chris', so all six rules would have been
-- assigned to a dead row and silently never appeared on anyone's card.
--
-- Matching on discord_user_id would also be unambiguous, but Discord ids are
-- kept out of this repo, so the UUID it is.
--
-- Times are Cyprus (Europe/Nicosia, UTC+3, no card before 07:40 local).
-- next_run is set to current_date so the first card picks them up tomorrow.
WITH me AS (
  SELECT id FROM public.chatters
   WHERE id = '06e819db-1ec4-436c-b76e-1ff563e3ac93'::uuid
)
INSERT INTO public.recurring_tasks
  (title, description, assignee_id, interval_days, next_run, weekdays, hard_gate, expires_hours, active, created_by)
SELECT v.title, v.description, me.id, v.interval_days, current_date, v.weekdays, v.hard_gate, v.expires_hours, true, 'cadence-v0'
  FROM me, (VALUES
    ('Approve Day-block MMs before 11:00',
     'All 8 accounts need an approved batch before the Day block opens. Eight chatters stall behind this for eight hours. (doc p8 #5)',
     1, ARRAY[1,2,3,4,5]::smallint[], false, 5),

    ('Pay salaries',
     'Salary creators are paid Mondays or on content completion. Luca asked for this reminder by name. (doc p16)',
     1, ARRAY[1]::smallint[], true, 72),

    ('Captions + edited assets to JA for next week''s promo',
     'JA builds next week''s schedule from these; Liz/Lance approve Mon/Tue. Thursday is the real deadline and it appears nowhere in the doc.',
     1, ARRAY[4]::smallint[], true, 72),

    ('Meta ads — make ONE change, do not browse',
     'Read spend / CPA / ROAS per creator. Kill or scale one thing. (doc p2 #3, p3 item 1)',
     1, ARRAY[2,4]::smallint[], false, 12),

    ('Scripts — personalise for ONE salary account',
     'Internally-promoted accounts cannot run the proven library verbatim. One account, properly. (doc p8 #12, p17)',
     1, ARRAY[2]::smallint[], false, 12),

    ('Pick next week''s focus: one chatter, one account, one team',
     'The doc''s own answer to being 2.5x over capacity — choose where quality gets assured next week. (doc p7 #5)',
     1, ARRAY[5]::smallint[], false, 12)
  ) AS v(title, description, interval_days, weekdays, hard_gate, expires_hours)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.recurring_tasks x WHERE x.title = v.title
 );

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT r.title, r.weekdays, r.hard_gate, r.expires_hours, r.next_run, c.name
--   FROM public.recurring_tasks r JOIN public.chatters c ON c.id = r.assignee_id
--  WHERE r.created_by = 'cadence-v0' ORDER BY r.title;
-- Expect 6 rows, all assigned to Christofis. Zero rows = the UUID above is not
-- in this database (wrong project?) — fix and re-run; everything is idempotent.
--
-- These six join 8 rules Christofis already has (3 of them daily), for 14 total.
-- That is intentional: the card caps at 2 non-gate items and everything unshown
-- expires overnight and re-competes, so extra rules cost nothing but choice.
