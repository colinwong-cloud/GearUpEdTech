DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'mer_invoices'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%payment_terms%'
  LOOP
    EXECUTE format('ALTER TABLE public.mer_invoices DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.mer_invoices
  ADD CONSTRAINT mer_invoices_payment_terms_check
  CHECK (payment_terms IN ('cash_with_order', 'net_30', 'net_60', 'net_90', 'blank'));

ALTER TABLE public.mer_invoices ALTER COLUMN due_date DROP NOT NULL;
