-- Run in Supabase SQL: faster recalculate_grade_aversages + optional indexes
-- (session_answers → quiz_sessions → students  avoids only joining to questions for grade)

CREATE INDEX IF NOT EXISTS idx_session_answers_question_id
  ON public.session_answers (question_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_id_student
  ON public.quiz_sessions (id, student_id)
  WHERE questions_attempted > 0;

CREATE OR REPLACE FUNCTION recalculate_grade_averages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
  DELETE FROM grade_averages WHERE true;

  INSERT INTO grade_averages (grade_level, question_type, avg_correct_pct, total_sessions)
  SELECT
    s.grade_level,
    '_overall' AS question_type,
    ROUND(
      AVG(CASE WHEN qs.questions_attempted > 0 THEN (qs.score::numeric / qs.questions_attempted) * 100 ELSE 0 END),
      2
    ),
    COUNT(qs.id)::int
  FROM quiz_sessions qs
  JOIN students s ON s.id = qs.student_id
  WHERE qs.questions_attempted > 0
  GROUP BY s.grade_level;

  -- Join session_answers to sessions+students+questions (better plan than sa→q alone on large tables)
  INSERT INTO grade_averages (grade_level, question_type, avg_correct_pct, total_sessions)
  SELECT
    st.grade_level,
    q.question_type,
    ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 2),
    COUNT(DISTINCT sa.session_id)::int
  FROM session_answers sa
  INNER JOIN quiz_sessions qs ON qs.id = sa.session_id
  INNER JOIN students st ON st.id = qs.student_id
  INNER JOIN questions q ON q.id = sa.question_id
  WHERE qs.questions_attempted > 0
  GROUP BY st.grade_level, q.question_type;
END;
$$;
