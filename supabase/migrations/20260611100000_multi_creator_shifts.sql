-- Multi-creator shifts: a chatter often covers several creators' inboxes
-- in ONE shift. Storing that as parallel shift rows would double-count
-- hours in payroll, so instead each shift (and rota plan) carries the
-- full set in creator_ids. creator_id stays as the FIRST selected
-- creator for backward compatibility with existing queries/UI.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS creator_ids UUID[];

ALTER TABLE public.rota_shifts
  ADD COLUMN IF NOT EXISTS creator_ids UUID[];
