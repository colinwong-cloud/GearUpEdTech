-- If parent_dashboard_view_log already exists but index creation failed, run this alone:
CREATE INDEX IF NOT EXISTS idx_pdv_t
  ON public.parent_dashboard_view_log (CAST((timezone('Asia/Hong_Kong', viewed_at)) AS date));
