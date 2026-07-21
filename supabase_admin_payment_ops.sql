-- ============================================================
-- Admin payment operations audit tables
-- - cancel future recurring payments audit
-- - last payment refund audit (idempotent by payment_order_id)
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.parent_payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id UUID NOT NULL UNIQUE REFERENCES public.parent_payment_orders(id) ON DELETE RESTRICT,
  parent_id UUID NULL REFERENCES public.parents(id) ON DELETE SET NULL,
  mobile_number TEXT NOT NULL,
  admin_user TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount_hkd NUMERIC(10, 2) NOT NULL CHECK (amount_hkd > 0),
  currency TEXT NOT NULL DEFAULT 'HKD',
  airwallex_request_id TEXT NOT NULL UNIQUE,
  airwallex_refund_id TEXT NULL UNIQUE,
  airwallex_payment_intent_id TEXT NULL,
  airwallex_payment_attempt_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'received', 'accepted', 'settled', 'failed')),
  failure_code TEXT NULL,
  failure_message TEXT NULL,
  raw_response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_payment_refunds_mobile_created
  ON public.parent_payment_refunds (mobile_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_payment_refunds_parent_created
  ON public.parent_payment_refunds (parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_payment_refunds_refund_id
  ON public.parent_payment_refunds (airwallex_refund_id)
  WHERE airwallex_refund_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.admin_payment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL
    CHECK (action_type IN ('cancel_future_payment', 'refund_last_payment')),
  status TEXT NOT NULL
    CHECK (status IN ('success', 'failed')),
  admin_user TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  parent_id UUID NULL REFERENCES public.parents(id) ON DELETE SET NULL,
  payment_order_id UUID NULL REFERENCES public.parent_payment_orders(id) ON DELETE SET NULL,
  recurring_profile_id UUID NULL REFERENCES public.parent_recurring_profiles(id) ON DELETE SET NULL,
  message TEXT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_payment_actions_mobile_created
  ON public.admin_payment_actions (mobile_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_payment_actions_parent_created
  ON public.admin_payment_actions (parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_payment_actions_type_created
  ON public.admin_payment_actions (action_type, created_at DESC);

COMMIT;
