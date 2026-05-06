-- ============================================================
-- Recurring auto-charge + payment method/status tracking
-- ============================================================

BEGIN;

ALTER TABLE public.parent_payment_orders
  ADD COLUMN IF NOT EXISTS airwallex_customer_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS airwallex_payment_consent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS airwallex_payment_method_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS airwallex_payment_method_transaction_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_method_brand TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_method_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_attempt_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_failure_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_failure_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_provider_response_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_provider_response_message TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_payment_orders_customer
  ON public.parent_payment_orders (airwallex_customer_id, created_at DESC)
  WHERE airwallex_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_payment_orders_method
  ON public.parent_payment_orders (airwallex_payment_method_id, created_at DESC)
  WHERE airwallex_payment_method_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.parent_recurring_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NULL REFERENCES public.parents(id) ON DELETE SET NULL,
  mobile_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'failed')),
  airwallex_customer_id TEXT NOT NULL,
  airwallex_payment_consent_id TEXT NULL,
  airwallex_payment_method_id TEXT NOT NULL,
  payment_method_type TEXT NOT NULL,
  payment_method_brand TEXT NULL,
  payment_method_label TEXT NULL,
  recurring_amount_hkd NUMERIC(10, 2) NOT NULL CHECK (recurring_amount_hkd > 0),
  currency TEXT NOT NULL DEFAULT 'HKD',
  next_charge_at TIMESTAMPTZ NOT NULL,
  last_charged_at TIMESTAMPTZ NULL,
  last_order_id UUID NULL REFERENCES public.parent_payment_orders(id) ON DELETE SET NULL,
  last_order_status TEXT NULL CHECK (last_order_status IN ('paid', 'failed', 'created', 'cancelled')),
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_recurring_profiles_status_due
  ON public.parent_recurring_profiles (status, next_charge_at ASC);

CREATE INDEX IF NOT EXISTS idx_parent_recurring_profiles_parent
  ON public.parent_recurring_profiles (parent_id, created_at DESC);

COMMIT;

-- ============================================================
-- Verification
-- ============================================================

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'parent_payment_orders'
  AND column_name IN (
    'airwallex_customer_id',
    'airwallex_payment_consent_id',
    'airwallex_payment_method_id',
    'airwallex_payment_method_transaction_id',
    'payment_method_type',
    'payment_method_brand',
    'payment_method_last4',
    'payment_method_label',
    'payment_attempt_status',
    'payment_failure_code',
    'payment_failure_message',
    'payment_provider_response_code',
    'payment_provider_response_message'
  )
ORDER BY column_name;

SELECT
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'parent_recurring_profiles'
ORDER BY ordinal_position;
