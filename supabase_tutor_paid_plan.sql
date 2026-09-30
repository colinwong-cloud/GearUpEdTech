-- Tutor paid plan: HK$199 monthly, merchant-scheduled MIT.
-- Safe to run multiple times.
-- Run after supabase_tutor_student_comparison.sql so paid_until already exists.

BEGIN;

ALTER TABLE public.tutor_referral_codes
  ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.tutor_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES public.tutor_referral_codes(id) ON DELETE RESTRICT,
  merchant_order_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  amount_hkd NUMERIC(10, 2) NOT NULL CHECK (amount_hkd > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'cancelled')),
  airwallex_payment_intent_id TEXT NULL,
  airwallex_customer_id TEXT NULL,
  airwallex_payment_consent_id TEXT NULL,
  airwallex_payment_method_id TEXT NULL,
  payment_method_type TEXT NULL,
  raw_response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tutor_payment_orders_code
  ON public.tutor_payment_orders (code_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutor_payment_orders_intent
  ON public.tutor_payment_orders (airwallex_payment_intent_id)
  WHERE airwallex_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tutor_recurring_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL UNIQUE REFERENCES public.tutor_referral_codes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'failed')),
  airwallex_customer_id TEXT NOT NULL,
  airwallex_payment_consent_id TEXT NULL,
  airwallex_payment_method_id TEXT NULL,
  payment_method_type TEXT NULL,
  recurring_amount_hkd NUMERIC(10, 2) NOT NULL DEFAULT 199 CHECK (recurring_amount_hkd > 0),
  currency TEXT NOT NULL DEFAULT 'HKD',
  next_charge_at TIMESTAMPTZ NOT NULL,
  last_charged_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tutor_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_recurring_profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tutor_payment_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tutor_recurring_profiles TO service_role;

COMMIT;
