-- Run if parent_dashboard_view_log already exists and CREATE INDEX failed in SQL Editor.
-- Add HKT date as a STORED generated column, then index the column (no :: in CREATE INDEX line).

ALTER TABLE public.parent_dashboard_view_log
  ADD COLUMN IF NOT EXISTS hkt_date date
  GENERATED ALWAYS AS (date(timezone('Asia/Hong_Kong', viewed_at))) STORED;

DROP INDEX IF EXISTS idx_pdv_t;
CREATE INDEX IF NOT EXISTS idx_pdv_t ON public.parent_dashboard_view_log (hkt_date);
