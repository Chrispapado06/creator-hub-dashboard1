-- Curate which staff appear in Task assignments.
--
-- `in_task_team = true`  → the person shows up in every Tasks assignment list
--   (Start pipeline, Board reassign, By member, template default assignee).
-- `in_task_team = false` → hidden from all of those, WITHOUT deleting them.
--
-- Defaults to true so nothing changes until an admin unticks someone in
-- Tasks → Templates → Team contacts. Existing rows are backfilled to true.

ALTER TABLE public.chatters
  ADD COLUMN IF NOT EXISTS in_task_team boolean NOT NULL DEFAULT true;
