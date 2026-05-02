-- Call from API (part=grade) with multiple short RPCs — avoids PostgREST one-query timeout
-- on large session_answers. Run in Supabase SQL Editor once.

CREATE OR REPLACE FUNCTION get_distinct_grade_levels()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(grade_level ORDER BY grade_level)
     FROM (SELECT DISTINCT grade_level FROM public.students) t),
    ARRAY[]::text[]
  );
$$;

CREATE OR REPLACE FUNCTION clear_grade_averages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM grade_averages WHERE true;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_grade_averages_for_grade(p_grade_level text)
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

-- Keep monolith for ad-hoc SQL: delegates to per-grade in a loop (may still hit timeout via PostgREST; prefer split from app)
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
    PERFORM recalculate_grade_averages_for_grade(g);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION get_distinct_grade_levels() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION clear_grade_averages() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION recalculate_grade_averages_for_grade(text) TO postgres, anon, authenticated, service_role;
