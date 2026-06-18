-- ============================================================
-- Tutor package metadata columns for payment tracking
-- ============================================================

BEGIN;

ALTER TABLE public.parent_payment_orders
  ADD COLUMN IF NOT EXISTS plan_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS tutor_subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS service_mode TEXT NULL;

ALTER TABLE public.parent_recurring_profiles
  ADD COLUMN IF NOT EXISTS plan_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS plan_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS tutor_subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS service_mode TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_payment_orders_plan_code_created
  ON public.parent_payment_orders (plan_code, created_at DESC)
  WHERE plan_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_recurring_profiles_plan_code_status
  ON public.parent_recurring_profiles (plan_code, status)
  WHERE plan_code IS NOT NULL;

UPDATE public.parent_payment_orders
SET
  plan_code = COALESCE(plan_code, 'monthly_standard'),
  plan_name = COALESCE(plan_name, 'GearUp 增分寶月費會員'),
  service_mode = COALESCE(service_mode, 'monthly_membership')
WHERE plan_code IS NULL;

UPDATE public.parent_recurring_profiles
SET
  plan_code = COALESCE(plan_code, 'monthly_standard'),
  plan_name = COALESCE(plan_name, 'GearUp 增分寶月費會員'),
  service_mode = COALESCE(service_mode, 'monthly_membership')
WHERE plan_code IS NULL;

COMMIT;

-- ============================================================
-- Verification
-- ============================================================

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('parent_payment_orders', 'parent_recurring_profiles')
  AND column_name IN ('plan_code', 'plan_name', 'tutor_subject', 'service_mode')
ORDER BY table_name, ordinal_position;
