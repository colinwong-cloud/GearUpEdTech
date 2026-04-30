-- ============================================================
-- Parent dashboard charts: filter by subject (Math / Chinese)
-- Problem: get_student_chart_data(p_student_id) returned last 30
-- sessions across ALL subjects, so Math and Chinese tabs showed
-- the same trend data.
-- Run in Supabase SQL Editor (replaces function; backward compatible
-- when p_subject is NULL = old behaviour).
-- ============================================================

CREATE OR REPLACE FUNCTION get_student_chart_data(
  p_student_id UUID,
  p_subject TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade TEXT;
  v_result JSON;
  v_key TEXT;
  v_filter BOOLEAN;
BEGIN
  SELECT grade_level INTO v_grade FROM students WHERE id = p_student_id;

  v_filter := p_subject IS NOT NULL AND trim(p_subject) <> '';
  v_key := CASE WHEN v_filter THEN lower(trim(p_subject)) ELSE NULL END;

  SELECT json_build_object(
    'grade_level', v_grade,
    'sessions', COALESCE((
      SELECT json_agg(row_to_json(s) ORDER BY s.created_at)
      FROM (
        SELECT
          qs.id,
          qs.created_at,
          qs.questions_attempted,
          qs.score,
          CASE WHEN qs.questions_attempted > 0
            THEN ROUND((qs.score::numeric / qs.questions_attempted) * 100, 1)
            ELSE 0 END AS correct_pct
        FROM quiz_sessions qs
        WHERE qs.student_id = p_student_id
          AND qs.questions_attempted > 0
          AND (
            NOT v_filter
            OR (
              lower(trim(qs.subject)) = v_key
              OR (v_key = 'math' AND lower(trim(qs.subject)) IN ('math', '數學'))
            )
          )
        ORDER BY qs.created_at DESC
        LIMIT 30
      ) s
    ), '[]'::json),
    'type_sessions', COALESCE((
      SELECT json_agg(row_to_json(ts))
      FROM (
        SELECT
          q.question_type,
          qs.id AS session_id,
          qs.created_at,
          COUNT(*)::int AS total,
          SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct,
          ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 1) AS correct_pct
        FROM session_answers sa
        JOIN questions q ON q.id = sa.question_id
        JOIN quiz_sessions qs ON qs.id = sa.session_id
        WHERE qs.student_id = p_student_id
          AND qs.questions_attempted > 0
          AND (
            NOT v_filter
            OR (
              lower(trim(qs.subject)) = v_key
              OR (v_key = 'math' AND lower(trim(qs.subject)) IN ('math', '數學'))
            )
          )
          AND qs.id IN (
            SELECT id FROM quiz_sessions q2
            WHERE q2.student_id = p_student_id
              AND q2.questions_attempted > 0
              AND (
                NOT v_filter
                OR (
                  lower(trim(q2.subject)) = v_key
                  OR (v_key = 'math' AND lower(trim(q2.subject)) IN ('math', '數學'))
                )
              )
            ORDER BY q2.created_at DESC
            LIMIT 30
          )
        GROUP BY q.question_type, qs.id, qs.created_at
        ORDER BY q.question_type, qs.created_at
      ) ts
    ), '[]'::json),
    'grade_averages', COALESCE((
      SELECT json_agg(row_to_json(ga))
      FROM (
        SELECT question_type, avg_correct_pct, total_sessions
        FROM grade_averages
        WHERE grade_level = v_grade
      ) ga
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
