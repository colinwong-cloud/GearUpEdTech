-- MIT cron run ledger + optional reactivation of retryable failed profiles.
-- Run in Supabase SQL Editor after this code is on Production.
-- Do not delete parent 91917838 (Loklok & Heihei).

BEGIN;

CREATE TABLE IF NOT EXISTS public.recurring_cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  trigger_host TEXT NULL,
  vercel_cron_schedule TEXT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  eligible_due INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'error')),
  error TEXT NULL,
  result_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_cron_runs_started
  ON public.recurring_cron_runs (started_at DESC);

ALTER TABLE public.recurring_cron_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recurring_cron_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.recurring_cron_runs FROM anon;
REVOKE ALL ON TABLE public.recurring_cron_runs FROM authenticated;
GRANT ALL ON TABLE public.recurring_cron_runs TO service_role;

COMMIT;

-- Verification: table exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recurring_cron_runs'
ORDER BY ordinal_position;

-- Reactivate the Sep 10 validation miss so admin status matches the retry policy.
-- Safe if already active: 0 rows updated.
UPDATE public.parent_recurring_profiles
SET
  status = 'active',
  updated_at = now()
WHERE mobile_number = '91917838'
  AND status = 'failed'
RETURNING
  id,
  mobile_number,
  status,
  next_charge_at,
  last_charged_at,
  last_order_status,
  last_error,
  updated_at;

-- Inspect due / failed MIT profiles (no secrets; ids only).
SELECT
  mobile_number,
  status,
  next_charge_at,
  last_charged_at,
  last_order_status,
  left(coalesce(last_error, ''), 180) AS last_error_preview
FROM public.parent_recurring_profiles
WHERE status IN ('active', 'failed')
  AND next_charge_at <= now()
ORDER BY next_charge_at ASC;
