-- Tutor referral contact enhancement migration.
-- Purpose:
-- 1) add tutor mobile/email fields
-- 2) enforce one active code per tutor mobile
-- 3) snapshot tutor mobile/email into usage records
--
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.tutor_referral_codes
  ADD COLUMN IF NOT EXISTS tutor_mobile TEXT,
  ADD COLUMN IF NOT EXISTS tutor_email TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tutor_referral_codes_tutor_mobile_chk'
      AND conrelid = 'public.tutor_referral_codes'::regclass
  ) THEN
    ALTER TABLE public.tutor_referral_codes
      ADD CONSTRAINT tutor_referral_codes_tutor_mobile_chk
      CHECK (tutor_mobile IS NULL OR tutor_mobile ~ '^[0-9]{8}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tutor_referral_codes_tutor_email_chk'
      AND conrelid = 'public.tutor_referral_codes'::regclass
  ) THEN
    ALTER TABLE public.tutor_referral_codes
      ADD CONSTRAINT tutor_referral_codes_tutor_email_chk
      CHECK (
        tutor_email IS NULL OR tutor_email = '' OR
        tutor_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_referral_codes_active_mobile
  ON public.tutor_referral_codes (tutor_mobile)
  WHERE is_active = true AND tutor_mobile IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tutor_referral_codes_tutor_email_lower
  ON public.tutor_referral_codes (LOWER(tutor_email))
  WHERE tutor_email IS NOT NULL AND tutor_email <> '';

ALTER TABLE public.tutor_referral_usages
  ADD COLUMN IF NOT EXISTS tutor_mobile TEXT,
  ADD COLUMN IF NOT EXISTS tutor_email TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tutor_referral_usages_tutor_mobile_chk'
      AND conrelid = 'public.tutor_referral_usages'::regclass
  ) THEN
    ALTER TABLE public.tutor_referral_usages
      ADD CONSTRAINT tutor_referral_usages_tutor_mobile_chk
      CHECK (tutor_mobile IS NULL OR tutor_mobile ~ '^[0-9]{8}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tutor_referral_usages_tutor_email_chk'
      AND conrelid = 'public.tutor_referral_usages'::regclass
  ) THEN
    ALTER TABLE public.tutor_referral_usages
      ADD CONSTRAINT tutor_referral_usages_tutor_email_chk
      CHECK (
        tutor_email IS NULL OR tutor_email = '' OR
        tutor_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
      );
  END IF;
END
$$;

UPDATE public.tutor_referral_usages u
SET tutor_mobile = c.tutor_mobile,
    tutor_email = c.tutor_email
FROM public.tutor_referral_codes c
WHERE u.code_id = c.id
  AND (
    u.tutor_mobile IS DISTINCT FROM c.tutor_mobile OR
    u.tutor_email IS DISTINCT FROM c.tutor_email
  );

COMMIT;
