-- Allow 'creator' logins (Phase B creator portal) alongside admin/staff.
ALTER TABLE public.access_codes DROP CONSTRAINT IF EXISTS access_codes_account_type_check;
ALTER TABLE public.access_codes ADD CONSTRAINT access_codes_account_type_check
  CHECK (account_type IN ('admin', 'staff', 'creator'));
