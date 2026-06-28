-- Reminders: how many days BEFORE the due date (one-off tasks) or the next
-- occurrence (recurring tasks) to send a "⏰ Coming up" heads-up in the daily
-- digest. NULL = no reminder. 0 = remind on the day itself.

ALTER TABLE public.standalone_tasks ADD COLUMN IF NOT EXISTS remind_days integer;
ALTER TABLE public.recurring_tasks  ADD COLUMN IF NOT EXISTS remind_days integer;
