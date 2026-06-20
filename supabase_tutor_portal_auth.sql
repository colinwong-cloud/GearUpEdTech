-- Tutor portal authentication and lockout model.
-- Purpose:
-- 1) allow tutor login by referral code
-- 2) force first-login password change
-- 3) enforce temporary lockout after too many failed attempts
--
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tutor_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES public.tutor_referral_codes(id) ON DELETE CASCADE,
  username_code TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tutor_portal_accounts_code_id_uniq UNIQUE (code_id),
  CONSTRAINT tutor_portal_accounts_username_code_chk CHECK (username_code ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_tutor_portal_accounts_is_active
  ON public.tutor_portal_accounts (is_active);

CREATE INDEX IF NOT EXISTS idx_tutor_portal_accounts_locked_until
  ON public.tutor_portal_accounts (locked_until)
  WHERE locked_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tutor_portal_accounts_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_tutor_portal_accounts_set_updated_at'
      AND tgrelid = 'public.tutor_portal_accounts'::regclass
  ) THEN
    CREATE TRIGGER trg_tutor_portal_accounts_set_updated_at
    BEFORE UPDATE ON public.tutor_portal_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.tutor_portal_accounts_set_updated_at();
  END IF;
END
$$;

ALTER TABLE public.tutor_portal_accounts ENABLE ROW LEVEL SECURITY;

COMMIT;
