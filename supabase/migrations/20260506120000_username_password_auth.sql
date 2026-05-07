-- Switch access_codes from a single code to username + password authentication.
-- Idempotent: safe to re-run after a partial / failed prior attempt.
-- Each existing row's code becomes its password; the username is derived from the
-- unique code (lowercased), so existing rows stay unique.

-- 1. Add username column if missing
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Backfill username from the unique 'code' (or 'password' if a prior partial run
--    already renamed it). EXECUTE avoids parse-time checks against the missing column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'access_codes' AND column_name = 'code'
  ) THEN
    EXECUTE $sql$
      UPDATE public.access_codes
         SET username = LOWER(code)
       WHERE username IS NULL OR username = 'admin'
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE public.access_codes
         SET username = LOWER(password)
       WHERE username IS NULL OR username = 'admin'
    $sql$;
  END IF;
END $$;

-- 3. Enforce NOT NULL + UNIQUE on username
ALTER TABLE public.access_codes ALTER COLUMN username SET NOT NULL;
ALTER TABLE public.access_codes DROP CONSTRAINT IF EXISTS access_codes_username_key;
ALTER TABLE public.access_codes ADD CONSTRAINT access_codes_username_key UNIQUE (username);

-- 4. Drop old uniqueness on code, then rename code -> password (idempotent)
ALTER TABLE public.access_codes DROP CONSTRAINT IF EXISTS access_codes_code_key;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'access_codes' AND column_name = 'code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'access_codes' AND column_name = 'password'
  ) THEN
    ALTER TABLE public.access_codes RENAME COLUMN code TO password;
  END IF;
END $$;
