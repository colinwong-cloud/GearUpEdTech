-- Run in Supabase SQL after hotfix, if the batch times out.
-- 1) Adds an index to speed the ranking scan.
-- 2) Replaces nested subqueries in recalculate_student_grade_rankings
--    with set-based CTEs (O(students) + O(sessions)) instead of O(n^2 per student).
-- 3) Raises statement timeout inside the function to 5 minutes.
-- 4) Same for recalculate_grade_averages.

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student_created
  ON public.quiz_sessions (student_id, created_at DESC)
  WHERE student_id IS NOT NULL AND questions_attempted > 0;

CREATE OR REPLACE FUNCTION recalculate_student_grade_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
  DELETE FROM student_grade_rankings WHERE true;

  WITH ranked_sessions AS (
    SELECT
      qs.student_id,
      (qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100 AS rate_pct,
      row_number() OVER (PARTITION BY qs.student_id ORDER BY qs.created_at DESC) AS rn
    FROM quiz_sessions qs
    WHERE qs.student_id IS NOT NULL
      AND qs.questions_attempted > 0
  ),
  session_agg AS (
    SELECT
      student_id,
      (COUNT(*) FILTER (WHERE rn <= 10))::int AS session_count_in_avg,
      CASE WHEN COUNT(*) FILTER (WHERE rn <= 10) > 0
        THEN ROUND(
          (AVG(rate_pct) FILTER (WHERE rn <= 10))::numeric,
          4
        )
        ELSE NULL
      END AS last_10_avg
    FROM ranked_sessions
    GROUP BY student_id
  ),
  lifetime AS (
    SELECT
      student_id,
      SUM(questions_attempted)::int AS lifetime_questions
    FROM quiz_sessions
    WHERE student_id IS NOT NULL
      AND questions_attempted > 0
    GROUP BY student_id
  ),
  per_student AS (
    SELECT
      s.id AS student_id,
      s.grade_level,
      s.student_name,
      COALESCE(l.lifetime_questions, 0) AS lifetime_questions,
      COALESCE(sa.session_count_in_avg, 0) AS session_count_in_avg,
      sa.last_10_avg
    FROM students s
    LEFT JOIN session_agg sa ON sa.student_id = s.id
    LEFT JOIN lifetime l ON l.student_id = s.id
  ),
  with_elig AS (
    SELECT
      ps.*,
      (ps.lifetime_questions >= 100) AS is_eligible
    FROM per_student ps
  ),
  ranked AS (
    SELECT
      w.*,
      CASE WHEN w.is_eligible THEN
        RANK() OVER (PARTITION BY w.grade_level ORDER BY w.last_10_avg DESC NULLS LAST, w.student_id)
      END AS rk,
      COUNT(*) FILTER (WHERE w.is_eligible) OVER (PARTITION BY w.grade_level) AS tot_elig
    FROM with_elig w
  )
  INSERT INTO student_grade_rankings (
    calculated_at,
    grade_level,
    student_id,
    student_name,
    lifetime_questions,
    session_count_in_avg,
    last_10_avg_correct_pct,
    rank_in_grade,
    total_eligible_in_grade
  )
  SELECT
    now(),
    r.grade_level,
    r.student_id,
    r.student_name,
    r.lifetime_questions,
    r.session_count_in_avg,
    r.last_10_avg,
    CASE WHEN r.is_eligible THEN r.rk::integer ELSE NULL END,
    COALESCE(r.tot_elig, 0)
  FROM ranked r;
END;
$$;

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
    ROUND(AVG(CASE WHEN qs.questions_attempted > 0 THEN (qs.score::numeric / qs.questions_attempted) * 100 ELSE 0 END), 2),
    COUNT(qs.id)::int
  FROM quiz_sessions qs
  JOIN students s ON s.id = qs.student_id
  WHERE qs.questions_attempted > 0
  GROUP BY s.grade_level;

  INSERT INTO grade_averages (grade_level, question_type, avg_correct_pct, total_sessions)
  SELECT
    q.grade_level,
    q.question_type,
    ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 2),
    COUNT(DISTINCT sa.session_id)::int
  FROM session_answers sa
  JOIN questions q ON q.id = sa.question_id
  GROUP BY q.grade_level, q.question_type;
END;
$$;
