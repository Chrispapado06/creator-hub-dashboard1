-- Add 'warm_up' to the Instagram account status enum.
-- Idempotent via IF NOT EXISTS (Postgres 14+).
ALTER TYPE public.instagram_account_status ADD VALUE IF NOT EXISTS 'warm_up';
