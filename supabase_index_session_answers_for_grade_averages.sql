-- Optional: speeds recalculate_grade_averages() on large session_answers tables.
-- Run in Supabase SQL Editor.

CREATE INDEX IF NOT EXISTS idx_session_answers_question_id
  ON public.session_answers (question_id);

CREATE INDEX IF NOT EXISTS idx_session_answers_session_id
  ON public.session_answers (session_id);
