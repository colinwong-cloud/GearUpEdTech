ALTER TABLE public.mer_invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS cheque_number TEXT,
  ADD COLUMN IF NOT EXISTS paid_on DATE;

ALTER TABLE public.mer_invoices DROP CONSTRAINT IF EXISTS mer_invoices_payment_method_check;
ALTER TABLE public.mer_invoices
  ADD CONSTRAINT mer_invoices_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'cheque', 'bank_transfer'));
