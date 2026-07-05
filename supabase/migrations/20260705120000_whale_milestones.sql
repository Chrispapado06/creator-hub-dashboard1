-- Whale monthly milestones (Luca's whale-pulse card).
--
-- The shift whale ping now surfaces a "Milestone" line alongside payday. These
-- columns let QA record the recurring dates + a freeform job update so the bot
-- can call them out when the whale is active on shift:
--   • birthday    — MM-DD (or YYYY-MM-DD); matched on month + day → "🎂 Birthday today"
--   • anniversary — MM-DD (or YYYY-MM-DD); matched on month + day → "💍 Anniversary today"
--   • job_update  — freeform, e.g. "started new job at Google" → "💼 …"
--
-- Populated via /whale add (birthday: / anniversary: / job:). Payday already
-- lives in whale_paydays.payday and needs no new column.
alter table public.whale_paydays
  add column if not exists birthday    text,
  add column if not exists anniversary text,
  add column if not exists job_update  text;
