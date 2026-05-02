-- ============================================================
-- Charts Feature: grade averages table + RPC functions
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Table to cache nightly grade-level averages
CREATE TABLE IF NOT EXISTS grade_averages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_level     TEXT NOT NULL,
  question_type   TEXT NOT NULL,
  avg_correct_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_sessions  INTEGER NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grade_level, question_type)
);

ALTER TABLE grade_averages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_grade_averages" ON grade_averages FOR SELECT TO anon USING (true);

-- 2. Function to recalculate all grade averages (called by scheduled task)
CREATE OR REPLACE FUNCTION recalculate_grade_averages()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
  -- WHERE true: some hosts reject DELETE without a WHERE clause
  DELETE FROM grade_averages WHERE true;

  -- Overall average per grade
  INSERT INTO grade_averages (grade_level, question_type, avg_correct_pct, total_sessions)
  SELECT
    s.grade_level,
    '_overall' AS question_type,
    ROUND(AVG(CASE WHEN qs.questions_attempted > 0 THEN (qs.score::numeric / qs.questions_attempted) * 100 ELSE 0 END), 2),
    COUNT(qs.id)::int
  FROM quiz_sessions qs
  JOIN students s ON s.id = qs.student_id
  WHERE qs.questions_attempted > 0
  GROUP BY s.grade_level;

  -- Per question_type average per grade (join via sessions+students for large session_answers)
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

-- 3. Get chart data for a student (last 30 sessions + per-type breakdown)
CREATE OR REPLACE FUNCTION get_student_chart_data(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade TEXT;
  v_result JSON;
BEGIN
  SELECT grade_level INTO v_grade FROM students WHERE id = p_student_id;

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
        WHERE qs.student_id = p_student_id AND qs.questions_attempted > 0
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
        WHERE qs.student_id = p_student_id AND qs.questions_attempted > 0
          AND qs.id IN (
            SELECT id FROM quiz_sessions
            WHERE student_id = p_student_id AND questions_attempted > 0
            ORDER BY created_at DESC LIMIT 30
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
