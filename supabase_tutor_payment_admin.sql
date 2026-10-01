-- Tutor payment admin: refund records for the current-month charge.
-- Safe to run more than once. Run before using 教師付款情況 refund.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tutor_payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id UUID NOT NULL REFERENCES public.tutor_payment_orders(id) ON DELETE RESTRICT,
  code_id UUID NOT NULL REFERENCES public.tutor_referral_codes(id) ON DELETE RESTRICT,
  tutor_mobile TEXT NOT NULL,
  admin_user TEXT NULL,
  reason TEXT NOT NULL,
  amount_hkd NUMERIC(10, 2) NOT NULL CHECK (amount_hkd > 0),
  currency TEXT NOT NULL DEFAULT 'HKD',
  airwallex_request_id TEXT NOT NULL UNIQUE,
  airwallex_refund_id TEXT NULL,
  airwallex_payment_intent_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  failure_code TEXT NULL,
  failure_message TEXT NULL,
  raw_response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_payment_refunds_order
  ON public.tutor_payment_refunds (payment_order_id, created_at DESC);

ALTER TABLE public.tutor_payment_refunds ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tutor_payment_refunds TO service_role;

COMMIT;
