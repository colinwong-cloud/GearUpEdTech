-- Hotfix: Supabase may reject "DELETE FROM table" without a predicate.
-- Run this in Supabase SQL Editor, then re-run the cron or call
-- recalculate_student_grade_rankings() / recalculate_grade_averages().

CREATE OR REPLACE FUNCTION recalculate_student_grade_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM student_grade_rankings WHERE true;

  WITH session_rates AS (
    SELECT
      qs.student_id,
      qs.id AS session_id,
      (qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100 AS rate_pct,
      row_number() OVER (PARTITION BY qs.student_id ORDER BY qs.created_at DESC) AS rn
    FROM quiz_sessions qs
    WHERE qs.student_id IS NOT NULL
      AND qs.questions_attempted > 0
  ),
  per_student AS (
    SELECT
      s.id AS student_id,
      s.grade_level,
      s.student_name,
      COALESCE((
        SELECT SUM(qs2.questions_attempted)::integer
        FROM quiz_sessions qs2
        WHERE qs2.student_id = s.id
          AND qs2.questions_attempted > 0
      ), 0) AS lifetime_questions,
      (
        SELECT COALESCE(ROUND(AVG(sr.rate_pct)::numeric, 4), NULL)
        FROM session_rates sr
        WHERE sr.student_id = s.id AND sr.rn <= 10
      ) AS last_10_avg,
      (
        SELECT COUNT(*)::integer
        FROM session_rates sr
        WHERE sr.student_id = s.id AND sr.rn <= 10
      ) AS session_count_in_avg
    FROM students s
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
