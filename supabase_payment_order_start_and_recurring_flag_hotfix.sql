BEGIN;

ALTER TABLE public.parent_payment_orders
  ADD COLUMN IF NOT EXISTS payment_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_recurring_payment BOOLEAN NOT NULL DEFAULT false;

UPDATE public.parent_payment_orders
SET payment_started_at = COALESCE(payment_started_at, created_at)
WHERE payment_started_at IS NULL;

COMMIT;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'parent_payment_orders'
  AND column_name IN ('payment_started_at', 'is_recurring_payment')
ORDER BY column_name;
