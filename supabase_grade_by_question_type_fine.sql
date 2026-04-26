-- Run in Supabase after other grade_ cron SQL files.
-- Further splits by-type: one (grade, question_type) per RPC to stay under PostgREST timeout.

CREATE OR REPLACE FUNCTION get_question_types_for_grade(p_grade_level text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT array_agg(x.question_type ORDER BY x.question_type)
    FROM (SELECT DISTINCT question_type FROM public.questions WHERE grade_level = p_grade_level) x
  ), ARRAY[]::text[]);
$$;

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
    st.grade_level,
    q.question_type,
    ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 2),
    COUNT(DISTINCT sa.session_id)::int
  FROM public.session_answers sa
  INNER JOIN public.quiz_sessions qs ON qs.id = sa.session_id
  INNER JOIN public.students st ON st.id = qs.student_id
  INNER JOIN public.questions q ON q.id = sa.question_id
  WHERE qs.questions_attempted > 0
    AND st.grade_level = p_grade_level
    AND q.question_type = p_question_type
  GROUP BY st.grade_level, q.question_type;
END;
$$;

-- Replace: by-type = loop over get_question_types_for_grade
CREATE OR REPLACE FUNCTION recalculate_grade_by_type_for_grade(p_grade_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT UNNEST(get_question_types_for_grade(p_grade_level))
  LOOP
    PERFORM recalculate_grade_one_type_for_grade(p_grade_level, t);
  END LOOP;
END;
$$;

-- Monolith: keep existing loop structure; recalculate_grade_averages already does overall+bytype per grade
-- By-type is now fine-grain inside recalculate_grade_by_type_for_grade

GRANT EXECUTE ON FUNCTION get_question_types_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION recalculate_grade_one_type_for_grade(text, text) TO postgres, anon, authenticated, service_role;
