-- Run in Supabase after supabase_split_grade_averages_cron.sql
-- Splits recalculate_grade_averages_for_grade into two short statements:
--   overall (quiz_sessions) vs by-type (session_answers) so each PostgREST RPC stays under timeout.

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
      AVG(CASE WHEN qs.questions_attempted > 0 THEN (qs.score::numeric / qs.questions_attempted) * 100 ELSE 0 END),
      2
    ),
    COUNT(qs.id)::int
  FROM quiz_sessions qs
  JOIN students s ON s.id = qs.student_id
  WHERE qs.questions_attempted > 0
    AND s.grade_level = p_grade_level
  GROUP BY s.grade_level;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_grade_by_type_for_grade(p_grade_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
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
    AND st.grade_level = p_grade_level
  GROUP BY st.grade_level, q.question_type;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_grade_averages_for_grade(p_grade_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalculate_grade_overall_for_grade(p_grade_level);
  PERFORM recalculate_grade_by_type_for_grade(p_grade_level);
END;
$$;

-- Monolith: clear + per grade two-step
CREATE OR REPLACE FUNCTION recalculate_grade_averages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g text;
BEGIN
  SET LOCAL statement_timeout = '5min';
  DELETE FROM grade_averages WHERE true;
  FOR g IN SELECT UNNEST(get_distinct_grade_levels()) AS x
  LOOP
    PERFORM recalculate_grade_overall_for_grade(g);
    PERFORM recalculate_grade_by_type_for_grade(g);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION recalculate_grade_overall_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION recalculate_grade_by_type_for_grade(text) TO postgres, anon, authenticated, service_role;
