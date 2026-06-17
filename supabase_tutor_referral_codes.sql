-- Teacher referral code module for registration attribution.
-- Run this in Supabase SQL Editor before enabling the feature in production.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tutor_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  tutor_name TEXT NOT NULL,
  usage_limit INTEGER NOT NULL DEFAULT 50 CHECK (usage_limit > 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tutor_referral_codes_code_digits_chk CHECK (code ~ '^[0-9]{6}$'),
  CONSTRAINT tutor_referral_codes_current_uses_limit_chk CHECK (current_uses <= usage_limit)
);

CREATE INDEX IF NOT EXISTS idx_tutor_referral_codes_created_at
  ON public.tutor_referral_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS public.tutor_referral_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES public.tutor_referral_codes(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  tutor_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  parent_id UUID NULL REFERENCES public.parents(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tutor_referral_usages_code_digits_chk CHECK (code ~ '^[0-9]{6}$'),
  CONSTRAINT tutor_referral_usages_mobile_chk CHECK (mobile_number ~ '^[0-9]{8}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_referral_usages_mobile_number
  ON public.tutor_referral_usages (mobile_number);

CREATE INDEX IF NOT EXISTS idx_tutor_referral_usages_code_id_used_at
  ON public.tutor_referral_usages (code_id, used_at DESC);

CREATE OR REPLACE FUNCTION public.set_tutor_referral_codes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_referral_codes_updated_at ON public.tutor_referral_codes;
CREATE TRIGGER trg_tutor_referral_codes_updated_at
BEFORE UPDATE ON public.tutor_referral_codes
FOR EACH ROW
EXECUTE FUNCTION public.set_tutor_referral_codes_updated_at();

-- Keep denormalized current_uses aligned with usage records.
WITH usage_counts AS (
  SELECT code_id, COUNT(*)::INTEGER AS usage_count
  FROM public.tutor_referral_usages
  GROUP BY code_id
)
UPDATE public.tutor_referral_codes c
SET current_uses = u.usage_count,
    updated_at = NOW()
FROM usage_counts u
WHERE c.id = u.code_id;

UPDATE public.tutor_referral_codes c
SET current_uses = 0,
    updated_at = NOW()
WHERE c.current_uses <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.tutor_referral_usages u
    WHERE u.code_id = c.id
  );

ALTER TABLE public.tutor_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_referral_usages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tutor_referral_codes'
      AND policyname = 'service_role_full_access_tutor_referral_codes'
  ) THEN
    CREATE POLICY service_role_full_access_tutor_referral_codes
      ON public.tutor_referral_codes
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tutor_referral_usages'
      AND policyname = 'service_role_full_access_tutor_referral_usages'
  ) THEN
    CREATE POLICY service_role_full_access_tutor_referral_usages
      ON public.tutor_referral_usages
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.tutor_referral_codes
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.tutor_referral_usages
TO service_role;

COMMIT;
