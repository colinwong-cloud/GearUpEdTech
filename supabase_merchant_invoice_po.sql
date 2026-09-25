ALTER TABLE public.mer_invoices
  ADD COLUMN IF NOT EXISTS vendor_po_number TEXT NOT NULL DEFAULT '';
