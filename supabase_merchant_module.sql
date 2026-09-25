CREATE TABLE IF NOT EXISTS public.mer_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  vendor_id UUID NOT NULL REFERENCES public.mer_vendors(id),
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  payment_terms TEXT NOT NULL CHECK (payment_terms IN ('cash_with_order', 'net_30', 'net_60')),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at TIMESTAMPTZ NULL,
  payment_method TEXT NULL CHECK (payment_method IS NULL OR payment_method IN ('cash', 'cheque', 'bank_transfer')),
  cheque_number TEXT NULL,
  paid_on DATE NULL,
  currency TEXT NOT NULL DEFAULT 'HKD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mer_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.mer_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty NUMERIC(12, 3) NOT NULL,
  unit_cost NUMERIC(12, 2) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.mer_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mer_invoice_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.mer_vendors TO service_role;
GRANT ALL ON public.mer_invoices TO service_role;
GRANT ALL ON public.mer_invoice_items TO service_role;
