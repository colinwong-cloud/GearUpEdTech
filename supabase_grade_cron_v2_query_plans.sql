-- Run in Supabase after supabase_grade_by_question_type_fine.sql
-- Improves index usage for grade-level cron so each RPC fits PostgREST time limits.

CREATE INDEX IF NOT EXISTS idx_students_grade_level
  ON public.students (grade_level);

CREATE INDEX IF NOT EXISTS idx_questions_grade_type
  ON public.questions (grade_level, question_type);

-- Helpful for one_type: filter session_answers by question_id, then to session
CREATE INDEX IF NOT EXISTS idx_session_answers_qid
  ON public.session_answers (question_id)
  WHERE question_id IS NOT NULL;

-- Overall per grade: drive from students in grade, then their sessions
CREATE OR REPLACE FUNCTION recalculate_grade_overall_for_grade(p_grade_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
  INSERT INTO grade_averages (grade_level, question_type, avg_correct_pct, total_sessions)
  SELECT
    s.grade_level,
    '_overall' AS question_type,
    ROUND(
      AVG(
        CASE
          WHEN qs.questions_attempted > 0 THEN
            (qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100
          ELSE 0
        END
      ),
      2
    ),
    COUNT(qs.id)::int
  FROM public.students s
  INNER JOIN public.quiz_sessions qs ON qs.student_id = s.id
  WHERE s.grade_level = p_grade_level
    AND qs.questions_attempted > 0
  GROUP BY s.grade_level;
END;
$$;

-- One question type: drive from questions (small), then session_answers for those ids
CREATE OR REPLACE FUNCTION recalculate_grade_one_type_for_grade(
  p_grade_level text,
  p_question_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
  INSERT INTO grade_averages (grade_level, question_type, avg_correct_pct, total_sessions)
  SELECT
    q.grade_level,
    q.question_type,
    ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 2),
    COUNT(DISTINCT sa.session_id)::int
  FROM public.questions q
  INNER JOIN public.session_answers sa ON sa.question_id = q.id
  INNER JOIN public.quiz_sessions qs ON qs.id = sa.session_id
  INNER JOIN public.students st ON st.id = qs.student_id
  WHERE q.grade_level = p_grade_level
    AND q.question_type = p_question_type
    AND st.grade_level = p_grade_level
    AND qs.questions_attempted > 0
  GROUP BY q.grade_level, q.question_type;
END;
$$;
