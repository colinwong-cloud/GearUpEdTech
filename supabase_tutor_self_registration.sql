-- Tutor self-registration.
-- Purpose:
-- 1) record whether a teacher code was created by an admin or by the tutor
-- 2) keep one active code per tutor email
-- 3) leave existing admin-assigned codes capped at their current usage_limit
--
-- Self-registered codes are inserted by the app with a high usage_limit so they
-- are not stopped at 50 students. Admin-assigned codes stay at 50.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.tutor_referral_codes
  ADD COLUMN IF NOT EXISTS registration_source TEXT;

UPDATE public.tutor_referral_codes
SET registration_source = 'admin'
WHERE registration_source IS NULL OR btrim(registration_source) = '';

ALTER TABLE public.tutor_referral_codes
  ALTER COLUMN registration_source SET DEFAULT 'admin';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tutor_referral_codes
    WHERE registration_source IS NULL
  ) THEN
    RAISE EXCEPTION 'tutor_referral_codes.registration_source still has null rows';
  END IF;
END
$$;

ALTER TABLE public.tutor_referral_codes
  ALTER COLUMN registration_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tutor_referral_codes_registration_source_chk'
      AND conrelid = 'public.tutor_referral_codes'::regclass
  ) THEN
    ALTER TABLE public.tutor_referral_codes
      ADD CONSTRAINT tutor_referral_codes_registration_source_chk
      CHECK (registration_source IN ('admin', 'self'));
  END IF;
END
$$;

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT LOWER(tutor_email) AS email_key
    FROM public.tutor_referral_codes
    WHERE is_active = true
      AND tutor_email IS NOT NULL
      AND btrim(tutor_email) <> ''
    GROUP BY LOWER(tutor_email)
    HAVING COUNT(*) > 1
  ) duplicated;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Active tutor emails are duplicated. Resolve them before adding uq_tutor_referral_codes_active_email.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_referral_codes_active_email
  ON public.tutor_referral_codes (LOWER(tutor_email))
  WHERE is_active = true AND tutor_email IS NOT NULL AND tutor_email <> '';

COMMIT;
